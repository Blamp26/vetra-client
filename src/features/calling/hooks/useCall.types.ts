import type { ResourceRef } from "@/shared/types";

export type CallStatus = 'idle' | 'calling' | 'ringing' | 'active' | 'ended' | 'failed';
export type CallServiceStatus = 'idle' | 'connecting' | 'ready' | 'retrying' | 'closed' | 'failed';

// ── Входящие события от сервера ──────────────────────────────────────────────

export interface IncomingCallPayload {
    from_user_id: ResourceRef;
    from_username: string;
    call_id: string;
}

export interface AnswerPayload {
    from_user_id: ResourceRef;
    from_username?: string;
    sdp: string;
    call_id?: string;
}

export interface RenegotiationSignalPayload {
    sdp: string;
    type: 'offer' | 'answer';
    screen_share_active?: boolean;
}

export type CallIceCandidatePayload = RTCIceCandidateInit;

export interface IceCandidatePayload {
    from_user_id: ResourceRef;
    call_id?: string;
    candidate: CallIceCandidatePayload;
}

export interface HangUpPayload {
    from_user_id: ResourceRef;
    call_id?: string;
}

export interface CallDiagnostics {
    connectionState: RTCPeerConnectionState | 'unknown';
    iceConnectionState: RTCIceConnectionState | 'unknown';
    iceGatheringState: RTCIceGatheringState | 'unknown';
    signalingState: RTCSignalingState | 'unknown';
    selectedLocalCandidateType: 'host' | 'srflx' | 'relay' | 'unknown';
}

export interface CallIssue {
    tone: 'default' | 'error';
    message: string;
}

// ── Публичный интерфейс хука ─────────────────────────────────────────────────

export interface UseCallReturn {
    status: CallStatus;
    callServiceStatus: CallServiceStatus;
    remoteUserId: ResourceRef | null;
    remoteUsername: string | null;
    callId: string | null;
    isMuted: boolean;
    isScreenSharing: boolean;
    isScreenShareUpdating: boolean;
    isRemoteScreenLoading: boolean;
    isRemoteScreenAvailable: boolean;
    isWatchingRemoteScreen: boolean;
    remoteStream: MediaStream | null;
    remoteScreenStream: MediaStream | null;
    localScreenStream: MediaStream | null;
    seconds: number;
    diagnostics: CallDiagnostics;
    callIssue: CallIssue | null;
    isIncomingActionPending: boolean;
    startCall: (targetUserId: ResourceRef, targetUsername?: string) => void;
    startScreenShare: () => Promise<void>;
    stopScreenShare: () => void;
    watchRemoteScreen: () => Promise<void>;
    stopWatchingRemoteScreen: () => Promise<void>;
    acceptCall: () => void;
    rejectCall: () => void;
    hangUp: () => void;
    toggleMute: () => void;
}
