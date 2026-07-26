import { debugCall, isCallDebugEnabled } from "../utils/callDebug";

const runtimeBranchDiagnostics = new Set<string>();
const MAX_DIRECTED_CALL_DIAGNOSTICS = 160;
export type DirectedCallDiagnosticProducerFamily = "coordinator" | "adapter" | "lifecycle" | "session" | "presentation";
export type DirectedCallDiagnosticsProbeStep = "recorder_entered" | "flag_checked" | "appended" | "listeners_notified" | null;

export interface DirectedCallDiagnosticsProbeSnapshot {
  rendererSessionProbeId: string;
  recorderModuleInstanceIds: string[];
  panelReaderInstanceIds: string[];
  flagObservedByRecorder: boolean;
  settingChangeCount: number;
  boundaryMounted: boolean;
  runtimeMounted: boolean;
  recorderEntryCount: number;
  suppressedDisabledCount: number;
  timelineAppendCount: number;
  currentTimelineLength: number;
  listenerNotificationCount: number;
  activeListenerCount: number;
  lastEventFamily: DirectedCallDiagnosticProducerFamily | null;
  lastCompletedStep: DirectedCallDiagnosticsProbeStep;
  lastInternalErrorCode: string | null;
  producerFamilies: DirectedCallDiagnosticProducerFamily[];
}

interface DirectedCallDiagnosticsProbeState extends Omit<DirectedCallDiagnosticsProbeSnapshot, "recorderModuleInstanceIds" | "panelReaderInstanceIds" | "producerFamilies"> {
  recorderModuleInstanceIds: Set<string>;
  panelReaderInstanceIds: Set<string>;
  producerFamilies: Set<DirectedCallDiagnosticProducerFamily>;
}

const DIAGNOSTICS_PROBE_KEY = Symbol.for("vetra.directed-call-diagnostics.probe");
const DIAGNOSTICS_PROBE_COUNTER_KEY = Symbol.for("vetra.directed-call-diagnostics.probe-counter");

function nextProbeId(prefix: string): string {
  try {
    const root = globalThis as unknown as Record<symbol, unknown>;
    const next = (typeof root[DIAGNOSTICS_PROBE_COUNTER_KEY] === "number" ? root[DIAGNOSTICS_PROBE_COUNTER_KEY] as number : 0) + 1;
    root[DIAGNOSTICS_PROBE_COUNTER_KEY] = next;
    return `${prefix}-${next}`;
  } catch {
    return `${prefix}-0`;
  }
}

function createProbeState(): DirectedCallDiagnosticsProbeState {
  return {
    rendererSessionProbeId: nextProbeId("renderer"),
    recorderModuleInstanceIds: new Set(),
    panelReaderInstanceIds: new Set(),
    flagObservedByRecorder: false,
    settingChangeCount: 0,
    boundaryMounted: false,
    runtimeMounted: false,
    recorderEntryCount: 0,
    suppressedDisabledCount: 0,
    timelineAppendCount: 0,
    currentTimelineLength: 0,
    listenerNotificationCount: 0,
    activeListenerCount: 0,
    lastEventFamily: null,
    lastCompletedStep: null,
    lastInternalErrorCode: null,
    producerFamilies: new Set(),
  };
}

function getProbeState(): DirectedCallDiagnosticsProbeState {
  try {
    const root = globalThis as unknown as Record<symbol, unknown>;
    const existing = root[DIAGNOSTICS_PROBE_KEY] as DirectedCallDiagnosticsProbeState | undefined;
    if (existing) return existing;
    const state = createProbeState();
    root[DIAGNOSTICS_PROBE_KEY] = state;
    return state;
  } catch {
    return createProbeState();
  }
}

const recorderModuleInstanceId = nextProbeId("recorder");
getProbeState().recorderModuleInstanceIds.add(recorderModuleInstanceId);

function updateProbe(mutator: (state: DirectedCallDiagnosticsProbeState) => void): void {
  try {
    mutator(getProbeState());
  } catch {
    try { getProbeState().lastInternalErrorCode = "probe_update_failed"; } catch { /* probe is best effort */ }
  }
}

function probeRecorderEntry(enabled: boolean, family?: DirectedCallDiagnosticProducerFamily): void {
  updateProbe((state) => {
    state.recorderEntryCount += 1;
    state.flagObservedByRecorder = enabled;
    state.lastCompletedStep = "recorder_entered";
    if (family) {
      state.lastEventFamily = family;
      state.producerFamilies.add(family);
    }
  });
  updateProbe((state) => { state.lastCompletedStep = "flag_checked"; });
  if (!enabled) updateProbe((state) => { state.suppressedDisabledCount += 1; });
}

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

export function getDirectedCallDiagnosticsProbe(): DirectedCallDiagnosticsProbeSnapshot {
  try {
    const state = getProbeState();
    return {
      ...state,
      recorderModuleInstanceIds: [...state.recorderModuleInstanceIds],
      panelReaderInstanceIds: [...state.panelReaderInstanceIds],
      producerFamilies: [...state.producerFamilies],
      currentTimelineLength: directedCallDiagnosticTimeline.length,
      activeListenerCount: directedCallDiagnosticListeners.size,
    };
  } catch {
    return {
      rendererSessionProbeId: "renderer-unavailable",
      recorderModuleInstanceIds: [], panelReaderInstanceIds: [], flagObservedByRecorder: false,
      settingChangeCount: 0, boundaryMounted: false, runtimeMounted: false, recorderEntryCount: 0,
      suppressedDisabledCount: 0, timelineAppendCount: 0, currentTimelineLength: 0,
      listenerNotificationCount: 0, activeListenerCount: 0, lastEventFamily: null,
      lastCompletedStep: null, lastInternalErrorCode: "probe_read_failed", producerFamilies: [],
    };
  }
}

export function registerDirectedCallDiagnosticsPanelReader(): string {
  const id = nextProbeId("panel");
  updateProbe((state) => state.panelReaderInstanceIds.add(id));
  return id;
}

export function unregisterDirectedCallDiagnosticsPanelReader(id: string): void {
  updateProbe((state) => state.panelReaderInstanceIds.delete(id));
}

export function recordDirectedCallDiagnosticsSettingChange(enabled: boolean): void {
  updateProbe((state) => {
    state.flagObservedByRecorder = enabled;
    state.settingChangeCount += 1;
  });
}

export function setDirectedCallDiagnosticsBoundaryMounted(mounted: boolean): void {
  updateProbe((state) => { state.boundaryMounted = mounted; });
}

export function setDirectedCallDiagnosticsRuntimeMounted(mounted: boolean): void {
  updateProbe((state) => { state.runtimeMounted = mounted; });
}

export function resetDirectedCallDiagnosticsProbe(): void {
  updateProbe((state) => {
    state.flagObservedByRecorder = false;
    state.settingChangeCount = 0;
    state.recorderEntryCount = 0;
    state.suppressedDisabledCount = 0;
    state.timelineAppendCount = 0;
    state.listenerNotificationCount = 0;
    state.lastEventFamily = null;
    state.lastCompletedStep = null;
    state.lastInternalErrorCode = null;
    state.producerFamilies.clear();
  });
}

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
    diagnosticStage?: string | null;
    diagnosticReason?: string | null;
    transceiverMid?: string | null;
    eventTransceiverPresent?: boolean | null;
    eventTransceiverMid?: string | null;
    expectedScreenTransceiverMid?: string | null;
    transceiverIdentityMatch?: boolean | null;
    receiverTrackIdentity?: string | null;
    eventSenderTrackPresent?: boolean | null;
    expectedSenderTrackPresent?: boolean | null;
    eventReceiverTrackPresent?: boolean | null;
    expectedReceiverTrackPresent?: boolean | null;
    associationStrategy?: string | null;
    associationAccepted?: boolean | null;
    videoTransceiverIndex?: number | null;
    videoTransceiverCount?: number | null;
    selectedScreenTransceiver?: boolean | null;
    localScreenSenderTransceiver?: boolean | null;
    transceiverCurrentDirection?: string | null;
    transceiverDirection?: string | null;
    localVideoDirection?: string | null;
    remoteVideoDirection?: string | null;
    senderTrackPresent?: boolean | null;
    receiverTrackPresent?: boolean | null;
    remoteTrackKind?: string | null;
    remoteTrackReadyState?: string | null;
    remoteTrackMuted?: boolean | null;
    browserStreamPresent?: boolean | null;
    remoteStreamPresent?: boolean | null;
    selectedCallId?: string | null;
    selectedState?: string | null;
    finalPhase?: string | null;
    fallbackPeerPresent?: boolean | null;
    initiationResultPresent?: boolean | null;
    staleGeneration?: string | null;
    videoMLineCount?: number | null;
    videoMLineIndex?: number | null;
    videoMLineMid?: string | null;
    videoMLineDirection?: string | null;
    videoMLineRejected?: boolean | null;
    producerFamily?: DirectedCallDiagnosticProducerFamily;
  } = {},
): void {
  const enabled = isCallDebugEnabled();
  probeRecorderEntry(enabled, details.producerFamily);
  if (!enabled) {
    directedCallDiagnosticTimeline.length = 0;
    lastDiagnosticKey = null;
    directedCallDiagnosticListeners.clear();
    updateProbe((state) => {
      state.currentTimelineLength = 0;
      state.activeListenerCount = 0;
    });
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
    diagnostic_stage: details.diagnosticStage,
    diagnostic_reason: safeDiagnosticText(details.diagnosticReason),
    transceiver_mid: details.transceiverMid,
    event_transceiver_present: details.eventTransceiverPresent,
    event_transceiver_mid: details.eventTransceiverMid,
    expected_screen_transceiver_mid: details.expectedScreenTransceiverMid,
    transceiver_identity_match: details.transceiverIdentityMatch,
    receiver_track_identity: details.receiverTrackIdentity,
    event_sender_track_present: details.eventSenderTrackPresent,
    expected_sender_track_present: details.expectedSenderTrackPresent,
    event_receiver_track_present: details.eventReceiverTrackPresent,
    expected_receiver_track_present: details.expectedReceiverTrackPresent,
    association_strategy: details.associationStrategy,
    association_accepted: details.associationAccepted,
    video_transceiver_index: details.videoTransceiverIndex,
    video_transceiver_count: details.videoTransceiverCount,
    selected_screen_transceiver: details.selectedScreenTransceiver,
    local_screen_sender_transceiver: details.localScreenSenderTransceiver,
    transceiver_current_direction: details.transceiverCurrentDirection,
    transceiver_direction: details.transceiverDirection,
    local_video_direction: details.localVideoDirection,
    remote_video_direction: details.remoteVideoDirection,
    sender_track_present: details.senderTrackPresent,
    receiver_track_present: details.receiverTrackPresent,
    remote_track_kind: details.remoteTrackKind,
    remote_track_ready_state: details.remoteTrackReadyState,
    remote_track_muted: details.remoteTrackMuted,
    browser_stream_present: details.browserStreamPresent,
    remote_stream_present: details.remoteStreamPresent,
    selected_call_id: redactCallId(details.selectedCallId),
    selected_state: details.selectedState,
    final_phase: details.finalPhase,
    fallback_peer_present: details.fallbackPeerPresent,
    initiation_result_present: details.initiationResultPresent,
    stale_generation: details.staleGeneration,
    video_mline_count: details.videoMLineCount,
    video_mline_index: details.videoMLineIndex,
    video_mline_mid: details.videoMLineMid,
    video_mline_direction: details.videoMLineDirection,
    video_mline_rejected: details.videoMLineRejected,
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
  updateProbe((state) => {
    state.timelineAppendCount += 1;
    state.currentTimelineLength = directedCallDiagnosticTimeline.length;
    state.lastCompletedStep = "appended";
  });
  const snapshot = directedCallDiagnosticTimeline.slice();
  directedCallDiagnosticListeners.forEach((listener) => {
    updateProbe((state) => {
      state.listenerNotificationCount += 1;
      state.activeListenerCount = directedCallDiagnosticListeners.size;
    });
    try { listener(snapshot); } catch { /* diagnostics cannot affect call control flow */ }
  });
  updateProbe((state) => {
    state.activeListenerCount = directedCallDiagnosticListeners.size;
    state.lastCompletedStep = "listeners_notified";
  });
  try { debugCall(`[directed-call] ${event}`, fields); } catch { /* best-effort sink */ }
}

export function getDirectedCallDiagnosticTimeline(): DirectedCallDiagnosticEntry[] {
  if (!isCallDebugEnabled()) {
    directedCallDiagnosticTimeline.length = 0;
    lastDiagnosticKey = null;
    directedCallDiagnosticListeners.clear();
    updateProbe((state) => {
      state.currentTimelineLength = 0;
      state.activeListenerCount = 0;
    });
    return [];
  }
  return directedCallDiagnosticTimeline.slice();
}

export function subscribeToDirectedCallDiagnostics(listener: DirectedCallDiagnosticListener): () => void {
  if (!isCallDebugEnabled()) return () => undefined;
  directedCallDiagnosticListeners.add(listener);
  updateProbe((state) => { state.activeListenerCount = directedCallDiagnosticListeners.size; });
  return () => {
    directedCallDiagnosticListeners.delete(listener);
    updateProbe((state) => { state.activeListenerCount = directedCallDiagnosticListeners.size; });
  };
}

export function resetDirectedCallDiagnosticTimeline(): void {
  directedCallDiagnosticTimeline.length = 0;
  nextDiagnosticSequence = 1;
  lastDiagnosticKey = null;
  updateProbe((state) => { state.currentTimelineLength = 0; });
  directedCallDiagnosticListeners.forEach((listener) => {
    try { listener([]); } catch { /* diagnostics cannot affect call control flow */ }
  });
}
