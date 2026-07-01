import { Channel } from 'phoenix';
import { getState } from '@/store';
import type { ResourceRef } from '@/shared/types';

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

export class WebRTCService {
    private peerConnection: RTCPeerConnection | null = null;
    private localStream: MediaStream | null = null;
    private remoteStream: MediaStream | null = null;
    private channel: Channel;
    private localUserId: number;
    private remoteUserId: ResourceRef;
    private iceCandidateQueue: RTCIceCandidateInit[] = [];
    private remoteDescriptionSet = false;
    private localMuted = false;
    private diagnostics: WebRTCDiagnostics = cloneDiagnostics(EMPTY_DIAGNOSTICS);

    public onRemoteStream: (stream: MediaStream) => void = () => { };
    public onCallIdReceived: ((callId: string) => void) | null = null;
    public onDiagnosticsChange: ((diagnostics: WebRTCDiagnostics) => void) | null = null;

    constructor(channel: Channel, localUserId: number, remoteUserId: ResourceRef) {
        this.channel = channel;
        this.localUserId = localUserId;
        this.remoteUserId = remoteUserId;
    }

    async startCall(): Promise<void> {
        if (this.peerConnection) throw new Error('Call already started');
        await this.initPeerConnection();
        const offer = await this.peerConnection!.createOffer();
        await this.peerConnection!.setLocalDescription(offer);
        this.channel.push('offer', {
            sdp: this.peerConnection!.localDescription!.sdp,
            to_user_id: this.remoteUserId,
        }).receive('ok', ({ call_id }: { call_id: string }) => {
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

        const callId = `${this.remoteUserId}:${this.localUserId}`;
        this.channel.push('answer', {
            sdp: this.peerConnection!.localDescription!.sdp,
            to_user_id: this.remoteUserId,
            call_id: callId,
        });
    }

    async handleAnswer(sdp: string): Promise<void> {
        if (!this.peerConnection) throw new Error('No peer connection');
        await this.peerConnection.setRemoteDescription(
            new RTCSessionDescription({ type: 'answer', sdp })
        );
        this.remoteDescriptionSet = true;
        await this.refreshDiagnostics();
        await this.flushIceCandidateQueue();
    }

    async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
        if (!this.peerConnection) return;
        if (!this.remoteDescriptionSet) {
            this.iceCandidateQueue.push(candidate);
            return;
        }
        try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            await this.refreshDiagnostics();
        } catch (err) {
            console.error('[WebRTC] Failed to add ICE candidate:', err);
        }
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

    dispose(): void {
        if (this.peerConnection) {
            this.peerConnection.close();
        }
        this.peerConnection = null;
        this.localStream?.getTracks().forEach(track => track.stop());
        this.localStream = null;
        if (this.remoteStream) {
            this.remoteStream = null;
        }
        this.iceCandidateQueue = [];
        this.remoteDescriptionSet = false;
        this.diagnostics = cloneDiagnostics(EMPTY_DIAGNOSTICS);
        this.emitDiagnostics();
        this.onRemoteStream = () => { };
        this.onCallIdReceived = null;
        this.onDiagnosticsChange = null;
    }

    hangUp(): void {
        this.dispose();
    }

    private async flushIceCandidateQueue(): Promise<void> {
        while (this.iceCandidateQueue.length > 0) {
            const candidate = this.iceCandidateQueue.shift()!;
            try {
                await this.peerConnection!.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (err) {
                console.error('[WebRTC] Failed to flush ICE candidate:', err);
            }
        }
        await this.refreshDiagnostics();
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
            const callId = `${this.remoteUserId}:${this.localUserId}`;
            this.channel.push('ice_candidate', {
                candidate: event.candidate,
                to_user_id: this.remoteUserId,
                call_id: callId,
            });
        };
        this.peerConnection.ontrack = (event) => {
            if (event.streams[0]) {
                this.remoteStream = event.streams[0];
                this.onRemoteStream(event.streams[0]);
            }
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
