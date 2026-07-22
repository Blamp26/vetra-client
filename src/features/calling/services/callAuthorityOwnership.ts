import { createDirectedCallUuid } from "./directedCallDevice";
import { isUuid } from "../protocol/directedCallProtocol";
import type { CallRuntimeMode } from "./callRuntimeMode";
import { invoke } from "@tauri-apps/api/core";

export type CallAuthorityTraceEventName =
  | "boundary_mount" | "boundary_cleanup" | "ownership_generation_created"
  | "acquire_requested" | "rust_acquire_received" | "rust_acquire_granted"
  | "rust_acquire_denied" | "acquire_promise_resolved" | "frontend_owner_applied"
  | "frontend_owner_rejected_stale" | "release_scheduled" | "scheduled_release_cancelled"
  | "release_requested" | "rust_release_received" | "rust_release_accepted"
  | "rust_release_rejected" | "frontend_state_released" | "window_destroy_cleanup"
  | "native_holder_snapshot" | "runtime_start_requested" | "session_start_succeeded"
  | "runtime_start_succeeded" | "runtime_start_failed";

export type CallAuthorityDisposeReason =
  | "stale_generation"
  | "runtime_prerequisite_unavailable"
  | "runtime_generation_stale"
  | "runtime_start_failed"
  | "boundary_cleanup"
  | "unspecified";

export interface CallAuthorityTraceEvent {
  sequence: number;
  elapsedMs: number;
  event: CallAuthorityTraceEventName;
  frontendGeneration: number;
  windowLabel: string;
  ownershipKeyHash: string | null;
  leaseSuffix: string | null;
  reason: string | null;
  frontendState: CallAuthorityState;
  rustHolderPresent: boolean;
  outcome: "accepted" | "denied" | "stale" | "cancelled" | null;
  startupPhase?: "session_start" | "runtime_start";
  errorType?: string;
  errorMessage?: string;
}

export interface NativeHolderSnapshot {
  present: boolean;
  keyHash: string | null;
  leaseSuffix: string | null;
  windowLabel: string | null;
}

export interface CallAuthorityTraceSnapshot {
  events: CallAuthorityTraceEvent[];
  lastEvent: CallAuthorityTraceEvent | null;
  nativeHolderPresent: boolean;
}

export type CallAuthorityState =
  | "uninitialized"
  | "acquiring"
  | "owner"
  | "non_owner"
  | "unavailable"
  | "releasing"
  | "released";

export type CallAuthorityBackend = "web-locks" | "native" | "unavailable";

export interface CallAuthoritySnapshot {
  state: CallAuthorityState;
  key: string | null;
  ownerId: string;
}

export interface LockLike {
  name: string;
}

export interface LockManagerLike {
  request<T>(
    name: string,
    options: { mode: "exclusive"; ifAvailable: true },
    callback: (lock: LockLike | null) => Promise<T> | T,
  ): Promise<T>;
}

export interface BroadcastChannelLike {
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage(message: unknown): void;
  close(): void;
}

export interface NativeCallAuthorityLike {
  acquire(key: string): Promise<string | null>;
  release(key: string, leaseId: string): Promise<void | boolean>;
  snapshot?: (key: string) => Promise<NativeHolderSnapshot>;
}

export interface CallAuthorityOwnershipOptions {
  mode: CallRuntimeMode;
  publicUserRef?: string | null;
  numericUserId: number;
  deviceId: string;
  locks?: LockManagerLike | null;
  createBroadcastChannel?: (name: string) => BroadcastChannelLike | null;
  eventTarget?: Pick<Window, "addEventListener" | "removeEventListener">;
  ownerId?: string;
  retryDelayMs?: number;
  nativeAuthority?: NativeCallAuthorityLike | null;
}

export interface CallAuthorityScope {
  profileScope: string;
  key: string;
}

type Listener = (snapshot: CallAuthoritySnapshot) => void;
type OwnerAnnouncement =
  | { type: "owner_acquired"; key: string; owner_id: string }
  | { type: "owner_released"; key: string; owner_id: string };

function getDefaultLocks(): LockManagerLike | null {
  if (typeof navigator === "undefined" || !navigator.locks) return null;
  return navigator.locks as unknown as LockManagerLike;
}

function getDefaultBroadcastChannel(name: string): BroadcastChannelLike | null {
  if (typeof BroadcastChannel === "undefined") return null;
  return new BroadcastChannel(name) as unknown as BroadcastChannelLike;
}

function getDefaultEventTarget(): Pick<Window, "addEventListener" | "removeEventListener"> | undefined {
  return typeof window === "undefined" ? undefined : window;
}

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function getDefaultNativeAuthority(): NativeCallAuthorityLike | null {
  if (!isTauriRuntime()) return null;
  return {
    acquire: (key) => invoke<string | null>("acquire_call_authority", { key }),
    release: (key, leaseId) => invoke<boolean>("release_call_authority", { key, leaseId }),
    snapshot: (key) => invoke<NativeHolderSnapshot>("get_call_authority_snapshot", { key }),
  };
}

export function hashCallAuthorityKey(key: string): string {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function leaseSuffix(leaseId: string | null): string | null {
  return leaseId ? leaseId.slice(-8) : null;
}

export function resolveCallAuthorityScope(options: {
  mode: CallRuntimeMode;
  publicUserRef?: string | null;
  numericUserId: number;
  deviceId: string;
}): CallAuthorityScope | null {
  if (!isUuid(options.deviceId) || !Number.isSafeInteger(options.numericUserId) || options.numericUserId <= 0) return null;

  if (options.mode === "persistent") {
    if (!options.publicUserRef || !isUuid(options.publicUserRef)) return null;
    return {
      profileScope: `public:${options.publicUserRef.toLowerCase()}`,
      key: `vetra:call-authority:public:${options.publicUserRef.toLowerCase()}:${options.deviceId.toLowerCase()}`,
    };
  }

  if (options.mode !== "legacy") return null;
  const profileScope = options.publicUserRef && isUuid(options.publicUserRef)
    ? `public:${options.publicUserRef.toLowerCase()}`
    : `numeric:${options.numericUserId}`;
  return {
    profileScope,
    key: `vetra:call-authority:${profileScope}:${options.deviceId.toLowerCase()}`,
  };
}

export class CallAuthorityOwnership {
  readonly ownerId: string;
  readonly key: string | null;
  readonly backend: CallAuthorityBackend;

  private readonly locks: LockManagerLike | null;
  private readonly nativeAuthority: NativeCallAuthorityLike | null;
  private readonly createBroadcastChannel: (name: string) => BroadcastChannelLike | null;
  private readonly eventTarget?: Pick<Window, "addEventListener" | "removeEventListener">;
  private readonly retryDelayMs: number;
  private readonly listeners = new Set<Listener>();
  private snapshot: CallAuthoritySnapshot;
  private channel: BroadcastChannelLike | null = null;
  private holdResolve: (() => void) | null = null;
  private acquisitionPromise: Promise<CallAuthoritySnapshot> | null = null;
  private lockRequestPromise: Promise<unknown> | null = null;
  private nativeLeaseId: string | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private releasePromise: Promise<void> | null = null;
  private traceSequence = 0;
  private traceStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  private traceGeneration = 0;
  private traceWindowLabel = "unknown";
  private traceRustHolderPresent = false;
  private readonly traceEvents: CallAuthorityTraceEvent[] = [];
  private readonly traceListeners = new Set<(snapshot: CallAuthorityTraceSnapshot) => void>();

  constructor(options: CallAuthorityOwnershipOptions) {
    const scope = resolveCallAuthorityScope(options);
    this.ownerId = options.ownerId ?? createDirectedCallUuid();
    this.key = scope?.key ?? null;
    this.locks = options.locks === undefined ? getDefaultLocks() : options.locks;
    this.nativeAuthority = options.nativeAuthority === undefined
      ? options.locks === undefined ? getDefaultNativeAuthority() : null
      : options.nativeAuthority;
    this.backend = this.nativeAuthority ? "native" : this.locks ? "web-locks" : "unavailable";
    this.createBroadcastChannel = options.createBroadcastChannel ?? getDefaultBroadcastChannel;
    this.eventTarget = options.eventTarget ?? getDefaultEventTarget();
    this.retryDelayMs = Math.max(250, options.retryDelayMs ?? 2_000);
    this.snapshot = { state: "uninitialized", key: this.key, ownerId: this.ownerId };
  }

  getSnapshot(): CallAuthoritySnapshot {
    return this.snapshot;
  }

  setTraceContext(generation: number, windowLabel?: string): void {
    this.traceGeneration = generation;
    if (windowLabel) this.traceWindowLabel = windowLabel;
  }

  getTraceSnapshot(): CallAuthorityTraceSnapshot {
    return {
      events: [...this.traceEvents],
      lastEvent: this.traceEvents.length > 0 ? this.traceEvents[this.traceEvents.length - 1] : null,
      nativeHolderPresent: this.traceRustHolderPresent,
    };
  }

  subscribeTrace(listener: (snapshot: CallAuthorityTraceSnapshot) => void): () => void {
    this.traceListeners.add(listener);
    return () => this.traceListeners.delete(listener);
  }

  trace(event: CallAuthorityTraceEventName, details: Partial<Pick<CallAuthorityTraceEvent, "reason" | "outcome" | "leaseSuffix" | "rustHolderPresent" | "startupPhase" | "errorType" | "errorMessage">> = {}): void {
    if (!import.meta.env.DEV) return;
    const traceEvent: CallAuthorityTraceEvent = {
      sequence: ++this.traceSequence,
      elapsedMs: Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - this.traceStartedAt),
      event,
      frontendGeneration: this.traceGeneration,
      windowLabel: this.traceWindowLabel,
      ownershipKeyHash: this.key ? hashCallAuthorityKey(this.key) : null,
      leaseSuffix: details.leaseSuffix ?? leaseSuffix(this.nativeLeaseId),
      reason: details.reason ?? null,
      frontendState: this.snapshot.state,
      rustHolderPresent: details.rustHolderPresent ?? this.traceRustHolderPresent,
      outcome: details.outcome ?? null,
      startupPhase: details.startupPhase,
      errorType: details.errorType,
      errorMessage: details.errorMessage,
    };
    this.traceRustHolderPresent = traceEvent.rustHolderPresent;
    this.traceEvents.push(traceEvent);
    if (this.traceEvents.length > 20) this.traceEvents.shift();
    console.info("[persistent-call-ownership-trace]", traceEvent);
    const snapshot = this.getTraceSnapshot();
    this.traceListeners.forEach((listener) => listener(snapshot));
  }

  private async traceNativeSnapshot(reason: string): Promise<void> {
    if (!this.nativeAuthority?.snapshot) return;
    try {
      const snapshot = await this.nativeAuthority.snapshot(this.key!);
      if (snapshot.windowLabel) this.traceWindowLabel = snapshot.windowLabel;
      this.trace("native_holder_snapshot", {
        reason,
        leaseSuffix: snapshot.leaseSuffix,
        rustHolderPresent: snapshot.present,
      });
    } catch {
      this.trace("native_holder_snapshot", { reason: "snapshot_failed", rustHolderPresent: false });
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async acquire(): Promise<CallAuthoritySnapshot> {
    if (this.disposed) return this.snapshot;
    if (this.snapshot.state === "owner" || this.snapshot.state === "unavailable" || this.snapshot.state === "released") {
      return this.snapshot;
    }
    if (this.acquisitionPromise) return this.acquisitionPromise;

    this.trace("acquire_requested");
    this.setState("acquiring");
    if (!this.key || (!this.locks && !this.nativeAuthority)) {
      this.setState("unavailable");
      return this.snapshot;
    }

    this.openChannel();
    this.installRetryListeners();
    this.acquisitionPromise = new Promise<CallAuthoritySnapshot>((resolve) => {
      let settled = false;
      const settle = () => {
        if (settled) return;
        if (this.snapshot.state === "owner" || this.snapshot.state === "non_owner" || this.snapshot.state === "unavailable" || this.snapshot.state === "released") {
          settled = true;
          resolve(this.snapshot);
        }
      };

      const onAcquired = async (acquired: boolean | string | null) => {
        const acquiredOk = typeof acquired === "boolean" ? acquired : acquired !== null;
        if (!acquiredOk) {
          this.trace("rust_acquire_denied", { outcome: "denied", reason: "holder_present", rustHolderPresent: true });
          this.setState("non_owner");
          settle();
          return;
        }
        this.trace("rust_acquire_granted", { outcome: "accepted", leaseSuffix: typeof acquired === "string" ? leaseSuffix(acquired) : null, rustHolderPresent: true });
        if (this.disposed) {
          if (this.nativeAuthority && this.key && typeof acquired === "string") {
            await this.nativeAuthority.release(this.key, acquired);
          }
          settle();
          return;
        }
        this.nativeLeaseId = typeof acquired === "string" ? acquired : null;
        void this.traceNativeSnapshot("after_acquire");
        this.setState("owner");
        settle();
        this.channel?.postMessage({ type: "owner_acquired", key: this.key!, owner_id: this.ownerId } satisfies OwnerAnnouncement);
        await new Promise<void>((resolveHold) => {
          this.holdResolve = resolveHold;
        });
      };

      const request = this.nativeAuthority
        ? (this.trace("rust_acquire_received"), this.nativeAuthority.acquire(this.key!).then((leaseId) => onAcquired(leaseId)))
        : this.locks!.request(this.key!, { mode: "exclusive", ifAvailable: true }, async (lock) => {
            await onAcquired(Boolean(lock));
          });
      this.lockRequestPromise = request;
      request.catch(() => {
        if (!this.disposed) this.setState("unavailable");
        settle();
      });
    }).finally(() => {
      this.acquisitionPromise = null;
    });

    return this.acquisitionPromise.then((result) => {
      this.trace("acquire_promise_resolved", { outcome: result.state === "owner" ? "accepted" : "denied" });
      return result;
    });
  }

  async release(disposeOwner?: () => void | Promise<void>, reason: CallAuthorityDisposeReason = "unspecified"): Promise<void> {
    if (this.releasePromise) return this.releasePromise;
    this.releasePromise = (async () => {
      this.trace("release_requested", { reason });
      if (this.snapshot.state === "owner") {
        this.setState("releasing");
        await disposeOwner?.();
        this.holdResolve?.();
        this.holdResolve = null;
        await this.lockRequestPromise?.catch(() => undefined);
        this.lockRequestPromise = null;
        const nativeLeaseId = this.nativeLeaseId;
        this.nativeLeaseId = null;
        if (this.nativeAuthority && this.key && nativeLeaseId) {
          this.trace("rust_release_received", { leaseSuffix: leaseSuffix(nativeLeaseId) });
          const accepted = await this.nativeAuthority.release(this.key, nativeLeaseId);
          this.trace(accepted === false ? "rust_release_rejected" : "rust_release_accepted", {
            outcome: accepted === false ? "denied" : "accepted",
            rustHolderPresent: accepted === false,
            leaseSuffix: leaseSuffix(nativeLeaseId),
          });
          void this.traceNativeSnapshot("after_release");
        }
        this.channel?.postMessage({ type: "owner_released", key: this.key!, owner_id: this.ownerId } satisfies OwnerAnnouncement);
      }
      if (this.retryTimer) {
        clearTimeout(this.retryTimer);
        this.trace("scheduled_release_cancelled", { outcome: "cancelled", reason: "dispose" });
      }
      this.retryTimer = null;
      this.removeRetryListeners();
      this.channel?.close();
      this.channel = null;
      this.setState("released");
      this.trace("frontend_state_released");
    })();
    return this.releasePromise;
  }

  dispose(disposeOwner?: () => void | Promise<void>, reason: CallAuthorityDisposeReason = "unspecified"): Promise<void> {
    this.disposed = true;
    return this.release(disposeOwner, reason);
  }

  private openChannel(): void {
    if (!this.key || this.channel || !this.createBroadcastChannel) return;
    try {
      const channel = this.createBroadcastChannel(`vetra:call-authority:${this.key}`);
      if (!channel) return;
      this.channel = channel;
      channel.onmessage = (event) => {
        const message = event.data as Partial<OwnerAnnouncement> | null;
        if (message?.type === "owner_released" && message.key === this.key && message.owner_id !== this.ownerId) {
          this.scheduleRetry();
        }
      };
    } catch {
      this.channel = null;
    }
  }

  private installRetryListeners(): void {
    if (!this.eventTarget) return;
    ["visibilitychange", "pageshow", "focus"].forEach((event) => this.eventTarget!.addEventListener(event, this.retryFromLifecycle));
  }

  private removeRetryListeners(): void {
    if (!this.eventTarget) return;
    ["visibilitychange", "pageshow", "focus"].forEach((event) => this.eventTarget!.removeEventListener(event, this.retryFromLifecycle));
  }

  private readonly retryFromLifecycle = (): void => {
    if (this.snapshot.state !== "non_owner" || this.disposed) return;
    this.scheduleRetry();
  };

  private scheduleRetry(): void {
    if (this.retryTimer || this.acquisitionPromise || this.snapshot.state !== "non_owner" || this.disposed) return;
    this.trace("release_scheduled", { reason: "retry_after_owner_release" });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.acquisitionPromise = null;
      void this.acquire();
    }, this.retryDelayMs);
  }

  private setState(state: CallAuthorityState): void {
    this.snapshot = { ...this.snapshot, state };
    this.listeners.forEach((listener) => listener(this.snapshot));
  }
}
