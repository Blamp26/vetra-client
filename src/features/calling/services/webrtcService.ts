import { Channel } from 'phoenix';
import { getState } from '@/store';
import type { ResourceRef } from '@/shared/types';
import type { CallIceCandidatePayload, RenegotiationSignalPayload } from '../hooks/useCall.types';

const DEFAULT_STUN_URL = 'stun:stun.l.google.com:19302';

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
};

const CALL_DEBUG_KEY = 'vetra.debug.calls';
const RENEGOTIATION_SIGNAL_KEY = '__vetra_call_signal';

const EMPTY_DIAGNOSTICS: WebRTCDiagnostics = {
    connectionState: 'unknown',
    iceConnectionState: 'unknown',
    iceGatheringState: 'unknown',
    signalingState: 'unknown',
    selectedCandidatePair: null,
};

function readEnvValue(value?: string): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

function cloneDiagnostics(diagnostics: WebRTCDiagnostics): WebRTCDiagnostics {
    return {
        ...diagnostics,
        selectedCandidatePair: diagnostics.selectedCandidatePair
            ? { ...diagnostics.selectedCandidatePair }
            : null,
    };
}

function isCallDebugEnabled(): boolean {
    try {
        return globalThis.localStorage?.getItem(CALL_DEBUG_KEY) === '1';
    } catch {
        return false;
    }
}

function debugCall(message: string, details?: Record<string, unknown>): void {
    if (!isCallDebugEnabled()) return;
    console.log(message, details ?? {});
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

export function buildIceServers(): RTCIceServer[] {
    const stunUrl = readEnvValue(import.meta.env.VITE_WEBRTC_STUN_URL) ?? DEFAULT_STUN_URL;
    const turnUrl = readEnvValue(import.meta.env.VITE_WEBRTC_TURN_URL);
    const turnUsername = readEnvValue(import.meta.env.VITE_WEBRTC_TURN_USERNAME);
    const turnCredential = readEnvValue(import.meta.env.VITE_WEBRTC_TURN_CREDENTIAL);

    const iceServers: RTCIceServer[] = [{ urls: stunUrl }];

    if (turnUrl && turnUsername && turnCredential) {
        iceServers.push({
            urls: turnUrl,
            username: turnUsername,
            credential: turnCredential,
        });
    }

    return iceServers;
}

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

function isRenegotiationSignal(candidate: CallIceCandidatePayload): candidate is RenegotiationSignalPayload {
    return (
        typeof candidate === 'object' &&
        candidate !== null &&
        RENEGOTIATION_SIGNAL_KEY in candidate &&
        (candidate as RenegotiationSignalPayload).__vetra_call_signal !== undefined
    );
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
    private screenStream: MediaStream | null = null;
    private screenSender: RTCRtpSender | null = null;
    private screenTrackEndedHandler: (() => void) | null = null;
    private channel: Channel;
    private localUserId: number;
    private remoteUserId: ResourceRef;
    private callId: string | null = null;
    private iceCandidateQueue: RTCIceCandidateInit[] = [];
    private queuedIceCandidateKeys = new Set<string>();
    private appliedIceCandidateKeys = new Set<string>();
    private remoteDescriptionSet = false;
    private localMuted = false;
    private isCreatingRenegotiationOffer = false;
    private hasQueuedRenegotiation = false;
    private diagnostics: WebRTCDiagnostics = cloneDiagnostics(EMPTY_DIAGNOSTICS);

    public onRemoteStream: (stream: MediaStream) => void = () => { };
    public onRemoteScreenStream: (stream: MediaStream | null) => void = () => { };
    public onCallIdReceived: ((callId: string) => void) | null = null;
    public onDiagnosticsChange: ((diagnostics: WebRTCDiagnostics) => void) | null = null;

    constructor(channel: Channel, localUserId: number, remoteUserId: ResourceRef) {
        this.channel = channel;
        this.localUserId = localUserId;
        this.remoteUserId = remoteUserId;
    }

    setCallId(callId: string | null): void {
        this.callId = callId;
    }

    getSignalingCallId(): string {
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
            target_user_id: this.remoteUserId,
            sdp_type: offer.type,
        });
        this.channel.push('offer', {
            sdp: this.peerConnection!.localDescription!.sdp,
            to_user_id: this.remoteUserId,
        }).receive('ok', ({ call_id }: { call_id: string }) => {
            this.setCallId(call_id);
            if (this.onCallIdReceived) this.onCallIdReceived(call_id);
        });
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
        this.channel.push('answer', {
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
        await this.refreshDiagnostics();
        await this.flushIceCandidateQueue();
        this.runQueuedRenegotiationIfStable();
    }

    async handleOffer(sdp: string): Promise<void> {
        if (!this.peerConnection) throw new Error('No peer connection');
        debugCall('[WebRTCService] handle active-call renegotiation offer', {
            call_id: this.getCallId(),
            signalingState: this.peerConnection.signalingState,
        });
        await this.peerConnection.setRemoteDescription(
            new RTCSessionDescription({ type: 'offer', sdp })
        );
        this.remoteDescriptionSet = true;
        if (!remoteSdpHasSendingVideo(sdp)) {
            this.clearRemoteScreenStream();
        }
        await this.refreshDiagnostics();
        await this.flushIceCandidateQueue();

        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);

        this.sendRenegotiationSignal({
            __vetra_call_signal: 'renegotiation_answer',
            sdp: this.peerConnection.localDescription!.sdp ?? answer.sdp ?? '',
            sdp_type: 'answer',
        });
    }

    async addIceCandidate(candidate: CallIceCandidatePayload): Promise<void> {
        if (!this.peerConnection) return;

        if (isRenegotiationSignal(candidate)) {
            if (candidate.__vetra_call_signal === 'renegotiation_offer') {
                await this.handleOffer(candidate.sdp);
                return;
            }

            await this.handleAnswer(candidate.sdp);
            return;
        }

        await this.addRealIceCandidate(candidate);
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

        await this.stopScreenShare({ stopTracks: true, renegotiate: false });

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
            void this.stopScreenShare({ stopTracks: false }).finally(() => {
                onEnded?.();
            });
        };

        if ('addEventListener' in screenTrack) {
            screenTrack.addEventListener?.('ended', handleEnded);
        }
        screenTrack.onended = handleEnded;

        this.screenStream = stream;
        this.screenTrackEndedHandler = handleEnded;
        this.screenSender = this.peerConnection.addTrack(screenTrack, stream);

        await this.renegotiate();
        return stream;
    }

    async stopScreenShare(options?: { stopTracks?: boolean; renegotiate?: boolean }): Promise<void> {
        const stopTracks = options?.stopTracks ?? true;
        const shouldRenegotiate = options?.renegotiate ?? true;
        const stream = this.screenStream;
        const sender = this.screenSender;
        const track = stream?.getVideoTracks()[0] ?? null;
        const endedHandler = this.screenTrackEndedHandler;

        this.screenStream = null;
        this.screenSender = null;
        this.screenTrackEndedHandler = null;

        if (track && endedHandler) {
            if ('removeEventListener' in track) {
                track.removeEventListener?.('ended', endedHandler);
            }
            track.onended = null;
        }

        if (this.peerConnection && sender) {
            this.peerConnection.removeTrack(sender);
        }

        if (stopTracks && stream) {
            stream.getTracks().forEach((mediaTrack) => mediaTrack.stop());
        }

        if (shouldRenegotiate && this.peerConnection && sender) {
            await this.renegotiate();
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
        this.clearRemoteScreenStream();
        this.iceCandidateQueue = [];
        this.queuedIceCandidateKeys.clear();
        this.appliedIceCandidateKeys.clear();
        this.remoteDescriptionSet = false;
        this.isCreatingRenegotiationOffer = false;
        this.hasQueuedRenegotiation = false;
        this.callId = null;
        this.diagnostics = cloneDiagnostics(EMPTY_DIAGNOSTICS);
        this.emitDiagnostics();
        this.onRemoteStream = () => { };
        this.onRemoteScreenStream = () => { };
        this.onCallIdReceived = null;
        this.onDiagnosticsChange = null;
    }

    hangUp(): void {
        this.dispose();
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

    private getCallId(): string {
        return this.callId ?? `${this.remoteUserId}:${this.localUserId}`;
    }

    private async renegotiate(): Promise<void> {
        const peerConnection = this.peerConnection;
        if (!peerConnection) return;
        if (this.isCreatingRenegotiationOffer || peerConnection.signalingState !== 'stable') {
            this.hasQueuedRenegotiation = true;
            return;
        }

        this.isCreatingRenegotiationOffer = true;
        try {
            const offer = await peerConnection.createOffer();
            if (peerConnection.signalingState !== 'stable') {
                this.hasQueuedRenegotiation = true;
                return;
            }
            await peerConnection.setLocalDescription(offer);
            debugCall('[WebRTCService] create renegotiation offer', {
                event: 'ice_candidate',
                call_id: this.getCallId(),
                target_user_id: this.remoteUserId,
                sdp_type: offer.type,
                signalingState: peerConnection.signalingState,
            });
            this.sendRenegotiationSignal({
                __vetra_call_signal: 'renegotiation_offer',
                sdp: peerConnection.localDescription!.sdp ?? offer.sdp ?? '',
                sdp_type: 'offer',
            });
        } finally {
            this.isCreatingRenegotiationOffer = false;
        }
    }

    private sendRenegotiationSignal(signal: RenegotiationSignalPayload): void {
        debugCall('[WebRTCService] send call signal', {
            event: 'ice_candidate',
            call_id: this.getCallId(),
            target_user_id: this.remoteUserId,
            signal: signal.__vetra_call_signal,
            sdp_type: signal.sdp_type,
        });
        this.channel.push('ice_candidate', {
            candidate: signal,
            to_user_id: this.remoteUserId,
            call_id: this.getCallId(),
        });
    }

    private runQueuedRenegotiationIfStable(): void {
        const peerConnection = this.peerConnection;
        if (!peerConnection || !this.hasQueuedRenegotiation || peerConnection.signalingState !== 'stable') {
            return;
        }

        this.hasQueuedRenegotiation = false;
        void this.renegotiate();
    }

    private clearRemoteScreenStream(): void {
        if (!this.remoteScreenStream) return;
        this.remoteScreenStream = null;
        this.onRemoteScreenStream(null);
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
            this.channel.push('ice_candidate', {
                candidate: event.candidate,
                to_user_id: this.remoteUserId,
                call_id: this.getCallId(),
            });
        };
        this.peerConnection.ontrack = (event) => {
            const stream = event.streams[0];
            if (!stream) return;

            if (event.track?.kind === 'video') {
                this.remoteScreenStream = stream;
                this.onRemoteScreenStream(stream);
                event.track.onended = () => this.clearRemoteScreenStream();
                event.track.onmute = () => this.clearRemoteScreenStream();
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
        if (!import.meta.env.DEV) return;
        console.log('[WebRTC] diagnostics', {
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
