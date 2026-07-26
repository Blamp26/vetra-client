import {
  isUuid,
  type IcePayload,
  type SignalEnvelope,
  type SignalKind,
  type SignalPayload,
  type IceRestartRequestRelay,
  type IceRestartSdpRelay,
} from "../protocol/directedCallProtocol";
import type { DirectedCallSession } from "./directedCallSession";

export interface DirectedCallSignalTransportOptions {
  callId?: string;
  generation: string;
  isGenerationCurrent?: (generation: string) => boolean;
}

export type DirectedCallSignalListener = (signal: SignalEnvelope) => void;
export type DirectedCallIceRestartListener = (event: IceRestartRequestRelay | IceRestartSdpRelay) => void;

/**
 * Persistent, transient signal boundary. It intentionally has no WebRTC or
 * media knowledge and never exposes signal contents through errors.
 */
export class DirectedCallSignalTransport {
  private boundCallId: string | null;
  readonly generation: string;

  private readonly session: DirectedCallSession;
  private readonly isGenerationCurrent: (generation: string) => boolean;
  private readonly listeners = new Set<DirectedCallSignalListener>();
  private readonly iceRestartListeners = new Set<DirectedCallIceRestartListener>();
  private readonly unsubscribeSession: () => void;
  private readonly unsubscribeIceRestartSession: () => void;
  private disposed = false;
  private attemptEpoch = 0;

  constructor(session: DirectedCallSession, options: DirectedCallSignalTransportOptions) {
    if ((options.callId !== undefined && !isUuid(options.callId)) || options.generation.length === 0) {
      throw new Error("invalid directed-call signal transport");
    }
    this.session = session;
    this.boundCallId = options.callId?.toLowerCase() ?? null;
    this.generation = options.generation;
    this.isGenerationCurrent = options.isGenerationCurrent ?? ((generation) => generation === this.generation);
    this.unsubscribeSession = session.subscribeToSignals((signal) => {
      if (this.disposed || !this.isGenerationCurrent(this.generation) || this.boundCallId === null || signal.call_id !== this.boundCallId) return;
      this.listeners.forEach((listener) => listener(signal));
    });
    const subscribeToIceRestartSignals = (session as DirectedCallSession & {
      subscribeToIceRestartSignals?: (listener: DirectedCallIceRestartListener) => () => void;
    }).subscribeToIceRestartSignals;
    this.unsubscribeIceRestartSession = subscribeToIceRestartSignals
      ? subscribeToIceRestartSignals.call(session, (event) => {
          if (this.disposed || !this.isGenerationCurrent(this.generation) || this.boundCallId === null || event.call_id !== this.boundCallId) return;
          this.iceRestartListeners.forEach((listener) => listener(event));
        })
      : () => undefined;
  }

  get callId(): string | null {
    return this.boundCallId;
  }

  bindCall(callId: string): void {
    if (!isUuid(callId) || (this.boundCallId !== null && this.boundCallId !== callId.toLowerCase())) {
      throw new Error("invalid directed-call signal transport call");
    }
    this.boundCallId = callId.toLowerCase();
  }

  unbindCall(): void {
    if (this.disposed) return;
    this.attemptEpoch += 1;
    this.boundCallId = null;
  }

  subscribe(listener: DirectedCallSignalListener): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeToIceRestart(listener: DirectedCallIceRestartListener): () => void {
    if (this.disposed) return () => undefined;
    this.iceRestartListeners.add(listener);
    return () => this.iceRestartListeners.delete(listener);
  }

  async send(
    signalId: string,
    kind: SignalKind,
    payload: SignalPayload | IcePayload,
  ): Promise<unknown> {
    this.assertUsable();
    if (!isUuid(signalId)) throw new Error("invalid directed-call signal");
    if (this.boundCallId === null) throw new Error("unbound directed-call signal transport");
    const generation = this.generation;
    const attempt = this.attemptEpoch;
    const result = await this.session.sendSignal(this.boundCallId, signalId, kind, payload);
    if (this.disposed || !this.isGenerationCurrent(generation) || attempt !== this.attemptEpoch) throw new Error("stale directed-call signal");
    return result;
  }

  async sendIceRestartRequest(signalId: string): Promise<unknown> {
    return this.sendRestart(signalId, (callId) => this.session.sendIceRestartRequest({ call_id: callId, signal_id: signalId }));
  }

  async sendIceRestartOffer(signalId: string, iceRestartId: string, sdp: string): Promise<unknown> {
    return this.sendRestart(signalId, (callId) => this.session.sendIceRestartOffer({ call_id: callId, signal_id: signalId, ice_restart_id: iceRestartId, sdp }));
  }

  async sendIceRestartAnswer(signalId: string, iceRestartId: string, sdp: string): Promise<unknown> {
    return this.sendRestart(signalId, (callId) => this.session.sendIceRestartAnswer({ call_id: callId, signal_id: signalId, ice_restart_id: iceRestartId, sdp }));
  }

  invalidate(): void {
    if (this.disposed) return;
    this.attemptEpoch += 1;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.attemptEpoch += 1;
    this.unsubscribeSession();
    this.unsubscribeIceRestartSession();
    this.listeners.clear();
    this.iceRestartListeners.clear();
  }

  private assertUsable(): void {
    if (this.disposed || !this.isGenerationCurrent(this.generation)) {
      throw new Error("disposed directed-call signal transport");
    }
  }

  private async sendRestart(signalId: string, send: (callId: string) => Promise<unknown>): Promise<unknown> {
    this.assertUsable();
    if (!isUuid(signalId)) throw new Error("invalid directed-call signal");
    if (this.boundCallId === null) throw new Error("unbound directed-call signal transport");
    const generation = this.generation;
    const attempt = this.attemptEpoch;
    const result = await send(this.boundCallId);
    if (this.disposed || !this.isGenerationCurrent(generation) || attempt !== this.attemptEpoch) throw new Error("stale directed-call signal");
    return result;
  }
}
