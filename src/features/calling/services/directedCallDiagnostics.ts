import { debugCall, isCallDebugEnabled } from "../utils/callDebug";

const runtimeBranchDiagnostics = new Set<string>();
const MAX_DIRECTED_CALL_DIAGNOSTICS = 160;

export interface DirectedCallDiagnosticEntry {
  sequence: number;
  event: DirectedCallDiagnosticEvent;
  line: string;
}

type DirectedCallDiagnosticListener = (entries: DirectedCallDiagnosticEntry[]) => void;
const directedCallDiagnosticTimeline: DirectedCallDiagnosticEntry[] = [];
const directedCallDiagnosticListeners = new Set<DirectedCallDiagnosticListener>();
let nextDiagnosticSequence = 1;
let lastDiagnosticKey: string | null = null;

const ORDERED_DIAGNOSTIC_EVENTS = new Set<DirectedCallDiagnosticEvent>([
  "ice_sent", "ice_received", "ice_applied", "ice_buffered", "ice_rejected",
]);

function safeDiagnosticText(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  let safe = value
    .replace(/https?:\/\/[^\s]+/gi, "[url-redacted]")
    .replace(/candidate\s*:[^\s]+/gi, "[candidate-redacted]")
    .replace(/v=0[^\s]*/gi, "[sdp-redacted]")
    .replace(/\b(?:token|password|credential|secret|authorization|ticket)\s*[=:]\s*[^\s]+/gi, "[secret-redacted]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip-redacted]")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[^A-Za-z0-9._:/ -]/g, "")
    .trim();
  if (safe.length > 96) safe = `${safe.slice(0, 93)}...`;
  return safe || "[redacted]";
}

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
  | "cleanup"
  | "renegotiate_request_sent"
  | "renegotiate_request_received"
  | "renegotiate_offer_sent"
  | "renegotiate_offer_received"
  | "renegotiate_answer_sent"
  | "renegotiate_answer_received"
  | "ice_sent"
  | "ice_received"
  | "ice_applied"
  | "ice_buffered"
  | "ice_rejected"
  | "remote_video_ontrack"
  | "remote_screen_stream_created"
  | "remote_screen_stream_updated"
  | "remote_screen_stream_cleared"
  | "remote_screen_snapshot_published"
  | "terminal_projection_received"
  | "terminal_projection_ignored"
  | "controller_selection"
  | "presentation_projection"
  | "presentation_phase"
  | "call_rollover"
  | "stale_generation_rejected";

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
    transactionId?: string | null;
    role?: string | null;
    generation?: string | null;
    adapterGeneration?: number | null;
    screenShare?: boolean | null;
    transactionPhase?: string | null;
    candidateAction?: string | null;
    candidateReason?: string | null;
    candidateIndex?: number | null;
    transceiverMid?: string | null;
    transceiverCurrentDirection?: string | null;
    transceiverDirection?: string | null;
    localVideoDirection?: string | null;
    remoteVideoDirection?: string | null;
    senderTrackPresent?: boolean | null;
    receiverTrackPresent?: boolean | null;
    remoteTrackKind?: string | null;
    remoteStreamPresent?: boolean | null;
    selectedCallId?: string | null;
    selectedState?: string | null;
    finalPhase?: string | null;
    fallbackPeerPresent?: boolean | null;
    initiationResultPresent?: boolean | null;
    staleGeneration?: string | null;
  } = {},
): void {
  if (!isCallDebugEnabled()) {
    directedCallDiagnosticTimeline.length = 0;
    lastDiagnosticKey = null;
    directedCallDiagnosticListeners.clear();
    return;
  }
  const fields: Record<string, string | number | boolean | null | undefined> = {
    call_id: redactCallId(details.callId),
    previous_call_id: redactCallId(details.previousCallId),
    next_call_id: redactCallId(details.nextCallId),
    mode: details.mode,
    authority: details.authority,
    canonical_state: details.canonicalState ?? null,
    media_phase: details.mediaPhase ?? null,
    socket: details.socket,
    peer_connection: details.peerConnection,
    ice_connection_state: details.iceConnectionState,
    ice_gathering_state: details.iceGatheringState,
    signaling_state: details.signalingState,
    queued_local_candidate_count: details.queuedLocalCandidateCount,
    flushed_local_candidate_count: details.flushedLocalCandidateCount,
    failure_kind: safeDiagnosticText(details.failureKind),
    reason: safeDiagnosticText(details.reason),
    transaction_id: redactCallId(details.transactionId),
    role: details.role ?? null,
    generation: details.generation ?? null,
    adapter_generation: details.adapterGeneration ?? null,
    screen_share: details.screenShare,
    transaction_phase: details.transactionPhase,
    candidate_action: details.candidateAction,
    candidate_reason: safeDiagnosticText(details.candidateReason),
    candidate_index: details.candidateIndex,
    transceiver_mid: details.transceiverMid,
    transceiver_current_direction: details.transceiverCurrentDirection,
    transceiver_direction: details.transceiverDirection,
    local_video_direction: details.localVideoDirection,
    remote_video_direction: details.remoteVideoDirection,
    sender_track_present: details.senderTrackPresent,
    receiver_track_present: details.receiverTrackPresent,
    remote_track_kind: details.remoteTrackKind,
    remote_stream_present: details.remoteStreamPresent,
    selected_call_id: redactCallId(details.selectedCallId),
    selected_state: details.selectedState,
    final_phase: details.finalPhase,
    fallback_peer_present: details.fallbackPeerPresent,
    initiation_result_present: details.initiationResultPresent,
    stale_generation: details.staleGeneration,
  };
  const line = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
  const diagnosticKey = `${event}|${line}`;
  if (!ORDERED_DIAGNOSTIC_EVENTS.has(event) && diagnosticKey === lastDiagnosticKey) return;
  lastDiagnosticKey = diagnosticKey;
  const entry: DirectedCallDiagnosticEntry = { sequence: nextDiagnosticSequence++, event, line: `${event} ${line}`.trim() };
  directedCallDiagnosticTimeline.push(entry);
  if (directedCallDiagnosticTimeline.length > MAX_DIRECTED_CALL_DIAGNOSTICS) directedCallDiagnosticTimeline.shift();
  const snapshot = directedCallDiagnosticTimeline.slice();
  directedCallDiagnosticListeners.forEach((listener) => {
    try { listener(snapshot); } catch { /* diagnostics cannot affect call control flow */ }
  });
  try { debugCall(`[directed-call] ${event}`, fields); } catch { /* best-effort sink */ }
}

export function getDirectedCallDiagnosticTimeline(): DirectedCallDiagnosticEntry[] {
  if (!isCallDebugEnabled()) {
    directedCallDiagnosticTimeline.length = 0;
    lastDiagnosticKey = null;
    directedCallDiagnosticListeners.clear();
    return [];
  }
  return directedCallDiagnosticTimeline.slice();
}

export function subscribeToDirectedCallDiagnostics(listener: DirectedCallDiagnosticListener): () => void {
  if (!isCallDebugEnabled()) return () => undefined;
  directedCallDiagnosticListeners.add(listener);
  return () => directedCallDiagnosticListeners.delete(listener);
}

export function resetDirectedCallDiagnosticTimeline(): void {
  directedCallDiagnosticTimeline.length = 0;
  nextDiagnosticSequence = 1;
  lastDiagnosticKey = null;
  directedCallDiagnosticListeners.forEach((listener) => {
    try { listener([]); } catch { /* diagnostics cannot affect call control flow */ }
  });
}
