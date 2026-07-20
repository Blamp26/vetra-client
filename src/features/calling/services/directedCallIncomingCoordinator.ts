import { decodeState, type CanonicalState, type StateProjection } from "../protocol/directedCallProtocol";
import {
  type DirectedCallSessionPort,
  type LifecycleCommandOutcome,
} from "./directedCallLifecycleController";

const INCOMING_STATES = new Set<CanonicalState>(["dispatching", "delivered", "presented"]);
export type IncomingCommandAction = "call:received" | "call:presented";
export type IncomingCoordinatorErrorKind = "transport_timeout" | "transport_error";

export interface IncomingCoordinatorError {
  action: IncomingCommandAction;
  kind: IncomingCoordinatorErrorKind;
}

export interface IncomingPresentationSnapshot {
  disposed: boolean;
  visible: boolean;
  callId: string | null;
  projection: StateProjection | null;
  recoverableError: IncomingCoordinatorError | null;
}

export interface DirectedCallIncomingControllerPort {
  received(callId: string): Promise<LifecycleCommandOutcome>;
  presented(callId: string): Promise<LifecycleCommandOutcome>;
}

type IncomingListener = (snapshot: IncomingPresentationSnapshot) => void;

function isIncomingProjection(projection: StateProjection): boolean {
  return projection.participant_role === "recipient" && INCOMING_STATES.has(projection.state);
}

function transportFailureKind(outcome: LifecycleCommandOutcome): IncomingCoordinatorErrorKind | null {
  if (outcome.status !== "failed") return null;
  return outcome.error.kind === "transport_timeout" || outcome.error.kind === "transport_error"
    ? outcome.error.kind
    : null;
}

/**
 * Coordinates the dormant recipient presentation handshake. It intentionally
 * has no UI, media, or terminal-command authority of its own.
 */
export class DirectedCallIncomingCoordinator {
  private readonly session: DirectedCallSessionPort;
  private readonly controller: DirectedCallIncomingControllerPort;
  private readonly enabled: boolean;
  private readonly listeners = new Set<IncomingListener>();
  private readonly receivedActions = new Set<string>();
  private readonly presentedActions = new Set<string>();
  private readonly unsubscribeProjection: () => void;
  private incomingProjection: StateProjection | null = null;
  private recoverableError: IncomingCoordinatorError | null = null;
  private disposed = false;

  constructor(
    session: DirectedCallSessionPort,
    controller: DirectedCallIncomingControllerPort,
    options: { enabled?: boolean } = {},
  ) {
    this.session = session;
    this.controller = controller;
    this.enabled = options.enabled ?? false;
    this.unsubscribeProjection = this.enabled
      ? session.subscribeToProjections((projection, classification) => {
          if (classification === "accepted") this.acceptProjection(projection);
        })
      : () => undefined;
  }

  getSnapshot(): IncomingPresentationSnapshot {
    return {
      disposed: this.disposed,
      visible: this.incomingProjection !== null,
      callId: this.incomingProjection?.call_id ?? null,
      projection: this.incomingProjection,
      recoverableError: this.recoverableError,
    };
  }

  subscribe(listener: IncomingListener): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Call from the modal's post-commit effect for the exact displayed call. */
  onModalPresented(callId: string): void {
    if (this.disposed || !this.enabled || this.incomingProjection?.call_id !== callId) return;

    const projection = this.session.getProjection(callId);
    if (!projection || projection.participant_role !== "recipient") return;
    if (projection.state === "presented") {
      this.presentedActions.add(callId);
      return;
    }
    if (projection.state !== "delivered" || this.presentedActions.has(callId)) return;

    this.presentedActions.add(callId);
    void this.runCommand("call:presented", callId);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeProjection();
    this.incomingProjection = null;
    this.recoverableError = null;
    this.receivedActions.clear();
    this.presentedActions.clear();
    this.listeners.clear();
  }

  private acceptProjection(projection: StateProjection): void {
    if (this.disposed || !this.enabled) return;
    const validatedProjection = decodeState(projection);
    if (!validatedProjection) return;
    projection = validatedProjection;

    if (!isIncomingProjection(projection)) {
      if (this.incomingProjection?.call_id === projection.call_id) this.clearIncoming();
      return;
    }

    this.recoverableError = null;
    if (projection.state === "dispatching") {
      if (this.incomingProjection?.call_id === projection.call_id) this.incomingProjection = null;
      this.emit();
      if (!this.receivedActions.has(projection.call_id)) {
        this.receivedActions.add(projection.call_id);
        void this.runCommand("call:received", projection.call_id);
      }
      return;
    }

    this.incomingProjection = projection;
    if (projection.state === "presented") this.presentedActions.add(projection.call_id);
    this.emit();
  }

  private clearIncoming(): void {
    this.incomingProjection = null;
    this.recoverableError = null;
    this.emit();
  }

  private async runCommand(action: IncomingCommandAction, callId: string): Promise<void> {
    if (this.disposed) return;

    let outcome: LifecycleCommandOutcome;
    try {
      outcome = action === "call:received"
        ? await this.controller.received(callId)
        : await this.controller.presented(callId);
    } catch {
      if (!this.disposed) {
        this.recoverableError = { action, kind: "transport_error" };
        this.emit();
      }
      return;
    }

    if (this.disposed || (action === "call:presented" && this.incomingProjection?.call_id !== callId)) return;
    const transportKind = transportFailureKind(outcome);
    if (transportKind) {
      this.recoverableError = { action, kind: transportKind };
      this.emit();
    }
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
