import { useEffect, useState } from "react";
import type { CallDiagnostics, CallIssue, CallStatus } from "../../hooks/useCall.types";
import type { User } from "@/shared/types";
import type { PersistentCallRuntimeValue } from "../../context/PersistentCallContext";
import type { PersistentPresentationSnapshot } from "../../services/directedCallPresentationModel";
import type { DirectedCallMediaStream } from "../../services/directedCallWebRtcAdapter";
import { callMediaErrorMessage, type CallMediaErrorCode } from "../../utils/callMediaErrors";

export type PersistentCallDirection = "incoming" | "outgoing" | null;

export interface PersistentSidebarCallModel {
  status: CallStatus;
  direction: PersistentCallDirection;
  remoteUsername: string | null;
  seconds: number;
  isMuted: boolean;
  muted: boolean;
  deafened: boolean;
  effectiveMuted: boolean;
  speaking: { localSpeaking: boolean; remoteSpeaking: boolean };
  canToggleMute: boolean;
  canToggleDeafen: boolean;
  callIssue: CallIssue | null;
  canRetryMedia: boolean;
  retryMedia: () => Promise<boolean>;
  isIncomingActionPending: boolean;
  canCancel: boolean;
  canHangup: boolean;
}

export interface PersistentActiveCallDockModel {
  currentUser: User;
  remoteUserId: string | null;
  remoteUser: User | null;
  remoteUsername: string;
  seconds: number;
  isMuted: boolean;
  muted: boolean;
  deafened: boolean;
  effectiveMuted: boolean;
  speaking: { localSpeaking: boolean; remoteSpeaking: boolean };
  canToggleMute: boolean;
  canToggleDeafen: boolean;
  callIssue: CallIssue | null;
  canRetryMedia: boolean;
  retryMedia: () => Promise<boolean>;
  diagnostics: CallDiagnostics;
  screenShareAvailable: boolean;
  isScreenSharing: boolean;
  isScreenShareUpdating: boolean;
  canRetryScreenShare: boolean;
  localScreenShareStream: DirectedCallMediaStream | null;
  remoteScreenShareAvailable: boolean;
  remoteScreenShareStream: DirectedCallMediaStream | null;
  startScreenShare: () => Promise<boolean>;
  stopScreenShare: () => Promise<boolean>;
}

function toCallIssue(snapshot: PersistentPresentationSnapshot): CallIssue | null {
  return snapshot.callIssue ? { tone: "error", message: snapshot.callIssue.message } : null;
}

function runtimeCallIssue(call: PersistentCallRuntimeValue): CallIssue | null {
  return toCallIssue(call.presentation) ?? (call.screenShareIssue ? {
    tone: "error",
    message: call.screenShareIssue.message,
  } : call.media.localIssue ? {
    tone: "error",
    message: call.media.mediaErrorCode
      ? callMediaErrorMessage(call.media.mediaErrorCode as CallMediaErrorCode)
      : call.media.localIssue === "transport_recovery"
      ? "The call setup was interrupted. Try again."
      : call.media.localIssue === "audio_input_switch_failed"
        ? "Couldn’t switch microphone. The previous microphone is still active."
        : "Call audio setup needs attention.",
  } : null);
}

export function persistentCallElapsedSeconds(snapshot: PersistentPresentationSnapshot, now = Date.now()): number {
  const start = snapshot.timestamps?.active_at ?? snapshot.timestamps?.connecting_at ?? snapshot.timestamps?.accepted_at;
  if (!start) return 0;
  const end = snapshot.terminalState ? snapshot.timestamps?.ended_at : null;
  const startTime = Date.parse(start);
  const endTime = end ? Date.parse(end) : now;
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return 0;
  return Math.max(0, Math.floor((endTime - startTime) / 1000));
}

export function usePersistentCallElapsedSeconds(snapshot: PersistentPresentationSnapshot | null): number {
  const [now, setNow] = useState(() => Date.now());
  const isRunning = snapshot?.phase === "connecting" || snapshot?.phase === "active";

  useEffect(() => {
    if (!isRunning) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isRunning, snapshot?.callId]);

  return snapshot ? persistentCallElapsedSeconds(snapshot, now) : 0;
}

export function persistentCallSidebarModel(call: PersistentCallRuntimeValue, seconds: number): PersistentSidebarCallModel {
  const { presentation } = call;
  const uxStatus = call.ux?.status ?? (presentation.phase === "active"
    ? { kind: "connected", callId: presentation.callId!, peerPublicId: presentation.peerPublicId!, direction: "outgoing" as const }
    : presentation.phase === "terminal"
      ? { kind: "ended", reason: "ended" as const, callId: presentation.callId!, peerPublicId: presentation.peerPublicId!, direction: "outgoing" as const }
      : { kind: "idle" as const });
  const incoming = presentation.incomingModal.visible && presentation.participantRole === "recipient";
  const status: CallStatus = call.ux ? (uxStatus.kind === "connected"
    ? "connected"
    : uxStatus.kind === "connecting"
      ? "connecting"
      : uxStatus.kind === "reconnecting"
        ? "reconnecting"
        : uxStatus.kind === "failed"
          ? "failed"
          : uxStatus.kind === "ended"
            ? "ended"
            : uxStatus.kind === "ringing" && incoming
              ? "ringing"
              : uxStatus.kind === "idle" && call.ux?.actionBusy
                ? "idle"
                : uxStatus.kind === "ringing"
                  ? "calling"
                  : presentation.phase === "terminal" ? "ended" : "idle")
    : presentation.phase === "active" ? "active" : presentation.phase === "terminal" ? "ended" : incoming ? "ringing" : presentation.phase === "idle" ? "idle" : "calling";

  return {
    status,
    direction: uxStatus.kind === "ringing" && incoming ? "incoming" : contextDirection(uxStatus, presentation),
    remoteUsername: incoming ? presentation.incomingModal.callerDisplayName : presentation.peerUsername,
    seconds,
    isMuted: call.isMuted,
    muted: call.muted,
    deafened: call.deafened,
    effectiveMuted: call.effectiveMuted,
    speaking: call.speaking,
    canToggleMute: call.canToggleMute,
    canToggleDeafen: call.canToggleDeafen,
    callIssue: runtimeCallIssue(call),
    canRetryMedia: call.media.canRetryMedia,
    isIncomingActionPending: incoming && Boolean(presentation.pendingAction),
    canCancel: !incoming && presentation.canCancel,
    canHangup: presentation.canHangup,
    retryMedia: call.retryMedia,
  };
}

function contextDirection(status: PersistentCallRuntimeValue["ux"]["status"], presentation: PersistentPresentationSnapshot): PersistentCallDirection {
  if (status.kind === "idle") {
    if (presentation.incomingModal.visible && presentation.participantRole === "recipient") return "incoming";
    return presentation.phase !== "idle" && presentation.phase !== "terminal" ? "outgoing" : null;
  }
  if (status.kind === "ended") return null;
  return status.direction;
}

export function persistentActiveCallDockModel(call: PersistentCallRuntimeValue, currentUser: User, remoteUser: User | null, seconds: number): PersistentActiveCallDockModel {
  const remoteUserId = call.presentation.peerPublicId ?? remoteUser?.public_id ?? null;
  const remoteUsername = call.presentation.peerUsername ?? remoteUser?.display_name ?? remoteUser?.username ?? "User";
  return {
    currentUser,
    remoteUserId,
    remoteUser,
    remoteUsername,
    seconds,
    isMuted: call.isMuted,
    muted: call.muted,
    deafened: call.deafened,
    effectiveMuted: call.effectiveMuted,
    speaking: call.speaking,
    canToggleMute: call.canToggleMute,
    canToggleDeafen: call.canToggleDeafen,
    callIssue: runtimeCallIssue(call),
    canRetryMedia: call.media.canRetryMedia,
    screenShareAvailable: call.screenShareAvailable,
    isScreenSharing: call.isScreenSharing,
    isScreenShareUpdating: call.isScreenShareUpdating,
    canRetryScreenShare: call.canRetryScreenShare,
    localScreenShareStream: call.localScreenShareStream,
    remoteScreenShareAvailable: call.remoteScreenShareAvailable,
    remoteScreenShareStream: call.remoteScreenShareStream,
    startScreenShare: call.startScreenShare,
    stopScreenShare: call.stopScreenShare,
    retryMedia: call.retryMedia,
    diagnostics: {
      connectionState: call.media.peerConnectionState ?? "unknown",
      iceConnectionState: "unknown",
      iceGatheringState: "unknown",
      signalingState: "unknown",
      selectedLocalCandidateType: "unknown",
    },
  };
}
