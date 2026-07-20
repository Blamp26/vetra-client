import {
  isUuid,
  type CanonicalState,
  type InitiateResult,
  type ParticipantRole,
  type StateProjection,
} from "../protocol/directedCallProtocol";
import {
  type DirectedCallControllerSnapshot,
  type DirectedCallLifecycleEvent,
  type DirectedCallSessionPort,
  type LifecycleCommandOutcome,
} from "./directedCallLifecycleController";
import type {
  IncomingPresentationSnapshot,
} from "./directedCallIncomingCoordinator";

export type PersistentPresentationPhase =
  | "idle"
  | "preparing"
  | "calling"
  | "ringing"
  | "incoming"
  | "accepting"
  | "declining"
  | "cancelling"
  | "connecting"
  | "active"
  | "terminal";

export type PersistentPendingUserAction =
  | "accepting"
  | "declining"
  | "cancelling"
  | "hanging_up";

export interface PersistentPresentationError {
  kind: "protocol_validation" | "rejected" | "transport" | "retry_exhausted";
  message: string;
}

export interface IncomingModalPresentationProps {
  visible: boolean;
  callerDisplayName: string;
  isPending: boolean;
  presentationKey: string | null;
  onPresented: (() => void) | undefined;
  onAccept: () => Promise<PresentationActionResult>;
  onDecline: () => Promise<PresentationActionResult>;
}

export interface PersistentPresentationSnapshot {
  disposed: boolean;
  phase: PersistentPresentationPhase;
  callId: string | null;
  participantRole: ParticipantRole | null;
  peerPublicId: string | null;
  peerUsername: string | null;
  canonicalState: CanonicalState | null;
  stateVersion: number | null;
  timestamps: Pick<StateProjection, "created_at" | "presented_at" | "accepted_at" | "connecting_at" | "active_at" | "ended_at"> | null;
  terminalState: CanonicalState | null;
  pendingAction: PersistentPendingUserAction | null;
  recoverableError: PersistentPresentationError | null;
  statusLabel: string;
  terminalLabel: string | null;
  callIssue: PersistentPresentationError | null;
  canCancel: boolean;
  canHangup: boolean;
  mediaControlsAvailable: false;
  incomingModal: IncomingModalPresentationProps;
}

export type PresentationActionResult =
  | { status: "acknowledged"; event: DirectedCallLifecycleEvent | "call:initiate" }
  | { status: "queued"; action: PersistentPendingUserAction }
  | { status: "ignored" }
  | { status: "failed"; error: PersistentPresentationError };

export interface DirectedCallPresentationSessionPort extends DirectedCallSessionPort {}

export interface DirectedCallPresentationLifecyclePort {
  initiate(targetPublicUserId: string): Promise<LifecycleCommandOutcome>;
  received(callId: string): Promise<LifecycleCommandOutcome>;
  presented(callId: string): Promise<LifecycleCommandOutcome>;
  accept(callId: string): Promise<LifecycleCommandOutcome>;
  cancel(callId: string): Promise<LifecycleCommandOutcome>;
  decline(callId: string): Promise<LifecycleCommandOutcome>;
  hangup(callId: string): Promise<LifecycleCommandOutcome>;
  retryPendingCommand(): Promise<LifecycleCommandOutcome>;
  getSnapshot(): DirectedCallControllerSnapshot;
  subscribe(listener: (snapshot: DirectedCallControllerSnapshot) => void): () => void;
}

export interface DirectedCallPresentationIncomingPort {
  getSnapshot(): IncomingPresentationSnapshot;
  subscribe(listener: (snapshot: IncomingPresentationSnapshot) => void): () => void;
  onModalPresented(callId: string): void;
}

type PresentationListener = (snapshot: PersistentPresentationSnapshot) => void;

const TERMINAL_STATES = new Set<CanonicalState>([
  "unavailable",
  "undelivered",
  "busy",
  "declined",
  "cancelled",
  "no_answer",
  "connection_failed",
  "ended",
]);
const CANCEL_STATES = new Set<CanonicalState>(["dispatching", "delivered", "presented"]);
const HANGUP_STATES = new Set<CanonicalState>(["accepted", "connecting", "active"]);

const TERMINAL_LABELS: Record<CanonicalState, string> = {
  unavailable: "Call unavailable",
  undelivered: "Call not delivered",
  busy: "User unavailable",
  declined: "Call declined",
  cancelled: "Call cancelled",
  no_answer: "No answer",
  connection_failed: "Connection failed",
  ended: "Call ended",
  dispatching: "",
  delivered: "",
  presented: "",
  accepted: "",
  connecting: "",
  active: "",
};

function commandError(outcome: Extract<LifecycleCommandOutcome, { status: "failed" }>): PersistentPresentationError {
  if (outcome.error.kind === "protocol_validation") {
    return { kind: "protocol_validation", message: "This call action was invalid." };
  }
  if (outcome.error.kind === "rejected") {
    return { kind: "rejected", message: "This call action is no longer available." };
  }
  if (outcome.error.kind === "retry_exhausted") {
    return { kind: "retry_exhausted", message: "The call action could not be completed. Try again." };
  }
  return { kind: "transport", message: "The call connection was interrupted. Try again." };
}

export class DirectedCallPresentationModel {
  private readonly controller: DirectedCallPresentationLifecyclePort;
  private readonly incoming: DirectedCallPresentationIncomingPort;
  private readonly enabled: boolean;
  private readonly listeners = new Set<PresentationListener>();
  private readonly sentActions = new Set<string>();
  private readonly unsubscribeProjection: () => void;
  private readonly unsubscribeController: () => void;
  private readonly unsubscribeIncoming: () => void;
  private authoritativeProjection: StateProjection | null = null;
  private controllerSnapshot: DirectedCallControllerSnapshot;
  private incomingSnapshot: IncomingPresentationSnapshot;
  private fallbackPeer: { id: string; username: string } | null = null;
  private pendingAction: PersistentPendingUserAction | null = null;
  private cancelIntent = false;
  private initiationPromise: Promise<LifecycleCommandOutcome> | null = null;
  private initiationResult: InitiateResult | null = null;
  private disposed = false;

  constructor(
    session: DirectedCallPresentationSessionPort,
    lifecycleController: DirectedCallPresentationLifecyclePort,
    incomingCoordinator: DirectedCallPresentationIncomingPort,
    options: { enabled?: boolean } = {},
  ) {
    this.controller = lifecycleController;
    this.incoming = incomingCoordinator;
    this.enabled = options.enabled ?? false;
    this.controllerSnapshot = lifecycleController.getSnapshot();
    this.incomingSnapshot = incomingCoordinator.getSnapshot();

    if (!this.enabled) {
      this.unsubscribeProjection = () => undefined;
      this.unsubscribeController = () => undefined;
      this.unsubscribeIncoming = () => undefined;
      return;
    }

    this.unsubscribeProjection = session.subscribeToProjections((projection, classification) => {
      if (classification !== "accepted") return;
      if (!this.authoritativeProjection || this.authoritativeProjection.call_id === projection.call_id ||
          (this.controllerSnapshot.preparing && projection.participant_role === "initiator")) {
        this.authoritativeProjection = projection;
      }
      this.handleProjection(projection);
    });
    this.unsubscribeController = lifecycleController.subscribe((snapshot) => {
      this.controllerSnapshot = snapshot;
      this.emit();
    });
    this.unsubscribeIncoming = incomingCoordinator.subscribe((snapshot) => {
      this.incomingSnapshot = snapshot;
      this.emit();
    });
  }

  getSnapshot(): PersistentPresentationSnapshot {
    const projection = this.disposed ? null : this.currentProjection();
    const callId = this.disposed ? null : projection?.call_id ?? this.controllerSnapshot.callId ?? this.incomingSnapshot.callId;
    const role = projection?.participant_role ?? null;
    const terminalState = projection && TERMINAL_STATES.has(projection.state) ? projection.state : null;
    const phase = this.mapPhase(projection, role, terminalState);
    const fallback = this.fallbackPeer;
    const peerPublicId = projection?.peer.user_id ?? fallback?.id ?? null;
    const peerUsername = projection?.peer.username ?? fallback?.username ?? null;
    const recoverableError = this.currentError();
    const modalVisible = this.incomingSnapshot.visible && Boolean(projection) &&
      (projection?.state === "delivered" || projection?.state === "presented");

    return {
      disposed: this.disposed,
      phase,
      callId,
      participantRole: role,
      peerPublicId,
      peerUsername,
      canonicalState: projection?.state ?? null,
      stateVersion: projection?.state_version ?? null,
      timestamps: projection
        ? {
            created_at: projection.created_at,
            presented_at: projection.presented_at,
            accepted_at: projection.accepted_at,
            connecting_at: projection.connecting_at,
            active_at: projection.active_at,
            ended_at: projection.ended_at,
          }
        : null,
      terminalState,
      pendingAction: this.pendingAction,
      recoverableError,
      statusLabel: this.statusLabel(phase),
      terminalLabel: terminalState ? TERMINAL_LABELS[terminalState] : null,
      callIssue: recoverableError,
      canCancel: this.canCancel(projection),
      canHangup: Boolean(projection && HANGUP_STATES.has(projection.state)),
      mediaControlsAvailable: false,
      incomingModal: {
        visible: modalVisible,
        callerDisplayName: peerUsername ?? "Unknown caller",
        isPending: this.pendingAction === "accepting" || this.pendingAction === "declining",
        presentationKey: modalVisible ? callId : null,
        onPresented: modalVisible && callId ? () => this.incoming.onModalPresented(callId) : undefined,
        onAccept: () => this.accept(),
        onDecline: () => this.decline(),
      },
    };
  }

  subscribe(listener: PresentationListener): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async startCall(targetPublicUserId: string, targetUsername: string): Promise<PresentationActionResult> {
    if (this.disposed || !this.enabled || !isUuid(targetPublicUserId)) {
      return { status: "failed", error: { kind: "protocol_validation", message: "A public user ID is required." } };
    }
    if (this.controllerSnapshot.preparing || this.currentProjection()) return { status: "ignored" };

    this.fallbackPeer = { id: targetPublicUserId.toLowerCase(), username: targetUsername };
    this.pendingAction = null;
    this.initiationResult = null;
    this.emit();
    const operation = this.controller.initiate(targetPublicUserId);
    this.initiationPromise = operation;
    const outcome = await operation;
    if (this.initiationPromise === operation) this.initiationPromise = null;

    if (this.cancelIntent) return this.resolveCancelledInitiation(outcome);
    if (outcome.status === "failed") {
      return { status: "failed", error: commandError(outcome) };
    }
    this.initiationResult = outcome.result as InitiateResult;
    this.emit();
    return { status: "acknowledged", event: "call:initiate" };
  }

  async accept(): Promise<PresentationActionResult> {
    return this.incomingAction("accepting");
  }

  async decline(): Promise<PresentationActionResult> {
    return this.incomingAction("declining");
  }

  async cancelCall(): Promise<PresentationActionResult> {
    if (this.disposed || !this.enabled) return { status: "ignored" };
    const projection = this.currentProjection();
    if (!projection && this.initiationResult && CANCEL_STATES.has(this.initiationResult.state)) {
      return this.sendAction("cancelling", this.initiationResult.call_id);
    }
    if (!projection && (this.controllerSnapshot.preparing || this.controllerSnapshot.pendingCommand?.event === "call:initiate")) {
      if (this.cancelIntent) return { status: "queued", action: "cancelling" };
      this.cancelIntent = true;
      this.pendingAction = "cancelling";
      this.emit();
      if (!this.initiationPromise) {
        const pending = this.controller.retryPendingCommand();
        this.initiationPromise = pending;
        return this.resolveCancelledInitiation(await pending);
      }
      return { status: "queued", action: "cancelling" };
    }
    if (!projection || projection.participant_role !== "initiator" || !CANCEL_STATES.has(projection.state)) {
      return { status: "ignored" };
    }
    return this.sendAction("cancelling", projection.call_id);
  }

  async hangup(): Promise<PresentationActionResult> {
    const projection = this.currentProjection();
    if (this.disposed || !this.enabled || !projection || !HANGUP_STATES.has(projection.state)) {
      return { status: "ignored" };
    }
    return this.sendAction("hanging_up", projection.call_id);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeProjection();
    this.unsubscribeController();
    this.unsubscribeIncoming();
    this.authoritativeProjection = null;
    this.fallbackPeer = null;
    this.controllerSnapshot = { ...this.controllerSnapshot, callId: null, projection: null, preparing: false, pendingCommand: null };
    this.incomingSnapshot = { ...this.incomingSnapshot, callId: null, projection: null, visible: false };
    this.pendingAction = null;
    this.cancelIntent = false;
    this.initiationPromise = null;
    this.initiationResult = null;
    this.sentActions.clear();
    this.listeners.clear();
  }

  private currentProjection(): StateProjection | null {
    const controllerProjection = this.controllerSnapshot.projection;
    if (controllerProjection) return controllerProjection;
    if (this.incomingSnapshot.projection) return this.incomingSnapshot.projection;
    return this.authoritativeProjection;
  }

  private currentError(): PersistentPresentationError | null {
    const incomingError = this.incomingSnapshot.recoverableError;
    if (incomingError) {
      return { kind: incomingError.kind === "retry_exhausted" ? "retry_exhausted" : "transport", message: "The incoming call connection was interrupted. Try again." };
    }
    const controllerError = this.controllerSnapshot.lastCommandError;
    if (!controllerError || controllerError.kind === "disposed") return null;
    return commandError({ status: "failed", event: "call:hangup", commandId: null, error: controllerError });
  }

  private mapPhase(projection: StateProjection | null, role: ParticipantRole | null, terminalState: CanonicalState | null): PersistentPresentationPhase {
    if (this.disposed) return "idle";
    if (!projection && this.controllerSnapshot.preparing) return this.pendingAction === "cancelling" ? "cancelling" : "preparing";
    if (!projection) return "idle";
    if (terminalState) return "terminal";
    if (this.pendingAction === "cancelling") return "cancelling";
    if (this.pendingAction === "hanging_up") return projection.state === "active" ? "active" : "connecting";
    if (role === "initiator") {
      if (projection.state === "presented") return "ringing";
      if (["accepted", "connecting"].includes(projection.state)) return "connecting";
      if (projection.state === "active") return "active";
      return "calling";
    }
    if (this.pendingAction === "accepting") return "accepting";
    if (this.pendingAction === "declining") return "declining";
    if (projection.state === "dispatching") return "idle";
    if (["accepted", "connecting"].includes(projection.state)) return "connecting";
    if (projection.state === "active") return "active";
    return "incoming";
  }

  private statusLabel(phase: PersistentPresentationPhase): string {
    return {
      idle: "Ready",
      preparing: "Preparing call…",
      calling: "Calling…",
      ringing: "Ringing",
      incoming: "Incoming call",
      accepting: "Accepting…",
      declining: "Declining…",
      cancelling: "Cancelling…",
      connecting: "Connecting…",
      active: "Active",
      terminal: "Call finished",
    }[phase];
  }

  private canCancel(projection: StateProjection | null): boolean {
    return Boolean(
      this.controllerSnapshot.preparing ||
      (projection?.participant_role === "initiator" && projection && CANCEL_STATES.has(projection.state)),
    );
  }

  private handleProjection(projection: StateProjection): void {
    if (this.disposed) return;
    if (this.authoritativeProjection?.call_id === projection.call_id) this.authoritativeProjection = projection;
    if (projection.call_id === this.controllerSnapshot.callId && TERMINAL_STATES.has(projection.state)) {
      this.pendingAction = null;
      this.cancelIntent = false;
    }
    if (projection.participant_role === "recipient" &&
        (!["delivered", "presented"].includes(projection.state) || TERMINAL_STATES.has(projection.state))) {
      this.pendingAction = null;
    }
    if (this.pendingAction === "accepting" || this.pendingAction === "declining") {
      if (projection.state === "presented" && projection.participant_role === "recipient") {
        void this.sendAction(this.pendingAction, projection.call_id);
      } else if (projection.state !== "delivered" && projection.state !== "presented") {
        this.pendingAction = null;
      }
    }
    this.emit();
  }

  private async incomingAction(action: "accepting" | "declining"): Promise<PresentationActionResult> {
    if (this.disposed || !this.enabled) return { status: "ignored" };
    const projection = this.currentProjection();
    if (!projection || projection.participant_role !== "recipient" || !["delivered", "presented"].includes(projection.state)) {
      return { status: "ignored" };
    }
    if (this.pendingAction && this.pendingAction !== action) return { status: "ignored" };
    if (projection.state === "delivered") {
      this.pendingAction = action;
      this.emit();
      return { status: "queued", action };
    }
    return this.sendAction(action, projection.call_id);
  }

  private async sendAction(action: PersistentPendingUserAction, callId: string): Promise<PresentationActionResult> {
    const key = `${action}:${callId}`;
    if (this.sentActions.has(key)) return { status: "ignored" };
    if (this.pendingAction && this.pendingAction !== action) return { status: "ignored" };
    this.sentActions.add(key);
    this.pendingAction = action;
    this.emit();
    const outcome = await this.invokeAction(action, callId);
    if (this.disposed) return { status: "ignored" };
    this.pendingAction = null;
    if (outcome.status === "failed") {
      this.emit();
      return { status: "failed", error: commandError(outcome) };
    }
    this.emit();
    return { status: "acknowledged", event: outcome.event };
  }

  private invokeAction(action: PersistentPendingUserAction, callId: string): Promise<LifecycleCommandOutcome> {
    if (action === "accepting") return this.controller.accept(callId);
    if (action === "declining") return this.controller.decline(callId);
    if (action === "cancelling") return this.controller.cancel(callId);
    return this.controller.hangup(callId);
  }

  private async resolveCancelledInitiation(initial: LifecycleCommandOutcome): Promise<PresentationActionResult> {
    let outcome = initial;
    while (
      outcome.status === "failed" &&
      (outcome.error.kind === "transport_timeout" || outcome.error.kind === "transport_error")
    ) {
      const pending = this.controller.getSnapshot().pendingCommand;
      if (!pending || pending.event !== "call:initiate" || pending.attempts >= 3) break;
      outcome = await this.controller.retryPendingCommand();
    }

    if (this.disposed) return { status: "ignored" };
    this.cancelIntent = false;
    this.pendingAction = null;
    if (outcome.status === "failed") {
      this.emit();
      return { status: "failed", error: commandError(outcome) };
    }
    this.initiationResult = outcome.result as InitiateResult;
    const result = this.initiationResult;
    if (CANCEL_STATES.has(result.state)) {
      this.emit();
      return this.sendAction("cancelling", result.call_id);
    }
    this.emit();
    return { status: "acknowledged", event: "call:initiate" };
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
