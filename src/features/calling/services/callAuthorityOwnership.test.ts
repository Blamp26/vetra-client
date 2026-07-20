import { describe, expect, it, vi } from "vitest";
import {
  CallAuthorityOwnership,
  resolveCallAuthorityScope,
  type BroadcastChannelLike,
  type LockManagerLike,
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

function options(locks: LockManagerLike, deviceId = DEVICE_A, publicUserRef = USER_A) {
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
    expect(resolveCallAuthorityScope({ ...options({ request: vi.fn() }), mode: "legacy", publicUserRef: null })).toMatchObject({
      profileScope: "numeric:1",
    });
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
