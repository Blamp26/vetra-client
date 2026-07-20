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
    mode?: string;
    authority?: string;
    canonicalState?: string | null;
    mediaPhase?: string;
    socket?: "connected" | "disconnected";
    peerConnection?: string;
    failureKind?: string;
    reason?: string;
  } = {},
): void {
  debugCall(`[directed-call] ${event}`, {
    call_id: redactCallId(details.callId),
    mode: details.mode,
    authority: details.authority,
    canonical_state: details.canonicalState,
    media_phase: details.mediaPhase,
    socket: details.socket,
    peer_connection: details.peerConnection,
    failure_kind: details.failureKind,
    reason: details.reason,
  });
}
