import { describe, expect, it, vi } from "vitest";
import {
  CallAuthorityOwnership,
  resolveCallAuthorityScope,
  type BroadcastChannelLike,
  type LockManagerLike,
  type NativeCallAuthorityLike,
} from "./callAuthorityOwnership";

const DEVICE_A = "11111111-1111-4111-8111-111111111111";
const DEVICE_B = "22222222-2222-4222-8222-222222222222";
const USER_A = "33333333-3333-4333-8333-333333333333";
const USER_B = "44444444-4444-4444-8444-444444444444";

function createLocks() {
  const held = new Set<string>();
  const locks: LockManagerLike = {
    request: vi.fn(async (name, _options, callback) => {
      if (held.has(name)) return callback(null);
      held.add(name);
      try {
        return await callback({ name });
      } finally {
        held.delete(name);
      }
    }),
  };
  return { locks, isHeld: (name?: string) => name ? held.has(name) : held.size > 0 };
}

function createChannels() {
  const channels: BroadcastChannelLike[] = [];
  return {
    create: () => {
      let channel!: BroadcastChannelLike;
      channel = {
        onmessage: null,
        postMessage(message) {
          channels.filter((candidate) => candidate !== channel).forEach((candidate) => candidate.onmessage?.({ data: message }));
        },
        close() {
          const index = channels.indexOf(channel);
          if (index >= 0) channels.splice(index, 1);
        },
      };
      channels.push(channel);
      return channel;
    },
  };
}

function options(locks: LockManagerLike | null, deviceId = DEVICE_A, publicUserRef = USER_A) {
  return {
    mode: "persistent" as const,
    publicUserRef,
    numericUserId: 1,
    deviceId,
    locks,
    retryDelayMs: 250,
  };
}

describe("CallAuthorityOwnership", () => {
  it("builds profile/device-scoped keys and rejects invalid persistent identity", () => {
    expect(resolveCallAuthorityScope(options({ request: vi.fn() }))).toMatchObject({
      profileScope: `public:${USER_A}`,
      key: `vetra:call-authority:public:${USER_A}:${DEVICE_A}`,
    });
    expect(resolveCallAuthorityScope(options({ request: vi.fn() }, DEVICE_A, "numeric-user"))).toBeNull();
    expect(resolveCallAuthorityScope({ ...options({ request: vi.fn() }), mode: "disabled", publicUserRef: USER_A })).toBeNull();
  });

  it("allows only one owner for a scope", async () => {
    const { locks } = createLocks();
    const first = new CallAuthorityOwnership({ ...options(locks), ownerId: "owner-a" });
    const second = new CallAuthorityOwnership({ ...options(locks), ownerId: "owner-b" });
    await expect(first.acquire()).resolves.toMatchObject({ state: "owner" });
    await expect(second.acquire()).resolves.toMatchObject({ state: "non_owner" });
    expect(first.getSnapshot().ownerId).not.toBe(second.getSnapshot().ownerId);
    await first.dispose();
    await second.dispose();
  });

  it("releases only after owner disposal", async () => {
    const { locks, isHeld } = createLocks();
    const owner = new CallAuthorityOwnership(options(locks));
    await owner.acquire();
    const order: string[] = [];
    await owner.release(() => {
      order.push("runtime-disposed");
      expect(isHeld()).toBe(true);
    });
    order.push("released");
    expect(order).toEqual(["runtime-disposed", "released"]);
    expect(isHeld()).toBe(false);
  });

  it("permits a second owner after clean release", async () => {
    const { locks } = createLocks();
    const first = new CallAuthorityOwnership(options(locks));
    const second = new CallAuthorityOwnership(options(locks));
    await first.acquire();
    await second.acquire();
    expect(second.getSnapshot().state).toBe("non_owner");
    await first.dispose();
    await expect(second.acquire()).resolves.toMatchObject({ state: "owner" });
    await second.dispose();
  });

  it("does not expire a healthy owner after timers advance", async () => {
    vi.useFakeTimers();
    try {
      const { locks } = createLocks();
      const owner = new CallAuthorityOwnership(options(locks));
      await owner.acquire();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(owner.getSnapshot().state).toBe("owner");
      await owner.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("cannot be made owner by an advisory message", async () => {
    const { locks } = createLocks();
    const channels = createChannels();
    const first = new CallAuthorityOwnership({ ...options(locks), createBroadcastChannel: channels.create });
    const second = new CallAuthorityOwnership({ ...options(locks), createBroadcastChannel: channels.create });
    await first.acquire();
    await second.acquire();
    expect(second.getSnapshot().state).toBe("non_owner");
    await first.dispose();
    expect(second.getSnapshot().state).toBe("non_owner");
    await second.dispose();
  });

  it("retries a non-owner after an advisory release", async () => {
    vi.useFakeTimers();
    try {
      const { locks } = createLocks();
      const channels = createChannels();
      const first = new CallAuthorityOwnership({ ...options(locks), createBroadcastChannel: channels.create });
      const second = new CallAuthorityOwnership({ ...options(locks), createBroadcastChannel: channels.create, retryDelayMs: 250 });
      await first.acquire();
      await second.acquire();
      await first.dispose();
      await vi.advanceTimersByTimeAsync(250);
      expect(second.getSnapshot().state).toBe("owner");
      await second.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("works without BroadcastChannel and fails closed without Web Locks", async () => {
    const { locks } = createLocks();
    const owner = new CallAuthorityOwnership(options(locks, DEVICE_B));
    await expect(owner.acquire()).resolves.toMatchObject({ state: "owner" });
    await owner.dispose();

    const unavailable = new CallAuthorityOwnership({ ...options(locks), locks: null });
    await expect(unavailable.acquire()).resolves.toMatchObject({ state: "unavailable" });
    await unavailable.dispose();
  });

  it("requires both scoped native and Web Lock authority in Tauri", async () => {
    const owners = new Map<string, { window: string; leaseId: string }>();
    let nextLease = 0;
    const nativeAuthority = (window: string): NativeCallAuthorityLike => ({
      acquire: vi.fn(async (key) => {
        const current = owners.get(key);
        if (current && current.window !== window) return null;
        const leaseId = `${window}:${++nextLease}`;
        owners.set(key, { window, leaseId });
        return leaseId;
      }),
      release: vi.fn(async (key, leaseId) => {
        if (owners.get(key)?.leaseId === leaseId) owners.delete(key);
      }),
    });
    const firstNative = nativeAuthority("window-a");
    const secondNative = nativeAuthority("window-b");
    const { locks } = createLocks();
    const first = new CallAuthorityOwnership({ ...options(locks), nativeAuthority: firstNative, ownerId: "tauri-a" });
    const second = new CallAuthorityOwnership({ ...options(locks), nativeAuthority: secondNative, ownerId: "tauri-b" });

    await expect(first.acquire()).resolves.toMatchObject({ state: "owner" });
    await expect(second.acquire()).resolves.toMatchObject({ state: "non_owner" });
    await first.dispose();
    await expect(second.acquire()).resolves.toMatchObject({ state: "owner" });
    expect(firstNative.acquire).toHaveBeenCalledTimes(1);
    expect(secondNative.acquire).toHaveBeenCalledTimes(2);
    await second.dispose();
  });

  it("fails closed when native authority is present without Web Locks", async () => {
    const nativeAuthority: NativeCallAuthorityLike = {
      acquire: vi.fn(async () => "lease"),
      release: vi.fn(async () => true),
    };
    const owner = new CallAuthorityOwnership({ ...options(null), locks: null, nativeAuthority });
    await expect(owner.acquire()).resolves.toMatchObject({ state: "unavailable" });
    expect(nativeAuthority.acquire).not.toHaveBeenCalled();
    await owner.dispose();
  });

  it("releases a native lease when the Web Lock is unavailable", async () => {
    const nativeAuthority: NativeCallAuthorityLike = {
      acquire: vi.fn(async () => "native-lease"),
      release: vi.fn(async () => true),
    };
    const locks: LockManagerLike = {
      request: vi.fn(async (_name, _options, callback) => callback(null)),
    };
    const owner = new CallAuthorityOwnership({ ...options(locks), nativeAuthority });
    await expect(owner.acquire()).resolves.toMatchObject({ state: "non_owner" });
    expect(nativeAuthority.release).toHaveBeenCalledWith(owner.key, "native-lease");
    await owner.dispose();
  });

  it("retries a native non-owner after the actual lock is released without BroadcastChannel", async () => {
    vi.useFakeTimers();
    try {
      const { locks } = createLocks();
      const owners = new Map<string, string>();
      const nativeAuthority = (name: string): NativeCallAuthorityLike => ({
        acquire: vi.fn(async (key) => {
          if (owners.has(key)) return null;
          const lease = `${name}-lease`;
          owners.set(key, lease);
          return lease;
        }),
        release: vi.fn(async (key, lease) => {
          if (owners.get(key) === lease) owners.delete(key);
          return true;
        }),
      });
      const first = new CallAuthorityOwnership({ ...options(locks), nativeAuthority: nativeAuthority("first") });
      const second = new CallAuthorityOwnership({ ...options(locks), nativeAuthority: nativeAuthority("second"), createBroadcastChannel: () => null });
      await first.acquire();
      await expect(second.acquire()).resolves.toMatchObject({ state: "non_owner" });
      await first.dispose();
      await vi.advanceTimersByTimeAsync(250);
      expect(second.getSnapshot().state).toBe("owner");
      await second.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("schedules the retry only after a denied acquisition has fully settled", async () => {
    vi.useFakeTimers();
    try {
      const { locks } = createLocks();
      let resolveFirst!: (lease: string | null) => void;
      let attempts = 0;
      const nativeAuthority: NativeCallAuthorityLike = {
        acquire: vi.fn(() => {
          attempts += 1;
          return attempts === 1
            ? new Promise<string | null>((resolve) => { resolveFirst = resolve; })
            : Promise.resolve(null);
        }),
        release: vi.fn(async () => true),
      };
      const owner = new CallAuthorityOwnership({ ...options(locks), nativeAuthority, createBroadcastChannel: () => null });
      const acquisition = owner.acquire();
      resolveFirst(null);
      await expect(acquisition).resolves.toMatchObject({ state: "non_owner" });
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(250);
      expect(nativeAuthority.acquire).toHaveBeenCalledTimes(2);
      await owner.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry after a native acquisition error", async () => {
    vi.useFakeTimers();
    try {
      const { locks } = createLocks();
      const nativeAuthority: NativeCallAuthorityLike = {
        acquire: vi.fn(async () => { throw new Error("native unavailable"); }),
        release: vi.fn(async () => true),
      };
      const owner = new CallAuthorityOwnership({ ...options(locks), nativeAuthority, createBroadcastChannel: () => null });
      await expect(owner.acquire()).resolves.toMatchObject({ state: "unavailable" });
      await vi.advanceTimersByTimeAsync(5_000);
      expect(nativeAuthority.acquire).toHaveBeenCalledTimes(1);
      await owner.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("records a redacted native lifecycle timeline", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const nativeAuthority: NativeCallAuthorityLike = {
      acquire: vi.fn(async () => "window-a:lease-secret"),
      release: vi.fn(async () => true),
      snapshot: vi.fn(async () => ({ present: true, keyHash: "safe", leaseSuffix: "secret", windowLabel: "window-a" })),
    };
    const { locks } = createLocks();
    const owner = new CallAuthorityOwnership({ ...options(locks), nativeAuthority });
    owner.setTraceContext(7, "window-a");
    await owner.acquire();
    await owner.dispose();

    const events = owner.getTraceSnapshot().events;
    expect(events.map((event) => event.event)).toEqual(expect.arrayContaining([
      "acquire_requested", "rust_acquire_received", "rust_acquire_granted",
      "acquire_promise_resolved", "release_requested", "rust_release_received",
      "rust_release_accepted", "frontend_state_released", "native_holder_snapshot",
    ]));
    expect(events.every((event) => !JSON.stringify(event).includes(owner.key!))).toBe(true);
    expect(events.every((event) => !JSON.stringify(event).includes("lease-secret"))).toBe(true);
    expect(info).toHaveBeenCalledWith("[persistent-call-ownership-trace]", expect.any(Object));
  });

  it("does not let a stale native release remove a newer lease", async () => {
    const owners = new Map<string, string>();
    let nextLease = 0;
    const nativeAuthority = (window: string): NativeCallAuthorityLike => ({
      acquire: vi.fn(async (key) => {
        const leaseId = `${window}:${++nextLease}`;
        owners.set(key, leaseId);
        return leaseId;
      }),
      release: vi.fn(async (key, leaseId) => {
        if (owners.get(key) === leaseId) owners.delete(key);
      }),
    });
    const first = nativeAuthority("window-a");
    const second = nativeAuthority("window-a");
    const key = `vetra:call-authority:${USER_A}:${DEVICE_A}`;
    const oldLease = await first.acquire(key);
    const liveLease = await second.acquire(key);
    expect(oldLease).toBe("window-a:1");
    expect(liveLease).toBe("window-a:2");
    await first.release(key, oldLease!);
    expect(owners.get(key)).toBe("window-a:2");
    await second.release(key, liveLease!);
  });

  it("releases a native lease that completes after its frontend generation was disposed", async () => {
    let resolveAcquire!: (leaseId: string) => void;
    let releasedLease: string | null = null;
    const nativeAuthority: NativeCallAuthorityLike = {
      acquire: vi.fn(() => new Promise<string>((resolve) => {
        resolveAcquire = resolve;
      })),
      release: vi.fn(async (_key, leaseId) => {
        releasedLease = leaseId;
      }),
    };
    const { locks } = createLocks();
    const stale = new CallAuthorityOwnership({ ...options(locks), nativeAuthority });
    const acquisition = stale.acquire();
    await stale.dispose();
    resolveAcquire("stale-lease");
    await acquisition;

    expect(releasedLease).toBe("stale-lease");
    expect(stale.getSnapshot().state).toBe("released");
  });

  it("cleans listeners and retry timers on disposal", async () => {
    vi.useFakeTimers();
    try {
      const { locks } = createLocks();
      const target = new EventTarget();
      const owner = new CallAuthorityOwnership({
        ...options(locks),
        eventTarget: target,
      });
      await owner.acquire();
      await owner.dispose();
      target.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(1_000);
      expect(owner.getSnapshot().state).toBe("released");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not block different profiles or devices", async () => {
    const { locks } = createLocks();
    const profileB = new CallAuthorityOwnership(options(locks, DEVICE_A, USER_B));
    const deviceB = new CallAuthorityOwnership(options(locks, DEVICE_B, USER_A));
    await expect(profileB.acquire()).resolves.toMatchObject({ state: "owner" });
    await expect(deviceB.acquire()).resolves.toMatchObject({ state: "owner" });
    await profileB.dispose();
    await deviceB.dispose();
  });
});
