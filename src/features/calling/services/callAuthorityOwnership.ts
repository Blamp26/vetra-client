import { createDirectedCallUuid } from "./directedCallDevice";
import { isUuid } from "../protocol/directedCallProtocol";
import type { CallRuntimeMode } from "./callRuntimeMode";
import { invoke } from "@tauri-apps/api/core";

export type CallAuthorityState =
  | "uninitialized"
  | "acquiring"
  | "owner"
  | "non_owner"
  | "unavailable"
  | "releasing"
  | "released";

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
  acquire(key: string): Promise<boolean>;
  release(key: string): Promise<void>;
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

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function getDefaultNativeAuthority(): NativeCallAuthorityLike | null {
  if (!isTauriRuntime()) return null;
  return {
    acquire: (key) => invoke<boolean>("acquire_call_authority", { key }),
    release: (key) => invoke<void>("release_call_authority", { key }),
  };
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
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private releasePromise: Promise<void> | null = null;

  constructor(options: CallAuthorityOwnershipOptions) {
    const scope = resolveCallAuthorityScope(options);
    this.ownerId = options.ownerId ?? createDirectedCallUuid();
    this.key = scope?.key ?? null;
    this.locks = options.locks === undefined ? getDefaultLocks() : options.locks;
    this.nativeAuthority = options.nativeAuthority === undefined
      ? options.locks === undefined ? getDefaultNativeAuthority() : null
      : options.nativeAuthority;
    this.createBroadcastChannel = options.createBroadcastChannel ?? getDefaultBroadcastChannel;
    this.eventTarget = options.eventTarget ?? getDefaultEventTarget();
    this.retryDelayMs = Math.max(250, options.retryDelayMs ?? 2_000);
    this.snapshot = { state: "uninitialized", key: this.key, ownerId: this.ownerId };
  }

  getSnapshot(): CallAuthoritySnapshot {
    return this.snapshot;
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

      const onAcquired = async (acquired: boolean) => {
        if (!acquired) {
          this.setState("non_owner");
          settle();
          return;
        }
        if (this.disposed) {
          if (this.nativeAuthority && this.key) {
            await this.nativeAuthority.release(this.key);
          }
          settle();
          return;
        }
        this.setState("owner");
        settle();
        this.channel?.postMessage({ type: "owner_acquired", key: this.key!, owner_id: this.ownerId } satisfies OwnerAnnouncement);
        await new Promise<void>((resolveHold) => {
          this.holdResolve = resolveHold;
        });
      };

      const request = this.nativeAuthority
        ? this.nativeAuthority.acquire(this.key!).then((acquired) => onAcquired(acquired))
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

    return this.acquisitionPromise;
  }

  async release(disposeOwner?: () => void | Promise<void>): Promise<void> {
    if (this.releasePromise) return this.releasePromise;
    this.releasePromise = (async () => {
      if (this.snapshot.state === "owner") {
        this.setState("releasing");
        await disposeOwner?.();
        this.holdResolve?.();
        this.holdResolve = null;
        await this.lockRequestPromise?.catch(() => undefined);
        this.lockRequestPromise = null;
        if (this.nativeAuthority && this.key) {
          await this.nativeAuthority.release(this.key);
        }
        this.channel?.postMessage({ type: "owner_released", key: this.key!, owner_id: this.ownerId } satisfies OwnerAnnouncement);
      }
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.retryTimer = null;
      this.removeRetryListeners();
      this.channel?.close();
      this.channel = null;
      this.setState("released");
    })();
    return this.releasePromise;
  }

  dispose(disposeOwner?: () => void | Promise<void>): Promise<void> {
    this.disposed = true;
    return this.release(disposeOwner);
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
