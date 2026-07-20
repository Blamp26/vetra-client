import {
  CANONICAL_STATES,
  buildCommand,
  buildInitiate,
  isUuid,
  type CanonicalState,
  type CommandResult,
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
  | "call:begin_connecting";

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
  private preparing = false;
  private controlledCallId: string | null = null;
  private pendingCommand: CommandRecord | null = null;
  private lastCommandError: ControllerCommandError | null = null;
  private disposed = false;
  private generation = 0;

  constructor(session: DirectedCallSessionPort) {
    this.session = session;
    this.unsubscribeProjection = session.subscribeToProjections((projection) => {
      if (!this.controlledCallId && !this.preparing) {
        this.controlledCallId = projection.call_id;
      }
      if (projection.call_id === this.controlledCallId) {
        this.preparing = false;
      }
      this.emit();
    });
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

    this.preparing = true;
    this.controlledCallId = null;
    this.lastCommandError = null;
    return this.dispatch({
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

  retryPendingCommand(): Promise<LifecycleCommandOutcome> {
    if (this.disposed) return Promise.resolve(this.fail("call:hangup", null, { kind: "disposed" }));
    if (!this.pendingCommand) {
      return Promise.resolve(this.fail("call:hangup", null, { kind: "retry_exhausted" }));
    }
    if (this.pendingCommand.attempts >= MAX_EXPLICIT_ATTEMPTS) {
      return Promise.resolve(this.fail(this.pendingCommand.event, this.pendingCommand.commandId, { kind: "retry_exhausted" }));
    }

    if (this.pendingCommand.event === "call:initiate") {
      this.preparing = true;
    }
    return this.dispatch({
      ...this.pendingCommand,
      generation: this.generation,
    });
  }

  cancelPreparing(): void {
    if (!this.preparing) return;
    this.generation += 1;
    this.preparing = false;
    this.pendingCommand = null;
    this.lastCommandError = null;
    this.emit();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.preparing = false;
    this.controlledCallId = null;
    this.pendingCommand = null;
    this.lastCommandError = null;
    this.unsubscribeProjection();
    this.listeners.clear();
  }

  private command(event: DirectedCallLifecycleEvent, callId: string): Promise<LifecycleCommandOutcome> {
    let commandId: string;
    let payload: unknown;
    try {
      commandId = createDirectedCallUuid();
      payload = buildCommand(callId, commandId, this.session.deviceId);
    } catch {
      return Promise.resolve(this.fail(event, null, { kind: "protocol_validation" }));
    }

    return this.dispatch({
      event,
      callId,
      commandId,
      attempts: 0,
      payload,
      generation: this.generation,
    });
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
        return this.fail(record.event, record.commandId, { kind: "disposed" });
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
        if (initiateResult.state === "unavailable" || this.session.getProjection(initiateResult.call_id)) {
          this.preparing = false;
        }
      }
      this.emit();
      return {
        status: "acknowledged",
        event: record.event,
        commandId: record.commandId,
        result,
      };
    } catch (error) {
      const mapped = mapTransportError(error);
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
