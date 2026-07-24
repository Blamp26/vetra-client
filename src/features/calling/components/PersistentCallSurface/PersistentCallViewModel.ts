import { useEffect, useState } from "react";
import type { CallDiagnostics, CallIssue, CallStatus } from "../../hooks/useCall.types";
import type { User } from "@/shared/types";
import type { PersistentCallRuntimeValue } from "../../context/PersistentCallContext";
import type { PersistentPresentationSnapshot } from "../../services/directedCallPresentationModel";

export type PersistentCallDirection = "incoming" | "outgoing" | null;

export interface PersistentSidebarCallModel {
  status: CallStatus;
  direction: PersistentCallDirection;
  remoteUsername: string | null;
  seconds: number;
  isMuted: boolean;
  callIssue: CallIssue | null;
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
  callIssue: CallIssue | null;
  diagnostics: CallDiagnostics;
}

function toCallIssue(snapshot: PersistentPresentationSnapshot): CallIssue | null {
  return snapshot.callIssue ? { tone: "error", message: snapshot.callIssue.message } : null;
}

function runtimeCallIssue(call: PersistentCallRuntimeValue): CallIssue | null {
  return toCallIssue(call.presentation) ?? (call.media.localIssue ? {
    tone: "error",
    message: call.media.localIssue === "transport_recovery"
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
  const incoming = presentation.incomingModal.visible && presentation.participantRole === "recipient";
  const status: CallStatus = presentation.phase === "active"
    ? "active"
    : presentation.phase === "terminal"
      ? "ended"
      : incoming
        ? "ringing"
        : presentation.phase === "idle"
          ? "idle"
          : "calling";

  return {
    status,
    direction: incoming ? "incoming" : presentation.phase === "idle" || presentation.phase === "terminal" ? null : "outgoing",
    remoteUsername: incoming ? presentation.incomingModal.callerDisplayName : presentation.peerUsername,
    seconds,
    isMuted: call.isMuted,
    callIssue: runtimeCallIssue(call),
    isIncomingActionPending: incoming && Boolean(presentation.pendingAction),
    canCancel: !incoming && presentation.canCancel,
    canHangup: presentation.canHangup,
  };
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
    callIssue: runtimeCallIssue(call),
    diagnostics: {
      connectionState: call.media.peerConnectionState ?? "unknown",
      iceConnectionState: "unknown",
      iceGatheringState: "unknown",
      signalingState: "unknown",
      selectedLocalCandidateType: "unknown",
    },
  };
}
