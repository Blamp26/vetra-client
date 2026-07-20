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
  type DirectedCallWebRtcAdapterOptions,
} from "./directedCallWebRtcAdapter";
import type { DirectedCallSession } from "./directedCallSession";

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
  private beginConnectingSent = false;
  private offerSent = false;
  private mediaReadySent = false;
  private disposed = false;

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
      onIceCandidate: (candidate) => this.sendIceCandidate(candidate),
    });
    this.snapshot = { state: "idle", callId: null, participantRole: null, projection: null, generation };
  }

  start(): void {
    if (this.disposed || this.unsubscribeProjection) return;
    this.unsubscribeProjection = this.session.subscribeToProjections((projection) => this.applyProjection(projection));
    this.unsubscribeSignal = this.signalTransport.subscribe((signal) => this.handleSignal(signal));
    this.session.getProjections()
      .filter(isUsableProjection)
      .sort((left, right) => left.created_at.localeCompare(right.created_at) || left.call_id.localeCompare(right.call_id))
      .slice(0, 1)
      .forEach((projection) => this.applyProjection(projection));
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
    this.disposed = true;
    this.setSnapshot({ ...this.snapshot, state: "disposing" });
    this.unsubscribeProjection?.();
    this.unsubscribeSignal?.();
    this.unsubscribeProjection = null;
    this.unsubscribeSignal = null;
    this.adapter.dispose();
    this.signalTransport.dispose();
    this.offer = null;
    this.setSnapshot({ state: "disposed", callId: null, participantRole: null, projection: null, generation: this.generation });
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

    const state: DirectedCallMediaCoordinatorState = projection.state === "accepted"
      ? "accepted"
      : MEDIA_READY_STATES.has(projection.state)
        ? "signaling_ready"
        : "waiting_for_connecting";
    this.setSnapshot({ state, callId: projection.call_id, participantRole: projection.participant_role, projection, generation: this.generation });

    if (projection.state === "accepted") void this.startMedia(projection);
    if (projection.state === "connecting") void this.continueConnecting(projection);
  }

  private async startMedia(projection: StateProjection): Promise<void> {
    if (this.mediaStartInFlight || this.disposed || !this.isGenerationCurrent(this.generation) || projection.call_id !== this.snapshot.callId) return;
    this.mediaStartInFlight = true;
    try {
      if (projection.participant_role === "initiator") {
        try {
          this.offer = await this.adapter.prepareOffer();
        } catch (error) {
          await this.reportSetupFailure(projection.call_id, error);
          return;
        }
        if (!this.isCurrentCall(projection.call_id)) return;
        const currentProjection = this.session.getProjection(projection.call_id) ?? this.snapshot.projection;
        if (currentProjection?.state === "connecting") {
          await this.continueConnecting(currentProjection);
        } else if (!this.beginConnectingSent) {
          this.beginConnectingSent = true;
          try {
            await this.lifecycle.beginConnecting(projection.call_id);
          } catch {
            // The lifecycle controller retains transport-failed commands for
            // its existing bounded retry path; this is not local setup failure.
          }
        }
      } else {
        try {
          await this.adapter.prepareAnswer();
        } catch (error) {
          await this.reportSetupFailure(projection.call_id, error);
        }
      }
    } catch (error) {
      if (error instanceof DirectedCallWebRtcError) await this.reportSetupFailure(projection.call_id, error);
    } finally {
      this.mediaStartInFlight = false;
    }
  }

  private async continueConnecting(projection: StateProjection): Promise<void> {
    if (!this.isCurrentCall(projection.call_id)) return;
    if (projection.participant_role === "initiator" && this.offer && !this.offerSent) {
      if (!this.offer.sdp) {
        await this.reportSetupFailure(projection.call_id, new DirectedCallWebRtcError("sdp_failed"));
        return;
      }
      try {
        await this.signalTransport.send(createDirectedCallUuid(), "offer", { sdp: this.offer.sdp });
        this.offerSent = true;
        await this.sendMediaReady(projection.call_id);
      } catch {
        // A transient relay failure is not a confirmed local setup failure.
      }
    }
  }

  private async handleSignal(signal: SignalEnvelope): Promise<void> {
    const projection = this.snapshot.projection;
    if (!projection || !this.isCurrentCall(signal.call_id) || !["connecting", "active"].includes(projection.state)) return;
    try {
      if (projection.participant_role === "initiator" && signal.kind === "answer" && isSdpPayload(signal)) {
        if (await this.adapter.acceptAnswer({ type: "answer", sdp: signal.payload.sdp })) {
          await this.sendMediaReady(projection.call_id);
        }
      } else if (projection.participant_role === "recipient" && signal.kind === "offer" && isSdpPayload(signal)) {
        const answer = await this.adapter.acceptOffer({ type: "offer", sdp: signal.payload.sdp });
        if (answer?.sdp) {
          await this.signalTransport.send(createDirectedCallUuid(), "answer", { sdp: answer.sdp });
          await this.sendMediaReady(projection.call_id);
        }
      } else if (isIcePayload(signal)) {
        await this.adapter.addRemoteIceCandidate(toRtcIceCandidate(signal.payload));
      }
    } catch (error) {
      if (error instanceof DirectedCallWebRtcError) await this.reportSetupFailure(projection.call_id, error);
    }
  }

  private async sendIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    const projection = this.snapshot.projection;
    if (!projection || !this.isCurrentCall(projection.call_id) || !["connecting", "active"].includes(projection.state)) return;
    try {
      await this.signalTransport.send(createDirectedCallUuid(), "ice_candidate", toWireIceCandidate(candidate));
    } catch {
      // Socket/relay failure is recoverable transport loss, not local setup failure.
    }
  }

  private async sendMediaReady(callId: string): Promise<void> {
    if (this.mediaReadySent || !this.isCurrentCall(callId) || this.snapshot.projection?.state !== "connecting") return;
    this.mediaReadySent = true;
    await this.lifecycle.mediaReady(callId);
  }

  private async reportSetupFailure(callId: string, error: unknown): Promise<void> {
    if (!this.isCurrentCall(callId) || !["accepted", "connecting"].includes(this.snapshot.projection?.state ?? "")) return;
    const failureCode = error instanceof DirectedCallWebRtcError ? error.failureCode : "peer_connection_failed";
    this.setSnapshot({ ...this.snapshot, state: "failed" });
    try {
      await this.lifecycle.setupFailed(callId, failureCode);
    } catch {
      // The canonical projection and command result remain authoritative.
    }
  }

  private isCurrentCall(callId: string): boolean {
    return !this.disposed && isUuid(callId) && this.snapshot.callId === callId && this.isGenerationCurrent(this.generation);
  }

  private setSnapshot(snapshot: DirectedCallMediaCoordinatorSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
