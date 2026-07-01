import type { ResourceRef } from "@/shared/types";

export type CallStatus = 'idle' | 'calling' | 'ringing' | 'active' | 'ended';

// ── Входящие события от сервера ──────────────────────────────────────────────

export interface IncomingCallPayload {
    from_user_id: ResourceRef;
    from_username: string;
    call_id: string;
}

export interface AnswerPayload {
    from_user_id: ResourceRef;
    from_username: string;
    sdp: string;
}

export interface IceCandidatePayload {
    from_user_id: ResourceRef;
    candidate: RTCIceCandidateInit;
}

export interface HangUpPayload {
    from_user_id: ResourceRef;
}

export interface CallDiagnostics {
    connectionState: RTCPeerConnectionState | 'unknown';
    iceConnectionState: RTCIceConnectionState | 'unknown';
    iceGatheringState: RTCIceGatheringState | 'unknown';
    signalingState: RTCSignalingState | 'unknown';
    selectedLocalCandidateType: 'host' | 'srflx' | 'relay' | 'unknown';
}

// ── Публичный интерфейс хука ─────────────────────────────────────────────────

export interface UseCallReturn {
    status: CallStatus;
    remoteUserId: ResourceRef | null;
    remoteUsername: string | null;
    callId: string | null;
    isMuted: boolean;
    isScreenSharing: boolean;
    remoteStream: MediaStream | null;
    remoteScreenStream: MediaStream | null;
    localScreenStream: MediaStream | null;
    seconds: number;
    diagnostics: CallDiagnostics;
    startCall: (targetUserId: ResourceRef) => void;
    startScreenShare: () => Promise<void>;
    stopScreenShare: () => void;
    acceptCall: () => void;
    rejectCall: () => void;
    hangUp: () => void;
    toggleMute: () => void;
}
