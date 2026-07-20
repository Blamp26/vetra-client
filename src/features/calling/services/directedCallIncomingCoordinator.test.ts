import { describe, expect, it, vi } from "vitest";
import type { StateProjection } from "../protocol/directedCallProtocol";
import {
  DirectedCallIncomingCoordinator,
  type DirectedCallIncomingControllerPort,
} from "./directedCallIncomingCoordinator";
import type { DirectedCallSessionPort, LifecycleCommandOutcome } from "./directedCallLifecycleController";

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

function createHarness(enabled = true) {
  let listener: ((value: StateProjection, classification: "accepted" | "duplicate") => void) | null = null;
  const projections = new Map<string, StateProjection>();
  const session: DirectedCallSessionPort = {
    deviceId: DEVICE_ID,
    getProjection: (callId) => projections.get(callId) ?? null,
    subscribeToProjections: (next) => {
      listener = next;
      return () => { listener = null; };
    },
    pushCommand: vi.fn(),
  };
  const controller: DirectedCallIncomingControllerPort = {
    received: vi.fn(async () => acknowledged("call:received")),
    presented: vi.fn(async () => acknowledged("call:presented")),
  };
  const coordinator = new DirectedCallIncomingCoordinator(session, controller, { enabled });
  const emit = (next: StateProjection, classification: "accepted" | "duplicate" = "accepted") => {
    projections.set(next.call_id, next);
    listener?.(next, classification);
  };
  return { coordinator, controller, emit };
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
