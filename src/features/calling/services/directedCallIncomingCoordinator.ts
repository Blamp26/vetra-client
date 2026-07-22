import { decodeState, type CanonicalState, type StateProjection } from "../protocol/directedCallProtocol";
import {
  type DirectedCallControllerSnapshot,
  type DirectedCallSessionPort,
  type LifecycleCommandOutcome,
} from "./directedCallLifecycleController";

const INCOMING_STATES = new Set<CanonicalState>(["dispatching", "delivered", "presented"]);
export type IncomingCommandAction = "call:received" | "call:presented";
export type IncomingCoordinatorErrorKind =
  | "transport_timeout"
  | "transport_error"
  | "retry_exhausted"
  | "rejected"
  | "protocol_validation";

export interface IncomingCoordinatorError {
  action: IncomingCommandAction;
  callId: string;
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
  retryPendingCommand(): Promise<LifecycleCommandOutcome>;
  getSnapshot(): DirectedCallControllerSnapshot;
}

type IncomingListener = (snapshot: IncomingPresentationSnapshot) => void;

function isIncomingProjection(projection: StateProjection): boolean {
  return projection.participant_role === "recipient" && INCOMING_STATES.has(projection.state);
}

function transportFailureKind(outcome: LifecycleCommandOutcome): "transport_timeout" | "transport_error" | null {
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
  private readonly unsubscribeSync: () => void;
  private readonly retryEligibility = new Map<string, IncomingCommandAction>();
  private readonly retriesInFlight = new Set<string>();
  private incomingProjection: StateProjection | null = null;
  private incomingCallId: string | null = null;
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
    this.unsubscribeSync = this.enabled && session.subscribeToSync
      ? session.subscribeToSync(() => this.retryAfterSync())
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
    this.unsubscribeSync();
    this.incomingProjection = null;
    this.incomingCallId = null;
    this.recoverableError = null;
    this.receivedActions.clear();
    this.presentedActions.clear();
    this.retryEligibility.clear();
    this.retriesInFlight.clear();
    this.listeners.clear();
  }

  private acceptProjection(projection: StateProjection): void {
    if (this.disposed || !this.enabled) return;
    const validatedProjection = decodeState(projection);
    if (!validatedProjection) return;
    projection = validatedProjection;

    if (this.incomingCallId && this.incomingCallId !== projection.call_id) {
      this.retryEligibility.clear();
      this.retriesInFlight.clear();
      this.recoverableError = null;
    }

    if (projection.participant_role === "recipient" && INCOMING_STATES.has(projection.state)) {
      this.incomingCallId = projection.call_id;
    }

    if (!isIncomingProjection(projection)) {
      this.clearObsoleteActions(projection);
      if (this.incomingCallId === projection.call_id) this.clearIncoming();
      return;
    }

    this.clearObsoleteActions(projection);
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
    this.incomingCallId = null;
    this.recoverableError = null;
    this.emit();
  }

  private actionKey(action: IncomingCommandAction, callId: string): string {
    return `${action}:${callId}`;
  }

  private actionRequired(action: IncomingCommandAction, projection: StateProjection | null): boolean {
    if (!projection || projection.participant_role !== "recipient") return false;
    return action === "call:received"
      ? projection.state === "dispatching"
      : projection.state === "delivered";
  }

  private clearAction(action: IncomingCommandAction, callId: string): void {
    this.retryEligibility.delete(this.actionKey(action, callId));
    if (this.recoverableError?.action === action && this.recoverableError.callId === callId) {
      this.recoverableError = null;
    }
  }

  private clearObsoleteActions(projection: StateProjection): void {
    (['call:received', 'call:presented'] as const).forEach((action) => {
      if (!this.actionRequired(action, projection)) this.clearAction(action, projection.call_id);
    });
    if (this.recoverableError && this.recoverableError.callId !== projection.call_id) {
      this.recoverableError = null;
    }
  }

  private pendingMatches(action: IncomingCommandAction, callId: string): boolean {
    const pending = this.controller.getSnapshot().pendingCommand;
    return pending?.event === action && pending.callId === callId;
  }

  private recordTransportFailure(
    action: IncomingCommandAction,
    callId: string,
    kind: "transport_timeout" | "transport_error",
  ): void {
    if (!this.pendingMatches(action, callId)) return;
    const pending = this.controller.getSnapshot().pendingCommand;
    if (pending && pending.attempts >= 3) {
      this.retryEligibility.delete(this.actionKey(action, callId));
      this.recoverableError = { action, callId, kind: "retry_exhausted" };
      return;
    }
    this.retryEligibility.set(this.actionKey(action, callId), action);
    this.recoverableError = { action, callId, kind };
  }

  private retryAfterSync(): void {
    if (this.disposed || !this.enabled) return;

    Array.from(this.retryEligibility.entries()).forEach(([key, action]) => {
      const callId = key.slice(action.length + 1);
      const projection = this.session.getProjection(callId);
      if (this.incomingCallId !== callId || !this.actionRequired(action, projection)) {
        this.clearAction(action, callId);
        return;
      }
      if (this.retriesInFlight.has(key) || !this.pendingMatches(action, callId)) return;

      this.retriesInFlight.add(key);
      void this.controller.retryPendingCommand().then((outcome) => {
        this.retriesInFlight.delete(key);
        if (this.disposed) return;

        const latest = this.session.getProjection(callId);
        if (this.incomingCallId !== callId || !this.actionRequired(action, latest)) {
          this.clearAction(action, callId);
          this.emit();
          return;
        }

        if (
          outcome.status === "failed" &&
          (outcome.error.kind === "transport_timeout" || outcome.error.kind === "transport_error")
        ) {
          this.recordTransportFailure(action, callId, outcome.error.kind);
          this.emit();
          return;
        }
        if (outcome.status === "failed" && outcome.error.kind === "retry_exhausted") {
          this.retryEligibility.delete(key);
          this.recoverableError = { action, callId, kind: "retry_exhausted" };
          this.emit();
          return;
        }
        if (outcome.status === "failed") {
          this.retryEligibility.delete(key);
          this.recoverableError = {
            action,
            callId,
            kind: outcome.error.kind === "protocol_validation" ? "protocol_validation" : "rejected",
          };
          this.emit();
          return;
        }
        this.clearAction(action, callId);
        this.emit();
      }).catch(() => {
        this.retriesInFlight.delete(key);
      });
    });
  }

  private async runCommand(action: IncomingCommandAction, callId: string): Promise<void> {
    if (this.disposed) return;

    let outcome: LifecycleCommandOutcome;
    try {
      outcome = action === "call:received"
        ? await this.controller.received(callId)
        : await this.controller.presented(callId);
    } catch {
      if (this.disposed) return;
      const latest = this.session.getProjection(callId);
      if (!this.actionRequired(action, latest)) {
        this.clearAction(action, callId);
        return;
      }
      this.recordTransportFailure(action, callId, "transport_error");
      this.emit();
      return;
    }

    if (this.disposed) return;
    const latest = this.session.getProjection(callId);
    if (this.incomingCallId !== callId || !this.actionRequired(action, latest)) {
      this.clearAction(action, callId);
      return;
    }
    const transportKind = transportFailureKind(outcome);
    if (transportKind) {
      this.recordTransportFailure(action, callId, transportKind);
      this.emit();
      return;
    }
    if (outcome.status === "failed") {
      this.retryEligibility.delete(this.actionKey(action, callId));
      this.recoverableError = {
        action,
        callId,
        kind: outcome.error.kind === "protocol_validation" ? "protocol_validation" : "rejected",
      };
      this.emit();
      return;
    }
    this.clearAction(action, callId);
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
