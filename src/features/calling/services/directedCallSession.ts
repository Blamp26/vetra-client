import { Channel, Socket } from "phoenix";
import {
  DIRECTED_CALL_EVENTS,
  DIRECTED_CALL_TOPIC_PREFIX,
  buildJoin,
  buildSync,
  buildSignal,
  decodeSignal,
  decodeState,
  isUuid,
  type SignalEnvelope,
  type IcePayload,
  type SignalKind,
  type SignalPayload,
  type StateProjection,
} from "../protocol/directedCallProtocol";
import { getOrCreateDirectedCallDeviceId } from "./directedCallDevice";
import { recordDirectedCallDiagnostic } from "./directedCallDiagnostics";

type ProjectionListener = (
  projection: StateProjection,
  classification: "accepted" | "duplicate",
) => void;
type SignalListener = (signal: SignalEnvelope) => void;
type SyncListener = () => void;

export type StateApplyResult =
  | "accepted"
  | "stale"
  | "duplicate"
  | "conflict"
  | "malformed";

export interface DirectedCallSessionOptions {
  socket: Socket;
  publicUserRef: string;
  deviceId?: string;
  enabled?: boolean;
  trace?: DirectedCallSessionTrace;
  retry?: DirectedCallSessionRetryOptions;
}

export interface DirectedCallSessionRetryOptions {
  setTimeout?: (callback: () => void, delayMs: number) => ReturnType<typeof globalThis.setTimeout>;
  clearTimeout?: (timer: ReturnType<typeof globalThis.setTimeout>) => void;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export type DirectedCallSessionPhase =
  | "channel_creation"
  | "subscription_installation"
  | "channel_join_request"
  | "channel_join_acknowledgement"
  | "initial_request_sync"
  | "sync_acknowledgement";

export type DirectedCallSessionTrace = (
  event: "session_start_phase_started" | "session_start_phase_succeeded" | "session_start_phase_failed",
  details: {
    reason: string;
    sessionPhase: DirectedCallSessionPhase;
    errorCategory?: string;
    errorDetails?: string;
    serverErrorCode?: DirectedCallServerErrorCode;
  },
) => void;

export type DirectedCallServerErrorCode =
  | "invalid_request"
  | "unsupported_protocol"
  | "feature_disabled"
  | "unavailable"
  | "command_key_reused"
  | "deadline_expired"
  | "rate_limited"
  | "internal_error";

export type DirectedCallCommandTransportError =
  | { kind: "disposed" }
  | { kind: "rejected" }
  | { kind: "transport_timeout" }
  | { kind: "transport_error" };

export class DirectedCallSessionCommandError extends Error {
  readonly transport: DirectedCallCommandTransportError;

  constructor(transport: DirectedCallCommandTransportError) {
    super(transport.kind);
    this.name = "DirectedCallSessionCommandError";
    this.transport = transport;
  }
}

export interface DirectedCallProjectionStore {
  get(callId: string): StateProjection | null;
  getAll(): StateProjection[];
  apply(value: unknown): StateApplyResult;
  subscribe(listener: ProjectionListener): () => void;
  clear(): void;
}

function semanticallyEqual(left: StateProjection, right: StateProjection): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function compareProjection(left: StateProjection, right: StateProjection): number {
  return left.created_at.localeCompare(right.created_at) || left.call_id.localeCompare(right.call_id);
}

const SAFE_REJECTION_KEYS = ["status", "reason", "code", "event"] as const;
const SERVER_ERROR_CODES = new Set<DirectedCallServerErrorCode>([
  "invalid_request",
  "unsupported_protocol",
  "feature_disabled",
  "unavailable",
  "command_key_reused",
  "deadline_expired",
  "rate_limited",
  "internal_error",
]);

function describeRejection(value: unknown): { errorCategory: string; errorDetails: string; serverErrorCode?: DirectedCallServerErrorCode } {
  if (value instanceof Error) {
    return { errorCategory: value.name || "Error", errorDetails: "error_instance" };
  }
  if (value === null) return { errorCategory: "null", errorDetails: "null" };
  if (typeof value !== "object") return { errorCategory: typeof value, errorDetails: "primitive" };
  if (Array.isArray(value)) return { errorCategory: "array", errorDetails: "array_value" };

  const record = value as Record<string, unknown>;
  const nestedError = record.error;
  const serverErrorCode =
    typeof nestedError === "object" && nestedError !== null && !Array.isArray(nestedError) && SERVER_ERROR_CODES.has((nestedError as Record<string, unknown>).code as DirectedCallServerErrorCode)
      ? (nestedError as Record<string, unknown>).code as DirectedCallServerErrorCode
      : undefined;
  const keys = Object.keys(record).sort().slice(0, 12);
  const safeFields = SAFE_REJECTION_KEYS.flatMap((key) => {
    const field = record[key];
    if (typeof field === "string" && field.length > 0) {
      return [`${key}=${field.replace(/[^A-Za-z0-9._:/ -]/g, "").slice(0, 64)}`];
    }
    if (typeof field === "number" || typeof field === "boolean") return [`${key}=${String(field)}`];
    return [];
  });
  return {
    errorCategory: "plain_object",
    errorDetails: [`keys=${keys.join(",") || "none"}`, ...safeFields].join("; "),
    serverErrorCode,
  };
}

export function createDirectedCallProjectionStore(
  onConflict?: (callId: string) => void,
): DirectedCallProjectionStore {
  const projections = new Map<string, StateProjection>();
  const listeners = new Set<ProjectionListener>();
  const repairRequested = new Set<string>();

  return {
    get(callId) {
      return projections.get(callId) ?? null;
    },

    getAll() {
      return Array.from(projections.values());
    },

    apply(value) {
      const next = decodeState(value);
      if (!next) return "malformed";

      const previous = projections.get(next.call_id);
      if (!previous || next.state_version > previous.state_version) {
        projections.set(next.call_id, next);
        repairRequested.delete(next.call_id);
        listeners.forEach((listener) => listener(next, "accepted"));
        return "accepted";
      }

      if (next.state_version < previous.state_version) return "stale";
      if (semanticallyEqual(previous, next)) return "duplicate";

      if (!repairRequested.has(next.call_id)) {
        repairRequested.add(next.call_id);
        onConflict?.(next.call_id);
      }
      return "conflict";
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    clear() {
      projections.clear();
      repairRequested.clear();
    },
  };
}

function decodeSyncResponse(
  value: unknown,
): { requestId: string; calls: StateProjection[] } | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    (value as Record<string, unknown>).protocol_version !== 1 ||
    (value as Record<string, unknown>).status !== "ok" ||
    !isUuid((value as Record<string, unknown>).request_id) ||
    !Array.isArray((value as Record<string, unknown>).calls) ||
    (value as { calls: unknown[] }).calls.length > 16
  ) {
    return null;
  }

  const calls = (value as { calls: unknown[] }).calls
    .map((call) => decodeState(call))
    .filter((call): call is StateProjection => call !== null);
  if (calls.length !== (value as { calls: unknown[] }).calls.length) return null;

  return {
    requestId: (value as { request_id: string }).request_id,
    calls,
  };
}

export class DirectedCallSession {
  readonly deviceId: string;
  readonly publicUserRef: string;
  readonly topic: string;
  readonly projections: DirectedCallProjectionStore;

  private readonly socket: Socket;
  private readonly enabled: boolean;
  private readonly trace?: DirectedCallSessionTrace;
  private readonly retry: Required<DirectedCallSessionRetryOptions>;
  private channel: Channel | null = null;
  private disposed = false;
  private socketAvailable = true;
  private generation = 0;
  private syncInFlight: Promise<void> | null = null;
  private retryTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  private retryAttempt = 0;
  private readonly projectionListeners = new Set<ProjectionListener>();
  private readonly signalListeners = new Set<SignalListener>();
  private readonly syncListeners = new Set<SyncListener>();
  private readonly channelRefs: Array<{ event: string; ref: number }> = [];
  private socketOpenRef: string | null = null;
  private socketCloseRef: string | null = null;

  constructor(options: DirectedCallSessionOptions) {
    this.socket = options.socket;
    this.publicUserRef = options.publicUserRef;
    this.deviceId = options.deviceId ?? getOrCreateDirectedCallDeviceId();
    this.topic = DIRECTED_CALL_TOPIC_PREFIX + this.publicUserRef;
    this.enabled = options.enabled ?? false;
    this.trace = options.trace;
    this.retry = {
      setTimeout: options.retry?.setTimeout ?? ((callback, delayMs) => globalThis.setTimeout(callback, delayMs)),
      clearTimeout: options.retry?.clearTimeout ?? ((timer) => globalThis.clearTimeout(timer)),
      baseDelayMs: options.retry?.baseDelayMs ?? 100,
      maxDelayMs: options.retry?.maxDelayMs ?? 2000,
    };
    this.projections = createDirectedCallProjectionStore((callId) => {
      void this.requestSync(callId);
    });
    this.projections.subscribe((projection, classification) => {
      this.projectionListeners.forEach((listener) => listener(projection, classification));
    });
  }

  async start(): Promise<boolean> {
    if (!this.enabled || this.disposed || !this.publicUserRef) return false;

    if (this.channel) return true;
    this.trace?.("session_start_phase_started", { reason: "channel_creation", sessionPhase: "channel_creation" });
    try {
      this.createChannel();
      this.trace?.("session_start_phase_succeeded", { reason: "channel_creation", sessionPhase: "channel_creation" });
    } catch (error) {
      const details = describeRejection(error);
      this.trace?.("session_start_phase_failed", { reason: "channel_creation", sessionPhase: "channel_creation", ...details });
      throw error;
    }

    this.trace?.("session_start_phase_started", { reason: "subscription_installation", sessionPhase: "subscription_installation" });
    try {
      this.socketOpenRef = this.socket.onOpen(() => {
        const wasAvailable = this.socketAvailable;
        this.socketAvailable = true;
        recordDirectedCallDiagnostic("socket", { socket: "connected" });
        if (!wasAvailable || typeof this.socket.onClose !== "function") void this.recoverConnection();
      });
      if (typeof this.socket.onClose === "function") {
        this.socketCloseRef = this.socket.onClose(() => {
          this.socketAvailable = false;
          this.cancelRetry();
          recordDirectedCallDiagnostic("socket", { socket: "disconnected" });
        });
      }
      this.trace?.("session_start_phase_succeeded", { reason: "subscription_installation", sessionPhase: "subscription_installation" });
    } catch (error) {
      const details = describeRejection(error);
      this.trace?.("session_start_phase_failed", { reason: "subscription_installation", sessionPhase: "subscription_installation", ...details });
      throw error;
    }

    this.trace?.("session_start_phase_started", { reason: "channel_join_request", sessionPhase: "channel_join_request" });
    try {
      this.trace?.("session_start_phase_started", { reason: "channel_join_acknowledgement", sessionPhase: "channel_join_acknowledgement" });
      await this.joinChannel(this.generation);
      this.trace?.("session_start_phase_succeeded", { reason: "channel_join_acknowledgement", sessionPhase: "channel_join_acknowledgement" });
      this.generation += 1;
      this.retryAttempt = 0;
      this.trace?.("session_start_phase_succeeded", { reason: "channel_join_request", sessionPhase: "channel_join_request" });
    } catch (error) {
      this.trace?.("session_start_phase_failed", { reason: "channel_join_acknowledgement", sessionPhase: "channel_join_acknowledgement", ...describeRejection(error) });
      this.scheduleRetry(this.generation);
      this.trace?.("session_start_phase_failed", { reason: "channel_join_request", sessionPhase: "channel_join_request", ...describeRejection(error) });
      throw error;
    }

    this.trace?.("session_start_phase_started", { reason: "initial_request_sync", sessionPhase: "initial_request_sync" });
    try {
      await this.requestSync(undefined, true);
      this.trace?.("session_start_phase_succeeded", { reason: "initial_request_sync", sessionPhase: "initial_request_sync" });
    } catch (error) {
      const details = describeRejection(error);
      this.trace?.("session_start_phase_failed", { reason: "initial_request_sync", sessionPhase: "initial_request_sync", ...details });
      throw error;
    }
    recordDirectedCallDiagnostic("socket", { socket: "connected" });
    return true;
  }

  private createChannel(): void {
    this.channel = this.socket.channel(this.topic, { ...buildJoin(this.deviceId) });
    this.channelRefs.push(
      { event: DIRECTED_CALL_EVENTS.state, ref: this.channel.on(DIRECTED_CALL_EVENTS.state, (payload) => { this.projections.apply(payload); }) },
      {
        event: DIRECTED_CALL_EVENTS.signal,
        ref: this.channel.on(DIRECTED_CALL_EVENTS.signal, (payload) => {
          const signal = decodeSignal(payload);
          if (!signal) return;
          this.signalListeners.forEach((listener) => listener(signal));
        }),
      },
    );
  }

  private async joinChannel(generation: number): Promise<void> {
    const channel = this.channel;
    if (!channel || this.disposed || generation !== this.generation || !this.socketAvailable) return;
    await new Promise<void>((resolve, reject) => {
      channel
        .join()
        .receive("ok", () => {
          if (this.disposed || generation !== this.generation || !this.socketAvailable) {
            reject(new Error("Stale directed-call topic join acknowledgement"));
            return;
          }
          resolve();
        })
        .receive("error", reject)
        .receive("timeout", () => reject(new Error("Directed-call topic join timed out")));
    });
  }

  private async recoverConnection(): Promise<void> {
    if (this.disposed || !this.socketAvailable) return;
    const generation = ++this.generation;
    this.cancelRetry();
    this.channelRefs.forEach(({ event, ref }) => this.channel?.off(event, ref));
    this.channel?.leave();
    this.channelRefs.length = 0;
    this.createChannel();
    const channel = this.channel;
    if (!channel) return;
    channel
      .join()
      .receive("ok", () => {
        if (this.disposed || generation !== this.generation || !this.socketAvailable) return;
        void this.requestSync().catch(() => undefined);
      })
      .receive("error", () => this.scheduleRetry(generation))
      .receive("timeout", () => this.scheduleRetry(generation));
  }

  private scheduleRetry(generation: number): void {
    if (this.retryTimer || this.disposed || generation !== this.generation || !this.socketAvailable) return;
    const delay = Math.min(this.retry.maxDelayMs, this.retry.baseDelayMs * 2 ** this.retryAttempt);
    this.retryAttempt = Math.min(this.retryAttempt + 1, 31);
    this.retryTimer = this.retry.setTimeout(() => {
      this.retryTimer = null;
      if (this.disposed || generation !== this.generation || !this.socketAvailable) return;
      void this.recoverConnection();
    }, delay);
  }

  private cancelRetry(): void {
    if (this.retryTimer !== null) this.retry.clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  getProjection(callId: string): StateProjection | null {
    return this.projections.get(callId);
  }

  getProjections(): StateProjection[] {
    return this.projections.getAll();
  }

  subscribeToProjections(listener: ProjectionListener): () => void {
    this.projectionListeners.add(listener);
    return () => this.projectionListeners.delete(listener);
  }

  subscribeToSignals(listener: SignalListener): () => void {
    this.signalListeners.add(listener);
    return () => this.signalListeners.delete(listener);
  }

  sendSignal(
    callId: string,
    signalId: string,
    kind: SignalKind,
    payload: SignalPayload | IcePayload,
  ): Promise<unknown> {
    return this.pushCommand(
      DIRECTED_CALL_EVENTS.signal,
      buildSignal(callId, signalId, this.deviceId, kind, payload),
    );
  }

  subscribeToSync(listener: SyncListener): () => void {
    this.syncListeners.add(listener);
    return () => this.syncListeners.delete(listener);
  }

  pushCommand(event: string, payload: unknown): Promise<unknown> {
    if (!this.channel || this.disposed) {
      return Promise.reject(
        new DirectedCallSessionCommandError({ kind: "disposed" }),
      );
    }

    return new Promise<unknown>((resolve, reject) => {
      this.channel!
        .push(event, payload as Record<string, unknown>)
        .receive("ok", resolve)
        .receive("error", () =>
          reject(
            new DirectedCallSessionCommandError({ kind: "rejected" }),
          ),
        )
        .receive("timeout", () =>
          reject(
            new DirectedCallSessionCommandError({ kind: "transport_timeout" }),
          ),
        );
    });
  }

  async requestSync(_repairCallId?: string, traceStartupPhase = false): Promise<void> {
    if (!this.channel || this.disposed || !this.socketAvailable) return;
    if (this.syncInFlight) {
      return this.syncInFlight;
    }

    const generation = this.generation;
    const run = async (): Promise<void> => {
      const requestId = crypto.randomUUID();
      const payload = buildSync(
        requestId,
        this.deviceId,
        this.getProjections().slice(0, 16).map(({ call_id, state_version }) => ({ call_id, state_version })),
      );
      await new Promise<void>((resolve, reject) => {
        if (traceStartupPhase) this.trace?.("session_start_phase_started", { reason: "sync_acknowledgement", sessionPhase: "sync_acknowledgement" });
        this.channel!
          .push(DIRECTED_CALL_EVENTS.sync, payload)
          .receive("ok", (response: unknown) => {
            if (this.disposed || generation !== this.generation || !this.socketAvailable) {
              resolve();
              return;
            }
            const decoded = decodeSyncResponse(response);
            if (!decoded || decoded.requestId !== requestId) {
              const error = new Error("Invalid directed-call sync response");
              if (traceStartupPhase) this.trace?.("session_start_phase_failed", { reason: "sync_acknowledgement", sessionPhase: "sync_acknowledgement", ...describeRejection(error) });
              reject(error);
              return;
            }
            decoded.calls.sort(compareProjection).forEach((projection) => this.projections.apply(projection));
            this.retryAttempt = 0;
            this.syncListeners.forEach((listener) => listener());
            if (traceStartupPhase) this.trace?.("session_start_phase_succeeded", { reason: "sync_acknowledgement", sessionPhase: "sync_acknowledgement" });
            resolve();
          })
          .receive("error", reject)
          .receive("timeout", () => reject(new Error("Directed-call sync timed out")));
      });
    };

    this.syncInFlight = run();
    try {
      await this.syncInFlight;
    } catch (error) {
      this.scheduleRetry(generation);
      throw error;
    } finally {
      this.syncInFlight = null;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelRetry();
    this.generation += 1;
    if (this.socketOpenRef !== null) this.socket.off([this.socketOpenRef]);
    if (this.socketCloseRef !== null) this.socket.off([this.socketCloseRef]);
    this.channelRefs.forEach(({ event, ref }) => this.channel?.off(event, ref));
    this.channel?.leave();
    this.channel = null;
    this.projectionListeners.clear();
    this.signalListeners.clear();
    this.syncListeners.clear();
    this.projections.clear();
  }
}
