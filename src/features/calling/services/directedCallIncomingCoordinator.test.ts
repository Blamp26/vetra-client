import { describe, expect, it, vi } from "vitest";
import type { StateProjection } from "../protocol/directedCallProtocol";
import {
  DirectedCallIncomingCoordinator,
  type DirectedCallIncomingControllerPort,
} from "./directedCallIncomingCoordinator";
import type {
  DirectedCallControllerSnapshot,
  DirectedCallSessionPort,
  LifecycleCommandOutcome,
  PendingLifecycleCommand,
} from "./directedCallLifecycleController";

const CALL_ID = "11111111-1111-4111-8111-111111111111";
const DEVICE_ID = "22222222-2222-4222-8222-222222222222";
const PEER_ID = "33333333-3333-4333-8333-333333333333";

function projection(state: StateProjection["state"], version = 1, role: StateProjection["participant_role"] = "recipient"): StateProjection {
  return {
    protocol_version: 1,
    call_id: CALL_ID,
    state,
    state_version: version,
    media: "audio",
    participant_role: role,
    peer: { user_id: PEER_ID, username: "Alice" },
    created_at: "2026-07-20T10:00:00.000000Z",
    presented_at: state === "presented" ? "2026-07-20T10:00:02.000000Z" : null,
    accepted_at: state === "accepted" ? "2026-07-20T10:00:03.000000Z" : null,
    connecting_at: state === "connecting" ? "2026-07-20T10:00:04.000000Z" : null,
    active_at: state === "active" ? "2026-07-20T10:00:05.000000Z" : null,
    ended_at: ["declined", "cancelled", "no_answer", "connection_failed", "ended"].includes(state)
      ? "2026-07-20T10:00:06.000000Z"
      : null,
  };
}

function acknowledged(event: "call:received" | "call:presented"): LifecycleCommandOutcome {
  return {
    status: "acknowledged",
    event,
    commandId: "44444444-4444-4444-8444-444444444444",
    result: { call_id: CALL_ID, state: "dispatching", state_version: 1, result_code: "applied" },
  };
}

function transportFailure(event: "call:received" | "call:presented", kind: "transport_timeout" | "transport_error" = "transport_timeout"): LifecycleCommandOutcome {
  return { status: "failed", event, commandId: "44444444-4444-4444-8444-444444444444", error: { kind } };
}

function createHarness(enabled = true) {
  let listener: ((value: StateProjection, classification: "accepted" | "duplicate") => void) | null = null;
  let syncListener: (() => void) | null = null;
  let pendingCommand: PendingLifecycleCommand | null = null;
  const projections = new Map<string, StateProjection>();
  const session: DirectedCallSessionPort = {
    deviceId: DEVICE_ID,
    getProjection: (callId) => projections.get(callId) ?? null,
    subscribeToProjections: (next) => {
      listener = next;
      return () => { listener = null; };
    },
    subscribeToSync: (next) => {
      syncListener = next;
      return () => { syncListener = null; };
    },
    pushCommand: vi.fn(),
  };
  const controller = {
    received: vi.fn(async (callId) => {
      pendingCommand = { event: "call:received", callId, commandId: "44444444-4444-4444-8444-444444444444", attempts: 1 };
      return acknowledged("call:received");
    }),
    presented: vi.fn(async (callId) => {
      pendingCommand = { event: "call:presented", callId, commandId: "44444444-4444-4444-8444-444444444444", attempts: 1 };
      return acknowledged("call:presented");
    }),
    retryPendingCommand: vi.fn(async () => acknowledged(pendingCommand?.event === "call:presented" ? "call:presented" : "call:received")),
    getSnapshot: vi.fn(() => ({
      phase: "live",
      preparing: false,
      disposed: false,
      callId: pendingCommand?.callId ?? null,
      projection: null,
      pendingCommand,
      lastCommandError: null,
    } satisfies DirectedCallControllerSnapshot)),
  } satisfies DirectedCallIncomingControllerPort;
  const coordinator = new DirectedCallIncomingCoordinator(session, controller, { enabled });
  const emit = (next: StateProjection, classification: "accepted" | "duplicate" = "accepted") => {
    projections.set(next.call_id, next);
    listener?.(next, classification);
  };
  const emitSync = () => syncListener?.();
  return { coordinator, controller, emit, emitSync, setPending: (pending: PendingLifecycleCommand | null) => { pendingCommand = pending; } };
}

describe("DirectedCallIncomingCoordinator", () => {
  it("is dormant by default and does not subscribe or send commands", () => {
    const harness = createHarness(false);
    harness.emit(projection("dispatching"));

    expect(harness.controller.received).not.toHaveBeenCalled();
    expect(harness.coordinator.getSnapshot().visible).toBe(false);
  });

  it("sends one received action only for a recipient dispatching projection", () => {
    const harness = createHarness();
    harness.emit(projection("dispatching"));
    harness.emit(projection("dispatching", 1));

    expect(harness.controller.received).toHaveBeenCalledTimes(1);
    expect(harness.controller.received).toHaveBeenCalledWith(CALL_ID);

    const caller = createHarness();
    caller.emit(projection("dispatching", 1, "initiator"));
    expect(caller.controller.received).not.toHaveBeenCalled();
  });

  it("makes a received timeout retryable after completed sync without a second logical action", async () => {
    const harness = createHarness();
    harness.controller.received.mockResolvedValueOnce(transportFailure("call:received"));
    harness.setPending({ event: "call:received", callId: CALL_ID, commandId: "44444444-4444-4444-8444-444444444444", attempts: 1 });
    harness.emit(projection("dispatching"));
    await Promise.resolve();

    expect(harness.coordinator.getSnapshot().recoverableError).toMatchObject({
      action: "call:received",
      kind: "transport_timeout",
    });
    harness.emitSync();
    await Promise.resolve();

    expect(harness.controller.received).toHaveBeenCalledTimes(1);
    expect(harness.controller.retryPendingCommand).toHaveBeenCalledTimes(1);
    expect(harness.coordinator.getSnapshot().recoverableError).toBeNull();
  });

  it("makes a presented timeout retryable while the authoritative state remains delivered", async () => {
    const harness = createHarness();
    harness.emit(projection("delivered", 2));
    harness.controller.presented.mockResolvedValueOnce(transportFailure("call:presented"));
    harness.setPending({ event: "call:presented", callId: CALL_ID, commandId: "44444444-4444-4444-8444-444444444444", attempts: 1 });
    harness.coordinator.onModalPresented(CALL_ID);
    await Promise.resolve();

    harness.emitSync();
    await Promise.resolve();

    expect(harness.controller.presented).toHaveBeenCalledTimes(1);
    expect(harness.controller.retryPendingCommand).toHaveBeenCalledTimes(1);
  });

  it("coalesces repeated sync notifications while one retry is in flight", async () => {
    const harness = createHarness();
    harness.controller.received.mockResolvedValueOnce(transportFailure("call:received"));
    harness.setPending({ event: "call:received", callId: CALL_ID, commandId: "44444444-4444-4444-8444-444444444444", attempts: 1 });
    harness.emit(projection("dispatching"));
    await Promise.resolve();

    let resolveRetry!: (outcome: LifecycleCommandOutcome) => void;
    harness.controller.retryPendingCommand.mockImplementationOnce(() => new Promise((resolve) => { resolveRetry = resolve; }));
    harness.emitSync();
    harness.emitSync();
    await Promise.resolve();
    expect(harness.controller.retryPendingCommand).toHaveBeenCalledTimes(1);

    resolveRetry(acknowledged("call:received"));
    await Promise.resolve();
  });

  it("retains a bounded exhaustion error without changing canonical state", async () => {
    const harness = createHarness();
    harness.controller.received.mockResolvedValueOnce(transportFailure("call:received"));
    harness.setPending({ event: "call:received", callId: CALL_ID, commandId: "44444444-4444-4444-8444-444444444444", attempts: 1 });
    harness.emit(projection("dispatching"));
    await Promise.resolve();
    harness.controller.retryPendingCommand.mockResolvedValueOnce({
      status: "failed",
      event: "call:received",
      commandId: "44444444-4444-4444-8444-444444444444",
      error: { kind: "retry_exhausted" },
    });
    harness.emitSync();
    await Promise.resolve();

    expect(harness.coordinator.getSnapshot()).toMatchObject({
      projection: null,
      recoverableError: { action: "call:received", kind: "retry_exhausted" },
    });
    expect(harness.controller.retryPendingCommand).toHaveBeenCalledTimes(1);
  });

  it("stops immediately after the third transport attempt without scheduling a fourth", async () => {
    const harness = createHarness();
    harness.controller.received.mockResolvedValueOnce(transportFailure("call:received"));
    harness.setPending({ event: "call:received", callId: CALL_ID, commandId: "44444444-4444-4444-8444-444444444444", attempts: 3 });
    harness.emit(projection("dispatching"));
    await Promise.resolve();

    expect(harness.coordinator.getSnapshot().recoverableError).toMatchObject({ kind: "retry_exhausted" });
    harness.emitSync();
    await Promise.resolve();
    expect(harness.controller.retryPendingCommand).not.toHaveBeenCalled();
  });

  it.each(["delivered", "presented", "accepted", "connecting", "active", "ended"] as const)(
    "suppresses a late received failure after authoritative %s advancement",
    async (state) => {
      const harness = createHarness();
      let resolveReceived!: (outcome: LifecycleCommandOutcome) => void;
      harness.controller.received.mockImplementationOnce(async () => new Promise((resolve) => { resolveReceived = resolve; }));
      harness.emit(projection("dispatching"));
      harness.emit(projection(state, 2));
      resolveReceived(transportFailure("call:received"));
      await Promise.resolve();

      expect(harness.coordinator.getSnapshot().recoverableError).toBeNull();
      expect(harness.controller.retryPendingCommand).not.toHaveBeenCalled();
    },
  );

  it("does not retry or publish late errors after disposal", async () => {
    const harness = createHarness();
    let resolveReceived!: (outcome: LifecycleCommandOutcome) => void;
    harness.controller.received.mockImplementationOnce(async () => new Promise((resolve) => { resolveReceived = resolve; }));
    harness.emit(projection("dispatching"));
    harness.coordinator.dispose();
    resolveReceived(transportFailure("call:received", "transport_error"));
    await Promise.resolve();
    harness.emitSync();

    expect(harness.controller.retryPendingCommand).not.toHaveBeenCalled();
    expect(harness.coordinator.getSnapshot().recoverableError).toBeNull();
  });

  it("exposes only authoritative delivered and presented projections", () => {
    const harness = createHarness();
    harness.emit(projection("dispatching"));
    expect(harness.coordinator.getSnapshot().visible).toBe(false);

    harness.emit(projection("delivered", 2));
    expect(harness.coordinator.getSnapshot().projection?.state).toBe("delivered");
    expect(harness.coordinator.getSnapshot().projection?.peer.username).toBe("Alice");

    harness.emit(projection("presented", 3));
    expect(harness.coordinator.getSnapshot().projection?.state).toBe("presented");
  });

  it("rejects malformed or duplicate projection notifications", () => {
    const harness = createHarness();
    harness.emit({ ...projection("delivered", 2), peer: { user_id: "not-a-uuid", username: "Alice" } } as StateProjection);
    expect(harness.coordinator.getSnapshot().visible).toBe(false);

    harness.emit(projection("delivered", 2));
    harness.emit(projection("dispatching", 1), "duplicate");
    expect(harness.controller.received).not.toHaveBeenCalled();
    expect(harness.coordinator.getSnapshot().projection?.state).toBe("delivered");
  });

  it("sends presented only after the exact modal commit and only once", () => {
    const harness = createHarness();
    harness.emit(projection("delivered", 2));

    harness.coordinator.onModalPresented("44444444-4444-4444-8444-444444444444");
    expect(harness.controller.presented).not.toHaveBeenCalled();
    harness.coordinator.onModalPresented(CALL_ID);
    harness.coordinator.onModalPresented(CALL_ID);

    expect(harness.controller.presented).toHaveBeenCalledTimes(1);
    expect(harness.controller.presented).toHaveBeenCalledWith(CALL_ID);
  });

  it("does not send presented when another device already advanced the call", () => {
    const harness = createHarness();
    harness.emit(projection("delivered", 2));
    harness.emit(projection("presented", 3));
    harness.coordinator.onModalPresented(CALL_ID);

    expect(harness.controller.presented).not.toHaveBeenCalled();
    expect(harness.coordinator.getSnapshot().visible).toBe(true);
  });

  it.each(["accepted", "connecting", "active", "declined", "cancelled", "no_answer", "connection_failed", "ended"] as const)(
    "dismisses on authoritative %s",
    (state) => {
      const harness = createHarness();
      harness.emit(projection("delivered", 2));
      harness.emit(projection(state, 3));

      expect(harness.coordinator.getSnapshot().visible).toBe(false);
      harness.coordinator.onModalPresented(CALL_ID);
      expect(harness.controller.presented).not.toHaveBeenCalled();
    },
  );

  it("keeps the incoming snapshot across disconnect-like silence and follows sync projections", () => {
    const harness = createHarness();
    harness.emit(projection("delivered", 2));
    expect(harness.coordinator.getSnapshot().visible).toBe(true);

    harness.emit(projection("accepted", 3));
    expect(harness.coordinator.getSnapshot().visible).toBe(false);
  });

  it("clears stale incoming presentation when a different outgoing call is accepted", () => {
    const harness = createHarness();
    harness.emit(projection("presented", 2, "recipient"));
    harness.emit({ ...projection("presented", 1, "initiator"), call_id: "66666666-6666-4666-8666-666666666666" });

    expect(harness.coordinator.getSnapshot()).toMatchObject({ visible: false, callId: null, projection: null });
  });

  it("cancels obsolete presentation work on disposal and does not emit terminal commands", () => {
    const harness = createHarness();
    harness.emit(projection("delivered", 2));
    harness.coordinator.dispose();
    harness.coordinator.onModalPresented(CALL_ID);

    expect(harness.controller.presented).not.toHaveBeenCalled();
    expect(harness.controller.received).not.toHaveBeenCalled();
    expect(harness.coordinator.getSnapshot()).toMatchObject({ disposed: true, visible: false, callId: null });
  });

  it("does not create accept, decline, cancel, hangup, media, or legacy commands", () => {
    const harness = createHarness();
    harness.emit(projection("delivered", 2));
    harness.coordinator.onModalPresented(CALL_ID);

    expect(harness.controller).toEqual(expect.objectContaining({ received: expect.any(Function), presented: expect.any(Function) }));
    expect(harness.controller).not.toHaveProperty("accept");
    expect(harness.controller).not.toHaveProperty("decline");
    expect(harness.controller).not.toHaveProperty("cancel");
    expect(harness.controller).not.toHaveProperty("hangup");
  });
});
