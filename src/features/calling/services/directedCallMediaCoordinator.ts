import {
  CANONICAL_STATES,
  isUuid,
  type IcePayload,
  type ParticipantRole,
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
import { recordDirectedCallDiagnostic } from "./directedCallDiagnostics";

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
  localIssue: "transport_recovery" | DirectedCallWebRtcError["failureCode"] | null;
  peerConnectionState: RTCPeerConnectionState | null;
  isMuted: boolean;
  canToggleMute: boolean;
}

export interface DirectedCallMediaLifecyclePort {
  beginConnecting(callId: string): Promise<unknown>;
  mediaReady(callId: string): Promise<unknown>;
  setupFailed(callId: string, failureCode: DirectedCallWebRtcError["failureCode"]): Promise<unknown>;
}

export interface DirectedCallMediaCoordinatorOptions {
  adapterFactory?: (options: DirectedCallWebRtcAdapterOptions) => DirectedCallWebRtcAdapter;
  isGenerationCurrent?: (generation: string) => boolean;
}

type Listener = (snapshot: DirectedCallMediaCoordinatorSnapshot) => void;

const TERMINAL_STATES = new Set<string>([
  "unavailable", "undelivered", "busy", "declined", "cancelled", "no_answer", "connection_failed", "ended",
]);
const MEDIA_READY_STATES = new Set(["accepted", "connecting", "active"]);

function isUsableProjection(projection: StateProjection): boolean {
  return CANONICAL_STATES.includes(projection.state) && !TERMINAL_STATES.has(projection.state);
}

function isSdpPayload(signal: SignalEnvelope): signal is SignalEnvelope & { payload: { sdp: string } } {
  return (signal.kind === "offer" || signal.kind === "answer") && typeof signal.payload === "object" && signal.payload !== null && "sdp" in signal.payload && typeof signal.payload.sdp === "string";
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

function toWireIceCandidate(candidate: RTCIceCandidateInit): IcePayload {
  return {
    candidate: candidate.candidate ?? "",
    sdp_mid: candidate.sdpMid ?? null,
    sdp_mline_index: candidate.sdpMLineIndex ?? null,
    username_fragment: candidate.usernameFragment ?? null,
  };
}

function candidateKey(candidate: RTCIceCandidateInit): string {
  return JSON.stringify([
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
  private readonly adapter: DirectedCallWebRtcAdapter;
  private unsubscribeProjection: (() => void) | null = null;
  private unsubscribeSignal: (() => void) | null = null;
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
  private peerConnectionState: RTCPeerConnectionState | null = null;
  private mediaAttemptEpoch = 0;
  private mediaAttemptActive = false;
  private setupFailureSent = false;
  private beginConnectingInFlight = false;
  private mediaReadyInFlight = false;
  private localStream: DirectedCallMediaStream | null = null;
  private readonly localTrackCleanups = new Map<DirectedCallMediaStreamTrack, () => void>();
  private localStreamCleanup: (() => void) | null = null;
  private readonly queuedLocalCandidates: Array<{ candidate: RTCIceCandidateInit; callId: string; attempt: number }> = [];
  private readonly sentLocalCandidateKeys = new Set<string>();
  private localCandidateFlushInFlight = false;
  private flushedLocalCandidateCount = 0;
  private peerConnectionDiagnostics: DirectedCallPeerConnectionDiagnostics | null = null;

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
    this.adapter = (options.adapterFactory ?? ((adapterOptions) => new DirectedCallWebRtcAdapter(adapterOptions)))({
      onIceCandidate: (candidate) => this.queueLocalIceCandidate(candidate),
      onRemoteStream: (stream) => {
        if (this.disposed) return;
        this.remoteAudioStream = stream;
        this.setSnapshot({ ...this.snapshot, remoteAudioStream: stream });
      },
      onPeerConnectionState: (state) => this.handlePeerConnectionState(state),
      onPeerConnectionDiagnostics: (diagnostics) => this.handlePeerConnectionDiagnostics(diagnostics),
    });
    this.snapshot = { state: "idle", callId: null, participantRole: null, projection: null, generation, remoteAudioStream: null, localIssue: null, peerConnectionState: null, isMuted: false, canToggleMute: false };
  }

  start(): void {
    if (this.disposed || this.unsubscribeProjection) return;
    this.unsubscribeProjection = this.session.subscribeToProjections((projection) => this.applyProjection(projection));
    this.unsubscribeSignal = this.signalTransport.subscribe((signal) => this.handleSignal(signal));
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
    recordDirectedCallDiagnostic("media_phase", { mediaPhase: "idle" });
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

  dispose(): void {
    if (this.disposed) return;
    this.invalidateMediaAttempt();
    this.disposed = true;
    this.setSnapshot({ ...this.snapshot, state: "disposing" });
    this.unsubscribeProjection?.();
    this.unsubscribeSignal?.();
    this.unsubscribeProjection = null;
    this.unsubscribeSignal = null;
    this.clearLocalMediaState();
    recordDirectedCallDiagnostic("cleanup", { callId: this.snapshot.callId, reason: "coordinator_disposed" });
    this.signalTransport.dispose();
    this.offer = null;
    this.remoteAudioStream = null;
    this.localIssue = null;
    this.setSnapshot({ state: "disposed", callId: null, participantRole: null, projection: null, generation: this.generation, remoteAudioStream: null, localIssue: null, peerConnectionState: null, isMuted: false, canToggleMute: false });
    this.listeners.clear();
  }

  private applyProjection(projection: StateProjection): void {
    if (this.disposed || !CANONICAL_STATES.includes(projection.state)) return;
    if (this.snapshot.callId === null) {
      if (!isUsableProjection(projection)) return;
      this.signalTransport.bindCall(projection.call_id);
    } else if (this.snapshot.callId !== projection.call_id) {
      return;
    }

    if (TERMINAL_STATES.has(projection.state)) {
      this.setSnapshot({ ...this.snapshot, projection, state: "disposing" });
      this.dispose();
      return;
    }

    if (this.mediaStarted && !this.mediaAttemptActive) {
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
    recordDirectedCallDiagnostic("call_projection", { callId: projection.call_id, canonicalState: projection.state });
    this.setSnapshot({ state, callId: projection.call_id, participantRole: projection.participant_role, projection, generation: this.generation, remoteAudioStream: this.remoteAudioStream, localIssue: this.localIssue, peerConnectionState: this.peerConnectionState, isMuted: this.snapshot.isMuted, canToggleMute: this.snapshot.canToggleMute });

    if (projection.state === "accepted") void this.startMedia(projection);
    if (projection.state === "connecting") {
      void this.continueConnecting(projection);
      void this.flushLocalCandidates(projection.call_id, this.mediaAttemptEpoch);
    }
    if (projection.state === "active") void this.flushLocalCandidates(projection.call_id, this.mediaAttemptEpoch);
  }

  private async startMedia(projection: StateProjection): Promise<void> {
    if (this.mediaStartInFlight || this.disposed || !this.isGenerationCurrent(this.generation) || projection.call_id !== this.snapshot.callId) return;
    if (!this.mediaAttemptActive) {
      this.mediaAttemptEpoch += 1;
      this.mediaAttemptActive = true;
      this.setupFailureSent = false;
    }
    const attempt = this.mediaAttemptEpoch;
    this.mediaStartInFlight = true;
    this.mediaStarted = true;
    recordDirectedCallDiagnostic("peer_connection", { callId: projection.call_id, peerConnection: "starting" });
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
        await this.sendMediaReady(projection.call_id, attempt);
      } catch {
        // A transient relay failure is not a confirmed local setup failure.
        this.retireForTransport(projection.call_id, attempt);
      }
    }
  }

  private async handleSignal(signal: SignalEnvelope): Promise<void> {
    const projection = this.snapshot.projection;
    const attempt = this.mediaAttemptEpoch;
    if (!projection || !this.isCurrentCall(signal.call_id, attempt) || !["connecting", "active"].includes(projection.state)) return;
    try {
      if (projection.participant_role === "initiator" && signal.kind === "answer" && isSdpPayload(signal)) {
        if (await this.adapter.acceptAnswer({ type: "answer", sdp: signal.payload.sdp })) {
          if (!this.isCurrentCall(projection.call_id, attempt)) return;
          await this.sendMediaReady(projection.call_id, attempt);
        }
      } else if (projection.participant_role === "recipient" && signal.kind === "offer" && isSdpPayload(signal)) {
        const answer = await this.adapter.acceptOffer({ type: "offer", sdp: signal.payload.sdp });
        if (answer?.sdp && this.isCurrentCall(projection.call_id, attempt)) {
          await this.signalTransport.send(createDirectedCallUuid(), "answer", { sdp: answer.sdp });
          if (!this.isCurrentCall(projection.call_id, attempt)) return;
          await this.sendMediaReady(projection.call_id, attempt);
        }
      } else if (isIcePayload(signal)) {
        await this.adapter.addRemoteIceCandidate(toRtcIceCandidate(signal.payload));
      }
    } catch (error) {
      if (error instanceof DirectedCallWebRtcStaleError) return;
      if (error instanceof DirectedCallWebRtcError) await this.reportSetupFailure(projection.call_id, error, attempt);
      else this.retireForTransport(projection.call_id, attempt);
    }
  }

  private queueLocalIceCandidate(candidate: RTCIceCandidateInit): void {
    const callId = this.snapshot.callId;
    const attempt = this.mediaAttemptEpoch;
    if (!callId || !this.isCurrentCall(callId, attempt)) return;
    const key = candidateKey(candidate);
    if (this.sentLocalCandidateKeys.has(key) || this.queuedLocalCandidates.some((entry) => candidateKey(entry.candidate) === key)) return;
    this.queuedLocalCandidates.push({ candidate, callId, attempt });
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
        this.queuedLocalCandidates.shift();
        const key = candidateKey(entry.candidate);
        if (this.sentLocalCandidateKeys.has(key)) continue;
        this.sentLocalCandidateKeys.add(key);
        try {
          await this.signalTransport.send(createDirectedCallUuid(), "ice_candidate", toWireIceCandidate(entry.candidate));
          if (!this.isCurrentCall(callId, attempt)) return;
          this.flushedLocalCandidateCount += 1;
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

  private async sendMediaReady(callId: string, attempt = this.mediaAttemptEpoch): Promise<void> {
    if (this.mediaReadySent || this.mediaReadyInFlight || !this.isCurrentCall(callId, attempt) || this.snapshot.projection?.state !== "connecting") return;
    this.mediaReadyInFlight = true;
    try {
      await this.lifecycle.mediaReady(callId);
      if (!this.isCurrentCall(callId, attempt)) return;
      this.mediaReadySent = true;
    } finally {
      if (this.mediaAttemptEpoch === attempt) this.mediaReadyInFlight = false;
    }
  }

  private handleSync(): void {
    if (this.disposed || !this.snapshot.callId) return;
    const projection = this.session.getProjection(this.snapshot.callId);
    if (!projection) return;
    if (TERMINAL_STATES.has(projection.state)) {
      this.applyProjection(projection);
      return;
    }
    if (["accepted", "connecting"].includes(projection.state) && this.mediaStarted && this.snapshot.state !== "idle") {
      this.retireForTransport(projection.call_id, this.mediaAttemptEpoch);
    }
  }

  private async reportSetupFailure(callId: string, error: unknown, attempt = this.mediaAttemptEpoch): Promise<void> {
    if (this.setupFailureSent || !this.isCurrentCall(callId, attempt) || !["accepted", "connecting"].includes(this.snapshot.projection?.state ?? "")) return;
    this.setupFailureSent = true;
    const failureCode = error instanceof DirectedCallWebRtcError ? error.failureCode : "peer_connection_failed";
    this.localIssue = failureCode;
    recordDirectedCallDiagnostic("failure", { callId, failureKind: failureCode });
    this.setSnapshot({ ...this.snapshot, state: "failed", localIssue: this.localIssue });
    this.invalidateMediaAttempt();
    try {
      await this.lifecycle.setupFailed(callId, failureCode);
    } catch {
      // The canonical projection and command result remain authoritative.
    }
  }

  private handlePeerConnectionState(state: RTCPeerConnectionState): void {
    if (this.disposed) return;
    this.peerConnectionState = state;
    recordDirectedCallDiagnostic("peer_connection", { callId: this.snapshot.callId, peerConnection: state });
    if (["failed", "closed", "disconnected"].includes(state) && this.snapshot.projection?.state === "active") {
      this.retireForTransport(this.snapshot.callId, this.mediaAttemptEpoch, state);
      return;
    }
    this.setSnapshot({ ...this.snapshot, peerConnectionState: state });
  }

  private handlePeerConnectionDiagnostics(diagnostics: DirectedCallPeerConnectionDiagnostics): void {
    if (this.disposed) return;
    this.peerConnectionDiagnostics = diagnostics;
    this.recordPeerConnectionDiagnostics();
  }

  private recordPeerConnectionDiagnostics(): void {
    const diagnostics = this.peerConnectionDiagnostics;
    if (!diagnostics) return;
    recordDirectedCallDiagnostic("peer_connection", {
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
    recordDirectedCallDiagnostic("failure", { callId, failureKind: this.localIssue });
    this.setSnapshot({ ...this.snapshot, state: "failed", localIssue: this.localIssue, remoteAudioStream: null, peerConnectionState });
  }

  private invalidateMediaAttempt(): void {
    this.mediaAttemptEpoch += 1;
    this.mediaAttemptActive = false;
    this.offer = null;
    this.offerSent = true;
    this.beginConnectingSent = true;
    this.mediaReadySent = true;
    this.signalTransport.invalidate();
    this.queuedLocalCandidates.length = 0;
    this.sentLocalCandidateKeys.clear();
    this.localCandidateFlushInFlight = false;
    this.flushedLocalCandidateCount = 0;
    this.peerConnectionDiagnostics = null;
    this.clearLocalMediaState();
    this.adapter.dispose();
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
