import { Channel } from 'phoenix';
import { getState } from '@/store';
import type { ResourceRef } from '@/shared/types';
import type { CallIceCandidatePayload, RenegotiationSignalPayload } from '../hooks/useCall.types';
import { debugCall, isCallDebugEnabled } from '../utils/callDebug';
import { buildIceServers } from './iceServerConfig';

export type SelectedCandidateType = 'host' | 'srflx' | 'relay' | 'unknown';

export interface CandidatePairDiagnostics {
    candidatePairId: string | null;
    localCandidateId: string | null;
    remoteCandidateId: string | null;
    localCandidateType: SelectedCandidateType;
    state: string | null;
    nominated: boolean;
}

export interface WebRTCDiagnostics {
    connectionState: RTCPeerConnectionState | 'unknown';
    iceConnectionState: RTCIceConnectionState | 'unknown';
    iceGatheringState: RTCIceGatheringState | 'unknown';
    signalingState: RTCSignalingState | 'unknown';
    selectedCandidatePair: CandidatePairDiagnostics | null;
}

type StatsValue = {
    id?: string;
    type?: string;
    selected?: boolean;
    nominated?: boolean;
    state?: string;
    localCandidateId?: string;
    remoteCandidateId?: string;
    candidateType?: string;
    kind?: string;
    bytesReceived?: number;
};

const RENEGOTIATION_ANSWER_TIMEOUT_MS = 8_000;

const EMPTY_DIAGNOSTICS: WebRTCDiagnostics = {
    connectionState: 'unknown',
    iceConnectionState: 'unknown',
    iceGatheringState: 'unknown',
    signalingState: 'unknown',
    selectedCandidatePair: null,
};

function cloneDiagnostics(diagnostics: WebRTCDiagnostics): WebRTCDiagnostics {
    return {
        ...diagnostics,
        selectedCandidatePair: diagnostics.selectedCandidatePair
            ? { ...diagnostics.selectedCandidatePair }
            : null,
    };
}

function getStatsValues(stats: { values?: () => IterableIterator<StatsValue> } | null | undefined): StatsValue[] {
    if (!stats?.values) return [];
    return Array.from(stats.values());
}

function isCandidatePairSelected(stat: StatsValue): boolean {
    return stat.type === 'candidate-pair' && (stat.selected === true || stat.nominated === true || stat.state === 'succeeded');
}

export function classifyCandidateType(candidateType?: string | null): SelectedCandidateType {
    if (candidateType === 'host' || candidateType === 'srflx' || candidateType === 'relay') {
        return candidateType;
    }
    return 'unknown';
}

export function inspectSelectedCandidatePairFromStats(
    stats: { values?: () => IterableIterator<StatsValue> } | null | undefined,
): CandidatePairDiagnostics | null {
    const values = getStatsValues(stats);
    if (values.length === 0) return null;

    const selectedPair = values.find((stat) => isCandidatePairSelected(stat));
    if (!selectedPair) return null;

    const localCandidate = values.find((stat) => stat.id === selectedPair.localCandidateId);

    return {
        candidatePairId: selectedPair.id ?? null,
        localCandidateId: selectedPair.localCandidateId ?? null,
        remoteCandidateId: selectedPair.remoteCandidateId ?? null,
        localCandidateType: classifyCandidateType(localCandidate?.candidateType),
        state: selectedPair.state ?? null,
        nominated: Boolean(selectedPair.nominated),
    };
}

export { buildIceServers } from './iceServerConfig';

function remoteSdpHasSendingVideo(sdp: string): boolean {
    const videoSection = sdp
        .split(/\r?\nm=/)
        .find((section) => section.startsWith('video ') || section.startsWith('m=video '));

    if (!videoSection) return false;

    const normalizedSection = videoSection.startsWith('m=') ? videoSection : `m=${videoSection}`;
    const firstLine = normalizedSection.split(/\r?\n/, 1)[0] ?? '';
    const port = firstLine.split(/\s+/)[1];
    if (port === '0') return false;

    const direction = normalizedSection.match(/^a=(sendrecv|sendonly|recvonly|inactive)$/m)?.[1];
    return !direction || direction === 'sendrecv' || direction === 'sendonly';
}

function candidateKey(candidate: RTCIceCandidateInit): string {
    return JSON.stringify({
        candidate: candidate.candidate ?? '',
        sdpMid: candidate.sdpMid ?? null,
        sdpMLineIndex: candidate.sdpMLineIndex ?? null,
        usernameFragment: candidate.usernameFragment ?? null,
    });
}

function isExpectedCandidateOrderingError(error: unknown): boolean {
    return (
        typeof DOMException !== 'undefined' &&
        error instanceof DOMException &&
        error.name === 'OperationError'
    );
}

export class WebRTCService {
    private peerConnection: RTCPeerConnection | null = null;
    private localStream: MediaStream | null = null;
    private remoteStream: MediaStream | null = null;
    private remoteScreenStream: MediaStream | null = null;
    private remoteScreenShareActive = false;
    private remoteScreenAvailable = false;
    private isWatchingRemoteScreen = false;
    private desiredRemoteScreenWatch = false;
    private remoteScreenWatchChangePending = false;
    private remoteScreenTransceiver: RTCRtpTransceiver | null = null;
    private remoteScreenWatchTimeoutRef: ReturnType<typeof setTimeout> | null = null;
    private remoteScreenWatchPromise: Promise<void> | null = null;
    private remoteScreenWatchResolve: (() => void) | null = null;
    private remoteScreenWatchReject: ((error: Error) => void) | null = null;
    private screenStream: MediaStream | null = null;
    private screenSender: RTCRtpSender | null = null;
    private screenTransceiver: RTCRtpTransceiver | null = null;
    private screenTrackEndedHandler: (() => void) | null = null;
    private isScreenShareActiveLocal = false;
    private desiredScreenShareActive = false;
    private pendingScreenShareChange = false;
    private pendingScreenShareChangeReason: 'start' | 'stop' | null = null;
    private pendingScreenShareStartResolvers: Array<{
        resolve: (stream: MediaStream) => void;
        reject: (error: Error) => void;
    }> = [];
    private pendingScreenShareOnEnded: (() => void) | null = null;
    private channel: Channel;
    private remoteUserId: ResourceRef;
    private callId: string | null = null;
    private pendingLocalIceCandidates: RTCIceCandidateInit[] = [];
    private pendingLocalIceCandidateKeys = new Set<string>();
    private sentLocalIceCandidateKeys = new Set<string>();
    private localIceFlushPromise: Promise<void> | null = null;
    private lifecycleGeneration = 0;
    private iceCandidateQueue: RTCIceCandidateInit[] = [];
    private queuedIceCandidateKeys = new Set<string>();
    private appliedIceCandidateKeys = new Set<string>();
    private remoteDescriptionSet = false;
    private localMuted = false;
    private isCreatingRenegotiationOffer = false;
    private isRenegotiationInFlight = false;
    private pendingRenegotiationReason: string | null = null;
    private renegotiationAnswerTimeoutRef: ReturnType<typeof setTimeout> | null = null;
    private diagnostics: WebRTCDiagnostics = cloneDiagnostics(EMPTY_DIAGNOSTICS);

    public onRemoteStream: (stream: MediaStream) => void = () => { };
    public onRemoteScreenStream: (stream: MediaStream | null) => void = () => { };
    public onRemoteScreenAvailabilityChange: (available: boolean) => void = () => { };
    public onRemoteScreenWatchStateChange: (watching: boolean) => void = () => { };
    public onRemoteScreenLoading: (loading: boolean) => void = () => { };
    public onScreenShareUpdatingChange: (updating: boolean) => void = () => { };
    public onCallIdReceived: ((callId: string) => void) | null = null;
    public onDiagnosticsChange: ((diagnostics: WebRTCDiagnostics) => void) | null = null;

    constructor(channel: Channel, _localUserId: number, remoteUserId: ResourceRef) {
        this.channel = channel;
        this.remoteUserId = remoteUserId;
    }

    setCallId(callId: string | null): void {
        this.callId = callId;
        if (callId) {
            this.startLocalIceFlush();
        }
    }

    getSignalingCallId(): string | null {
        return this.getCallId();
    }

    async startCall(): Promise<void> {
        if (this.peerConnection) throw new Error('Call already started');
        await this.initPeerConnection();
        const offer = await this.peerConnection!.createOffer();
        await this.peerConnection!.setLocalDescription(offer);
        debugCall('[WebRTCService] send offer', {
            event: 'offer',
            call_id: this.callId,
            to_user_id: this.remoteUserId,
            sdp_type: offer.type,
        });
        const { call_id } = await this.pushWithReply<{ call_id: string }>('offer', {
            sdp: this.peerConnection!.localDescription!.sdp,
            to_user_id: this.remoteUserId,
        });
        if (typeof call_id !== 'string' || call_id.length === 0) {
            throw new Error('Call offer was accepted without a call_id');
        }
        this.setCallId(call_id);
        if (this.onCallIdReceived) this.onCallIdReceived(call_id);
    }

    async acceptCall(remoteSdp: string): Promise<void> {
        if (this.peerConnection) throw new Error('Call already accepted');
        await this.initPeerConnection();
        await this.peerConnection!.setRemoteDescription(
            new RTCSessionDescription({ type: 'offer', sdp: remoteSdp })
        );
        this.remoteDescriptionSet = true;
        await this.refreshDiagnostics();
        await this.flushIceCandidateQueue();

        const answer = await this.peerConnection!.createAnswer();
        await this.peerConnection!.setLocalDescription(answer);

        debugCall('[WebRTCService] send answer', {
            event: 'answer',
            call_id: this.getCallId(),
            sdp_type: answer.type,
        });
        await this.pushWithReply('answer', {
            sdp: this.peerConnection!.localDescription!.sdp,
            to_user_id: this.remoteUserId,
            call_id: this.getCallId(),
        });
    }

    async handleAnswer(sdp: string): Promise<void> {
        if (!this.peerConnection) throw new Error('No peer connection');
        debugCall('[WebRTCService] apply renegotiation answer', {
            call_id: this.getCallId(),
            signalingState: this.peerConnection.signalingState,
        });
        await this.peerConnection.setRemoteDescription(
            new RTCSessionDescription({ type: 'answer', sdp })
        );
        this.remoteDescriptionSet = true;
        this.clearRenegotiationAnswerTimeout();
        this.setRenegotiationInFlight(false);
        debugCall('[WebRTCService] renegotiation answer applied', {
            call_id: this.getCallId(),
            signalingState: this.peerConnection.signalingState,
            inFlight: this.isRenegotiationInFlight,
        });
        await this.refreshDiagnostics();
        await this.flushIceCandidateQueue();
        if (this.remoteScreenShareActive && this.isWatchingRemoteScreen) {
            this.syncRemoteScreenFromReceivers('renegotiation_answer');
        }
        this.consumePendingScreenShareChangeIfStable();
        this.runQueuedRenegotiationIfStable();
    }

    async handleRenegotiation(signal: RenegotiationSignalPayload): Promise<void> {
        if (signal.type === 'offer') {
            await this.handleOffer(signal.sdp, { screenShareActive: signal.screen_share_active });
            return;
        }

        await this.handleAnswer(signal.sdp);
    }

    async handleOffer(sdp: string, options?: { screenShareActive?: boolean }): Promise<void> {
        if (!this.peerConnection) throw new Error('No peer connection');
        debugCall('[WebRTCService] handle active-call renegotiation offer', {
            call_id: this.getCallId(),
            signalingState: this.peerConnection.signalingState,
            screenShareActive: options?.screenShareActive,
        });
        if (options?.screenShareActive !== undefined) {
            this.remoteScreenShareActive = options.screenShareActive;
            this.setRemoteScreenAvailability(options.screenShareActive);
        }
        await this.peerConnection.setRemoteDescription(
            new RTCSessionDescription({ type: 'offer', sdp })
        );
        this.remoteDescriptionSet = true;
        this.remoteScreenTransceiver = this.findRemoteScreenReceiveTransceiver();
        if (options?.screenShareActive === false || !remoteSdpHasSendingVideo(sdp)) {
            this.remoteScreenShareActive = false;
            this.setRemoteScreenAvailability(false);
            this.isWatchingRemoteScreen = false;
            this.desiredRemoteScreenWatch = false;
            this.remoteScreenWatchChangePending = false;
            this.setRemoteScreenReceiveDirection('inactive');
            this.clearRemoteScreenWatchTimeout();
            this.rejectRemoteScreenWatch(new Error('Remote screen share stopped'));
            this.onRemoteScreenWatchStateChange(false);
            this.setRemoteScreenLoading(false, 'screenShareActive_false');
            this.clearRemoteScreenStream('screenShareActive_false');
        } else if (this.remoteScreenShareActive) {
            this.setRemoteScreenReceiveDirection(this.isWatchingRemoteScreen ? 'recvonly' : 'inactive');
            if (this.isWatchingRemoteScreen) {
                this.syncRemoteScreenFromReceivers('post_renegotiation');
            } else {
                this.setRemoteScreenLoading(false, 'remote_screen_available_unwatched');
                this.clearRemoteScreenStream('remote_screen_available_unwatched');
            }
        }
        await this.refreshDiagnostics();
        await this.flushIceCandidateQueue();

        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);

        await this.sendRenegotiationSignal({
            sdp: this.peerConnection.localDescription!.sdp ?? answer.sdp ?? '',
            type: 'answer',
        });
    }

    async addIceCandidate(candidate: CallIceCandidatePayload): Promise<void> {
        if (!this.peerConnection) return;

        await this.addRealIceCandidate(candidate);
    }

    async watchRemoteScreen(): Promise<void> {
        if (!this.remoteScreenAvailable) {
            throw new Error('Remote screen share is no longer available');
        }
        if (this.remoteScreenStream && this.isWatchingRemoteScreen) return;
        if (this.remoteScreenWatchPromise) return this.remoteScreenWatchPromise;

        const transceiver = this.findRemoteScreenReceiveTransceiver();
        if (!transceiver) {
            const error = new Error('No remote screen receive transceiver is available');
            this.failRemoteScreenWatch(error);
            throw error;
        }

        const watchPromise = new Promise<void>((resolve, reject) => {
            this.remoteScreenWatchResolve = resolve;
            this.remoteScreenWatchReject = reject;
        });
        watchPromise.catch(() => undefined);
        this.remoteScreenWatchPromise = watchPromise;
        this.startRemoteScreenWatchTimeout();
        void this.setRemoteScreenWatchDesired(true).catch((error: unknown) => {
            this.failRemoteScreenWatch(error instanceof Error ? error : new Error('Remote screen watch negotiation failed'));
        });
        return this.remoteScreenWatchPromise;
    }

    async stopWatchingRemoteScreen(): Promise<void> {
        await this.setRemoteScreenWatchDesired(false);
        this.clearRemoteScreenWatchTimeout();
        this.rejectRemoteScreenWatch(new Error('Remote screen watch stopped'));
    }

    getDiagnosticsSnapshot(): WebRTCDiagnostics {
        return cloneDiagnostics(this.diagnostics);
    }

    async collectDiagnostics(): Promise<WebRTCDiagnostics> {
        await this.refreshDiagnostics();
        return this.getDiagnosticsSnapshot();
    }

    getLocalAudioTracks(): MediaStreamTrack[] {
        return this.localStream?.getAudioTracks() ?? [];
    }

    setLocalMuted(muted: boolean): void {
        this.localMuted = muted;
        this.getLocalAudioTracks().forEach((track) => {
            track.enabled = !muted;
        });
    }

    toggleLocalMuted(): boolean {
        const nextMuted = !this.localMuted;
        this.setLocalMuted(nextMuted);
        return nextMuted;
    }

    isLocalMuted(): boolean {
        return this.localMuted;
    }

    async startScreenShare(onEnded?: () => void): Promise<MediaStream> {
        if (!this.peerConnection) throw new Error('No peer connection');

        debugCall('[WebRTCService] screenShare start requested', {
            call_id: this.getCallId(),
            current: this.isScreenShareActiveLocal,
            desired: this.desiredScreenShareActive,
            pending: this.pendingScreenShareChange,
            inFlight: this.isRenegotiationInFlight,
            signalingState: this.peerConnection.signalingState,
        });

        this.desiredScreenShareActive = true;
        this.pendingScreenShareOnEnded = onEnded ?? null;

        if (this.isScreenShareActiveLocal && this.screenStream) {
            this.pendingScreenShareChange = false;
            this.pendingScreenShareChangeReason = null;
            this.emitScreenShareUpdatingState();
            return this.screenStream;
        }

        if (!this.canApplyScreenShareChangeNow()) {
            this.pendingScreenShareChange = true;
            this.pendingScreenShareChangeReason = 'start';
            this.emitScreenShareUpdatingState();
            debugCall('[WebRTCService] pending screen desired state queued', {
                call_id: this.getCallId(),
                reason: this.pendingScreenShareChangeReason,
                desired: this.desiredScreenShareActive,
                signalingState: this.peerConnection.signalingState,
                inFlight: this.isRenegotiationInFlight,
            });
            return new Promise<MediaStream>((resolve, reject) => {
                this.pendingScreenShareStartResolvers.push({ resolve, reject });
            });
        }

        return this.applyDesiredScreenShareState();
    }

    async stopScreenShare(options?: { stopTracks?: boolean; renegotiate?: boolean }): Promise<void> {
        const shouldRenegotiate = options?.renegotiate ?? true;

        debugCall('[WebRTCService] screenShare stop requested', {
            call_id: this.callId,
            current: this.isScreenShareActiveLocal,
            desired: this.desiredScreenShareActive,
            pending: this.pendingScreenShareChange,
            inFlight: this.isRenegotiationInFlight,
            signalingState: this.peerConnection?.signalingState,
        });

        this.desiredScreenShareActive = false;
        this.rejectPendingScreenShareStarts(new Error('Screen share start was superseded by stop'));

        if (!shouldRenegotiate || !this.peerConnection) {
            await this.detachScreenTrack({ stopTracks: options?.stopTracks ?? true });
            this.pendingScreenShareChange = false;
            this.pendingScreenShareChangeReason = null;
            this.emitScreenShareUpdatingState();
            return;
        }

        if (!this.isScreenShareActiveLocal && !this.screenStream) {
            this.pendingScreenShareChange = false;
            this.pendingScreenShareChangeReason = null;
            this.emitScreenShareUpdatingState();
            return;
        }

        await this.detachScreenTrack({ stopTracks: options?.stopTracks ?? true });

        if (!this.canApplyScreenShareChangeNow()) {
            this.pendingScreenShareChange = true;
            this.pendingScreenShareChangeReason = 'stop';
            this.emitScreenShareUpdatingState();
            debugCall('[WebRTCService] pending screen desired state queued', {
                call_id: this.getCallId(),
                reason: this.pendingScreenShareChangeReason,
                desired: this.desiredScreenShareActive,
                signalingState: this.peerConnection.signalingState,
                inFlight: this.isRenegotiationInFlight,
            });
            return;
        }

        this.pendingScreenShareChange = false;
        this.pendingScreenShareChangeReason = null;
        this.emitScreenShareUpdatingState();
        await this.renegotiate('stop_screen_share');
    }

    private async applyDesiredScreenShareState(options?: { stopTracks?: boolean }): Promise<MediaStream> {
        if (!this.peerConnection) throw new Error('No peer connection');

        debugCall('[WebRTCService] apply screen desired state', {
            call_id: this.getCallId(),
            current: this.isScreenShareActiveLocal,
            desired: this.desiredScreenShareActive,
            signalingState: this.peerConnection.signalingState,
        });

        if (this.desiredScreenShareActive) {
            const stream = await this.attachScreenTrack();
            this.pendingScreenShareChange = false;
            this.pendingScreenShareChangeReason = null;
            this.emitScreenShareUpdatingState();
            this.resolvePendingScreenShareStarts(stream);
            await this.renegotiate('start_screen_share');
            return stream;
        }

        await this.detachScreenTrack({ stopTracks: options?.stopTracks ?? true });
        this.pendingScreenShareChange = false;
        this.pendingScreenShareChangeReason = null;
        this.emitScreenShareUpdatingState();
        await this.renegotiate('stop_screen_share');
        return this.screenStream ?? new MediaStream();
    }

    private async attachScreenTrack(): Promise<MediaStream> {
        if (!this.peerConnection) throw new Error('No peer connection');

        if (this.isScreenShareActiveLocal && this.screenStream) {
            return this.screenStream;
        }

        await this.detachScreenTrack({ stopTracks: true });

        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: false,
        });
        const screenTrack = stream.getVideoTracks()[0];
        if (!screenTrack) {
            stream.getTracks().forEach((track) => track.stop());
            throw new Error('Screen share did not provide a video track');
        }

        const handleEnded = () => {
            this.pendingScreenShareOnEnded?.();
            void this.stopScreenShare({ stopTracks: false });
        };

        if ('addEventListener' in screenTrack) {
            screenTrack.addEventListener?.('ended', handleEnded);
        }
        screenTrack.onended = handleEnded;

        this.screenStream = stream;
        this.screenTrackEndedHandler = handleEnded;
        this.isScreenShareActiveLocal = true;
        if (this.screenSender) {
            await this.screenSender.replaceTrack(screenTrack);
            if (this.screenTransceiver) {
                this.screenTransceiver.direction = 'sendonly';
            }
        } else if (typeof this.peerConnection.addTransceiver === 'function') {
            this.screenTransceiver = this.peerConnection.addTransceiver(screenTrack, {
                direction: 'sendonly',
                streams: [stream],
            });
            this.screenSender = this.screenTransceiver.sender;
        } else {
            this.screenSender = this.peerConnection.addTrack(screenTrack, stream);
        }
        debugCall('[WebRTCService] attach screen track', {
            call_id: this.getCallId(),
            track_id: screenTrack.id,
        });

        return stream;
    }

    private async detachScreenTrack(options?: { stopTracks?: boolean }): Promise<void> {
        const stopTracks = options?.stopTracks ?? true;
        const stream = this.screenStream;
        const sender = this.screenSender;
        const track = stream?.getVideoTracks()[0] ?? null;
        const endedHandler = this.screenTrackEndedHandler;

        this.screenStream = null;
        this.screenTrackEndedHandler = null;
        this.isScreenShareActiveLocal = false;

        if (track && endedHandler) {
            if ('removeEventListener' in track) {
                track.removeEventListener?.('ended', endedHandler);
            }
            track.onended = null;
        }

        if (stopTracks && stream) {
            stream.getTracks().forEach((mediaTrack) => mediaTrack.stop());
        }
        debugCall('[WebRTCService] local screen track stopped', {
            call_id: this.getCallId(),
            stopTracks,
            track_id: track?.id,
        });

        if (sender && this.peerConnection && typeof sender.replaceTrack === 'function') {
            await sender.replaceTrack(null);
            if (this.screenTransceiver) {
                this.screenTransceiver.direction = 'inactive';
            }
            debugCall('[WebRTCService] detach screen track', {
                call_id: this.getCallId(),
                track_id: track?.id,
            });
        }
    }

    dispose(): void {
        if (this.peerConnection) {
            this.peerConnection.close();
        }
        this.peerConnection = null;
        void this.stopScreenShare({ stopTracks: true, renegotiate: false });
        this.localStream?.getTracks().forEach(track => track.stop());
        this.localStream = null;
        if (this.remoteStream) {
            this.remoteStream = null;
        }
        this.remoteScreenShareActive = false;
        this.remoteScreenAvailable = false;
        this.isWatchingRemoteScreen = false;
        this.desiredRemoteScreenWatch = false;
        this.remoteScreenWatchChangePending = false;
        this.remoteScreenTransceiver = null;
        this.clearRemoteScreenWatchTimeout();
        this.rejectRemoteScreenWatch(new Error('Remote screen watch stopped because the peer was disposed'));
        this.setRemoteScreenLoading(false, 'dispose');
        this.clearRemoteScreenStream('dispose');
        this.desiredScreenShareActive = false;
        this.isScreenShareActiveLocal = false;
        this.pendingScreenShareChange = false;
        this.pendingScreenShareChangeReason = null;
        this.rejectPendingScreenShareStarts(new Error('Screen share stopped because the peer was disposed'));
        this.lifecycleGeneration += 1;
        this.pendingLocalIceCandidates = [];
        this.pendingLocalIceCandidateKeys.clear();
        this.sentLocalIceCandidateKeys.clear();
        this.iceCandidateQueue = [];
        this.queuedIceCandidateKeys.clear();
        this.appliedIceCandidateKeys.clear();
        this.remoteDescriptionSet = false;
        this.clearRenegotiationAnswerTimeout();
        this.isCreatingRenegotiationOffer = false;
        this.isRenegotiationInFlight = false;
        this.pendingRenegotiationReason = null;
        this.screenSender = null;
        this.screenTransceiver = null;
        this.callId = null;
        this.diagnostics = cloneDiagnostics(EMPTY_DIAGNOSTICS);
        this.emitDiagnostics();
        this.onRemoteStream = () => { };
        this.onRemoteScreenStream = () => { };
        this.onRemoteScreenAvailabilityChange = () => { };
        this.onRemoteScreenWatchStateChange = () => { };
        this.onRemoteScreenLoading = () => { };
        this.onScreenShareUpdatingChange = () => { };
        this.onCallIdReceived = null;
        this.onDiagnosticsChange = null;
    }

    hangUp(): void {
        this.dispose();
    }

    private startLocalIceFlush(): void {
        if (this.localIceFlushPromise || !this.callId) return;

        const generation = this.lifecycleGeneration;
        const promise = this.flushPendingLocalIceCandidates(generation);
        this.localIceFlushPromise = promise;
        void promise.finally(() => {
            if (this.localIceFlushPromise === promise) {
                this.localIceFlushPromise = null;
            }
        }).catch(() => undefined);
    }

    private async flushPendingLocalIceCandidates(generation: number): Promise<void> {
        while (
            generation === this.lifecycleGeneration &&
            this.callId &&
            this.pendingLocalIceCandidates.length > 0
        ) {
            const candidate = this.pendingLocalIceCandidates.shift();
            if (!candidate) continue;
            const key = candidateKey(candidate);
            this.pendingLocalIceCandidateKeys.delete(key);
            this.sendLocalIceCandidate(candidate, key, generation);
            await Promise.resolve();
        }
    }

    private sendLocalIceCandidate(candidate: RTCIceCandidateInit, key: string, generation: number): void {
        const callId = this.callId;
        if (generation !== this.lifecycleGeneration || !callId || this.sentLocalIceCandidateKeys.has(key)) {
            return;
        }

        this.sentLocalIceCandidateKeys.add(key);
        this.channel.push('ice_candidate', {
            candidate,
            to_user_id: this.remoteUserId,
            call_id: callId,
        });
    }

    private handleLocalIceCandidate(candidate: RTCIceCandidate): void {
        const candidateInit = JSON.parse(JSON.stringify(
            typeof candidate.toJSON === 'function'
                ? candidate.toJSON()
                : {
                    candidate: candidate.candidate,
                    sdpMid: candidate.sdpMid,
                    sdpMLineIndex: candidate.sdpMLineIndex,
                    usernameFragment: candidate.usernameFragment,
                },
        )) as RTCIceCandidateInit;
        const key = candidateKey(candidateInit);

        if (this.pendingLocalIceCandidateKeys.has(key) || this.sentLocalIceCandidateKeys.has(key)) {
            return;
        }

        if (!this.callId || this.localIceFlushPromise) {
            this.pendingLocalIceCandidateKeys.add(key);
            this.pendingLocalIceCandidates.push(candidateInit);
            if (this.callId) this.startLocalIceFlush();
            return;
        }

        this.sendLocalIceCandidate(candidateInit, key, this.lifecycleGeneration);
    }

    private async flushIceCandidateQueue(): Promise<void> {
        if (this.iceCandidateQueue.length > 0) {
            debugCall('[WebRTCService] flush queued ICE', {
                call_id: this.getCallId(),
                count: this.iceCandidateQueue.length,
                signalingState: this.peerConnection?.signalingState,
            });
        }

        const queuedCandidates = [...this.iceCandidateQueue];
        this.iceCandidateQueue = [];
        this.queuedIceCandidateKeys.clear();

        for (const candidate of queuedCandidates) {
            await this.addRealIceCandidate(candidate, { fromFlush: true });
        }
        await this.refreshDiagnostics();
    }

    private queueIceCandidate(candidate: RTCIceCandidateInit): void {
        const key = candidateKey(candidate);
        if (this.queuedIceCandidateKeys.has(key) || this.appliedIceCandidateKeys.has(key)) {
            return;
        }

        this.queuedIceCandidateKeys.add(key);
        this.iceCandidateQueue.push(candidate);
    }

    private async addRealIceCandidate(candidate: RTCIceCandidateInit, options?: { fromFlush?: boolean }): Promise<void> {
        const peerConnection = this.peerConnection;
        if (!peerConnection) return;

        const hasRemoteDescription = Boolean(peerConnection.remoteDescription) || this.remoteDescriptionSet;
        debugCall('[WebRTCService] receive ICE', {
            call_id: this.getCallId(),
            hasRemoteDescription,
            signalingState: peerConnection.signalingState,
            queued: !hasRemoteDescription,
        });

        if (!hasRemoteDescription) {
            this.queueIceCandidate(candidate);
            return;
        }

        const key = candidateKey(candidate);
        if (this.appliedIceCandidateKeys.has(key)) {
            return;
        }

        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            this.appliedIceCandidateKeys.add(key);
            await this.refreshDiagnostics();
        } catch (err) {
            if (isExpectedCandidateOrderingError(err)) {
                if (!options?.fromFlush) {
                    this.queueIceCandidate(candidate);
                }
                debugCall('[WebRTCService] queued/dropped out-of-order ICE', {
                    call_id: this.getCallId(),
                    signalingState: peerConnection.signalingState,
                    fromFlush: Boolean(options?.fromFlush),
                });
                return;
            }

            console.error('[WebRTC] Failed to add ICE candidate:', err);
        }
    }

    private getCallId(): string | null {
        return this.callId;
    }

    private pushWithReply<T = void>(event: string, payload: Record<string, unknown>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this.channel.push(event, payload)
                .receive('ok', (response: T) => {
                    debugCall('[WebRTCService] signal acknowledged', {
                        event,
                        call_id: this.callId,
                    });
                    resolve(response);
                })
                .receive('error', (reason: unknown) => {
                    debugCall('[WebRTCService] signal rejected', {
                        event,
                        call_id: this.callId,
                        reason: typeof reason === 'object' ? JSON.stringify(reason) : String(reason),
                    });
                    reject(new Error(`Call signaling ${event} failed: ${this.describeSignalFailure(reason)}`));
                })
                .receive('timeout', () => {
                    debugCall('[WebRTCService] signal timed out', {
                        event,
                        call_id: this.callId,
                    });
                    reject(new Error(`Call signaling ${event} timed out`));
                });
        });
    }

    private describeSignalFailure(reason: unknown): string {
        if (!reason || typeof reason !== 'object') {
            return String(reason ?? 'unknown');
        }

        const value = (reason as Record<string, unknown>).reason;
        return typeof value === 'string' && value.length > 0
            ? value
            : JSON.stringify(reason);
    }

    private async renegotiate(reason: string): Promise<void> {
        const peerConnection = this.peerConnection;
        if (!peerConnection) return;
        if (this.isCreatingRenegotiationOffer || this.isRenegotiationInFlight || peerConnection.signalingState !== 'stable') {
            this.pendingRenegotiationReason = reason;
            this.emitScreenShareUpdatingState();
            debugCall('[WebRTCService] renegotiation queued', {
                call_id: this.getCallId(),
                reason,
                signalingState: peerConnection.signalingState,
                inFlight: this.isRenegotiationInFlight,
                creating: this.isCreatingRenegotiationOffer,
            });
            return;
        }

        this.setCreatingRenegotiationOffer(true);
        try {
            const offer = await peerConnection.createOffer();
            if (peerConnection.signalingState !== 'stable') {
                this.pendingRenegotiationReason = reason;
                this.emitScreenShareUpdatingState();
                debugCall('[WebRTCService] renegotiation queued after createOffer', {
                    call_id: this.getCallId(),
                    reason,
                    signalingState: peerConnection.signalingState,
                });
                return;
            }
            await peerConnection.setLocalDescription(offer);
            this.setRenegotiationInFlight(true);
            this.pendingRenegotiationReason = null;
            debugCall('[WebRTCService] create renegotiation offer', {
                event: 'renegotiate',
                call_id: this.getCallId(),
                to_user_id: this.remoteUserId,
                reason,
                sdp_type: offer.type,
                signalingState: peerConnection.signalingState,
            });
            await this.sendRenegotiationSignal({
                sdp: peerConnection.localDescription!.sdp ?? offer.sdp ?? '',
                type: 'offer',
                screen_share_active: this.isScreenShareActiveLocal,
            });
            this.startRenegotiationAnswerTimeout(reason);
        } catch (error) {
            await this.failRenegotiationTransaction(
                error instanceof Error ? error : new Error('Renegotiation failed'),
                reason,
            );
            throw error;
        } finally {
            this.setCreatingRenegotiationOffer(false);
        }
    }

    private canApplyScreenShareChangeNow(): boolean {
        const peerConnection = this.peerConnection;
        return Boolean(
            peerConnection &&
            peerConnection.signalingState === 'stable' &&
            !this.isCreatingRenegotiationOffer &&
            !this.isRenegotiationInFlight
        );
    }

    private consumePendingScreenShareChangeIfStable(): void {
        if (!this.pendingScreenShareChange || !this.canApplyScreenShareChangeNow()) return;
        if (this.pendingScreenShareChangeReason === 'stop') {
            this.pendingScreenShareChange = false;
            this.pendingScreenShareChangeReason = null;
            this.emitScreenShareUpdatingState();
            debugCall('[WebRTCService] pending screen desired state consumed', {
                call_id: this.getCallId(),
                current: this.isScreenShareActiveLocal,
                desired: this.desiredScreenShareActive,
                reason: 'stop',
            });
            void this.renegotiate('stop_screen_share').catch((err) => {
                console.warn('[WebRTCService] Failed to apply pending screen share stop', err);
            });
            return;
        }

        if (this.desiredScreenShareActive === this.isScreenShareActiveLocal) {
            this.pendingScreenShareChange = false;
            this.pendingScreenShareChangeReason = null;
            this.emitScreenShareUpdatingState();
            debugCall('[WebRTCService] pending screen desired state cleared', {
                call_id: this.getCallId(),
                current: this.isScreenShareActiveLocal,
                desired: this.desiredScreenShareActive,
            });
            return;
        }

        debugCall('[WebRTCService] pending screen desired state consumed', {
            call_id: this.getCallId(),
            current: this.isScreenShareActiveLocal,
            desired: this.desiredScreenShareActive,
            reason: this.pendingScreenShareChangeReason,
        });
        void this.applyDesiredScreenShareState().catch((err) => {
            this.rejectPendingScreenShareStarts(err instanceof Error ? err : new Error('Screen share change failed'));
            console.warn('[WebRTCService] Failed to apply pending screen share change', err);
        });
    }

    private resolvePendingScreenShareStarts(stream: MediaStream): void {
        const resolvers = this.pendingScreenShareStartResolvers;
        this.pendingScreenShareStartResolvers = [];
        resolvers.forEach(({ resolve }) => resolve(stream));
    }

    private rejectPendingScreenShareStarts(error: Error): void {
        const resolvers = this.pendingScreenShareStartResolvers;
        this.pendingScreenShareStartResolvers = [];
        resolvers.forEach(({ reject }) => reject(error));
    }

    private async sendRenegotiationSignal(signal: RenegotiationSignalPayload): Promise<void> {
        debugCall('[WebRTCService] send call signal', {
            event: 'renegotiate',
            call_id: this.getCallId(),
            to_user_id: this.remoteUserId,
            sdp_type: signal.type,
            screen_share_active: signal.screen_share_active,
        });
        await this.pushWithReply('renegotiate', {
            ...signal,
            to_user_id: this.remoteUserId,
            call_id: this.getCallId(),
        });
    }

    private runQueuedRenegotiationIfStable(): void {
        const peerConnection = this.peerConnection;
        if (!peerConnection || !this.pendingRenegotiationReason || this.isRenegotiationInFlight || peerConnection.signalingState !== 'stable') {
            return;
        }

        const reason = this.pendingRenegotiationReason;
        this.pendingRenegotiationReason = null;
        if (reason === 'remote_screen_watch') {
            this.remoteScreenWatchChangePending = false;
        }
        debugCall('[WebRTCService] pending renegotiation cleared', {
            call_id: this.getCallId(),
            reason,
        });
        void this.renegotiate(reason);
    }

    private setCreatingRenegotiationOffer(next: boolean): void {
        this.isCreatingRenegotiationOffer = next;
        this.emitScreenShareUpdatingState();
    }

    private setRenegotiationInFlight(next: boolean): void {
        this.isRenegotiationInFlight = next;
        this.emitScreenShareUpdatingState();
    }

    private emitScreenShareUpdatingState(): void {
        this.onScreenShareUpdatingChange(this.isScreenShareUpdating());
    }

    private isScreenShareUpdating(): boolean {
        return this.isCreatingRenegotiationOffer || this.isRenegotiationInFlight || this.pendingScreenShareChange || this.remoteScreenWatchChangePending;
    }

    private startRenegotiationAnswerTimeout(reason: string): void {
        this.clearRenegotiationAnswerTimeout();
        this.renegotiationAnswerTimeoutRef = setTimeout(() => {
            void this.failRenegotiationTransaction(
                new Error(`Renegotiation answer timed out after ${RENEGOTIATION_ANSWER_TIMEOUT_MS}ms`),
                reason,
            );
        }, RENEGOTIATION_ANSWER_TIMEOUT_MS);
    }

    private clearRenegotiationAnswerTimeout(): void {
        if (this.renegotiationAnswerTimeoutRef) {
            clearTimeout(this.renegotiationAnswerTimeoutRef);
            this.renegotiationAnswerTimeoutRef = null;
        }
    }

    private async failRenegotiationTransaction(error: Error, reason: string): Promise<void> {
        const peerConnection = this.peerConnection;
        this.clearRenegotiationAnswerTimeout();
        debugCall('[WebRTCService] renegotiation failed', {
            call_id: this.getCallId(),
            reason,
            error: error.message,
            signalingState: peerConnection?.signalingState,
        });

        if (peerConnection?.signalingState === 'have-local-offer') {
            try {
                await peerConnection.setLocalDescription({ type: 'rollback' } as RTCLocalSessionDescriptionInit);
                debugCall('[WebRTCService] renegotiation rolled back', {
                    call_id: this.getCallId(),
                    reason,
                });
            } catch (rollbackError) {
                debugCall('[WebRTCService] renegotiation rollback failed', {
                    call_id: this.getCallId(),
                    reason,
                    error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
                });
            }
        }

        if (this.desiredScreenShareActive && this.isScreenShareActiveLocal) {
            await this.detachScreenTrack({ stopTracks: true });
            this.desiredScreenShareActive = false;
            this.pendingScreenShareChange = false;
            this.pendingScreenShareChangeReason = null;
            this.rejectPendingScreenShareStarts(error);
            debugCall('[WebRTCService] local screen share reset after renegotiation failure', {
                call_id: this.getCallId(),
                reason,
            });
        }

        if (reason === 'remote_screen_watch') {
            this.failRemoteScreenWatch(error);
        }

        this.pendingRenegotiationReason = null;
        this.setRenegotiationInFlight(false);
        await this.refreshDiagnostics();
        this.consumePendingScreenShareChangeIfStable();
        this.runQueuedRenegotiationIfStable();
    }

    private syncRemoteScreenFromReceivers(reason: string): void {
        const peerConnection = this.peerConnection;
        if (!peerConnection || !this.remoteScreenShareActive || !this.isWatchingRemoteScreen) return;

        const remoteTransceiver = this.findRemoteScreenReceiveTransceiver();
        if (!remoteTransceiver) return;
        this.remoteScreenTransceiver = remoteTransceiver;
        const videoReceivers = [remoteTransceiver.receiver];
        debugCall('[WebRTCService] remote video receivers', {
            call_id: this.getCallId(),
            reason,
            count: videoReceivers.length,
            tracks: videoReceivers.map((receiver) => ({
                id: receiver.track?.id,
                muted: receiver.track?.muted,
                readyState: receiver.track?.readyState,
            })),
        });

        const candidateTrack = videoReceivers.find((receiver) => receiver.track?.readyState === 'live')?.track;
        if (!candidateTrack) return;

        if (candidateTrack.muted) {
            this.setRemoteScreenLoading(true, `${reason}_muted`);
            this.attachRemoteScreenTrackLifecycle(candidateTrack);
            return;
        }

        const videoTrack = candidateTrack;
        if (!videoTrack) return;

        this.setRemoteScreenTrack(videoTrack, reason);
    }

    private isLocalScreenSendTransceiver(transceiver: RTCRtpTransceiver): boolean {
        if (transceiver === this.screenTransceiver) return true;
        if (this.screenSender && transceiver.sender === this.screenSender) return true;
        const localTrack = this.screenStream?.getVideoTracks()[0] ?? this.screenSender?.track;
        return Boolean(localTrack && transceiver.sender.track === localTrack);
    }

    private findRemoteScreenReceiveTransceiver(): RTCRtpTransceiver | null {
        const peerConnection = this.peerConnection;
        if (!peerConnection || typeof peerConnection.getTransceivers !== 'function') return null;
        const transceivers = peerConnection.getTransceivers();
        const tracked = this.remoteScreenTransceiver;
        if (tracked && !this.isLocalScreenSendTransceiver(tracked)) return tracked;
        return transceivers.find((transceiver) => {
            return !this.isLocalScreenSendTransceiver(transceiver)
                && !transceiver.sender.track
                && transceiver.receiver.track?.kind === 'video';
        }) ?? null;
    }

    private setRemoteScreenAvailability(available: boolean): void {
        if (this.remoteScreenAvailable === available) return;
        this.remoteScreenAvailable = available;
        this.onRemoteScreenAvailabilityChange(available);
        debugCall('[WebRTCService] remote screen availability changed', {
            call_id: this.getCallId(),
            available,
            watching: this.isWatchingRemoteScreen,
        });
    }

    private startRemoteScreenWatchTimeout(): void {
        this.clearRemoteScreenWatchTimeout();
        this.remoteScreenWatchTimeoutRef = setTimeout(() => {
            const error = new Error('Could not load screen share. Try again.');
            this.failRemoteScreenWatch(error);
        }, 8_000);
    }

    private clearRemoteScreenWatchTimeout(): void {
        if (this.remoteScreenWatchTimeoutRef) {
            clearTimeout(this.remoteScreenWatchTimeoutRef);
            this.remoteScreenWatchTimeoutRef = null;
        }
    }

    private resolveRemoteScreenWatch(): void {
        const resolve = this.remoteScreenWatchResolve;
        this.remoteScreenWatchResolve = null;
        this.remoteScreenWatchReject = null;
        this.remoteScreenWatchPromise = null;
        this.clearRemoteScreenWatchTimeout();
        resolve?.();
    }

    private rejectRemoteScreenWatch(error: Error): void {
        const reject = this.remoteScreenWatchReject;
        this.remoteScreenWatchResolve = null;
        this.remoteScreenWatchReject = null;
        this.remoteScreenWatchPromise = null;
        reject?.(error);
    }

    private failRemoteScreenWatch(error: Error): void {
        this.clearRemoteScreenWatchTimeout();
        this.remoteScreenWatchChangePending = false;
        this.desiredRemoteScreenWatch = false;
        this.isWatchingRemoteScreen = false;
        this.setRemoteScreenReceiveDirection('inactive');
        this.setRemoteScreenLoading(false, 'remote_screen_watch_failed');
        this.clearRemoteScreenStream('remote_screen_watch_failed');
        this.onRemoteScreenWatchStateChange(false);
        this.rejectRemoteScreenWatch(error);
        debugCall('[WebRTCService] remote screen watch failed', {
            call_id: this.getCallId(),
            error: error.message,
            available: this.remoteScreenAvailable,
        });
    }

    private setRemoteScreenReceiveDirection(direction: RTCRtpTransceiverDirection): boolean {
        if (this.remoteScreenTransceiver && this.isLocalScreenSendTransceiver(this.remoteScreenTransceiver)) {
            debugCall('[WebRTCService] remote/local transceiver role collision', {
                call_id: this.getCallId(),
                direction,
                localTransceiver: this.screenTransceiver?.mid ?? null,
                remoteTransceiver: this.remoteScreenTransceiver.mid,
            });
            if (import.meta.env.DEV) {
                console.error('[WebRTCService] Refusing to mutate local screen sender as remote receiver');
            }
            return false;
        }
        const transceiver = this.findRemoteScreenReceiveTransceiver();
        if (!transceiver) return false;
        if (this.isLocalScreenSendTransceiver(transceiver) || transceiver === this.screenTransceiver) {
            debugCall('[WebRTCService] remote/local transceiver role collision', {
                call_id: this.getCallId(),
                direction,
                localTransceiver: this.screenTransceiver?.mid ?? null,
                remoteTransceiver: transceiver.mid,
            });
            if (import.meta.env.DEV) {
                console.error('[WebRTCService] Refusing to mutate local screen sender as remote receiver');
            }
            return false;
        }
        this.remoteScreenTransceiver = transceiver;
        if (transceiver.direction === direction) return true;
        transceiver.direction = direction;
        debugCall('[WebRTCService] remote screen receiver direction changed', {
            call_id: this.getCallId(),
            direction,
            transceiver: transceiver.mid,
        });
        return true;
    }

    private async setRemoteScreenWatchDesired(watching: boolean): Promise<void> {
        if (watching && !this.remoteScreenAvailable) return;
        if (this.desiredRemoteScreenWatch === watching && this.isWatchingRemoteScreen === watching && !this.remoteScreenWatchChangePending) {
            return;
        }

        this.desiredRemoteScreenWatch = watching;
        this.isWatchingRemoteScreen = watching;
        this.onRemoteScreenWatchStateChange(watching);
        if (watching && !this.setRemoteScreenReceiveDirection('recvonly')) {
            throw new Error('No safe remote screen receive transceiver is available');
        }
        if (!watching) this.setRemoteScreenReceiveDirection('inactive');

        if (watching) {
            this.setRemoteScreenLoading(true, 'watch_requested');
        } else {
            this.setRemoteScreenLoading(false, 'watch_stopped');
            this.clearRemoteScreenStream('watch_stopped');
        }

        const peerConnection = this.peerConnection;
        if (!peerConnection) return;
        if (!this.canApplyScreenShareChangeNow()) {
            this.remoteScreenWatchChangePending = true;
            this.pendingRenegotiationReason = 'remote_screen_watch';
            this.emitScreenShareUpdatingState();
            debugCall('[WebRTCService] remote screen watch change queued', {
                call_id: this.getCallId(),
                watching,
                signalingState: peerConnection.signalingState,
            });
            return;
        }

        this.remoteScreenWatchChangePending = false;
        await this.renegotiate('remote_screen_watch');
    }

    private attachRemoteScreenTrackLifecycle(track: MediaStreamTrack): void {
        track.onended = () => {
            debugCall('[WebRTCService] remote screen track ended', {
                call_id: this.getCallId(),
                track_id: track.id,
            });
            if (this.isWatchingRemoteScreen) {
                this.remoteScreenShareActive = false;
                this.setRemoteScreenAvailability(false);
                this.setRemoteScreenLoading(false, 'onended');
                this.clearRemoteScreenStream('onended');
                this.isWatchingRemoteScreen = false;
                this.desiredRemoteScreenWatch = false;
                this.setRemoteScreenReceiveDirection('inactive');
                this.onRemoteScreenWatchStateChange(false);
                this.clearRemoteScreenWatchTimeout();
                this.rejectRemoteScreenWatch(new Error('Remote screen share ended'));
            }
        };
        track.onmute = () => {
            debugCall('[WebRTCService] remote screen track muted', {
                call_id: this.getCallId(),
                track_id: track.id,
            });
            if (this.isWatchingRemoteScreen) {
                this.setRemoteScreenLoading(true, 'onmute');
                this.clearRemoteScreenStream('onmute');
                this.startRemoteScreenWatchTimeout();
            }
        };
        track.onunmute = () => {
            debugCall('[WebRTCService] remote screen track unmuted', {
                call_id: this.getCallId(),
                track_id: track.id,
            });
            if (this.remoteScreenShareActive && this.isWatchingRemoteScreen) {
                this.setRemoteScreenTrack(track, 'onunmute');
            }
        };
    }

    private setRemoteScreenTrack(track: MediaStreamTrack, reason: string): void {
        if (!this.isWatchingRemoteScreen || !this.remoteScreenShareActive) return;
        this.attachRemoteScreenTrackLifecycle(track);
        const screenStream = new MediaStream([track]);
        this.remoteScreenStream = screenStream;
        this.resolveRemoteScreenWatch();
        this.setRemoteScreenLoading(false, reason);
        debugCall('[WebRTCService] set remote screen stream', {
            call_id: this.getCallId(),
            reason,
            track_id: track.id,
            muted: track.muted,
            readyState: track.readyState,
        });
        this.onRemoteScreenStream(screenStream);
    }

    private clearRemoteScreenStream(reason = 'clear'): void {
        const hadRemoteScreenStream = Boolean(this.remoteScreenStream);
        this.remoteScreenStream = null;
        debugCall('[WebRTCService] clear remote screen stream', {
            call_id: this.getCallId(),
            reason,
            hadRemoteScreenStream,
        });
        this.onRemoteScreenStream(null);
    }

    private setRemoteScreenLoading(loading: boolean, reason: string): void {
        debugCall('[WebRTCService] remote screen loading', {
            call_id: this.getCallId(),
            loading,
            reason,
        });
        this.onRemoteScreenLoading(loading);
    }

    private async initPeerConnection(): Promise<void> {
        const state = getState();
        const inputId = state.selectedInputDeviceId || 'default';

        this.localStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: inputId !== 'default' ? { exact: inputId } : undefined,
                noiseSuppression: state.noiseSuppression,
                echoCancellation: state.echoCancellation,
                autoGainControl: state.autoGainControl,
            },
            video: false,
        });
        this.setLocalMuted(this.localMuted);
        this.peerConnection = new RTCPeerConnection({ iceServers: buildIceServers() });
        this.attachDiagnosticsListeners(this.peerConnection);
        this.localStream.getTracks().forEach(track => {
            this.peerConnection!.addTrack(track, this.localStream!);
        });
        this.peerConnection.onicecandidate = (event) => {
            if (!event.candidate) {
                void this.refreshDiagnostics();
                return;
            }
            this.handleLocalIceCandidate(event.candidate);
        };
        this.peerConnection.ontrack = (event) => {
            const stream = event.streams[0];
            if (!stream) return;

            if (event.track?.kind === 'video') {
                this.remoteScreenShareActive = true;
                const eventTransceiver = event.transceiver;
                this.remoteScreenTransceiver = eventTransceiver && !this.isLocalScreenSendTransceiver(eventTransceiver)
                    ? eventTransceiver
                    : this.findRemoteScreenReceiveTransceiver();
                this.setRemoteScreenAvailability(true);
                if (!this.isWatchingRemoteScreen) {
                    this.setRemoteScreenLoading(false, 'ontrack_not_watching');
                    this.clearRemoteScreenStream('ontrack_not_watching');
                    this.setRemoteScreenReceiveDirection('inactive');
                } else if (event.track.muted) {
                    this.setRemoteScreenLoading(true, 'ontrack_muted');
                    this.attachRemoteScreenTrackLifecycle(event.track);
                } else {
                    this.setRemoteScreenTrack(event.track, 'ontrack');
                }
                return;
            }

            this.remoteStream = stream;
            this.onRemoteStream(stream);
        };
        await this.refreshDiagnostics();
    }

    private attachDiagnosticsListeners(peerConnection: RTCPeerConnection): void {
        peerConnection.onconnectionstatechange = () => {
            void this.refreshDiagnostics();
        };
        peerConnection.oniceconnectionstatechange = () => {
            void this.refreshDiagnostics();
        };
        peerConnection.onicegatheringstatechange = () => {
            void this.refreshDiagnostics();
        };
        peerConnection.onsignalingstatechange = () => {
            void this.refreshDiagnostics();
            this.runQueuedRenegotiationIfStable();
        };
    }

    private emitDiagnostics(): void {
        const snapshot = this.getDiagnosticsSnapshot();
        this.onDiagnosticsChange?.(snapshot);
        this.logDiagnostics(snapshot);
    }

    private async refreshDiagnostics(): Promise<void> {
        const peerConnection = this.peerConnection;
        if (!peerConnection) {
            this.diagnostics = cloneDiagnostics(EMPTY_DIAGNOSTICS);
            this.emitDiagnostics();
            return;
        }

        const nextDiagnostics: WebRTCDiagnostics = {
            connectionState: peerConnection.connectionState ?? 'unknown',
            iceConnectionState: peerConnection.iceConnectionState ?? 'unknown',
            iceGatheringState: peerConnection.iceGatheringState ?? 'unknown',
            signalingState: peerConnection.signalingState ?? 'unknown',
            selectedCandidatePair: null,
        };

        try {
            if (typeof peerConnection.getStats === 'function') {
                const stats = await peerConnection.getStats();
                nextDiagnostics.selectedCandidatePair = inspectSelectedCandidatePairFromStats(stats);
                if (isCallDebugEnabled()) {
                    const inboundVideo = getStatsValues(stats).filter((stat) => stat.type === 'inbound-rtp' && stat.kind === 'video');
                    debugCall('[WebRTCService] remote screen subscription stats', {
                        call_id: this.getCallId(),
                        available: this.remoteScreenAvailable,
                        watching: this.isWatchingRemoteScreen,
                        transceiverDirection: this.remoteScreenTransceiver?.direction ?? null,
                        inboundVideo: inboundVideo.map((stat) => ({ id: stat.id, bytesReceived: stat.bytesReceived ?? null })),
                    });
                }
            }
        } catch {
            nextDiagnostics.selectedCandidatePair = null;
        }

        const previousSerialized = JSON.stringify(this.diagnostics);
        const nextSerialized = JSON.stringify(nextDiagnostics);
        this.diagnostics = nextDiagnostics;

        if (previousSerialized !== nextSerialized) {
            this.emitDiagnostics();
        }
    }

    private logDiagnostics(diagnostics: WebRTCDiagnostics): void {
        if (!import.meta.env.DEV || !isCallDebugEnabled()) return;
        debugCall('[WebRTC] diagnostics', {
            connectionState: diagnostics.connectionState,
            iceConnectionState: diagnostics.iceConnectionState,
            iceGatheringState: diagnostics.iceGatheringState,
            signalingState: diagnostics.signalingState,
            selectedCandidatePair: diagnostics.selectedCandidatePair
                ? {
                    candidatePairId: diagnostics.selectedCandidatePair.candidatePairId,
                    localCandidateType: diagnostics.selectedCandidatePair.localCandidateType,
                    state: diagnostics.selectedCandidatePair.state,
                    nominated: diagnostics.selectedCandidatePair.nominated,
                }
                : null,
        });
    }
}
