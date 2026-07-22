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
  action?: PersistentPendingUserAction | "call:initiate" | "call:received" | "call:presented";
  callId?: string | null;
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
  mediaReady?(callId: string): Promise<LifecycleCommandOutcome>;
  setupFailed?(callId: string, failureCode: string): Promise<LifecycleCommandOutcome>;
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
type ActionStatus = "queued" | "submitted" | "acknowledged" | "retryable" | "retrying" | "exhausted" | "rejected";
interface ActionRecord {
  action: PersistentPendingUserAction;
  callId: string;
  commandId: string | null;
  status: ActionStatus;
}

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

function scopeError(
  error: PersistentPresentationError,
  action: PersistentPendingUserAction | "call:initiate" | "call:received" | "call:presented",
  callId: string | null,
): PersistentPresentationError {
  return { ...error, action, callId };
}

function actionEvent(action: PersistentPendingUserAction): DirectedCallLifecycleEvent {
  if (action === "accepting") return "call:accept";
  if (action === "declining") return "call:decline";
  if (action === "cancelling") return "call:cancel";
  return "call:hangup";
}

function actionRequired(action: PersistentPendingUserAction, projection: StateProjection | null): boolean {
  if (!projection) return false;
  if (action === "accepting" || action === "declining") {
    return projection.participant_role === "recipient" && projection.state === "presented";
  }
  if (action === "cancelling") {
    return projection.participant_role === "initiator" && CANCEL_STATES.has(projection.state);
  }
  return HANGUP_STATES.has(projection.state);
}

function isLiveProjection(projection: StateProjection): boolean {
  return !TERMINAL_STATES.has(projection.state);
}

function compareProjection(left: StateProjection, right: StateProjection): number {
  return left.created_at.localeCompare(right.created_at) || left.call_id.localeCompare(right.call_id);
}

export class DirectedCallPresentationModel {
  private readonly controller: DirectedCallPresentationLifecyclePort;
  private readonly incoming: DirectedCallPresentationIncomingPort;
  private readonly enabled: boolean;
  private readonly listeners = new Set<PresentationListener>();
  private readonly unsubscribeProjection: () => void;
  private readonly unsubscribeController: () => void;
  private readonly unsubscribeIncoming: () => void;
  private readonly unsubscribeSync: () => void;
  private readonly session: DirectedCallPresentationSessionPort;
  private authoritativeProjection: StateProjection | null = null;
  private controllerSnapshot: DirectedCallControllerSnapshot;
  private incomingSnapshot: IncomingPresentationSnapshot;
  private fallbackPeer: { id: string; username: string } | null = null;
  private actionRecord: ActionRecord | null = null;
  private scopedError: PersistentPresentationError | null = null;
  private cancelIntent = false;
  private initiationPromise: Promise<LifecycleCommandOutcome> | null = null;
  private initiationResult: InitiateResult | null = null;
  private initiationGeneration = 0;
  private disposed = false;

  constructor(
    session: DirectedCallPresentationSessionPort,
    lifecycleController: DirectedCallPresentationLifecyclePort,
    incomingCoordinator: DirectedCallPresentationIncomingPort,
    options: { enabled?: boolean } = {},
  ) {
    this.controller = lifecycleController;
    this.incoming = incomingCoordinator;
    this.session = session;
    this.enabled = options.enabled ?? false;
    this.controllerSnapshot = lifecycleController.getSnapshot();
    this.incomingSnapshot = incomingCoordinator.getSnapshot();

    if (!this.enabled) {
      this.unsubscribeProjection = () => undefined;
      this.unsubscribeController = () => undefined;
      this.unsubscribeIncoming = () => undefined;
      this.unsubscribeSync = () => undefined;
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
      const selectedCallId = snapshot.projection?.call_id ?? snapshot.callId;
      if (selectedCallId && this.actionRecord && this.actionRecord.callId !== selectedCallId) {
        this.clearActionRecord();
        this.fallbackPeer = null;
        this.initiationResult = null;
        this.cancelIntent = false;
      }
      this.emit();
    });
    this.unsubscribeIncoming = incomingCoordinator.subscribe((snapshot) => {
      this.incomingSnapshot = snapshot;
      this.emit();
    });
    this.unsubscribeSync = session.subscribeToSync
      ? session.subscribeToSync(() => this.retryAfterSync())
      : () => undefined;
  }

  getSnapshot(): PersistentPresentationSnapshot {
    const projection = this.disposed ? null : this.currentProjection();
    const reply = this.disposed || projection ? null : this.initiationResult;
    const callId = this.disposed
      ? null
      : projection?.call_id ?? reply?.call_id ??
        (this.controllerSnapshot.preparing ? null : this.controllerSnapshot.callId) ?? this.incomingSnapshot.callId;
    const role = projection?.participant_role ?? reply?.participant_role ?? null;
    const terminalState = projection && TERMINAL_STATES.has(projection.state)
      ? projection.state
      : reply && TERMINAL_STATES.has(reply.state)
        ? reply.state
        : null;
    const phase = this.mapPhase(projection, reply, role, terminalState);
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
      pendingAction: this.visiblePendingAction(),
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
        isPending: this.visiblePendingAction() === "accepting" || this.visiblePendingAction() === "declining",
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
    const existingProjection = this.currentProjection();
    if ((this.controllerSnapshot.preparing && !this.initiationResult) ||
        (existingProjection && !TERMINAL_STATES.has(existingProjection.state))) return { status: "ignored" };

    const generation = ++this.initiationGeneration;
    this.fallbackPeer = { id: targetPublicUserId.toLowerCase(), username: targetUsername };
    this.clearActionRecord();
    this.authoritativeProjection = null;
    this.scopedError = null;
    this.initiationResult = null;
    this.emit();
    const operation = this.controller.initiate(targetPublicUserId);
    this.initiationPromise = operation;
    const outcome = await operation;
    if (generation !== this.initiationGeneration || this.disposed) return { status: "ignored" };
    if (this.initiationPromise === operation) this.initiationPromise = null;

    if (this.cancelIntent) return this.resolveCancelledInitiation(outcome);
    if (outcome.status === "failed") {
      this.scopedError = scopeError(commandError(outcome), "call:initiate", null);
      this.emit();
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
      return this.submitAction("cancelling", this.initiationResult.call_id);
    }
    if (!projection && (this.controllerSnapshot.preparing || this.controllerSnapshot.pendingCommand?.event === "call:initiate")) {
      if (this.cancelIntent) return { status: "queued", action: "cancelling" };
      this.cancelIntent = true;
      this.actionRecord = { action: "cancelling", callId: this.controllerSnapshot.callId ?? "", commandId: null, status: "queued" };
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
    return this.submitAction("cancelling", projection.call_id);
  }

  async hangup(): Promise<PresentationActionResult> {
    const projection = this.currentProjection();
    if (this.disposed || !this.enabled || !projection || !HANGUP_STATES.has(projection.state)) {
      return { status: "ignored" };
    }
    return this.submitAction("hanging_up", projection.call_id);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeProjection();
    this.unsubscribeController();
    this.unsubscribeIncoming();
    this.unsubscribeSync();
    this.authoritativeProjection = null;
    this.fallbackPeer = null;
    this.controllerSnapshot = { ...this.controllerSnapshot, callId: null, projection: null, preparing: false, pendingCommand: null };
    this.incomingSnapshot = { ...this.incomingSnapshot, callId: null, projection: null, visible: false };
    this.clearActionRecord();
    this.cancelIntent = false;
    this.initiationPromise = null;
    this.initiationResult = null;
    this.initiationGeneration += 1;
    this.clearActionRecord();
    this.scopedError = null;
    this.listeners.clear();
  }

  private currentProjection(): StateProjection | null {
    const controllerProjection = this.controllerSnapshot.projection;
    const alternateProjections = [this.incomingSnapshot.projection, this.authoritativeProjection]
      .filter((projection): projection is StateProjection => projection !== null && isLiveProjection(projection))
      .sort(compareProjection);
    if (controllerProjection && isLiveProjection(controllerProjection)) return controllerProjection;
    if (alternateProjections[0]) return alternateProjections[0];
    return controllerProjection ?? this.authoritativeProjection;
  }

  private clearActionRecord(): void {
    this.actionRecord = null;
    this.scopedError = null;
  }

  private currentError(): PersistentPresentationError | null {
    const incomingError = this.incomingSnapshot.recoverableError;
    if (incomingError) {
      if (this.callIdForIncomingError() !== (this.currentProjection()?.call_id ?? null)) return null;
      return {
        kind: incomingError.kind === "retry_exhausted"
          ? "retry_exhausted"
          : incomingError.kind === "rejected"
            ? "rejected"
            : incomingError.kind === "protocol_validation"
              ? "protocol_validation"
              : "transport",
        message: "The incoming call connection was interrupted. Try again.",
        action: incomingError.action,
        callId: incomingError.callId,
      };
    }
    const currentCallId = this.currentProjection()?.call_id ?? this.initiationResult?.call_id ?? null;
    if (!this.scopedError) return null;
    if (this.scopedError.callId !== currentCallId) return null;
    if (this.scopedError.action !== "call:initiate" && this.actionRecord && this.scopedError.action !== this.actionRecord.action) return null;
    return this.scopedError;
  }

  private callIdForIncomingError(): string | null {
    return this.incomingSnapshot.recoverableError?.callId ?? null;
  }

  private visiblePendingAction(): PersistentPendingUserAction | null {
    if (!this.actionRecord || this.actionRecord.status === "rejected") return null;
    return this.actionRecord.action;
  }

  private mapPhase(
    projection: StateProjection | null,
    reply: InitiateResult | null,
    role: ParticipantRole | null,
    terminalState: CanonicalState | null,
  ): PersistentPresentationPhase {
    if (this.disposed) return "idle";
    if (!projection && terminalState) return "terminal";
    if (!projection && reply) {
      if (this.visiblePendingAction() === "cancelling") return "cancelling";
      if (role === "initiator") {
        if (reply.state === "presented") return "ringing";
        if (["accepted", "connecting"].includes(reply.state)) return "connecting";
        if (reply.state === "active") return "active";
        return "calling";
      }
      if (reply.state === "presented") return "ringing";
      if (["accepted", "connecting"].includes(reply.state)) return "connecting";
      if (reply.state === "active") return "active";
      return "incoming";
    }
    if (!projection && this.controllerSnapshot.preparing) return this.visiblePendingAction() === "cancelling" ? "cancelling" : "preparing";
    if (!projection) return "idle";
    if (terminalState) return "terminal";
    if (this.visiblePendingAction() === "cancelling") return "cancelling";
    if (this.visiblePendingAction() === "hanging_up") return projection.state === "active" ? "active" : "connecting";
    if (role === "initiator") {
      if (projection.state === "presented") return "ringing";
      if (["accepted", "connecting"].includes(projection.state)) return "connecting";
      if (projection.state === "active") return "active";
      return "calling";
    }
    if (this.visiblePendingAction() === "accepting") return "accepting";
    if (this.visiblePendingAction() === "declining") return "declining";
    if (projection.state === "dispatching") return "idle";
    if (projection.state === "presented") return "ringing";
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
    const selectedProjection = this.currentProjection();
    if (this.actionRecord && selectedProjection?.call_id === projection.call_id && this.actionRecord.callId !== projection.call_id) {
      this.clearActionRecord();
      this.scopedError = null;
      this.fallbackPeer = null;
      this.initiationResult = null;
      this.cancelIntent = false;
    }
    if (!this.authoritativeProjection || this.authoritativeProjection.call_id === projection.call_id ||
        TERMINAL_STATES.has(this.authoritativeProjection.state) ||
        (this.controllerSnapshot.preparing && projection.participant_role === "initiator")) {
      this.authoritativeProjection = projection;
    }

    const record = this.actionRecord;
    if (record && record.callId === projection.call_id && !actionRequired(record.action, projection)) {
      this.clearActionRecord();
      this.scopedError = null;
      if (record.action === "cancelling") this.cancelIntent = false;
    }
    const currentRecord = this.actionRecord;
    if (currentRecord && currentRecord.callId === projection.call_id &&
        (currentRecord.action === "accepting" || currentRecord.action === "declining") &&
        currentRecord.status === "queued" && projection.state === "presented" &&
        projection.participant_role === "recipient") {
      void this.submitAction(currentRecord.action, projection.call_id);
    }
    this.emit();
  }

  private async incomingAction(action: "accepting" | "declining"): Promise<PresentationActionResult> {
    if (this.disposed || !this.enabled) return { status: "ignored" };
    const projection = this.currentProjection();
    if (!projection || projection.participant_role !== "recipient" || !["delivered", "presented"].includes(projection.state)) {
      return { status: "ignored" };
    }
    if (this.actionRecord && this.actionRecord.action !== action) return { status: "ignored" };
    if (projection.state === "delivered") {
      this.actionRecord = { action, callId: projection.call_id, commandId: null, status: "queued" };
      this.emit();
      return { status: "queued", action };
    }
    return this.submitAction(action, projection.call_id);
  }

  private async submitAction(action: PersistentPendingUserAction, callId: string): Promise<PresentationActionResult> {
    if (this.actionRecord && (this.actionRecord.action !== action || this.actionRecord.callId !== callId)) return { status: "ignored" };
    if (this.actionRecord?.status === "submitted" || this.actionRecord?.status === "retrying" ||
        this.actionRecord?.status === "acknowledged" || this.actionRecord?.status === "retryable" ||
        this.actionRecord?.status === "exhausted" || this.actionRecord?.status === "rejected") return { status: "ignored" };
    this.actionRecord = {
      action,
      callId,
      commandId: this.controller.getSnapshot().pendingCommand?.commandId ?? null,
      status: "submitted",
    };
    this.scopedError = null;
    const outcomePromise = this.invokeAction(action, callId);
    if (this.actionRecord?.action === action && this.actionRecord.callId === callId) {
      this.actionRecord.commandId = this.controller.getSnapshot().pendingCommand?.commandId ?? null;
    }
    this.emit();
    const outcome = await outcomePromise;
    if (this.disposed) return { status: "ignored" };
    return this.finishAction(outcome, action, callId);
  }

  private invokeAction(action: PersistentPendingUserAction, callId: string): Promise<LifecycleCommandOutcome> {
    if (action === "accepting") return this.controller.accept(callId);
    if (action === "declining") return this.controller.decline(callId);
    if (action === "cancelling") return this.controller.cancel(callId);
    return this.controller.hangup(callId);
  }

  async retryPendingAction(): Promise<PresentationActionResult> {
    if (this.disposed || !this.enabled || !this.actionRecord || this.actionRecord.status !== "retryable") return { status: "ignored" };
    const { action, callId } = this.actionRecord;
    if (!actionRequired(action, this.session.getProjection(callId))) {
      this.clearActionRecord();
      return { status: "ignored" };
    }
    const pending = this.controller.getSnapshot().pendingCommand;
    if (!pending || pending.event !== actionEvent(action) || pending.callId !== callId) {
      this.clearActionRecord();
      return { status: "ignored" };
    }
    return this.retryAction(action, callId);
  }

  private retryAfterSync(): void {
    if (!this.actionRecord || this.actionRecord.status !== "retryable" || this.disposed) return;
    void this.retryPendingAction();
  }

  private async retryAction(action: PersistentPendingUserAction, callId: string): Promise<PresentationActionResult> {
    if (!this.actionRecord || this.actionRecord.action !== action || this.actionRecord.callId !== callId || this.actionRecord.status !== "retryable") return { status: "ignored" };
    this.actionRecord.status = "retrying";
    this.emit();
    const outcome = await this.controller.retryPendingCommand();
    if (this.disposed) return { status: "ignored" };
    return this.finishAction(outcome, action, callId);
  }

  private finishAction(outcome: LifecycleCommandOutcome, action: PersistentPendingUserAction, callId: string): PresentationActionResult {
    if (this.disposed) return { status: "ignored" };
    if (!this.actionRecord || this.actionRecord.action !== action || this.actionRecord.callId !== callId) {
      return { status: "ignored" };
    }
    const latest = this.session.getProjection(callId);
    if (!actionRequired(action, latest)) {
      this.clearActionRecord();
      this.scopedError = null;
      this.emit();
      return { status: "ignored" };
    }

    if (outcome.status === "failed") {
      if (outcome.error.kind === "retry_exhausted") {
        this.actionRecord = { ...this.actionRecord, action, callId, status: "exhausted" };
        this.scopedError = scopeError(commandError(outcome), action, callId);
        this.emit();
        return { status: "failed", error: this.scopedError };
      }
      if (outcome.error.kind === "transport_timeout" || outcome.error.kind === "transport_error") {
        const pending = this.controller.getSnapshot().pendingCommand;
        if (pending?.event === actionEvent(action) && pending.callId === callId) {
          this.actionRecord = {
            ...this.actionRecord,
            action,
            callId,
            status: pending.attempts >= 3 ? "exhausted" : "retryable",
          };
          this.scopedError = scopeError(commandError(outcome), action, callId);
        } else {
          this.clearActionRecord();
        }
      } else {
        this.actionRecord = { ...this.actionRecord, action, callId, status: "rejected" };
        this.scopedError = scopeError(commandError(outcome), action, callId);
      }
      this.emit();
      return { status: "failed", error: this.scopedError ?? commandError(outcome) };
    }

    const result = outcome.result;
    if ("result_code" in result && result.result_code === "rejected") {
      this.actionRecord = { ...this.actionRecord, action, callId, status: "rejected" };
      this.scopedError = scopeError({ kind: "rejected", message: "This call action is no longer available." }, action, callId);
      this.emit();
      return { status: "failed", error: this.scopedError };
    }
    this.actionRecord = { ...this.actionRecord, status: "acknowledged" };
    this.scopedError = null;
    this.emit();
    return { status: "acknowledged", event: outcome.event };
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
    this.clearActionRecord();
    if (outcome.status === "failed") {
      const pending = this.controller.getSnapshot().pendingCommand;
      if (
        (outcome.error.kind === "transport_timeout" || outcome.error.kind === "transport_error") &&
        pending?.event === "call:initiate" &&
        pending.attempts >= 3
      ) {
        const exhausted = scopeError(
          { kind: "retry_exhausted", message: "The call action could not be completed. Try again." },
          "call:initiate",
          this.initiationResult?.call_id ?? null,
        );
        this.scopedError = exhausted;
        this.emit();
        return { status: "failed", error: exhausted };
      }
      this.emit();
      return { status: "failed", error: commandError(outcome) };
    }
    this.initiationResult = outcome.result as InitiateResult;
    const result = this.initiationResult;
    const latest = this.session.getProjection(result.call_id);
    const latestCanCancel = latest
      ? latest.participant_role === "initiator" && CANCEL_STATES.has(latest.state)
      : result.participant_role === "initiator" && CANCEL_STATES.has(result.state);
    if (latestCanCancel) {
      this.actionRecord = { action: "cancelling", callId: result.call_id, commandId: null, status: "queued" };
      this.emit();
      return this.submitAction("cancelling", result.call_id);
    }
    this.emit();
    return { status: "acknowledged", event: "call:initiate" };
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
