import {
  CANONICAL_STATES,
  isUuid,
  type FailureCode,
  type IcePayload,
  type IceRestartRelay,
  type IceRestartSdpRelay,
  type ParticipantRole,
  type RenegotiationRequestPayload,
  type RenegotiationSdpPayload,
  type SignalEnvelope,
  type StateProjection,
} from "../protocol/directedCallProtocol";
import { createDirectedCallUuid } from "./directedCallDevice";
import { DirectedCallSignalTransport } from "./directedCallSignalTransport";
import {
  DirectedCallWebRtcAdapter,
  DirectedCallWebRtcError,
  DirectedCallWebRtcStaleError,
  type DirectedCallWebRtcAdapterOptions,
  type DirectedCallMediaStream,
  type DirectedCallMediaStreamTrack,
  type DirectedCallPeerConnectionDiagnostics,
} from "./directedCallWebRtcAdapter";
import type { DirectedCallSession } from "./directedCallSession";
import type { LifecycleCommandOutcome } from "./directedCallLifecycleController";
import { recordDirectedCallDiagnostic } from "./directedCallDiagnostics";
import type { DirectedCallDiagnosticEvent, DirectedCallDiagnosticProducerFamily } from "./directedCallDiagnostics";

export type DirectedCallMediaCoordinatorState =
  | "idle"
  | "accepted"
  | "waiting_for_connecting"
  | "signaling_ready"
  | "failed"
  | "disposing"
  | "disposed";

export interface DirectedCallMediaCoordinatorSnapshot {
  state: DirectedCallMediaCoordinatorState;
  callId: string | null;
  participantRole: ParticipantRole | null;
  projection: StateProjection | null;
  generation: string;
  remoteAudioStream: DirectedCallMediaStream | null;
  localScreenShareStream: DirectedCallMediaStream | null;
  isLocalScreenShareActive: boolean;
  remoteScreenShareStream: DirectedCallMediaStream | null;
  localIssue: "transport_recovery" | "restart_exhausted" | "rebuild_exhausted" | "rebuild_blocked_by_screen_share" | "audio_input_switch_failed" | DirectedCallWebRtcError["failureCode"] | null;
  peerConnectionState: RTCPeerConnectionState | null;
  isMuted: boolean;
  canToggleMute: boolean;
}

export interface DirectedCallMediaLifecyclePort {
  beginConnecting(callId: string): Promise<unknown>;
  mediaReady(callId: string): Promise<LifecycleCommandOutcome>;
  setupFailed(callId: string, failureCode: DirectedCallWebRtcError["failureCode"]): Promise<LifecycleCommandOutcome>;
}

export interface DirectedCallMediaCoordinatorOptions {
  adapterFactory?: (options: DirectedCallWebRtcAdapterOptions) => DirectedCallWebRtcAdapter;
  audioConstraints?: () => MediaStreamConstraints;
  isGenerationCurrent?: (generation: string) => boolean;
  onRecoveryResult?: (result:
    | { kind: "rebuild_exhausted"; callId: string; generation: string }
    | { kind: "rebuild_blocked_by_screen_share"; callId: string; generation: string }) => void;
}

type Listener = (snapshot: DirectedCallMediaCoordinatorSnapshot) => void;
type ScreenShareAction = "none" | "start" | "stop";
type RenegotiationTransaction = {
  callId: string;
  generation: string;
  id: string;
  phase: "preparing_screen" | "requested" | "creating_offer" | "offered" | "answering" | "applying_answer";
  screenShare: boolean;
  screenAction: ScreenShareAction;
  localScreenShareStarted: boolean;
  localScreenShareStopped: boolean;
  remoteScreenReceptionEnabledByTransaction: boolean;
  remoteScreenReceptionDisabledByTransaction: boolean;
  remoteScreenReceptionWasEnabled: boolean;
  browserEndedDuringTransaction: boolean;
};
type IceRestartTransaction = {
  callId: string;
  generation: string;
  id: string;
  phase: "creating_offer" | "offered" | "answering" | "applying_answer";
  remoteDescriptionReady: boolean;
  rebuild?: boolean;
};
type RecoveryIncident = {
  callId: string;
  generation: string;
  attempts: number;
  activeAttempt: number | null;
  rebuildAttempted: boolean;
};
const MAX_COMPLETED_RENEGOTIATIONS = 32;
const MAX_COMPLETED_ICE_RESTARTS = 32;
const ICE_RECOVERY_GRACE_MS = 3_000;
const ICE_RECOVERY_TIMEOUT_MS = 10_000;
const ICE_RECOVERY_RETRY_DELAY_MS = 2_000;
const MAX_ICE_RECOVERY_ATTEMPTS = 2;
const PEER_CONNECTION_REBUILD_TIMEOUT_MS = 15_000;

type SetupFailureReport = {
  callId: string;
  failureCode: FailureCode;
  epoch: number;
  generation: string;
  inFlight: boolean;
  acknowledged: boolean;
  retryable: boolean;
};

const TERMINAL_STATES = new Set<string>([
  "unavailable", "undelivered", "busy", "declined", "cancelled", "no_answer", "connection_failed", "ended",
]);
const MEDIA_READY_STATES = new Set(["accepted", "connecting", "active"]);

function isUsableProjection(projection: StateProjection): boolean {
  return CANONICAL_STATES.includes(projection.state) && !TERMINAL_STATES.has(projection.state);
}

function isSdpPayload(signal: SignalEnvelope): signal is SignalEnvelope & { payload: { sdp: string } } {
  return ["offer", "answer", "renegotiate_offer", "renegotiate_answer"].includes(signal.kind) && typeof signal.payload === "object" && signal.payload !== null && "sdp" in signal.payload && typeof signal.payload.sdp === "string";
}

function isIcePayload(signal: SignalEnvelope): signal is SignalEnvelope & { payload: IcePayload } {
  return signal.kind === "ice_candidate";
}

function toRtcIceCandidate(payload: IcePayload): RTCIceCandidateInit {
  return {
    candidate: payload.candidate,
    sdpMid: payload.sdp_mid,
    sdpMLineIndex: payload.sdp_mline_index,
    usernameFragment: payload.username_fragment,
  };
}

function toWireIceCandidate(candidate: RTCIceCandidateInit, renegotiationId?: string, iceRestartId?: string): IcePayload {
  return {
    candidate: candidate.candidate ?? "",
    sdp_mid: candidate.sdpMid ?? null,
    sdp_mline_index: candidate.sdpMLineIndex ?? null,
    username_fragment: candidate.usernameFragment ?? null,
    ...(renegotiationId ? { renegotiation_id: renegotiationId } : iceRestartId ? { ice_restart_id: iceRestartId } : {}),
  };
}

function candidateKey(candidate: RTCIceCandidateInit, transactionId?: string): string {
  return JSON.stringify([
    transactionId ?? null,
    candidate.candidate ?? "",
    candidate.sdpMid ?? null,
    candidate.sdpMLineIndex ?? null,
    candidate.usernameFragment ?? null,
  ]);
}

/** Owner-scoped, audio-only persistent media authority. */
export class DirectedCallMediaCoordinator {
  private readonly session: DirectedCallSession;
  private readonly signalTransport: DirectedCallSignalTransport;
  private readonly lifecycle: DirectedCallMediaLifecyclePort;
  private readonly listeners = new Set<Listener>();
  private readonly generation: string;
  private readonly isGenerationCurrent: (generation: string) => boolean;
  private readonly adapterFactory: (options: DirectedCallWebRtcAdapterOptions) => DirectedCallWebRtcAdapter;
  private readonly audioConstraints?: () => MediaStreamConstraints;
  private readonly onRecoveryResult?: DirectedCallMediaCoordinatorOptions["onRecoveryResult"];
  private adapter: DirectedCallWebRtcAdapter;
  private localScreenShareEndedCleanup: (() => void) | null = null;
  private remoteScreenShareChangedCleanup: (() => void) | null = null;
  private unsubscribeProjection: (() => void) | null = null;
  private unsubscribeSignal: (() => void) | null = null;
  private unsubscribeIceRestart: (() => void) | null = null;
  private snapshot: DirectedCallMediaCoordinatorSnapshot;
  private offer: RTCSessionDescriptionInit | null = null;
  private mediaStartInFlight = false;
  private mediaStarted = false;
  private beginConnectingSent = false;
  private offerSent = false;
  private mediaReadySent = false;
  private disposed = false;
  private localIssue: DirectedCallMediaCoordinatorSnapshot["localIssue"] = null;
  private remoteAudioStream: DirectedCallMediaStream | null = null;
  private remoteScreenShareStream: DirectedCallMediaStream | null = null;
  private peerConnectionState: RTCPeerConnectionState | null = null;
  private mediaAttemptEpoch = 0;
  private mediaAttemptActive = false;
  private setupFailureReport: SetupFailureReport | null = null;
  private setupFailureReportEpoch = 0;
  private beginConnectingInFlight = false;
  private mediaReadyInFlight = false;
  private localStream: DirectedCallMediaStream | null = null;
  private readonly localTrackCleanups = new Map<DirectedCallMediaStreamTrack, () => void>();
  private localStreamCleanup: (() => void) | null = null;
  private readonly queuedLocalCandidates: Array<{ candidate: RTCIceCandidateInit; callId: string; attempt: number; renegotiationId?: string; iceRestartId?: string }> = [];
  private readonly sentLocalCandidateKeys = new Set<string>();
  private localCandidateFlushInFlight = false;
  private flushedLocalCandidateCount = 0;
  private peerConnectionDiagnostics: DirectedCallPeerConnectionDiagnostics | null = null;
  private lastTerminalCallId: string | null = null;
  private adapterEpoch = 0;
  private renegotiation: RenegotiationTransaction | null = null;
  private readonly completedRenegotiations: string[] = [];
  private remoteScreenShareCommitted = false;
  private localScreenShareActive = false;
  private localScreenShareCommitted = false;
  private pendingBrowserScreenStop = false;
  private stopScreenShareInFlight: Promise<boolean> | null = null;
  private iceRestart: IceRestartTransaction | null = null;
  private readonly completedIceRestarts: string[] = [];
  private readonly queuedRemoteIceRestartCandidates = new Map<string, RTCIceCandidateInit[]>();
  private localCandidateTransaction: { kind: "renegotiation" | "ice_restart"; id: string } | null = null;
  private iceRestartRequestInFlight = false;
  private recoveryGraceTimer: ReturnType<typeof setTimeout> | null = null;
  private recoveryRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private recoveryTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private recoveryIncident: RecoveryIncident | null = null;
  private recoveryState: RTCPeerConnectionState | "completed" | null = null;
  private rebuildTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private rebuildReadyPromise: Promise<void> | null = null;
  private rebuildInFlight = false;
  private rebuildEpoch = 0;
  private pendingScreenShareRecoveryAction: { action: "start" | "stop"; fromBrowser: boolean; resolve: (result: boolean) => void } | null = null;

  constructor(
    session: DirectedCallSession,
    signalTransport: DirectedCallSignalTransport,
    lifecycle: DirectedCallMediaLifecyclePort,
    generation: string,
    options: DirectedCallMediaCoordinatorOptions = {},
  ) {
    this.session = session;
    this.signalTransport = signalTransport;
    this.lifecycle = lifecycle;
    this.generation = generation;
    this.isGenerationCurrent = options.isGenerationCurrent ?? ((current) => current === this.generation);
    this.snapshot = { state: "idle", callId: null, participantRole: null, projection: null, generation, remoteAudioStream: null, localScreenShareStream: null, isLocalScreenShareActive: false, remoteScreenShareStream: null, localIssue: null, peerConnectionState: null, isMuted: false, canToggleMute: false };
    this.adapterFactory = options.adapterFactory ?? ((adapterOptions) => new DirectedCallWebRtcAdapter(adapterOptions));
    this.audioConstraints = options.audioConstraints;
    this.onRecoveryResult = options.onRecoveryResult;
    this.adapter = this.createAdapter();
  }

  private createAdapter(): DirectedCallWebRtcAdapter {
    this.localScreenShareEndedCleanup?.();
    this.localScreenShareEndedCleanup = null;
    this.remoteScreenShareChangedCleanup?.();
    this.remoteScreenShareChangedCleanup = null;
    const adapterEpoch = ++this.adapterEpoch;
    const adapter = this.adapterFactory({
      getAudioConstraints: this.audioConstraints,
      onIceCandidate: (candidate) => {
        if (this.adapterEpoch === adapterEpoch) this.queueLocalIceCandidate(candidate);
      },
      onRemoteStream: (stream) => {
        if (this.disposed || this.adapterEpoch !== adapterEpoch) return;
        this.remoteAudioStream = stream;
        this.setSnapshot({ ...this.snapshot, remoteAudioStream: stream });
      },
      onInitialMediaReadinessChange: () => {
        this.maybeSendMediaReady(this.snapshot.callId, this.mediaAttemptEpoch, adapterEpoch);
      },
      onPeerConnectionState: (state) => this.handlePeerConnectionState(state, adapterEpoch),
      onPeerConnectionDiagnostics: (diagnostics) => this.handlePeerConnectionDiagnostics(diagnostics, adapterEpoch),
      onDiagnostic: (event, details) => this.recordMediaDiagnostic(event, details, adapterEpoch, "adapter"),
    });
    this.localScreenShareEndedCleanup = adapter.onLocalScreenShareEnded?.(() => {
      if (this.adapterEpoch === adapterEpoch) this.handleLocalScreenShareEnded();
    }) ?? null;
    this.remoteScreenShareChangedCleanup = adapter.onRemoteScreenShareChanged?.(() => {
      if (this.adapterEpoch === adapterEpoch) this.handleRemoteScreenShareChanged(adapterEpoch, adapter);
    }) ?? null;
    this.remoteScreenShareStream = adapter.getRemoteScreenShareStream?.() ?? null;
    return adapter;
  }

  start(): void {
    if (this.disposed || this.unsubscribeProjection) return;
    this.unsubscribeProjection = this.session.subscribeToProjections((projection) => this.applyProjection(projection));
    this.unsubscribeSignal = this.signalTransport.subscribe((signal) => this.handleSignal(signal));
    this.unsubscribeIceRestart = this.signalTransport.subscribeToIceRestart((event) => { void this.handleIceRestart(event); });
    const unsubscribeSync = this.session.subscribeToSync?.(() => this.handleSync()) ?? (() => undefined);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void this.session.requestSync?.();
    };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibilityChange);
    this.unsubscribeProjection = (() => {
      const unsubscribeProjection = this.unsubscribeProjection!;
      return () => {
        unsubscribeProjection();
        unsubscribeSync();
        if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibilityChange);
      };
    })();
    this.session.getProjections()
      .filter(isUsableProjection)
      .sort((left, right) => left.created_at.localeCompare(right.created_at) || left.call_id.localeCompare(right.call_id))
      .slice(0, 1)
      .forEach((projection) => this.applyProjection(projection));
    this.recordMediaDiagnostic("media_phase", { mediaPhase: "idle" });
  }

  getSnapshot(): DirectedCallMediaCoordinatorSnapshot {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSignalTransport(): DirectedCallSignalTransport {
    return this.signalTransport;
  }

  async startScreenShare(): Promise<boolean> {
    const projection = this.snapshot.projection;
    if (this.rebuildInFlight) return this.queueScreenShareRecoveryAction("start", false);
    if (
      this.disposed
      || !projection
      || projection.state !== "active"
      || !this.isGenerationCurrent(this.generation)
      || this.renegotiation
      || this.iceRestart
      || this.adapter.getLocalScreenShareStream?.()
      || this.localScreenShareCommitted
    ) return false;

    const id = createDirectedCallUuid();
    const transaction: RenegotiationTransaction = {
      callId: projection.call_id,
      generation: this.generation,
      id,
      phase: "preparing_screen",
      screenShare: true,
      screenAction: "start",
      localScreenShareStarted: false,
      localScreenShareStopped: false,
      remoteScreenReceptionEnabledByTransaction: false,
      remoteScreenReceptionDisabledByTransaction: false,
      remoteScreenReceptionWasEnabled: false,
      browserEndedDuringTransaction: false,
    };
    this.renegotiation = transaction;
    let captureStarted = false;
    try {
      if (!await this.adapter.startScreenShare()) {
        this.clearRenegotiation(id);
        return false;
      }
      captureStarted = true;
      if (!this.ownsRenegotiation(transaction, id, projection.call_id, "preparing_screen")) return false;
      if (transaction.browserEndedDuringTransaction) {
        this.clearRenegotiation(id);
        return false;
      }
      transaction.localScreenShareStarted = true;
      this.localScreenShareActive = true;
      this.updateLocalScreenShareSnapshot();
      transaction.phase = "requested";
      this.recordMediaDiagnostic("renegotiate_request_sent", { transactionId: id, screenShare: true, transactionPhase: transaction.phase });
      await this.signalTransport.send(createDirectedCallUuid(), "renegotiate_request", { renegotiation_id: id, screen_share: true });
      if (projection.participant_role === "initiator") {
        if (!this.ownsRenegotiation(transaction, id, projection.call_id, "requested")) return false;
        await this.createAndSendRenegotiationOffer(projection.call_id, id, true);
        return this.renegotiation?.id === id && this.renegotiation.phase === "offered";
      }
      return this.renegotiation?.id === id && this.acceptsRenegotiationId(id, projection.call_id);
    } catch {
      this.clearRenegotiation(id);
      return false;
    } finally {
      if (captureStarted && this.renegotiation?.id !== id && this.adapter.getLocalScreenShareStream?.()) this.adapter.stopScreenShare?.();
    }
  }

  async stopScreenShare(): Promise<boolean> {
    return this.stopScreenShareInternal(false);
  }

  private stopScreenShareInternal(fromBrowser: boolean): Promise<boolean> {
    if (this.stopScreenShareInFlight) return this.stopScreenShareInFlight;
    const projection = this.snapshot.projection;
    if (this.disposed || !projection || projection.state !== "active" || !this.isGenerationCurrent(this.generation)) return Promise.resolve(false);
    if (this.rebuildInFlight) return this.queueScreenShareRecoveryAction("stop", fromBrowser);
    if (this.renegotiation || this.iceRestart) {
      if (fromBrowser) {
        this.pendingBrowserScreenStop = true;
        if (this.renegotiation) this.renegotiation.browserEndedDuringTransaction = true;
      }
      return Promise.resolve(false);
    }
    if (!fromBrowser && !this.localScreenShareActive && !this.adapter.getLocalScreenShareStream?.() && !this.localScreenShareCommitted) return Promise.resolve(true);

    const id = createDirectedCallUuid();
    const transaction: RenegotiationTransaction = {
      callId: projection.call_id,
      generation: this.generation,
      id,
      phase: "requested",
      screenShare: false,
      screenAction: "stop",
      localScreenShareStarted: false,
      localScreenShareStopped: true,
      remoteScreenReceptionEnabledByTransaction: false,
      remoteScreenReceptionDisabledByTransaction: false,
      remoteScreenReceptionWasEnabled: false,
      browserEndedDuringTransaction: false,
    };
    this.renegotiation = transaction;
    this.localScreenShareActive = false;
    this.adapter.stopScreenShare?.();
    this.updateLocalScreenShareSnapshot();
    const operation = (async (): Promise<boolean> => {
      try {
        await this.signalTransport.send(createDirectedCallUuid(), "renegotiate_request", { renegotiation_id: id, screen_share: false });
        if (projection.participant_role === "initiator") {
          if (!this.ownsRenegotiation(transaction, id, projection.call_id, "requested")) return false;
          await this.createAndSendRenegotiationOffer(projection.call_id, id, false);
          return this.renegotiation?.id === id && this.renegotiation.phase === "offered";
        }
        return this.renegotiation?.id === id && this.acceptsRenegotiationId(id, projection.call_id);
      } catch {
        this.clearRenegotiation(id);
        return false;
      }
    })();
    this.stopScreenShareInFlight = operation;
    void operation.finally(() => {
      if (this.stopScreenShareInFlight === operation) this.stopScreenShareInFlight = null;
    });
    return operation;
  }

  private handleLocalScreenShareEnded(): void {
    if (this.disposed) return;
    if (this.renegotiation?.screenAction === "start" && this.renegotiation.phase === "preparing_screen") {
      this.pendingBrowserScreenStop = true;
      this.renegotiation.browserEndedDuringTransaction = true;
      return;
    }
    if (!this.localScreenShareActive) return;
    this.localScreenShareActive = false;
    this.updateLocalScreenShareSnapshot();
    if (this.renegotiation) {
      this.pendingBrowserScreenStop = true;
      this.renegotiation.browserEndedDuringTransaction = true;
      return;
    }
    void this.stopScreenShareInternal(true);
  }

  private handleRemoteScreenShareChanged(adapterEpoch: number, adapter: DirectedCallWebRtcAdapter): void {
    if (this.disposed || this.adapterEpoch !== adapterEpoch) return;
    const nextStream = this.snapshot.projection?.state === "active"
      ? (adapter.getRemoteScreenShareStream?.() ?? null)
      : null;
    if (nextStream === this.remoteScreenShareStream) return;
    this.remoteScreenShareStream = nextStream;
    this.recordMediaDiagnostic("remote_screen_snapshot_published", { remoteStreamPresent: Boolean(nextStream) }, adapterEpoch);
    this.setSnapshot({ ...this.snapshot, remoteScreenShareStream: nextStream });
  }

  private updateLocalScreenShareSnapshot(): void {
    const isActiveCall = this.snapshot.projection?.state === "active";
    const nextStream = isActiveCall ? (this.adapter.getLocalScreenShareStream?.() ?? null) : null;
    const nextActive = isActiveCall && this.localScreenShareActive;
    if (
      nextStream === this.snapshot.localScreenShareStream
      && nextActive === this.snapshot.isLocalScreenShareActive
    ) return;
    this.setSnapshot({
      ...this.snapshot,
      localScreenShareStream: nextStream,
      isLocalScreenShareActive: nextActive,
    });
  }

  private resetCallState(callId: string): void {
    this.lastTerminalCallId = callId;
    this.retireSetupFailureReport();
    this.cancelRecoveryWork();
    this.invalidateMediaAttempt();
    this.signalTransport.unbindCall();
    this.renegotiation = null;
    this.iceRestart = null;
    this.queuedRemoteIceRestartCandidates.clear();
    this.localCandidateTransaction = null;
    this.completedIceRestarts.length = 0;
    this.iceRestartRequestInFlight = false;
    this.completedRenegotiations.length = 0;
    this.remoteScreenShareCommitted = false;
    this.remoteScreenShareStream = null;
    this.localScreenShareActive = false;
    this.localScreenShareCommitted = false;
    this.pendingBrowserScreenStop = false;
    this.stopScreenShareInFlight = null;
    this.mediaStartInFlight = false;
    this.mediaStarted = false;
    this.beginConnectingSent = false;
    this.beginConnectingInFlight = false;
    this.offerSent = false;
    this.mediaReadySent = false;
    this.mediaReadyInFlight = false;
    this.localIssue = null;
    this.remoteAudioStream = null;
    this.peerConnectionState = null;
    this.adapter = this.createAdapter();
    this.recordMediaDiagnostic("cleanup", { callId, reason: "coordinator_reset" });
    this.recordMediaDiagnostic("cleanup", { callId, reason: "call_terminal_reset" });
    this.setSnapshot({
      state: "idle",
      callId: null,
      participantRole: null,
      projection: null,
      generation: this.generation,
      remoteAudioStream: null,
      localScreenShareStream: null,
      isLocalScreenShareActive: false,
      remoteScreenShareStream: null,
      localIssue: null,
      peerConnectionState: null,
      isMuted: false,
      canToggleMute: false,
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.retireSetupFailureReport();
    this.cancelRecoveryWork();
    this.invalidateMediaAttempt();
    this.disposed = true;
    this.recordMediaDiagnostic("cleanup", { reason: "coordinator_dispose" });
    this.setSnapshot({ ...this.snapshot, state: "disposing" });
    this.unsubscribeProjection?.();
    this.unsubscribeSignal?.();
    this.unsubscribeIceRestart?.();
    this.unsubscribeProjection = null;
    this.unsubscribeSignal = null;
    this.unsubscribeIceRestart = null;
    this.clearLocalMediaState();
    this.recordMediaDiagnostic("cleanup", { callId: this.snapshot.callId, reason: "coordinator_disposed" });
    this.signalTransport.dispose();
    this.renegotiation = null;
    this.iceRestart = null;
    this.queuedRemoteIceRestartCandidates.clear();
    this.localCandidateTransaction = null;
    this.completedIceRestarts.length = 0;
    this.iceRestartRequestInFlight = false;
    this.completedRenegotiations.length = 0;
    this.localScreenShareEndedCleanup?.();
    this.localScreenShareEndedCleanup = null;
    this.remoteScreenShareChangedCleanup?.();
    this.remoteScreenShareChangedCleanup = null;
    this.remoteScreenShareCommitted = false;
    this.remoteScreenShareStream = null;
    this.localScreenShareActive = false;
    this.localScreenShareCommitted = false;
    this.pendingBrowserScreenStop = false;
    this.stopScreenShareInFlight = null;
    this.offer = null;
    this.remoteAudioStream = null;
    this.localIssue = null;
    this.setSnapshot({ state: "disposed", callId: null, participantRole: null, projection: null, generation: this.generation, remoteAudioStream: null, localScreenShareStream: null, isLocalScreenShareActive: false, remoteScreenShareStream: null, localIssue: null, peerConnectionState: null, isMuted: false, canToggleMute: false });
    this.listeners.clear();
  }

  private applyProjection(projection: StateProjection): void {
    if (this.disposed) {
      if (TERMINAL_STATES.has(projection.state)) this.recordMediaDiagnostic("terminal_projection_ignored", { callId: projection.call_id, canonicalState: projection.state, generation: this.generation, reason: "coordinator_disposed" });
      return;
    }
    if (!CANONICAL_STATES.includes(projection.state)) {
      this.recordMediaDiagnostic("terminal_projection_ignored", { callId: projection.call_id, canonicalState: projection.state, generation: this.generation, reason: "invalid_canonical_state" });
      return;
    }
    if (this.snapshot.callId === null) {
      if (!isUsableProjection(projection)) return;
      this.signalTransport.bindCall(projection.call_id);
      if (this.lastTerminalCallId) {
        this.recordMediaDiagnostic("call_rollover", { previousCallId: this.lastTerminalCallId, nextCallId: projection.call_id });
        this.recordMediaDiagnostic("cleanup", {
          callId: projection.call_id,
          previousCallId: this.lastTerminalCallId,
          nextCallId: projection.call_id,
          reason: "call_rollover",
        });
        this.lastTerminalCallId = null;
      }
      this.recordMediaDiagnostic("media_phase", { callId: projection.call_id, reason: "fresh_media_session" });
    } else if (this.snapshot.callId !== projection.call_id) {
      this.cancelRecoveryWork();
      return;
    }

    if (TERMINAL_STATES.has(projection.state)) {
      this.recordMediaDiagnostic("terminal_projection_received", { canonicalState: projection.state, reason: projection.state });
      if (this.snapshot.callId === projection.call_id) {
        if (projection.state === "connection_failed") this.acknowledgeSetupFailureFromProjection(projection.call_id);
        else this.retireSetupFailureReport();
        this.remoteScreenShareStream = null;
        this.setSnapshot({ ...this.snapshot, projection, state: "disposing", localScreenShareStream: null, isLocalScreenShareActive: false, remoteScreenShareStream: null });
        this.resetCallState(projection.call_id);
      }
      return;
    }

    if (this.setupFailureReport?.callId === projection.call_id && ["accepted", "connecting"].includes(projection.state)) {
      this.setSnapshot({
        ...this.snapshot,
        projection,
        state: "failed",
        localIssue: this.setupFailureReport.failureCode,
      });
      this.maybeSendSetupFailure(projection.call_id, this.setupFailureReport.epoch);
      return;
    }

    if (projection.state === "active" && this.setupFailureReport?.callId === projection.call_id) {
      this.retireSetupFailureReport();
    }

    if (this.mediaStarted && !this.mediaAttemptActive && projection.state !== "active") {
      this.setSnapshot({
        ...this.snapshot,
        projection,
        state: "failed",
        localIssue: this.localIssue ?? "transport_recovery",
      });
      return;
    }

    const state: DirectedCallMediaCoordinatorState = projection.state === "accepted"
      ? "accepted"
      : MEDIA_READY_STATES.has(projection.state)
        ? "signaling_ready"
        : "waiting_for_connecting";
    this.localIssue = null;
    this.recordMediaDiagnostic("call_projection", { callId: projection.call_id, canonicalState: projection.state });
    this.remoteScreenShareStream = projection.state === "active"
      ? (this.adapter.getRemoteScreenShareStream?.() ?? null)
      : null;
    const localScreenShareStream = projection.state === "active"
      ? (this.adapter.getLocalScreenShareStream?.() ?? null)
      : null;
    this.setSnapshot({ state, callId: projection.call_id, participantRole: projection.participant_role, projection, generation: this.generation, remoteAudioStream: this.remoteAudioStream, localScreenShareStream, isLocalScreenShareActive: projection.state === "active" && this.localScreenShareActive, remoteScreenShareStream: this.remoteScreenShareStream, localIssue: this.localIssue, peerConnectionState: this.peerConnectionState, isMuted: this.snapshot.isMuted, canToggleMute: this.snapshot.canToggleMute });

    if (projection.state === "accepted") void this.startMedia(projection);
    if (projection.state === "connecting") {
      void this.continueConnecting(projection);
      void this.flushLocalCandidates(projection.call_id, this.mediaAttemptEpoch);
      this.maybeSendMediaReady(projection.call_id, this.mediaAttemptEpoch, this.adapterEpoch);
    }
    if (projection.state === "active") void this.flushLocalCandidates(projection.call_id, this.mediaAttemptEpoch);
  }

  private async startMedia(projection: StateProjection): Promise<void> {
    if (this.mediaStartInFlight || this.disposed || !this.isGenerationCurrent(this.generation) || projection.call_id !== this.snapshot.callId) return;
    if (!this.mediaAttemptActive) {
      this.mediaAttemptEpoch += 1;
      this.mediaAttemptActive = true;
    }
    const attempt = this.mediaAttemptEpoch;
    this.mediaStartInFlight = true;
    this.mediaStarted = true;
    this.recordMediaDiagnostic("peer_connection", { callId: projection.call_id, peerConnection: "starting" });
    try {
      if (projection.participant_role === "initiator") {
        try {
          this.offer = await this.adapter.prepareOffer();
          this.syncLocalMediaState(projection.call_id, attempt);
        } catch (error) {
          if (!(error instanceof DirectedCallWebRtcStaleError)) await this.reportSetupFailure(projection.call_id, error, attempt);
          return;
        }
        if (!this.isCurrentCall(projection.call_id, attempt)) return;
        const currentProjection = this.session.getProjection(projection.call_id) ?? this.snapshot.projection;
        if (currentProjection?.state === "connecting") {
          await this.continueConnecting(currentProjection, attempt);
        } else if (!this.beginConnectingSent && !this.beginConnectingInFlight) {
          this.beginConnectingSent = true;
          this.beginConnectingInFlight = true;
          try {
            await this.lifecycle.beginConnecting(projection.call_id);
            if (!this.isCurrentCall(projection.call_id, attempt)) return;
          } catch {
            // The lifecycle controller retains transport-failed commands for
            // its existing bounded retry path; this is not local setup failure.
          } finally {
            if (this.mediaAttemptEpoch === attempt) this.beginConnectingInFlight = false;
          }
        }
      } else {
        try {
          await this.adapter.prepareAnswer();
          this.syncLocalMediaState(projection.call_id, attempt);
          if (!this.isCurrentCall(projection.call_id, attempt)) return;
        } catch (error) {
          if (!(error instanceof DirectedCallWebRtcStaleError)) await this.reportSetupFailure(projection.call_id, error, attempt);
        }
      }
    } catch (error) {
      if (error instanceof DirectedCallWebRtcError && !(error instanceof DirectedCallWebRtcStaleError)) await this.reportSetupFailure(projection.call_id, error, attempt);
    } finally {
      this.mediaStartInFlight = false;
    }
  }

  private async continueConnecting(projection: StateProjection, attempt = this.mediaAttemptEpoch): Promise<void> {
    if (!this.isCurrentCall(projection.call_id, attempt)) return;
    if (projection.participant_role === "initiator" && this.offer && !this.offerSent) {
      if (!this.offer.sdp) {
        await this.reportSetupFailure(projection.call_id, new DirectedCallWebRtcError("sdp_failed"));
        return;
      }
      try {
        await this.signalTransport.send(createDirectedCallUuid(), "offer", { sdp: this.offer.sdp });
        if (!this.isCurrentCall(projection.call_id, attempt)) return;
        this.offerSent = true;
        this.maybeSendMediaReady(projection.call_id, attempt, this.adapterEpoch);
      } catch {
        // A transient relay failure is not a confirmed local setup failure.
        this.retireForTransport(projection.call_id, attempt);
      }
    }
  }

  private async handleSignal(signal: SignalEnvelope): Promise<void> {
    const projection = this.snapshot.projection;
    const attempt = this.mediaAttemptEpoch;
    if (!projection || !this.isCurrentCall(signal.call_id, attempt) || !["connecting", "active"].includes(projection.state)) {
      this.recordMediaDiagnostic("stale_generation_rejected", { reason: !projection ? "no_projection" : "stale_call_or_generation" });
      return;
    }
    try {
      if (projection.state === "active" && signal.kind === "renegotiate_request") {
        const payload = signal.payload as RenegotiationRequestPayload;
        this.recordMediaDiagnostic("renegotiate_request_received", { transactionId: payload.renegotiation_id, screenShare: payload.screen_share });
        await this.handleRenegotiationRequest(signal, projection);
      } else if (projection.state === "active" && signal.kind === "renegotiate_offer") {
        const payload = signal.payload as RenegotiationSdpPayload;
        this.recordMediaDiagnostic("renegotiate_offer_received", { transactionId: payload.renegotiation_id, screenShare: payload.screen_share });
        await this.handleRenegotiationOffer(signal, projection);
      } else if (projection.state === "active" && signal.kind === "renegotiate_answer") {
        const payload = signal.payload as RenegotiationSdpPayload;
        this.recordMediaDiagnostic("renegotiate_answer_received", { transactionId: payload.renegotiation_id, screenShare: payload.screen_share });
        await this.handleRenegotiationAnswer(signal, projection);
      } else if (projection.participant_role === "initiator" && signal.kind === "answer" && isSdpPayload(signal)) {
        if (await this.adapter.acceptAnswer({ type: "answer", sdp: signal.payload.sdp })) {
          if (!this.isCurrentCall(projection.call_id, attempt)) return;
          this.maybeSendMediaReady(projection.call_id, attempt, this.adapterEpoch);
        }
      } else if (projection.participant_role === "recipient" && signal.kind === "offer" && isSdpPayload(signal)) {
        const answer = await this.adapter.acceptOffer({ type: "offer", sdp: signal.payload.sdp });
        if (answer?.sdp && this.isCurrentCall(projection.call_id, attempt)) {
          await this.signalTransport.send(createDirectedCallUuid(), "answer", { sdp: answer.sdp });
          if (!this.isCurrentCall(projection.call_id, attempt)) return;
          this.maybeSendMediaReady(projection.call_id, attempt, this.adapterEpoch);
        }
      } else if (isIcePayload(signal)) {
        const restartId = signal.payload.ice_restart_id;
        const transactionId = restartId ?? signal.payload.renegotiation_id;
        this.recordMediaDiagnostic("ice_received", { transactionId, candidateAction: "received" });
        if (restartId && !this.acceptsIceRestartId(restartId, projection.call_id)) {
          this.recordMediaDiagnostic("ice_rejected", { transactionId, candidateAction: "rejected", candidateReason: "stale_or_unknown_ice_restart" });
          return;
        }
        if (!restartId && transactionId && !this.acceptsRenegotiationId(transactionId, projection.call_id)) {
          this.recordMediaDiagnostic("ice_rejected", { transactionId, candidateAction: "rejected", candidateReason: "stale_or_unknown_renegotiation" });
          return;
        }
        const buffered = restartId
          ? !this.iceRestart?.remoteDescriptionReady
          : !this.adapter.hasRemoteDescription;
        if (restartId && buffered) {
          const queued = this.queuedRemoteIceRestartCandidates.get(restartId) ?? [];
          queued.push(toRtcIceCandidate(signal.payload));
          this.queuedRemoteIceRestartCandidates.set(restartId, queued);
          this.recordMediaDiagnostic("ice_buffered", { transactionId: restartId, candidateAction: "buffered" });
          return;
        }
        const candidate = toRtcIceCandidate(signal.payload);
        const applied = restartId
          ? await this.adapter.addRemoteIceCandidate(candidate, restartId)
          : await this.adapter.addRemoteIceCandidate(candidate);
        if (!applied) {
          this.recordMediaDiagnostic("ice_rejected", { transactionId, candidateAction: "rejected", candidateReason: "duplicate_or_stale_candidate" });
        } else {
          this.recordMediaDiagnostic(buffered ? "ice_buffered" : "ice_applied", { transactionId, candidateAction: buffered ? "buffered" : "applied" });
        }
      }
    } catch (error) {
      if (error instanceof DirectedCallWebRtcStaleError) return;
      if (isIcePayload(signal) && signal.payload.ice_restart_id) {
        const transaction = this.iceRestart;
        if (transaction?.id === signal.payload.ice_restart_id) this.failIceRestart(transaction, error);
        return;
      }
      if (error instanceof DirectedCallWebRtcError) await this.reportSetupFailure(projection.call_id, error, attempt);
      else this.retireForTransport(projection.call_id, attempt);
    }
  }

  async requestIceRestart(): Promise<string | null> {
    const projection = this.snapshot.projection;
    if (
      this.disposed
      || !projection
      || projection.state !== "active"
      || !this.isGenerationCurrent(this.generation)
      || this.renegotiation
      || this.iceRestart
      || this.iceRestartRequestInFlight
    ) return null;

    if (projection.participant_role === "initiator") {
      return this.startIceRestartOffer(projection.call_id);
    }

    const signalId = createDirectedCallUuid();
    this.iceRestartRequestInFlight = true;
    try {
      await this.signalTransport.sendIceRestartRequest(signalId);
      return signalId;
    } catch {
      return null;
    } finally {
      this.iceRestartRequestInFlight = false;
    }
  }

  startIceRestart(): Promise<string | null> {
    return this.requestIceRestart();
  }

  private async handleIceRestart(event: IceRestartRelay): Promise<void> {
    const projection = this.snapshot.projection;
    if (
      this.disposed
      || !projection
      || projection.state !== "active"
      || event.call_id !== projection.call_id
      || !this.isGenerationCurrent(this.generation)
    ) return;

    if (event.kind === "request") {
      if (
        projection.participant_role === "initiator"
        && !this.rebuildInFlight
        && !this.recoveryIncident?.rebuildAttempted
        && !this.renegotiation
        && !this.iceRestart
      ) {
        await this.startIceRestartOffer(projection.call_id);
      }
      return;
    }

    if (event.kind === "offer") {
      await this.handleIceRestartOffer(event, projection);
      return;
    }

    await this.handleIceRestartAnswer(event, projection);
  }

  private async startIceRestartOffer(callId: string, rebuild = false): Promise<string | null> {
    const projection = this.snapshot.projection;
    if (
      this.disposed
      || !projection
      || projection.call_id !== callId
      || projection.state !== "active"
      || projection.participant_role !== "initiator"
      || this.renegotiation
      || this.iceRestart
      || !this.isGenerationCurrent(this.generation)
    ) return null;

    const id = createDirectedCallUuid();
    const transaction: IceRestartTransaction = {
      callId,
      generation: this.generation,
      id,
      phase: "creating_offer",
      remoteDescriptionReady: false,
      rebuild,
    };
    this.iceRestart = transaction;
    this.localCandidateTransaction = { kind: "ice_restart", id };
    void this.flushLocalCandidates(callId, this.mediaAttemptEpoch);
    try {
      const offer = rebuild
        ? await this.adapter.createPeerConnectionRebuildOffer?.()
        : await this.adapter.createIceRestartOffer();
      if (!this.ownsIceRestart(transaction, id, callId, "creating_offer") || !offer?.sdp) return null;
      transaction.phase = "offered";
      await this.signalTransport.sendIceRestartOffer(createDirectedCallUuid(), id, offer.sdp);
      if (!this.ownsIceRestart(transaction, id, callId, "offered")) return null;
      return id;
    } catch (error) {
      this.failIceRestart(transaction, error);
      return null;
    }
  }

  private async handleIceRestartOffer(
    event: IceRestartSdpRelay,
    projection: StateProjection,
  ): Promise<void> {
    if (projection.participant_role !== "recipient" || this.renegotiation) return;
    if (this.rebuildReadyPromise) {
      try {
        await this.rebuildReadyPromise;
      } catch {
        return;
      }
      if (this.disposed || !this.isCurrentCall(projection.call_id) || this.snapshot.projection?.state !== "active") return;
    }
    if (this.completedIceRestarts.includes(event.ice_restart_id)) return;
    if (this.iceRestart?.id === event.ice_restart_id) return;
    if (this.iceRestart) this.supersedeIceRestart(this.iceRestart.id);

    const transaction: IceRestartTransaction = {
      callId: projection.call_id,
      generation: this.generation,
      id: event.ice_restart_id,
      phase: "answering",
      remoteDescriptionReady: false,
      rebuild: this.rebuildInFlight,
    };
    this.iceRestart = transaction;
    this.localCandidateTransaction = { kind: "ice_restart", id: transaction.id };
    void this.flushLocalCandidates(projection.call_id, this.mediaAttemptEpoch);
    try {
      await this.adapter.applyIceRestartOffer({ type: "offer", sdp: event.sdp }, transaction.id, transaction.rebuild);
      if (!this.ownsIceRestart(transaction, transaction.id, projection.call_id, "answering")) return;
      transaction.remoteDescriptionReady = true;
      await this.flushRemoteIceRestartCandidates(transaction.id);
      const answer = transaction.rebuild
        ? await this.adapter.createPeerConnectionRebuildAnswer?.()
        : await this.adapter.createIceRestartAnswer();
      if (!answer?.sdp || !this.ownsIceRestart(transaction, transaction.id, projection.call_id, "answering")) return;
      await this.signalTransport.sendIceRestartAnswer(createDirectedCallUuid(), transaction.id, answer.sdp);
      if (this.ownsIceRestart(transaction, transaction.id, projection.call_id, "answering")) this.completeIceRestart(transaction.id);
    } catch (error) {
      this.failIceRestart(transaction, error);
    }
  }

  private async handleIceRestartAnswer(
    event: IceRestartSdpRelay,
    projection: StateProjection,
  ): Promise<void> {
    const transaction = this.iceRestart;
    if (
      projection.participant_role !== "initiator"
      || !transaction
      || transaction.id !== event.ice_restart_id
      || transaction.phase !== "offered"
      || this.completedIceRestarts.includes(event.ice_restart_id)
    ) return;
    transaction.phase = "applying_answer";
    try {
      await this.adapter.applyIceRestartAnswer({ type: "answer", sdp: event.sdp }, transaction.id);
      if (!this.ownsIceRestart(transaction, transaction.id, projection.call_id, "applying_answer")) return;
      transaction.remoteDescriptionReady = true;
      await this.flushRemoteIceRestartCandidates(transaction.id);
      if (this.ownsIceRestart(transaction, transaction.id, projection.call_id, "applying_answer")) this.completeIceRestart(transaction.id);
    } catch (error) {
      this.failIceRestart(transaction, error);
    }
  }

  private async flushRemoteIceRestartCandidates(id: string): Promise<void> {
    const candidates = this.queuedRemoteIceRestartCandidates.get(id) ?? [];
    this.queuedRemoteIceRestartCandidates.delete(id);
    for (const candidate of candidates) {
      if (!this.iceRestart || this.iceRestart.id !== id) return;
      await this.adapter.addRemoteIceCandidate(candidate, id);
    }
  }

  private acceptsIceRestartId(id: string, callId: string): boolean {
    return !this.disposed
      && this.isGenerationCurrent(this.generation)
      && this.snapshot.callId === callId
      && this.iceRestart?.id === id
      && this.iceRestart.generation === this.generation
      && !this.completedIceRestarts.includes(id);
  }

  private ownsIceRestart(transaction: IceRestartTransaction, id: string, callId: string, phase: IceRestartTransaction["phase"]): boolean {
    return this.acceptsIceRestartId(id, callId)
      && this.iceRestart === transaction
      && transaction.phase === phase;
  }

  private completeIceRestart(id: string): void {
    if (!this.iceRestart || this.iceRestart.id !== id) return;
    this.completedIceRestarts.push(id);
    if (this.completedIceRestarts.length > MAX_COMPLETED_ICE_RESTARTS) this.completedIceRestarts.shift();
    this.queuedRemoteIceRestartCandidates.delete(id);
    this.iceRestart = null;
  }

  private supersedeIceRestart(id: string): void {
    if (!this.iceRestart || this.iceRestart.id !== id) return;
    this.completedIceRestarts.push(id);
    if (this.completedIceRestarts.length > MAX_COMPLETED_ICE_RESTARTS) this.completedIceRestarts.shift();
    this.queuedRemoteIceRestartCandidates.delete(id);
    this.queuedLocalCandidates.splice(0, this.queuedLocalCandidates.length, ...this.queuedLocalCandidates.filter((entry) => entry.iceRestartId !== id));
    this.iceRestart = null;
  }

  private clearIceRestart(id: string): void {
    if (this.iceRestart?.id !== id) return;
    this.iceRestart = null;
    this.queuedRemoteIceRestartCandidates.delete(id);
    this.queuedLocalCandidates.splice(0, this.queuedLocalCandidates.length, ...this.queuedLocalCandidates.filter((entry) => entry.iceRestartId !== id));
    if (this.localCandidateTransaction?.kind === "ice_restart" && this.localCandidateTransaction.id === id) {
      this.localCandidateTransaction = null;
    }
  }

  private failIceRestart(transaction: IceRestartTransaction, error: unknown): void {
    if (error instanceof DirectedCallWebRtcStaleError || !this.ownsIceRestart(transaction, transaction.id, transaction.callId, transaction.phase)) return;
    const failureCode = error instanceof DirectedCallWebRtcError ? error.failureCode : "sdp_failed";
    this.recordMediaDiagnostic("failure", { callId: transaction.callId, failureKind: failureCode, transactionId: transaction.id });
    this.setSnapshot({ ...this.snapshot, localIssue: failureCode });
    this.clearIceRestart(transaction.id);
  }

  async requestRenegotiation(screenShare = false): Promise<string | null> {
    const projection = this.snapshot.projection;
    if (this.disposed || !projection || projection.state !== "active" || this.rebuildInFlight || this.renegotiation || this.iceRestart) return null;
    const id = createDirectedCallUuid();
    this.renegotiation = {
      callId: projection.call_id,
      generation: this.generation,
      id,
      phase: "requested",
      screenShare,
      screenAction: screenShare ? "start" : "none",
      localScreenShareStarted: false,
      localScreenShareStopped: false,
      remoteScreenReceptionEnabledByTransaction: false,
      remoteScreenReceptionDisabledByTransaction: false,
      remoteScreenReceptionWasEnabled: false,
      browserEndedDuringTransaction: false,
    };
    try {
      await this.signalTransport.send(createDirectedCallUuid(), "renegotiate_request", { renegotiation_id: id, screen_share: screenShare });
      this.recordMediaDiagnostic("renegotiate_request_sent", { transactionId: id, screenShare, transactionPhase: this.renegotiation?.phase });
      if (projection.participant_role === "initiator") await this.createAndSendRenegotiationOffer(projection.call_id, id, screenShare);
      return id;
    } catch {
      this.clearRenegotiation(id);
      return null;
    }
  }

  private async handleRenegotiationRequest(signal: SignalEnvelope, projection: StateProjection): Promise<void> {
    if (this.rebuildInFlight) return;
    const payload = signal.payload as RenegotiationRequestPayload;
    const id = payload.renegotiation_id;
    if (this.completedRenegotiations.includes(id)) return;
    if (this.renegotiation && this.renegotiation.id !== id) return;
    if (!this.renegotiation) this.renegotiation = {
      callId: projection.call_id,
      generation: this.generation,
      id,
      phase: "requested",
      screenShare: payload.screen_share,
      screenAction: payload.screen_share
        ? "start"
        : (this.remoteScreenShareCommitted || Boolean(this.adapter.getRemoteScreenShareStream?.()) ? "stop" : "none"),
      localScreenShareStarted: false,
      localScreenShareStopped: false,
      remoteScreenReceptionEnabledByTransaction: false,
      remoteScreenReceptionDisabledByTransaction: false,
      remoteScreenReceptionWasEnabled: false,
      browserEndedDuringTransaction: false,
    };
    if (projection.participant_role === "initiator") {
      if (payload.screen_share && !this.prepareRemoteScreenReception(id, projection.call_id)) return;
      if (!payload.screen_share && this.renegotiation.screenAction === "stop" && !this.prepareRemoteScreenStop(id, projection.call_id)) return;
      await this.createAndSendRenegotiationOffer(projection.call_id, id, payload.screen_share);
    }
  }

  private async createAndSendRenegotiationOffer(callId: string, id: string, screenShare: boolean): Promise<void> {
    if (!this.renegotiation || this.renegotiation.id !== id || this.renegotiation.phase !== "requested") return;
    this.renegotiation.phase = "creating_offer";
    this.localCandidateTransaction = { kind: "renegotiation", id };
    try {
      const offer = await this.adapter.createRenegotiationOffer();
      if (!offer.sdp || !this.acceptsRenegotiationId(id, callId)) return;
      this.renegotiation.phase = "offered";
      this.recordMediaDiagnostic("renegotiate_offer_sent", { transactionId: id, screenShare, transactionPhase: this.renegotiation.phase });
      await this.signalTransport.send(createDirectedCallUuid(), "renegotiate_offer", { renegotiation_id: id, screen_share: screenShare, sdp: offer.sdp });
    } catch {
      this.clearRenegotiation(id);
    }
  }

  private async handleRenegotiationOffer(signal: SignalEnvelope, projection: StateProjection): Promise<void> {
    const payload = signal.payload as RenegotiationSdpPayload;
    const id = payload.renegotiation_id;
    if (projection.participant_role !== "recipient" || this.completedRenegotiations.includes(id)) return;
    if (this.renegotiation && this.renegotiation.id !== id) return;
    if (!this.renegotiation) this.renegotiation = {
      callId: projection.call_id,
      generation: this.generation,
      id,
      phase: "offered",
      screenShare: payload.screen_share,
      screenAction: payload.screen_share
        ? "start"
        : (this.remoteScreenShareCommitted || Boolean(this.adapter.getRemoteScreenShareStream?.()) ? "stop" : "none"),
      localScreenShareStarted: false,
      localScreenShareStopped: false,
      remoteScreenReceptionEnabledByTransaction: false,
      remoteScreenReceptionDisabledByTransaction: false,
      remoteScreenReceptionWasEnabled: false,
      browserEndedDuringTransaction: false,
    };
    if (this.renegotiation.phase === "answering") return;
    if (this.renegotiation.phase === "requested") this.renegotiation.phase = "offered";
    if (this.renegotiation.phase !== "offered") return;
    if (this.renegotiation.screenAction === "start" && !this.renegotiation.localScreenShareStarted && !this.prepareRemoteScreenReception(id, projection.call_id)) return;
    if (this.renegotiation.screenAction === "stop" && !this.renegotiation.localScreenShareStarted && !this.prepareRemoteScreenStop(id, projection.call_id)) return;
    this.renegotiation.phase = "answering";
    const transaction = this.renegotiation;
    this.localCandidateTransaction = { kind: "renegotiation", id };
    try {
      await this.adapter.applyRenegotiationOffer({ type: "offer", sdp: payload.sdp });
      if (!this.ownsRenegotiation(transaction, id, projection.call_id, "answering")) return;
      const answer = await this.adapter.createRenegotiationAnswer();
      if (!answer.sdp || !this.ownsRenegotiation(transaction, id, projection.call_id, "answering")) return;
      this.recordMediaDiagnostic("renegotiate_answer_sent", { transactionId: id, screenShare: payload.screen_share, transactionPhase: this.renegotiation.phase });
      await this.signalTransport.send(createDirectedCallUuid(), "renegotiate_answer", { renegotiation_id: id, screen_share: payload.screen_share, sdp: answer.sdp });
      if (!this.ownsRenegotiation(transaction, id, projection.call_id, "answering")) return;
      this.completeRenegotiation(id);
    } catch {
      if (this.ownsRenegotiation(transaction, id, projection.call_id, "answering")) this.clearRenegotiation(id);
    }
  }

  private async handleRenegotiationAnswer(signal: SignalEnvelope, projection: StateProjection): Promise<void> {
    const payload = signal.payload as RenegotiationSdpPayload;
    const id = payload.renegotiation_id;
    if (projection.participant_role !== "initiator" || this.completedRenegotiations.includes(id)) return;
    if (!this.renegotiation || this.renegotiation.id !== id || this.renegotiation.phase !== "offered") return;
    this.renegotiation.phase = "applying_answer";
    const transaction = this.renegotiation;
    try {
      await this.adapter.applyRenegotiationAnswer({ type: "answer", sdp: payload.sdp });
      if (!this.ownsRenegotiation(transaction, id, projection.call_id, "applying_answer")) return;
      this.completeRenegotiation(id);
    } catch {
      this.clearRenegotiation(id);
    }
  }

  private acceptsRenegotiationId(id: string, callId: string): boolean {
    return !this.disposed && this.isGenerationCurrent(this.generation) && this.snapshot.callId === callId && this.renegotiation?.id === id && this.renegotiation.generation === this.generation;
  }

  private ownsRenegotiation(transaction: RenegotiationTransaction, id: string, callId: string, phase: RenegotiationTransaction["phase"]): boolean {
    return this.acceptsRenegotiationId(id, callId) && this.renegotiation === transaction && this.renegotiation.phase === phase;
  }

  private completeRenegotiation(id: string): void {
    const transaction = this.renegotiation;
    if (transaction?.id !== id) return;
    this.completedRenegotiations.push(id);
    if (this.completedRenegotiations.length > MAX_COMPLETED_RENEGOTIATIONS) this.completedRenegotiations.shift();
    this.renegotiation = null;
    if (transaction.screenAction === "start" && transaction.localScreenShareStarted) this.localScreenShareCommitted = true;
    if (transaction.screenAction === "stop") this.localScreenShareCommitted = false;
    if (transaction.screenShare && transaction.remoteScreenReceptionEnabledByTransaction) {
      this.remoteScreenShareCommitted = true;
      this.adapter.reconcileRemoteScreenShareState?.(true);
    }
    if (transaction.screenAction === "stop" && transaction.remoteScreenReceptionDisabledByTransaction) {
      this.remoteScreenShareCommitted = false;
      this.adapter.reconcileRemoteScreenShareState?.(false);
    }
    const browserStopPending = transaction.browserEndedDuringTransaction || this.pendingBrowserScreenStop;
    this.pendingBrowserScreenStop = false;
    if (browserStopPending && this.localScreenShareCommitted) {
      queueMicrotask(() => { void this.stopScreenShareInternal(true); });
    }
  }

  private clearRenegotiation(id: string): void {
    const transaction = this.renegotiation;
    if (transaction?.id !== id) return;
    this.renegotiation = null;
    if (transaction.localScreenShareStarted) {
      this.localScreenShareActive = false;
      this.adapter.stopScreenShare?.();
      this.updateLocalScreenShareSnapshot();
    }
    if (transaction.screenAction === "start") this.localScreenShareCommitted = false;
    if (transaction.remoteScreenReceptionEnabledByTransaction) {
      this.adapter.setRemoteScreenShareReceptionEnabled?.(false);
      this.adapter.reconcileRemoteScreenShareState?.(false);
    }
    if (transaction.remoteScreenReceptionDisabledByTransaction && transaction.remoteScreenReceptionWasEnabled) {
      this.adapter.setRemoteScreenShareReceptionEnabled?.(true);
    }
    const browserStopPending = transaction.browserEndedDuringTransaction || this.pendingBrowserScreenStop;
    this.pendingBrowserScreenStop = false;
    if (browserStopPending && this.localScreenShareCommitted) {
      queueMicrotask(() => { void this.stopScreenShareInternal(true); });
    }
  }

  private prepareRemoteScreenReception(id: string, callId: string): boolean {
    const transaction = this.renegotiation;
    if (!transaction || transaction.id !== id || transaction.callId !== callId || !transaction.screenShare) return false;
    if (transaction.remoteScreenReceptionEnabledByTransaction) return true;
    const enabled = this.adapter.setRemoteScreenShareReceptionEnabled ? this.adapter.setRemoteScreenShareReceptionEnabled(true) : true;
    if (!enabled) {
      this.clearRenegotiation(id);
      return false;
    }
    transaction.remoteScreenReceptionEnabledByTransaction = true;
    return true;
  }

  private prepareRemoteScreenStop(id: string, callId: string): boolean {
    const transaction = this.renegotiation;
    if (!transaction || transaction.id !== id || transaction.callId !== callId || transaction.screenAction !== "stop") return false;
    if (transaction.remoteScreenReceptionDisabledByTransaction) return true;
    transaction.remoteScreenReceptionWasEnabled = this.remoteScreenShareCommitted || Boolean(this.adapter.getRemoteScreenShareStream?.());
    if (!transaction.remoteScreenReceptionWasEnabled) return true;
    const disabled = this.adapter.setRemoteScreenShareReceptionEnabled ? this.adapter.setRemoteScreenShareReceptionEnabled(false) : true;
    if (!disabled) {
      this.clearRenegotiation(id);
      return false;
    }
    transaction.remoteScreenReceptionDisabledByTransaction = true;
    return true;
  }

  private queueLocalIceCandidate(candidate: RTCIceCandidateInit): void {
    const callId = this.snapshot.callId;
    const attempt = this.mediaAttemptEpoch;
    if (!callId || !this.isCurrentCall(callId, attempt)) return;
    const localTransaction = this.localCandidateTransaction;
    const renegotiationId = localTransaction?.kind === "renegotiation" ? localTransaction.id : undefined;
    const iceRestartId = localTransaction?.kind === "ice_restart" ? localTransaction.id : undefined;
    const key = candidateKey(candidate, renegotiationId ?? iceRestartId);
    if (this.sentLocalCandidateKeys.has(key) || this.queuedLocalCandidates.some((entry) => candidateKey(entry.candidate, entry.renegotiationId ?? entry.iceRestartId) === key)) return;
    this.queuedLocalCandidates.push({ candidate, callId, attempt, renegotiationId, iceRestartId });
    this.recordPeerConnectionDiagnostics();
    void this.flushLocalCandidates(callId, attempt);
  }

  private async flushLocalCandidates(callId: string, attempt: number): Promise<void> {
    if (this.localCandidateFlushInFlight || !this.isCurrentCall(callId, attempt)) return;
    const projection = this.snapshot.projection;
    if (!projection || !["connecting", "active"].includes(projection.state)) return;
    this.localCandidateFlushInFlight = true;
    try {
      while (this.queuedLocalCandidates.length > 0) {
        const entry = this.queuedLocalCandidates[0];
        if (entry.callId !== callId || entry.attempt !== attempt || !this.isCurrentCall(callId, attempt)) return;
        if (this.rebuildInFlight && !this.localCandidateTransaction) return;
        if (this.rebuildInFlight && !entry.renegotiationId && !entry.iceRestartId && this.localCandidateTransaction?.kind === "ice_restart") {
          entry.iceRestartId = this.localCandidateTransaction.id;
        }
        this.queuedLocalCandidates.shift();
        const key = candidateKey(entry.candidate, entry.renegotiationId ?? entry.iceRestartId);
        if (this.sentLocalCandidateKeys.has(key)) continue;
        this.sentLocalCandidateKeys.add(key);
        try {
          await this.signalTransport.send(createDirectedCallUuid(), "ice_candidate", toWireIceCandidate(entry.candidate, entry.renegotiationId, entry.iceRestartId));
          if (!this.isCurrentCall(callId, attempt)) return;
          this.flushedLocalCandidateCount += 1;
          this.recordMediaDiagnostic("ice_sent", { transactionId: entry.renegotiationId, candidateAction: "sent", candidateIndex: this.flushedLocalCandidateCount });
          this.recordPeerConnectionDiagnostics();
        } catch {
          this.retireForTransport(callId, attempt);
          return;
        }
      }
    } finally {
      this.localCandidateFlushInFlight = false;
    }
  }

  private maybeSendMediaReady(callId: string | null, attempt: number, adapterEpoch: number): void {
    if (this.disposed || adapterEpoch !== this.adapterEpoch || !callId || !this.isGenerationCurrent(this.generation)) return;
    if (!this.isCurrentCall(callId, attempt) || this.snapshot.projection?.state !== "connecting") return;
    if (!this.adapter.initialMediaReadinessSnapshot.ready || this.mediaReadySent || this.mediaReadyInFlight) return;
    this.mediaReadyInFlight = true;
    void this.lifecycle.mediaReady(callId)
      .then((outcome) => {
        if (outcome.status === "acknowledged" && this.isCurrentReadyAttempt(callId, attempt, adapterEpoch)) {
          this.mediaReadySent = true;
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (this.mediaAttemptEpoch === attempt && this.adapterEpoch === adapterEpoch) this.mediaReadyInFlight = false;
      });
  }

  private isCurrentReadyAttempt(callId: string, attempt: number, adapterEpoch: number): boolean {
    return adapterEpoch === this.adapterEpoch
      && this.isCurrentCall(callId, attempt)
      && this.snapshot.projection?.state === "connecting";
  }

  private handleSync(): void {
    if (this.disposed || !this.snapshot.callId) return;
    const projection = this.session.getProjection(this.snapshot.callId);
    if (!projection) return;
    if (TERMINAL_STATES.has(projection.state)) {
      this.applyProjection(projection);
      return;
    }
    if (this.setupFailureReport?.callId === projection.call_id && ["accepted", "connecting"].includes(projection.state)) {
      this.maybeSendSetupFailure(projection.call_id, this.setupFailureReport.epoch);
      return;
    }
    if (["accepted", "connecting"].includes(projection.state) && this.mediaStarted && this.snapshot.state !== "idle") {
      this.retireForTransport(projection.call_id, this.mediaAttemptEpoch);
    }
  }

  private reportSetupFailure(callId: string, error: unknown, attempt = this.mediaAttemptEpoch): void {
    if (error instanceof DirectedCallWebRtcStaleError) return;
    if (this.setupFailureReport || !this.isCurrentCall(callId, attempt) || !["accepted", "connecting"].includes(this.snapshot.projection?.state ?? "")) return;

    const failureCode = this.toSafeSetupFailureCode(error);
    const report: SetupFailureReport = {
      callId,
      failureCode,
      epoch: ++this.setupFailureReportEpoch,
      generation: this.generation,
      inFlight: false,
      acknowledged: false,
      retryable: true,
    };
    this.setupFailureReport = report;
    this.localIssue = failureCode;
    this.recordMediaDiagnostic("failure", { callId, failureKind: failureCode });
    this.setSnapshot({ ...this.snapshot, state: "failed", localIssue: failureCode });

    // Cleanup is deliberately complete before any server-report Promise is created.
    this.invalidateMediaAttempt();
    this.maybeSendSetupFailure(callId, report.epoch);
  }

  private toSafeSetupFailureCode(error: unknown): FailureCode {
    if (error instanceof DirectedCallWebRtcError) {
      const safeCodes = new Set<FailureCode>([
        "permission_denied",
        "microphone_unavailable",
        "peer_connection_failed",
        "sdp_failed",
        "ice_failed",
        "media_binding_failed",
      ]);
      return safeCodes.has(error.failureCode) ? error.failureCode : "peer_connection_failed";
    }
    return "peer_connection_failed";
  }

  private maybeSendSetupFailure(callId: string, epoch: number): void {
    const report = this.setupFailureReport;
    if (!report || report.epoch !== epoch || report.callId !== callId || report.generation !== this.generation) return;
    if (this.disposed || !this.isGenerationCurrent(this.generation) || this.snapshot.callId !== callId) return;
    if (!["accepted", "connecting"].includes(this.snapshot.projection?.state ?? "")) return;
    if (report.acknowledged || report.inFlight || !report.retryable) return;

    report.inFlight = true;
    void this.lifecycle.setupFailed(callId, report.failureCode)
      .then((outcome) => this.handleSetupFailureOutcome(report, outcome))
      .catch(() => {
        if (this.isCurrentSetupFailureReport(report)) report.retryable = true;
      })
      .finally(() => {
        if (this.isCurrentSetupFailureReport(report)) report.inFlight = false;
      });
  }

  private handleSetupFailureOutcome(report: SetupFailureReport, outcome: LifecycleCommandOutcome): void {
    if (!this.isCurrentSetupFailureReport(report)) return;
    const resultCode = outcome.status === "acknowledged" && "result_code" in outcome.result
      ? outcome.result.result_code
      : null;
    if (
      outcome.status === "acknowledged" &&
      outcome.event === "call:setup_failed" &&
      outcome.result.call_id === report.callId &&
      outcome.result.state === "connection_failed" &&
      typeof resultCode === "string" && ["applied", "no_op", "duplicate"].includes(resultCode)
    ) {
      report.acknowledged = true;
      report.retryable = false;
      return;
    }

    if (outcome.status === "failed" && ["transport_timeout", "transport_error"].includes(outcome.error.kind)) {
      report.retryable = true;
      return;
    }

    report.retryable = false;
    this.recordMediaDiagnostic("failure", { callId: report.callId, failureKind: "setup_failure_report_rejected" });
  }

  private isCurrentSetupFailureReport(report: SetupFailureReport): boolean {
    return !this.disposed && this.setupFailureReport === report && report.epoch === this.setupFailureReportEpoch && report.generation === this.generation;
  }

  private acknowledgeSetupFailureFromProjection(callId: string): void {
    const report = this.setupFailureReport;
    if (!report || report.callId !== callId) return;
    report.acknowledged = true;
    report.retryable = false;
    report.inFlight = false;
  }

  private retireSetupFailureReport(): void {
    this.setupFailureReportEpoch += 1;
    this.setupFailureReport = null;
  }

  private handlePeerConnectionState(state: RTCPeerConnectionState | "completed", adapterEpoch = this.adapterEpoch): void {
    if (this.disposed || adapterEpoch !== this.adapterEpoch) return;
    this.peerConnectionState = state === "completed" ? "connected" : state;
    this.recordMediaDiagnostic("peer_connection", { callId: this.snapshot.callId, peerConnection: state });
    if ((state === "connected" || state === "completed") && this.snapshot.projection?.state === "active") this.recoverFromIceIncident();
    else if (state === "disconnected" && this.snapshot.projection?.state === "active") this.scheduleIceRecoveryGrace();
    else if (state === "failed" && this.snapshot.projection?.state === "active") this.startIceRecoveryAttempt();
    else if (state === "closed") {
      this.cancelRecoveryWork();
      this.recoveryState = state;
    }
    this.setSnapshot({ ...this.snapshot, peerConnectionState: this.peerConnectionState });
  }

  private handlePeerConnectionDiagnostics(diagnostics: DirectedCallPeerConnectionDiagnostics, adapterEpoch = this.adapterEpoch): void {
    if (this.disposed || adapterEpoch !== this.adapterEpoch) return;
    this.peerConnectionDiagnostics = diagnostics;
    this.recordPeerConnectionDiagnostics();
  }

  private scheduleIceRecoveryGrace(): void {
    const callId = this.snapshot.callId;
    if (!callId || this.disposed || !this.isGenerationCurrent(this.generation)) return;
    if (!this.recoveryIncident || this.recoveryIncident.callId !== callId || this.recoveryIncident.generation !== this.generation) {
      this.cancelRecoveryWork();
      this.recoveryIncident = { callId, generation: this.generation, attempts: 0, activeAttempt: null, rebuildAttempted: false };
    }
    this.recoveryState = "disconnected";
    if (this.recoveryIncident.activeAttempt !== null || this.recoveryGraceTimer || this.recoveryRetryTimer || this.recoveryTimeoutTimer) return;
    const incident = this.recoveryIncident;
    this.recoveryGraceTimer = setTimeout(() => {
      this.recoveryGraceTimer = null;
      if (this.recoveryIncident !== incident || this.recoveryState !== "disconnected" || !this.isCurrentCall(incident.callId)) return;
      this.startIceRecoveryAttempt();
    }, ICE_RECOVERY_GRACE_MS);
  }

  private startIceRecoveryAttempt(): void {
    const callId = this.snapshot.callId;
    if (!callId || this.disposed || this.snapshot.projection?.state !== "active" || !this.isGenerationCurrent(this.generation)) return;
    if (!this.recoveryIncident || this.recoveryIncident.callId !== callId || this.recoveryIncident.generation !== this.generation) {
      this.cancelRecoveryWork();
      this.recoveryIncident = { callId, generation: this.generation, attempts: 0, activeAttempt: null, rebuildAttempted: false };
    }
    const incident = this.recoveryIncident;
    if (incident.activeAttempt !== null || this.recoveryRetryTimer || this.recoveryGraceTimer || incident.attempts >= MAX_ICE_RECOVERY_ATTEMPTS) return;
    const attempt = ++incident.attempts;
    incident.activeAttempt = attempt;
    this.recoveryState = this.peerConnectionState;
    this.localIssue = "transport_recovery";
    this.recordMediaDiagnostic("failure", { callId, failureKind: "ice_restart_attempt", reason: `attempt_${attempt}` });
    this.setSnapshot({ ...this.snapshot, localIssue: this.localIssue });
    this.recoveryTimeoutTimer = setTimeout(() => {
      this.recoveryTimeoutTimer = null;
      this.finishIceRecoveryAttempt(incident, attempt);
    }, ICE_RECOVERY_TIMEOUT_MS);
    void this.requestIceRestart().then((restartId) => {
      if (restartId === null) this.finishIceRecoveryAttempt(incident, attempt);
    }).catch(() => {
      this.finishIceRecoveryAttempt(incident, attempt);
    });
  }

  private finishIceRecoveryAttempt(incident: RecoveryIncident, attempt: number): void {
    if (this.recoveryIncident !== incident || incident.activeAttempt !== attempt || this.disposed || !this.isCurrentCall(incident.callId)) return;
    if (this.recoveryTimeoutTimer) {
      clearTimeout(this.recoveryTimeoutTimer);
      this.recoveryTimeoutTimer = null;
    }
    if (this.iceRestart) this.supersedeIceRestart(this.iceRestart.id);
    incident.activeAttempt = null;
    if (this.recoveryState === "connected" || this.recoveryState === "completed") return;
    if (incident.attempts < MAX_ICE_RECOVERY_ATTEMPTS) {
      this.recoveryRetryTimer = setTimeout(() => {
        this.recoveryRetryTimer = null;
        if (this.recoveryIncident === incident && (this.recoveryState === "disconnected" || this.recoveryState === "failed")) this.startIceRecoveryAttempt();
      }, ICE_RECOVERY_RETRY_DELAY_MS);
      return;
    }
    this.localIssue = "restart_exhausted";
    this.recordMediaDiagnostic("failure", { callId: incident.callId, failureKind: "restart_exhausted" });
    this.setSnapshot({ ...this.snapshot, localIssue: this.localIssue });
    this.startPeerConnectionRebuild(incident);
  }

  private startPeerConnectionRebuild(incident: RecoveryIncident): void {
    if (
      incident.rebuildAttempted
      || this.disposed
      || this.recoveryIncident !== incident
      || !this.isCurrentCall(incident.callId)
      || this.snapshot.projection?.state !== "active"
      || !this.isGenerationCurrent(this.generation)
    ) return;
    incident.rebuildAttempted = true;
    const rebuildEpoch = ++this.rebuildEpoch;
    this.rebuildInFlight = true;
    this.rebuildTimeoutTimer = setTimeout(() => {
      this.finishPeerConnectionRebuild(rebuildEpoch);
    }, PEER_CONNECTION_REBUILD_TIMEOUT_MS);
    const ready = Promise.resolve().then(() => {
      if (!this.adapter.rebuildPeerConnection) throw new DirectedCallWebRtcError("media_binding_failed");
      return this.adapter.rebuildPeerConnection();
    });
    this.rebuildReadyPromise = ready;
    void ready.then(async () => {
      if (!this.ownsPeerConnectionRebuild(incident, rebuildEpoch)) return;
      if (this.snapshot.participantRole === "initiator") {
        const restartId = await this.startIceRestartOffer(incident.callId, true);
        if (restartId === null) this.finishPeerConnectionRebuild(rebuildEpoch);
      } else {
        try {
          await this.signalTransport.sendIceRestartRequest(createDirectedCallUuid());
        } catch {
          this.finishPeerConnectionRebuild(rebuildEpoch);
        }
      }
    }).catch(() => {
      this.finishPeerConnectionRebuild(rebuildEpoch);
    }).finally(() => {
      if (this.rebuildReadyPromise === ready) this.rebuildReadyPromise = null;
    });
  }

  private ownsPeerConnectionRebuild(incident: RecoveryIncident, rebuildEpoch: number): boolean {
    return !this.disposed
      && this.rebuildInFlight
      && this.rebuildEpoch === rebuildEpoch
      && this.recoveryIncident === incident
      && this.isCurrentCall(incident.callId)
      && this.isGenerationCurrent(this.generation);
  }

  private finishPeerConnectionRebuild(rebuildEpoch: number): void {
    if (!this.rebuildInFlight || this.rebuildEpoch !== rebuildEpoch || this.disposed || !this.snapshot.callId || !this.isCurrentCall(this.snapshot.callId)) return;
    if (this.rebuildTimeoutTimer) clearTimeout(this.rebuildTimeoutTimer);
    this.rebuildTimeoutTimer = null;
    this.rebuildInFlight = false;
    this.cancelPendingScreenShareRecoveryAction();
    if (this.iceRestart) this.supersedeIceRestart(this.iceRestart.id);
    const callId = this.snapshot.callId;
    this.localIssue = "rebuild_exhausted";
    this.recordMediaDiagnostic("failure", { callId, failureKind: this.localIssue });
    this.setSnapshot({ ...this.snapshot, localIssue: this.localIssue });
    this.onRecoveryResult?.({ kind: "rebuild_exhausted", callId, generation: this.generation });
  }

  private recoverFromIceIncident(): void {
    const pendingScreenShareAction = this.pendingScreenShareRecoveryAction;
    this.pendingScreenShareRecoveryAction = null;
    if (this.iceRestart) this.supersedeIceRestart(this.iceRestart.id);
    if (this.rebuildTimeoutTimer) clearTimeout(this.rebuildTimeoutTimer);
    this.rebuildTimeoutTimer = null;
    this.rebuildInFlight = false;
    this.rebuildEpoch += 1;
    this.cancelRecoveryWork();
    this.recoveryState = this.peerConnectionState;
    this.localIssue = null;
    this.setSnapshot({ ...this.snapshot, localIssue: null });
    if (pendingScreenShareAction) {
      queueMicrotask(() => {
        const operation = pendingScreenShareAction.action === "start"
          ? this.startScreenShare()
          : this.stopScreenShareInternal(pendingScreenShareAction.fromBrowser);
        void operation.then(pendingScreenShareAction.resolve, () => pendingScreenShareAction.resolve(false));
      });
    }
  }

  private cancelRecoveryWork(): void {
    if (this.recoveryGraceTimer) clearTimeout(this.recoveryGraceTimer);
    if (this.recoveryRetryTimer) clearTimeout(this.recoveryRetryTimer);
    if (this.recoveryTimeoutTimer) clearTimeout(this.recoveryTimeoutTimer);
    this.recoveryGraceTimer = null;
    this.recoveryRetryTimer = null;
    this.recoveryTimeoutTimer = null;
    if (this.rebuildTimeoutTimer) clearTimeout(this.rebuildTimeoutTimer);
    this.rebuildTimeoutTimer = null;
    this.rebuildInFlight = false;
    this.rebuildEpoch += 1;
    this.rebuildReadyPromise = null;
    this.cancelPendingScreenShareRecoveryAction();
    this.recoveryIncident = null;
    this.recoveryState = null;
  }

  private queueScreenShareRecoveryAction(action: "start" | "stop", fromBrowser: boolean): Promise<boolean> {
    if (this.disposed || this.snapshot.projection?.state !== "active" || !this.isGenerationCurrent(this.generation)) return Promise.resolve(false);
    if (this.pendingScreenShareRecoveryAction) this.pendingScreenShareRecoveryAction.resolve(false);
    return new Promise((resolve) => {
      this.pendingScreenShareRecoveryAction = { action, fromBrowser, resolve };
    });
  }

  private cancelPendingScreenShareRecoveryAction(): void {
    const pending = this.pendingScreenShareRecoveryAction;
    this.pendingScreenShareRecoveryAction = null;
    pending?.resolve(false);
  }

  private recordPeerConnectionDiagnostics(): void {
    const diagnostics = this.peerConnectionDiagnostics;
    if (!diagnostics) return;
    this.recordMediaDiagnostic("peer_connection", {
      callId: this.snapshot.callId,
      peerConnection: diagnostics.connectionState,
      iceConnectionState: diagnostics.iceConnectionState,
      iceGatheringState: diagnostics.iceGatheringState,
      signalingState: diagnostics.signalingState,
      queuedLocalCandidateCount: this.queuedLocalCandidates.length,
      flushedLocalCandidateCount: this.flushedLocalCandidateCount,
    });
  }

  private isCurrentCall(callId: string, attempt = this.mediaAttemptEpoch): boolean {
    return !this.disposed && this.mediaAttemptActive && attempt === this.mediaAttemptEpoch && isUuid(callId) && this.snapshot.callId === callId && this.isGenerationCurrent(this.generation);
  }

  private retireForTransport(callId: string | null, attempt: number, peerConnectionState: RTCPeerConnectionState | null = null): void {
    if (!callId || !this.isCurrentCall(callId, attempt)) return;
    this.localIssue = "transport_recovery";
    this.invalidateMediaAttempt();
    this.remoteScreenShareStream = null;
    this.recordMediaDiagnostic("failure", { callId, failureKind: this.localIssue });
    this.setSnapshot({ ...this.snapshot, state: "failed", localIssue: this.localIssue, remoteAudioStream: null, localScreenShareStream: null, isLocalScreenShareActive: false, remoteScreenShareStream: null, peerConnectionState });
  }

  private invalidateMediaAttempt(): void {
    if (this.renegotiation) this.clearRenegotiation(this.renegotiation.id);
    if (this.iceRestart) this.clearIceRestart(this.iceRestart.id);
    this.mediaAttemptEpoch += 1;
    this.mediaAttemptActive = false;
    this.offer = null;
    this.offerSent = true;
    this.beginConnectingSent = true;
    this.mediaReadySent = false;
    this.mediaReadyInFlight = false;
    this.signalTransport.invalidate();
    this.queuedLocalCandidates.length = 0;
    this.queuedRemoteIceRestartCandidates.clear();
    this.localCandidateTransaction = null;
    this.sentLocalCandidateKeys.clear();
    this.localCandidateFlushInFlight = false;
    this.flushedLocalCandidateCount = 0;
    this.peerConnectionDiagnostics = null;
    this.clearLocalMediaState();
    this.adapter.dispose();
  }

  private recordMediaDiagnostic(
    event: DirectedCallDiagnosticEvent,
    details: Parameters<typeof recordDirectedCallDiagnostic>[1] = {},
    adapterGeneration = this.adapterEpoch,
    producerFamily: DirectedCallDiagnosticProducerFamily = "coordinator",
  ): void {
    recordDirectedCallDiagnostic(event, {
      ...details,
      producerFamily,
      callId: details.callId ?? this.snapshot.callId,
      role: details.role ?? this.snapshot.participantRole,
      generation: details.generation ?? this.generation,
      adapterGeneration,
      canonicalState: details.canonicalState ?? this.snapshot.projection?.state ?? null,
      mediaPhase: details.mediaPhase ?? this.snapshot.state,
    });
  }

  toggleMute(): boolean {
    if (this.disposed || !["accepted", "connecting", "active"].includes(this.snapshot.projection?.state ?? "")) return false;
    const muted = !this.adapter.isLocalAudioMuted;
    if (!this.adapter.setLocalAudioMuted(muted)) {
      this.syncLocalMediaState(this.snapshot.callId, this.mediaAttemptEpoch);
      return false;
    }
    this.setSnapshot({ ...this.snapshot, isMuted: muted, canToggleMute: true });
    return true;
  }

  async switchAudioInput(constraints: MediaStreamConstraints): Promise<boolean> {
    if (this.disposed || !this.mediaAttemptActive || !["accepted", "connecting", "active"].includes(this.snapshot.projection?.state ?? "")) {
      return false;
    }
    const switched = await this.adapter.switchAudioInput(constraints);
    if (this.disposed || !this.mediaAttemptActive) return false;
    if (!switched) {
      this.localIssue = "audio_input_switch_failed";
      this.setSnapshot({ ...this.snapshot, localIssue: this.localIssue });
      return false;
    }
    this.localIssue = null;
    this.syncLocalMediaState(this.snapshot.callId, this.mediaAttemptEpoch);
    this.setSnapshot({ ...this.snapshot, localIssue: null });
    return true;
  }

  private syncLocalMediaState(callId: string | null, attempt: number): void {
    if (!callId || !this.isCurrentCall(callId, attempt)) return;
    const stream = this.adapter.localMediaStream;
    if (stream !== this.localStream) {
      this.localStreamCleanup?.();
      this.localTrackCleanups.forEach((cleanup) => cleanup());
      this.localTrackCleanups.clear();
      this.localStream = stream;
      if (stream?.addEventListener) {
        const onStreamChange = () => this.syncLocalMediaState(callId, attempt);
        stream.addEventListener("addtrack", onStreamChange as EventListener);
        stream.addEventListener("removetrack", onStreamChange as EventListener);
        this.localStreamCleanup = () => {
          stream.removeEventListener?.("addtrack", onStreamChange as EventListener);
          stream.removeEventListener?.("removetrack", onStreamChange as EventListener);
        };
      } else {
        this.localStreamCleanup = null;
      }
    }

    const liveAudioTracks = stream?.getTracks().filter((track) =>
      (track.kind === undefined || track.kind === "audio") && track.readyState !== "ended",
    ) ?? [];
    if (this.adapter.isLocalAudioMuted && liveAudioTracks.length > 0) {
      this.adapter.setLocalAudioMuted(true);
    }
    this.localTrackCleanups.forEach((cleanup, track) => {
      if (!liveAudioTracks.includes(track)) {
        cleanup();
        this.localTrackCleanups.delete(track);
      }
    });
    liveAudioTracks.forEach((track) => {
      if (this.localTrackCleanups.has(track) || !track.addEventListener) return;
      const onEnded = () => this.syncLocalMediaState(callId, attempt);
      track.addEventListener("ended", onEnded as EventListener);
      this.localTrackCleanups.set(track, () => track.removeEventListener?.("ended", onEnded as EventListener));
    });

    const nextCanToggleMute = liveAudioTracks.length > 0;
    const nextIsMuted = nextCanToggleMute ? this.adapter.isLocalAudioMuted : false;
    if (this.snapshot.canToggleMute !== nextCanToggleMute || this.snapshot.isMuted !== nextIsMuted) {
      this.setSnapshot({ ...this.snapshot, canToggleMute: nextCanToggleMute, isMuted: nextIsMuted });
    }
  }

  private clearLocalMediaState(): void {
    this.localStreamCleanup?.();
    this.localStreamCleanup = null;
    this.localTrackCleanups.forEach((cleanup) => cleanup());
    this.localTrackCleanups.clear();
    this.localStream = null;
  }

  private setSnapshot(snapshot: DirectedCallMediaCoordinatorSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
