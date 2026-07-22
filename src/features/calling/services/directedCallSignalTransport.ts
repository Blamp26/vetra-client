import {
  isUuid,
  type IcePayload,
  type SignalEnvelope,
  type SignalKind,
  type SignalPayload,
} from "../protocol/directedCallProtocol";
import type { DirectedCallSession } from "./directedCallSession";

export interface DirectedCallSignalTransportOptions {
  callId?: string;
  generation: string;
  isGenerationCurrent?: (generation: string) => boolean;
}

export type DirectedCallSignalListener = (signal: SignalEnvelope) => void;

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
  private readonly unsubscribeSession: () => void;
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

  subscribe(listener: DirectedCallSignalListener): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
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

  invalidate(): void {
    if (this.disposed) return;
    this.attemptEpoch += 1;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.attemptEpoch += 1;
    this.unsubscribeSession();
    this.listeners.clear();
  }

  private assertUsable(): void {
    if (this.disposed || !this.isGenerationCurrent(this.generation)) {
      throw new Error("disposed directed-call signal transport");
    }
  }
}
