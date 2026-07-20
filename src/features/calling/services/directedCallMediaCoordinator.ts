import { CANONICAL_STATES, type ParticipantRole, type StateProjection } from "../protocol/directedCallProtocol";
import { DirectedCallSignalTransport } from "./directedCallSignalTransport";
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

type Listener = (snapshot: DirectedCallMediaCoordinatorSnapshot) => void;

const TERMINAL_STATES = new Set<string>([
  "unavailable", "undelivered", "busy", "declined", "cancelled", "no_answer", "connection_failed", "ended",
]);

const MEDIA_READY_STATES = new Set(["accepted", "connecting", "active"]);

/**
 * Media-free C1 orchestration boundary. It observes authoritative state and
 * owns the lifetime of the persistent signal transport, but performs no media
 * or signaling actions on its own.
 */
export class DirectedCallMediaCoordinator {
  private readonly session: DirectedCallSession;
  private readonly signalTransport: DirectedCallSignalTransport;
  private readonly listeners = new Set<Listener>();
  private readonly generation: string;
  private unsubscribeProjection: (() => void) | null = null;
  private snapshot: DirectedCallMediaCoordinatorSnapshot;
  private disposed = false;

  constructor(
    session: DirectedCallSession,
    signalTransport: DirectedCallSignalTransport,
    generation: string,
  ) {
    this.session = session;
    this.signalTransport = signalTransport;
    this.generation = generation;
    this.snapshot = { state: "idle", callId: null, participantRole: null, projection: null, generation };
  }

  start(): void {
    if (this.disposed || this.unsubscribeProjection) return;
    this.unsubscribeProjection = this.session.subscribeToProjections((projection) => this.applyProjection(projection));
    this.session.getProjections()
      .filter((projection) => !TERMINAL_STATES.has(projection.state))
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
    this.unsubscribeProjection = null;
    this.signalTransport.dispose();
    this.setSnapshot({ state: "disposed", callId: null, participantRole: null, projection: null, generation: this.generation });
    this.listeners.clear();
  }

  private applyProjection(projection: StateProjection): void {
    if (this.disposed || !CANONICAL_STATES.includes(projection.state)) return;
    if (this.snapshot.callId === null) {
      if (TERMINAL_STATES.has(projection.state)) return;
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
  }

  private setSnapshot(snapshot: DirectedCallMediaCoordinatorSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
