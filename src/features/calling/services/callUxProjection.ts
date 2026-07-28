import type { DirectedCallMediaCoordinatorSnapshot } from "./directedCallMediaCoordinator";
import type { PersistentPresentationSnapshot } from "./directedCallPresentationModel";
import type { CallMediaErrorCode } from "../utils/callMediaErrors";

export type CallFailureReason =
  | "permission_denied"
  | "microphone_unavailable"
  | "peer_connection_failed"
  | "sdp_failed"
  | "ice_failed"
  | "media_binding_failed"
  | "audio_input_switch_failed"
  | "rebuild_exhausted";

export type CallEndReason =
  | "unavailable"
  | "undelivered"
  | "busy"
  | "declined"
  | "cancelled"
  | "no_answer"
  | "connection_failed"
  | "ended";

export type EstablishedCallContext = {
  callId: string;
  peerPublicId: string;
  direction: "incoming" | "outgoing";
};

export type CallUxStatus =
  | { kind: "idle" }
  | ({ kind: "ringing" } & EstablishedCallContext)
  | ({ kind: "connecting" } & EstablishedCallContext)
  | ({ kind: "connected" } & EstablishedCallContext)
  | ({ kind: "reconnecting"; recovery: { strategy: "ice_restart"; attempt: 1 | 2 } | { strategy: "peer_rebuild"; attempt: 1 } } & EstablishedCallContext)
  | ({ kind: "failed"; reason: CallFailureReason; mediaErrorCode?: CallMediaErrorCode } & EstablishedCallContext)
  | ({ kind: "ended"; reason: CallEndReason } & EstablishedCallContext);

export type CallUxSnapshot = { status: CallUxStatus; actionBusy: boolean };

export type CallUxEvent =
  | { type: "presentation_snapshot"; snapshot: PersistentPresentationSnapshot }
  | { type: "media_snapshot"; snapshot: DirectedCallMediaCoordinatorSnapshot }
  | { type: "runtime_generation"; generation: string }
  | { type: "disposed" };

const TERMINAL_REASONS = new Set<CallEndReason>([
  "unavailable", "undelivered", "busy", "declined", "cancelled", "no_answer", "connection_failed", "ended",
]);
const FAILURE_REASONS = new Set<CallFailureReason>([
  "permission_denied", "microphone_unavailable", "peer_connection_failed", "sdp_failed", "ice_failed", "media_binding_failed", "audio_input_switch_failed", "rebuild_exhausted",
]);

function contextFor(snapshot: PersistentPresentationSnapshot): EstablishedCallContext | null {
  if (!snapshot.callId || !snapshot.peerPublicId || !snapshot.participantRole) return null;
  return {
    callId: snapshot.callId,
    peerPublicId: snapshot.peerPublicId,
    direction: snapshot.participantRole === "initiator" ? "outgoing" : "incoming",
  };
}

function terminalReason(snapshot: PersistentPresentationSnapshot): CallEndReason | null {
  const state = snapshot.terminalState ?? snapshot.canonicalState;
  return state && TERMINAL_REASONS.has(state as CallEndReason) ? state as CallEndReason : null;
}

function failureReason(snapshot: DirectedCallMediaCoordinatorSnapshot): CallFailureReason | null {
  if (snapshot.mediaErrorCode && snapshot.mediaErrorCode !== "audio_output_unavailable") {
    return snapshot.localIssue && FAILURE_REASONS.has(snapshot.localIssue as CallFailureReason)
      ? snapshot.localIssue as CallFailureReason
      : "media_binding_failed";
  }
  return snapshot.localIssue && FAILURE_REASONS.has(snapshot.localIssue as CallFailureReason)
    ? snapshot.localIssue as CallFailureReason
    : null;
}

/** UX-only state projection. It intentionally has no knowledge of WebRTC state or recovery timers. */
export class CallUxProjection {
  private readonly listeners = new Set<(snapshot: CallUxSnapshot) => void>();
  private presentation: PersistentPresentationSnapshot | null = null;
  private media: DirectedCallMediaCoordinatorSnapshot | null = null;
  private generation: string | null = null;
  private readonly retiredGenerations = new Set<string>();
  private currentCallId: string | null = null;
  private highestAcceptedStateVersion: number | null = null;
  private canonicalTerminalLocked = false;
  private lastPresentationSignature: string | null = null;
  private terminalCallId: string | null = null;
  private latchedRebuildExhausted = false;
  private lastRecovery: DirectedCallMediaCoordinatorSnapshot["recovery"] = null;
  private disposed = false;
  private snapshot: CallUxSnapshot = { status: { kind: "idle" }, actionBusy: false };

  getSnapshot(): CallUxSnapshot { return this.snapshot; }

  subscribe(listener: (snapshot: CallUxSnapshot) => void): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  handle(event: CallUxEvent): void {
    if (this.disposed && event.type !== "runtime_generation") return;
    if (event.type === "disposed") {
      this.disposed = true;
      this.presentation = null;
      this.media = null;
      this.currentCallId = null;
      this.highestAcceptedStateVersion = null;
      this.canonicalTerminalLocked = false;
      this.lastPresentationSignature = null;
      this.terminalCallId = null;
      this.latchedRebuildExhausted = false;
      this.lastRecovery = null;
      this.publish({ status: { kind: "idle" }, actionBusy: false });
      this.listeners.clear();
      return;
    }
    if (event.type === "runtime_generation") {
      if (this.retiredGenerations.has(event.generation)) return;
      if (this.generation !== null && this.generation !== event.generation) {
        this.retiredGenerations.add(this.generation);
        this.presentation = null;
        this.media = null;
        this.currentCallId = null;
        this.highestAcceptedStateVersion = null;
        this.canonicalTerminalLocked = false;
        this.lastPresentationSignature = null;
        this.terminalCallId = null;
        this.latchedRebuildExhausted = false;
        this.lastRecovery = null;
        this.publish({ status: { kind: "idle" }, actionBusy: false });
      }
      this.generation = event.generation;
      return;
    }
    if (event.type === "media_snapshot") {
      if (this.generation !== null && event.snapshot.generation !== this.generation) return;
      if (this.currentCallId !== null && event.snapshot.callId !== null && event.snapshot.callId !== this.currentCallId) return;
      this.media = event.snapshot;
      if (event.snapshot.localIssue === "rebuild_exhausted") this.latchedRebuildExhausted = true;
      if (this.lastRecovery !== null && event.snapshot.recovery === null && event.snapshot.localIssue !== "rebuild_exhausted") {
        this.latchedRebuildExhausted = false;
      }
      this.lastRecovery = event.snapshot.recovery;
      this.recompute();
      return;
    }
    const next = event.snapshot;
    if (next.disposed) return;
    if (this.currentCallId !== null && next.callId !== null && next.callId !== this.currentCallId) {
      if (!this.canonicalTerminalLocked) return;
      this.media = null;
      this.latchedRebuildExhausted = false;
      this.lastRecovery = null;
      this.highestAcceptedStateVersion = null;
      this.canonicalTerminalLocked = false;
      this.lastPresentationSignature = null;
    }
    if (next.callId !== null && next.callId !== this.currentCallId) {
      this.currentCallId = next.callId;
      this.terminalCallId = null;
      this.latchedRebuildExhausted = false;
    }
    if (this.currentCallId === next.callId && this.canonicalTerminalLocked) return;
    const presentationSignature = [next.callId, next.phase, next.canonicalState, next.stateVersion, next.terminalState, next.pendingAction].join("|");
    if (presentationSignature === this.lastPresentationSignature) return;
    if (this.currentCallId === next.callId && this.highestAcceptedStateVersion !== null) {
      if (next.stateVersion === null || next.stateVersion <= this.highestAcceptedStateVersion) return;
    }
    if (next.stateVersion !== null) this.highestAcceptedStateVersion = next.stateVersion;
    this.lastPresentationSignature = presentationSignature;
    this.presentation = next;
    this.recompute();
  }

  private recompute(): void {
    const presentation = this.presentation;
    if (!presentation) return;
    const context = contextFor(presentation);
    if (!context) {
      this.publish({
        status: { kind: "idle" },
        actionBusy: presentation.phase === "preparing"
          || presentation.phase === "calling"
          || Boolean(presentation.pendingAction),
      });
      return;
    }
    const terminal = terminalReason(presentation);
    if (terminal) {
      this.terminalCallId = context.callId;
      this.latchedRebuildExhausted = false;
      this.canonicalTerminalLocked = true;
      this.publish({ status: { kind: "ended", reason: terminal, ...context }, actionBusy: false });
      return;
    }
    const actionBusy = Boolean(presentation.pendingAction)
      || presentation.phase === "preparing"
      || presentation.phase === "calling"
      || (context.direction === "outgoing" && ["dispatching", "delivered"].includes(presentation.canonicalState ?? ""));
    const failure = this.media && this.media.callId === context.callId ? failureReason(this.media) : null;
    if (failure) {
      this.publish({ status: { kind: "failed", reason: failure, mediaErrorCode: this.media?.mediaErrorCode ?? undefined, ...context }, actionBusy });
      return;
    }
    if (this.latchedRebuildExhausted && this.terminalCallId !== context.callId) {
      this.publish({ status: { kind: "failed", reason: "rebuild_exhausted", ...context }, actionBusy });
      return;
    }
    const recovery = this.media?.callId === context.callId ? this.media.recovery : null;
    if (recovery && presentation.canonicalState === "active") {
      this.publish({
        status: {
          kind: "reconnecting",
          recovery: recovery.phase === "ice_restart"
            ? { strategy: "ice_restart", attempt: recovery.attempt }
            : { strategy: "peer_rebuild", attempt: recovery.attempt },
          ...context,
        },
        actionBusy,
      });
      return;
    }
    switch (presentation.canonicalState) {
      case "presented":
        this.publish({ status: { kind: "ringing", ...context }, actionBusy });
        return;
      case "accepted":
      case "connecting":
        this.publish({ status: { kind: "connecting", ...context }, actionBusy });
        return;
      case "active":
        this.publish({ status: { kind: "connected", ...context }, actionBusy });
        return;
      default:
        this.publish({ status: { kind: "idle" }, actionBusy });
    }
  }

  private publish(snapshot: CallUxSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

export function createCallUxProjection(): CallUxProjection { return new CallUxProjection(); }
