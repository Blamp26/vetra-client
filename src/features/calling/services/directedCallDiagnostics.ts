import { debugCall } from "../utils/callDebug";

const runtimeBranchDiagnostics = new Set<string>();

export function recordDirectedCallRuntimeBranch(
  branch: "owner" | "non-owner" | "unavailable",
  reason?: string,
): void {
  if (!import.meta.env.DEV) return;
  const message = branch === "owner"
    ? "persistent call runtime: owner"
    : branch === "non-owner"
      ? "persistent call runtime: non-owner"
      : `persistent call runtime unavailable: ${reason ?? "unknown"}`;
  if (runtimeBranchDiagnostics.has(message)) return;
  runtimeBranchDiagnostics.add(message);
  console.info(message);
}

export type DirectedCallDiagnosticEvent =
  | "runtime_mode"
  | "authority"
  | "call_projection"
  | "media_phase"
  | "socket"
  | "peer_connection"
  | "failure"
  | "cleanup";

function redactCallId(callId: string | null | undefined): string | null {
  return callId ? `${callId.slice(0, 8)}…` : null;
}

export function recordDirectedCallDiagnostic(
  event: DirectedCallDiagnosticEvent,
  details: {
    callId?: string | null;
    previousCallId?: string | null;
    nextCallId?: string | null;
    mode?: string;
    authority?: string;
    canonicalState?: string | null;
    mediaPhase?: string;
    socket?: "connected" | "disconnected";
    peerConnection?: string;
    iceConnectionState?: string;
    iceGatheringState?: string;
    signalingState?: string;
    queuedLocalCandidateCount?: number;
    flushedLocalCandidateCount?: number;
    failureKind?: string;
    reason?: string;
  } = {},
): void {
  debugCall(`[directed-call] ${event}`, {
    call_id: redactCallId(details.callId),
    previous_call_id: redactCallId(details.previousCallId),
    next_call_id: redactCallId(details.nextCallId),
    mode: details.mode,
    authority: details.authority,
    canonical_state: details.canonicalState,
    media_phase: details.mediaPhase,
    socket: details.socket,
    peer_connection: details.peerConnection,
    ice_connection_state: details.iceConnectionState,
    ice_gathering_state: details.iceGatheringState,
    signaling_state: details.signalingState,
    queued_local_candidate_count: details.queuedLocalCandidateCount,
    flushed_local_candidate_count: details.flushedLocalCandidateCount,
    failure_kind: details.failureKind,
    reason: details.reason,
  });
}
