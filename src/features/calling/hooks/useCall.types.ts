export type CallStatus = 'idle' | 'calling' | 'ringing' | 'active' | 'ended';

// ── Входящие события от сервера ──────────────────────────────────────────────

export interface IncomingCallPayload {
    from_user_id: number;
    from_username: string;
    call_id: string;
}

export interface AnswerPayload {
    from_user_id: number;
    from_username: string;
    sdp: string;
}

export interface IceCandidatePayload {
    from_user_id: number;
    candidate: RTCIceCandidateInit;
}

export interface HangUpPayload {
    from_user_id: number;
}

// ── Публичный интерфейс хука ─────────────────────────────────────────────────

export interface UseCallReturn {
    status: CallStatus;
    remoteUserId: number | null;
    remoteUsername: string | null;
    callId: string | null;
    isMuted: boolean;
    remoteStream: MediaStream | null;
    seconds: number;
    startCall: (targetUserId: number) => void;
    acceptCall: () => void;
    rejectCall: () => void;
    hangUp: () => void;
    toggleMute: () => void;
}