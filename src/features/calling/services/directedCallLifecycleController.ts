import {
  CANONICAL_STATES,
  buildCommand,
  buildInitiate,
  buildSetupFailed,
  isUuid,
  type CanonicalState,
  type CommandResult,
  type FailureCode,
  type InitiateResult,
  type ParticipantRole,
  type StateProjection,
} from "../protocol/directedCallProtocol";
import { createDirectedCallUuid } from "./directedCallDevice";
import {
  DirectedCallSessionCommandError as SessionCommandError,
  type DirectedCallCommandTransportError,
} from "./directedCallSession";

export type DirectedCallLifecycleEvent =
  | "call:received"
  | "call:presented"
  | "call:accept"
  | "call:cancel"
  | "call:decline"
  | "call:hangup"
  | "call:begin_connecting"
  | "call:media_ready"
  | "call:setup_failed";

export type ControllerPhase = "idle" | "preparing" | "live" | "terminal" | "disposed";

export type ControllerCommandErrorKind =
  | "protocol_validation"
  | "rejected"
  | "transport_timeout"
  | "transport_error"
  | "disposed"
  | "retry_exhausted";

export interface ControllerCommandError {
  kind: ControllerCommandErrorKind;
}

export interface PendingLifecycleCommand {
  event: DirectedCallLifecycleEvent | "call:initiate";
  callId: string | null;
  commandId: string;
  attempts: number;
}

export interface DirectedCallControllerSnapshot {
  phase: ControllerPhase;
  preparing: boolean;
  disposed: boolean;
  callId: string | null;
  projection: StateProjection | null;
  pendingCommand: PendingLifecycleCommand | null;
  lastCommandError: ControllerCommandError | null;
}

export type LifecycleCommandOutcome =
  | {
      status: "acknowledged";
      event: DirectedCallLifecycleEvent | "call:initiate";
      commandId: string;
      result: CommandResult | InitiateResult;
    }
  | {
      status: "failed";
      event: DirectedCallLifecycleEvent | "call:initiate";
      commandId: string | null;
      error: ControllerCommandError;
    };

export interface DirectedCallSessionPort {
  readonly deviceId: string;
  getProjections?: () => StateProjection[];
  getProjection(callId: string): StateProjection | null;
  subscribeToProjections(
    listener: (projection: StateProjection, classification: "accepted" | "duplicate") => void,
  ): () => void;
  subscribeToSync?: (listener: () => void) => () => void;
  pushCommand(event: string, payload: unknown): Promise<unknown>;
}

type ControllerListener = (snapshot: DirectedCallControllerSnapshot) => void;
type CommandRecord = PendingLifecycleCommand & {
  payload: unknown;
  generation: number;
};
type InFlightCommand = {
  event: DirectedCallLifecycleEvent | "call:initiate";
  callId: string | null;
  promise: Promise<LifecycleCommandOutcome>;
};

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
const MAX_EXPLICIT_ATTEMPTS = 3;

function isLiveProjection(projection: StateProjection): boolean {
  return !TERMINAL_STATES.has(projection.state);
}

function compareProjection(left: StateProjection, right: StateProjection): number {
  return left.created_at.localeCompare(right.created_at) || left.call_id.localeCompare(right.call_id);
}

function confirmsCommand(command: PendingLifecycleCommand, projection: StateProjection): boolean {
  if (command.callId !== projection.call_id) return false;
  if (TERMINAL_STATES.has(projection.state)) return true;

  switch (command.event) {
    case "call:received":
      return ["delivered", "presented", "accepted", "connecting", "active"].includes(projection.state);
    case "call:presented":
      return ["presented", "accepted", "connecting", "active"].includes(projection.state);
    case "call:accept":
      return ["accepted", "connecting", "active"].includes(projection.state);
    case "call:decline":
      return false;
    case "call:cancel":
      return false;
    case "call:hangup":
      return false;
    case "call:begin_connecting":
      return ["connecting", "active"].includes(projection.state);
    case "call:setup_failed":
      return projection.state === "connection_failed";
    case "call:media_ready":
      return ["connecting", "active"].includes(projection.state);
    case "call:initiate":
      return true;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function decodeCommandReply(value: unknown): CommandResult | null {
  if (!isRecord(value) || value.protocol_version !== 1 || value.status !== "ok" || !isRecord(value.result)) {
    return null;
  }

  const result = value.result;
  if (
    !isUuid(result.call_id) ||
    !CANONICAL_STATES.includes(result.state as CanonicalState) ||
    !isSafeInteger(result.state_version) ||
    !["applied", "no_op", "duplicate", "rejected"].includes(String(result.result_code))
  ) {
    return null;
  }

  return {
    call_id: result.call_id,
    state: result.state as CanonicalState,
    state_version: result.state_version,
    result_code: result.result_code as CommandResult["result_code"],
  };
}

function decodeInitiateReply(value: unknown): InitiateResult | null {
  if (!isRecord(value) || value.protocol_version !== 1 || value.status !== "ok" || !isRecord(value.result)) {
    return null;
  }

  const result = value.result;
  if (
    !isUuid(result.call_id) ||
    !CANONICAL_STATES.includes(result.state as CanonicalState) ||
    !isSafeInteger(result.state_version) ||
    result.media !== "audio" ||
    !["initiator", "recipient"].includes(String(result.participant_role)) ||
    typeof result.merged !== "boolean" ||
    typeof result.attempt_created !== "boolean"
  ) {
    return null;
  }

  return {
    call_id: result.call_id,
    state: result.state as CanonicalState,
    state_version: result.state_version,
    media: "audio",
    participant_role: result.participant_role as ParticipantRole,
    merged: result.merged,
    attempt_created: result.attempt_created,
  };
}

function mapTransportError(error: unknown): ControllerCommandError {
  if (error instanceof SessionCommandError) {
    const kind: DirectedCallCommandTransportError = error.transport;
    return { kind: kind.kind };
  }
  return { kind: "transport_error" };
}

export class DirectedCallLifecycleController {
  private readonly session: DirectedCallSessionPort;
  private readonly listeners = new Set<ControllerListener>();
  private readonly unsubscribeProjection: () => void;
  private readonly unsubscribeSync: () => void;
  private preparing = false;
  private controlledCallId: string | null = null;
  private pendingCommand: CommandRecord | null = null;
  private lastCommandError: ControllerCommandError | null = null;
  private disposed = false;
  private generation = 0;
  private readonly authoritativelyAdvancedCommands = new Set<string>();
  private inFlightCommand: InFlightCommand | null = null;

  constructor(session: DirectedCallSessionPort) {
    this.session = session;
    this.unsubscribeProjection = session.subscribeToProjections((projection) => {
      this.selectFromProjection(projection);
      this.emit();
    });
    this.unsubscribeSync = session.subscribeToSync
      ? session.subscribeToSync(() => {
          this.selectFromStore();
          this.emit();
        })
      : () => undefined;
  }

  getSnapshot(): DirectedCallControllerSnapshot {
    const projection = this.controlledCallId
      ? this.session.getProjection(this.controlledCallId)
      : null;
    const phase: ControllerPhase = this.disposed
      ? "disposed"
      : this.preparing
        ? "preparing"
        : projection
          ? TERMINAL_STATES.has(projection.state)
            ? "terminal"
            : "live"
          : "idle";

    return {
      phase,
      preparing: this.preparing,
      disposed: this.disposed,
      callId: this.controlledCallId,
      projection,
      pendingCommand: this.pendingCommand
        ? {
            event: this.pendingCommand.event,
            callId: this.pendingCommand.callId,
            commandId: this.pendingCommand.commandId,
            attempts: this.pendingCommand.attempts,
          }
        : null,
      lastCommandError: this.lastCommandError,
    };
  }

  subscribe(listener: ControllerListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  initiate(targetPublicUserId: string): Promise<LifecycleCommandOutcome> {
    let commandId: string;
    let payload: unknown;
    try {
      commandId = createDirectedCallUuid();
      payload = buildInitiate(commandId, this.session.deviceId, targetPublicUserId);
    } catch {
      return Promise.resolve(this.fail("call:initiate", null, { kind: "protocol_validation" }));
    }

    this.generation += 1;
    this.preparing = true;
    this.controlledCallId = null;
    this.lastCommandError = null;
    return this.trackDispatch({
      event: "call:initiate",
      callId: null,
      commandId,
      attempts: 0,
      payload,
      generation: this.generation,
    });
  }

  received(callId: string): Promise<LifecycleCommandOutcome> {
    return this.command("call:received", callId);
  }

  presented(callId: string): Promise<LifecycleCommandOutcome> {
    return this.command("call:presented", callId);
  }

  accept(callId: string): Promise<LifecycleCommandOutcome> {
    return this.command("call:accept", callId);
  }

  cancel(callId: string): Promise<LifecycleCommandOutcome> {
    return this.command("call:cancel", callId);
  }

  decline(callId: string): Promise<LifecycleCommandOutcome> {
    return this.command("call:decline", callId);
  }

  hangup(callId: string): Promise<LifecycleCommandOutcome> {
    return this.command("call:hangup", callId);
  }

  beginConnecting(callId: string): Promise<LifecycleCommandOutcome> {
    return this.command("call:begin_connecting", callId);
  }

  mediaReady(callId: string): Promise<LifecycleCommandOutcome> {
    return this.command("call:media_ready", callId);
  }

  setupFailed(callId: string, failureCode: FailureCode): Promise<LifecycleCommandOutcome> {
    if (this.inFlightCommand?.event === "call:setup_failed" && this.inFlightCommand.callId === callId) {
      return this.inFlightCommand.promise;
    }
    if (this.pendingCommand?.event === "call:setup_failed" && this.pendingCommand.callId === callId) {
      return this.retryPendingCommand();
    }

    let commandId: string;
    let payload: unknown;
    try {
      commandId = createDirectedCallUuid();
      payload = buildSetupFailed(callId, commandId, this.session.deviceId, failureCode);
    } catch {
      return Promise.resolve(this.fail("call:setup_failed", null, { kind: "protocol_validation" }));
    }

    return this.trackDispatch({
      event: "call:setup_failed",
      callId,
      commandId,
      attempts: 0,
      payload,
      generation: this.generation,
    });
  }

  retryPendingCommand(): Promise<LifecycleCommandOutcome> {
    if (this.disposed) return Promise.resolve(this.fail("call:hangup", null, { kind: "disposed" }));
    if (!this.pendingCommand) {
      return Promise.resolve(this.fail("call:hangup", null, { kind: "retry_exhausted" }));
    }
    if (this.inFlightCommand?.event === this.pendingCommand.event &&
        this.inFlightCommand.callId === this.pendingCommand.callId) {
      return this.inFlightCommand.promise;
    }
    if (this.pendingCommand.attempts >= MAX_EXPLICIT_ATTEMPTS) {
      return Promise.resolve(this.fail(this.pendingCommand.event, this.pendingCommand.commandId, { kind: "retry_exhausted" }));
    }

    if (this.pendingCommand.event === "call:initiate") {
      this.preparing = true;
    }
    return this.trackDispatch({
      ...this.pendingCommand,
      generation: this.generation,
    });
  }

  cancelPreparing(): void {
    if (!this.preparing) return;
    this.generation += 1;
    this.preparing = false;
    this.pendingCommand = null;
    this.inFlightCommand = null;
    this.lastCommandError = null;
    this.authoritativelyAdvancedCommands.clear();
    this.emit();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.preparing = false;
    this.controlledCallId = null;
    this.pendingCommand = null;
    this.inFlightCommand = null;
    this.lastCommandError = null;
    this.authoritativelyAdvancedCommands.clear();
    this.unsubscribeProjection();
    this.unsubscribeSync();
    this.listeners.clear();
  }

  private selectFromProjection(projection: StateProjection): void {
    if (this.pendingCommand?.event === "call:setup_failed" &&
        this.pendingCommand.callId === projection.call_id &&
        (projection.state === "active" || TERMINAL_STATES.has(projection.state))) {
      this.authoritativelyAdvancedCommands.add(this.pendingCommand.commandId);
      this.pendingCommand = null;
      this.lastCommandError = null;
    }
    if (this.pendingCommand && confirmsCommand(this.pendingCommand, projection)) {
      this.authoritativelyAdvancedCommands.add(this.pendingCommand.commandId);
      this.pendingCommand = null;
      this.lastCommandError = null;
    }
    const previousControlledCallId = this.controlledCallId;
    if (this.preparing) {
      if (this.controlledCallId === projection.call_id) this.preparing = false;
      return;
    }
    const selected = this.controlledCallId ? this.session.getProjection(this.controlledCallId) : null;
    if (selected && isLiveProjection(selected)) {
      if (projection.call_id === selected.call_id) this.preparing = false;
      return;
    }

    if (!selected && !isLiveProjection(projection)) {
      this.controlledCallId = projection.call_id;
      return;
    }

    const candidates = this.session.getProjections
      ? this.session.getProjections().filter(isLiveProjection)
      : [projection].filter(isLiveProjection);
    const next = candidates.sort(compareProjection)[0];
    if (next) {
      this.controlledCallId = next.call_id;
      this.preparing = false;
    }

    if (previousControlledCallId && this.controlledCallId && previousControlledCallId !== this.controlledCallId) {
      this.generation += 1;
      this.pendingCommand = null;
      this.lastCommandError = null;
      this.authoritativelyAdvancedCommands.clear();
    }
  }

  private selectFromStore(): void {
    if (this.preparing) return;
    const selected = this.controlledCallId ? this.session.getProjection(this.controlledCallId) : null;
    if (selected && isLiveProjection(selected)) return;
    const candidates = (this.session.getProjections?.() ?? []).filter(isLiveProjection).sort(compareProjection);
    if (candidates[0]) this.controlledCallId = candidates[0].call_id;
  }

  private command(event: DirectedCallLifecycleEvent, callId: string): Promise<LifecycleCommandOutcome> {
    if (this.inFlightCommand?.event === event && this.inFlightCommand.callId === callId) {
      return this.inFlightCommand.promise;
    }

    let commandId: string;
    let payload: unknown;
    try {
      commandId = createDirectedCallUuid();
      payload = buildCommand(callId, commandId, this.session.deviceId);
    } catch {
      return Promise.resolve(this.fail(event, null, { kind: "protocol_validation" }));
    }

    return this.trackDispatch({
      event,
      callId,
      commandId,
      attempts: 0,
      payload,
      generation: this.generation,
    });
  }

  private trackDispatch(record: CommandRecord): Promise<LifecycleCommandOutcome> {
    const promise = this.dispatch(record);
    const tracked: InFlightCommand = { event: record.event, callId: record.callId, promise };
    this.inFlightCommand = tracked;
    void promise.then(
      () => { if (this.inFlightCommand?.promise === promise) this.inFlightCommand = null; },
      () => { if (this.inFlightCommand?.promise === promise) this.inFlightCommand = null; },
    );
    return promise;
  }

  private async dispatch(record: CommandRecord): Promise<LifecycleCommandOutcome> {
    if (this.disposed) return this.fail(record.event, record.commandId, { kind: "disposed" });

    record.attempts += 1;
    this.pendingCommand = record;
    this.lastCommandError = null;
    this.emit();

    try {
      const response = await this.session.pushCommand(record.event, record.payload);
      if (record.generation !== this.generation || this.disposed) {
        return { status: "failed", event: record.event, commandId: record.commandId, error: { kind: "disposed" } };
      }

      const result = record.event === "call:initiate"
        ? decodeInitiateReply(response)
        : decodeCommandReply(response);
      if (!result) {
        const error = { kind: "protocol_validation" as const };
        this.pendingCommand = null;
        if (record.event === "call:initiate") this.preparing = false;
        this.lastCommandError = error;
        this.emit();
        return { status: "failed", event: record.event, commandId: record.commandId, error };
      }

      this.pendingCommand = null;
      this.lastCommandError = null;
      if (record.event === "call:initiate") {
        const initiateResult = result as InitiateResult;
        this.controlledCallId = initiateResult.call_id;
      }
      this.emit();
      return {
        status: "acknowledged",
        event: record.event,
        commandId: record.commandId,
        result,
      };
    } catch (error) {
      if (record.generation !== this.generation || this.disposed) {
        return { status: "failed", event: record.event, commandId: record.commandId, error: { kind: "disposed" } };
      }
      const mapped = mapTransportError(error);
      if (this.authoritativelyAdvancedCommands.delete(record.commandId)) {
        return { status: "failed", event: record.event, commandId: record.commandId, error: mapped };
      }
      if (mapped.kind !== "transport_timeout" && mapped.kind !== "transport_error") {
        this.pendingCommand = null;
      }
      if (record.event === "call:initiate") {
        this.preparing = false;
      }
      this.lastCommandError = mapped;
      this.emit();
      return { status: "failed", event: record.event, commandId: record.commandId, error: mapped };
    }
  }

  private fail(
    event: DirectedCallLifecycleEvent | "call:initiate",
    commandId: string | null,
    error: ControllerCommandError,
  ): LifecycleCommandOutcome {
    this.lastCommandError = error;
    this.emit();
    return { status: "failed", event, commandId, error };
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
