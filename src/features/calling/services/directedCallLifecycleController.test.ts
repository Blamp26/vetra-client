import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCommand,
  type StateProjection,
} from "../protocol/directedCallProtocol";
import {
  DirectedCallLifecycleController,
  type DirectedCallSessionPort,
} from "./directedCallLifecycleController";
import { DirectedCallSessionCommandError } from "./directedCallSession";

const deviceId = "11111111-1111-4111-8111-111111111111";
const targetId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const callId = "33333333-3333-4333-8333-333333333333";
const secondCallId = "55555555-5555-4555-8555-555555555555";
const state = (stateName: StateProjection["state"] = "dispatching", version = 1, selectedCallId = callId, createdAt = "2026-01-02T03:04:05.123456Z"): StateProjection => ({
  protocol_version: 1,
  call_id: selectedCallId,
  state: stateName,
  state_version: version,
  media: "audio",
  participant_role: "initiator",
  peer: { user_id: targetId, username: "alice" },
  created_at: createdAt,
  presented_at: null,
  accepted_at: null,
  connecting_at: null,
  active_at: null,
  ended_at: null,
});

function initiateReply(stateName: StateProjection["state"] = "dispatching") {
  return {
    protocol_version: 1,
    status: "ok",
    result: {
      call_id: callId,
      state: stateName,
      state_version: 1,
      media: "audio",
      participant_role: "initiator",
      merged: false,
      attempt_created: true,
    },
  };
}

function commandReply(stateName: StateProjection["state"] = "dispatching") {
  return {
    protocol_version: 1,
    status: "ok",
    result: {
      call_id: callId,
      state: stateName,
      state_version: 1,
      result_code: "applied",
    },
  };
}

function createSession(responses: unknown[] = []) {
  const projections = new Map<string, StateProjection>();
  const listeners = new Set<(projection: StateProjection, classification: "accepted" | "duplicate") => void>();
  const syncListeners = new Set<() => void>();
  const pushes: Array<{ event: string; payload: Record<string, unknown> }> = [];
  const queued = [...responses];
  const session: DirectedCallSessionPort & {
    pushes: typeof pushes;
    emit: (projection: StateProjection) => void;
    emitSync: () => void;
    load: (projection: StateProjection) => void;
  } = {
    deviceId,
    getProjections: () => Array.from(projections.values()),
    getProjection: (id) => projections.get(id) ?? null,
    subscribeToProjections: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeToSync: (listener) => {
      syncListeners.add(listener);
      return () => syncListeners.delete(listener);
    },
    pushCommand: vi.fn((event: string, payload: unknown) => {
      pushes.push({ event, payload: payload as Record<string, unknown> });
      const response = queued.shift();
      if (response instanceof Error) return Promise.reject(response);
      return Promise.resolve(response ?? commandReply());
    }),
    pushes,
    emit: (projection) => {
      projections.set(projection.call_id, projection);
      listeners.forEach((listener) => listener(projection, "accepted"));
    },
    emitSync: () => syncListeners.forEach((listener) => listener()),
    load: (projection) => projections.set(projection.call_id, projection),
  };
  return session;
}

describe("DirectedCallLifecycleController", () => {
  beforeEach(() => {
    let next = 0;
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => {
        next += 1;
        return "44444444-4444-4444-8444-44444444444" + next;
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("enters local preparing before initiating and uses the public target and stable device", async () => {
    const session = createSession([initiateReply()]);
    const controller = new DirectedCallLifecycleController(session);
    const operation = controller.initiate(targetId);

    expect(controller.getSnapshot()).toMatchObject({
      phase: "preparing",
      preparing: true,
      callId: null,
    });
    const result = await operation;
    const payload = session.pushes[0].payload;

    expect(result.status).toBe("acknowledged");
    expect(session.pushes[0].event).toBe("call:initiate");
    expect(payload).toMatchObject({
      protocol_version: 1,
      device_id: deviceId,
      target_user_id: targetId,
      media: "audio",
    });
    expect(payload.target_user_id).not.toBe("42");
  });

  it("owns command IDs, reuses them only for explicit retry, and changes them for new actions", async () => {
    const session = createSession([
      new DirectedCallSessionCommandError({ kind: "transport_timeout" }),
      initiateReply(),
      commandReply(),
    ]);
    const controller = new DirectedCallLifecycleController(session);

    const first = await controller.initiate(targetId);
    const firstId = session.pushes[0].payload.command_id;
    const firstPayload = { ...session.pushes[0].payload };
    const retry = await controller.retryPendingCommand();
    const retryId = session.pushes[1].payload.command_id;
    await controller.received(callId);
    const secondId = session.pushes[2].payload.command_id;

    expect(first.status).toBe("failed");
    expect(retry.status).toBe("acknowledged");
    expect(retryId).toBe(firstId);
    expect(session.pushes[1].payload).toEqual(firstPayload);
    expect(secondId).not.toBe(firstId);
  });

  it("reconciles an ambiguous lifecycle acknowledgement through authoritative projection", async () => {
    const session = createSession();
    let rejectPush!: (error: unknown) => void;
    session.pushCommand = vi.fn(() => new Promise((_, reject) => { rejectPush = reject; }));
    const controller = new DirectedCallLifecycleController(session);
    const operation = controller.accept(callId);

    expect(controller.getSnapshot().pendingCommand?.commandId).toBeTruthy();
    session.emit(state("accepted", 2));
    expect(controller.getSnapshot()).toMatchObject({ projection: state("accepted", 2), pendingCommand: null, lastCommandError: null });

    rejectPush(new DirectedCallSessionCommandError({ kind: "transport_timeout" }));
    await expect(operation).resolves.toMatchObject({ status: "failed", error: { kind: "transport_timeout" } });
    expect(controller.getSnapshot().lastCommandError).toBeNull();
    expect(session.pushes).toHaveLength(0);
  });

  it("bounds explicit retries without generating a replacement logical command", async () => {
    const timeout = () => new DirectedCallSessionCommandError({ kind: "transport_timeout" });
    const session = createSession([timeout(), timeout(), timeout()]);
    const controller = new DirectedCallLifecycleController(session);

    await controller.initiate(targetId);
    await controller.retryPendingCommand();
    await controller.retryPendingCommand();
    const exhausted = await controller.retryPendingCommand();

    expect(exhausted).toMatchObject({ status: "failed", error: { kind: "retry_exhausted" } });
    expect(session.pushes).toHaveLength(3);
    expect(new Set(session.pushes.map(({ payload }) => payload.command_id)).size).toBe(1);
    expect(session.pushes[1].payload).toEqual(session.pushes[0].payload);
    expect(session.pushes[2].payload).toEqual(session.pushes[0].payload);
  });

  it("does not invent a call ID or make acknowledgements canonical", async () => {
    const session = createSession([initiateReply(), commandReply("accepted")]);
    const controller = new DirectedCallLifecycleController(session);

    await controller.initiate(targetId);
    expect(controller.getSnapshot().callId).toBe(callId);
    expect(controller.getSnapshot().projection).toBeNull();
    expect(controller.getSnapshot().preparing).toBe(true);

    await controller.accept(callId);
    expect(controller.getSnapshot().projection).toBeNull();
    expect(controller.getSnapshot().phase).toBe("preparing");

    session.emit(state("accepted"));
    expect(controller.getSnapshot().projection?.state).toBe("accepted");
    expect(controller.getSnapshot().preparing).toBe(false);
  });

  it("keeps lifecycle and media commands explicit without optimistic transitions", async () => {
    const session = createSession([commandReply(), commandReply(), commandReply(), commandReply(), commandReply()]);
    const controller = new DirectedCallLifecycleController(session);
    session.emit(state("presented"));

    await controller.decline(callId);
    expect(controller.getSnapshot().projection?.state).toBe("presented");
    await controller.hangup(callId);
    expect(controller.getSnapshot().projection?.state).toBe("presented");
    await controller.beginConnecting(callId);
    expect(controller.getSnapshot().projection?.state).toBe("presented");
    await controller.mediaReady(callId);
    await controller.setupFailed(callId, "sdp_failed");
    expect(session.pushes.map(({ event }) => event)).toEqual([
      "call:decline",
      "call:hangup",
      "call:begin_connecting",
      "call:media_ready",
      "call:setup_failed",
    ]);
    expect(session.pushes[session.pushes.length - 1]?.payload).toMatchObject({ failure_code: "sdp_failed" });
  });

  it("never sends received or presented automatically", async () => {
    const session = createSession();
    const controller = new DirectedCallLifecycleController(session);
    session.emit(state("dispatching"));

    expect(session.pushes).toEqual([]);
    await controller.received(callId);
    await controller.presented(callId);
    expect(session.pushes.map(({ event }) => event)).toEqual([
      "call:received",
      "call:presented",
    ]);
  });

  it("preserves preparing and canonical state across disconnect-like session silence", async () => {
    let resolveInitiate!: (value: unknown) => void;
    const session = createSession();
    session.pushCommand = vi.fn(() => new Promise((resolve) => {
      resolveInitiate = resolve;
    }));
    const controller = new DirectedCallLifecycleController(session);
    const operation = controller.initiate(targetId);

    expect(controller.getSnapshot().preparing).toBe(true);
    expect(controller.getSnapshot().preparing).toBe(true);
    expect(controller.getSnapshot().projection).toBeNull();
    resolveInitiate(initiateReply());
    await operation;
    expect(controller.getSnapshot().preparing).toBe(true);
  });

  it("exposes authoritative terminal projections and does not calculate timers", async () => {
    const session = createSession();
    const controller = new DirectedCallLifecycleController(session);
    session.emit(state("ended", 8));

    expect(controller.getSnapshot()).toMatchObject({
      phase: "terminal",
      callId,
      projection: { state: "ended", state_version: 8 },
    });
    expect(controller.getSnapshot()).not.toHaveProperty("seconds");
  });

  it("rejects malformed targets and replies without submitting invalid commands", async () => {
    const session = createSession([{ protocol_version: 1, status: "ok", result: {} }]);
    const controller = new DirectedCallLifecycleController(session);

    const invalidTarget = await controller.initiate("42");
    expect(invalidTarget).toMatchObject({ status: "failed", error: { kind: "protocol_validation" } });
    expect(session.pushes).toHaveLength(0);

    const invalidReply = await controller.initiate(targetId);
    expect(invalidReply).toMatchObject({ status: "failed", error: { kind: "protocol_validation" } });
    expect(controller.getSnapshot().preparing).toBe(false);
  });

  it("clears local state on disposal and prevents later commands", async () => {
    const session = createSession([initiateReply()]);
    const controller = new DirectedCallLifecycleController(session);
    await controller.initiate(targetId);
    controller.dispose();

    const result = await controller.hangup(callId);
    expect(result).toMatchObject({ status: "failed", error: { kind: "disposed" } });
    expect(controller.getSnapshot()).toMatchObject({
      phase: "disposed",
      disposed: true,
      preparing: false,
      pendingCommand: null,
    });
    expect(session.pushes.map(({ event }) => event)).toEqual(["call:initiate"]);
  });

  it("uses only persistent lifecycle events and never legacy call events", async () => {
    const session = createSession([commandReply(), commandReply(), commandReply()]);
    const controller = new DirectedCallLifecycleController(session);
    await controller.received(callId);
    await controller.presented(callId);
    await controller.accept(callId);

    expect(session.pushes.every(({ event }) => event.startsWith("call:"))).toBe(true);
    expect(session.pushes.map(({ event }) => event)).not.toContain("offer");
    expect(session.pushes.map(({ event }) => event)).not.toContain("hang_up");
    expect(session.pushes.map(({ event }) => event)).not.toContain("ice_candidate");
    expect(session.pushes.map(({ event }) => event)).not.toContain("renegotiate");
  });

  it("does not require or instantiate media behavior", async () => {
    const session = createSession([commandReply()]);
    const controller = new DirectedCallLifecycleController(session);
    await controller.beginConnecting(callId);

    expect(session.pushes[0].payload).toEqual(
      buildCommand(callId, session.pushes[0].payload.command_id as string, deviceId),
    );
    expect(controller.getSnapshot()).not.toHaveProperty("peerConnection");
    expect(controller.getSnapshot()).not.toHaveProperty("microphone");
  });

  it("yields a terminal selection to a later live call while retaining both projections", () => {
    const session = createSession();
    const controller = new DirectedCallLifecycleController(session);
    const terminalA = state("ended", 8, callId, "2026-01-02T03:04:05.123456Z");
    const liveB = state("delivered", 1, secondCallId, "2026-01-03T03:04:05.123456Z");

    session.emit(terminalA);
    session.emit(liveB);

    expect(controller.getSnapshot()).toMatchObject({ callId: secondCallId, projection: liveB, phase: "live" });
    expect(session.getProjection(callId)).toEqual(terminalA);
    expect(session.getProjection(secondCallId)).toEqual(liveB);
  });

  it("keeps a selected live call sticky when another live projection arrives", () => {
    const session = createSession();
    const controller = new DirectedCallLifecycleController(session);
    const liveA = state("dispatching", 1, callId, "2026-01-02T03:04:05.123456Z");
    const liveB = state("delivered", 2, secondCallId, "2026-01-01T03:04:05.123456Z");

    session.emit(liveA);
    session.emit(liveB);

    expect(controller.getSnapshot()).toMatchObject({ callId, projection: liveA });
  });

  it("selects a deterministic live projection after sync when selection is empty or terminal", () => {
    const session = createSession();
    const controller = new DirectedCallLifecycleController(session);
    const later = state("active", 2, secondCallId, "2026-01-03T03:04:05.123456Z");
    const earlier = state("delivered", 1, callId, "2026-01-02T03:04:05.123456Z");

    session.load(later);
    session.load(earlier);
    session.emitSync();
    expect(controller.getSnapshot().callId).toBe(callId);

    session.emit(state("ended", 3, callId, "2026-01-02T03:04:05.123456Z"));
    session.emitSync();
    expect(controller.getSnapshot().callId).toBe(secondCallId);
  });

  it("clears terminal selection before a new outgoing preparation", async () => {
    const session = createSession([initiateReply()]);
    const controller = new DirectedCallLifecycleController(session);
    session.emit(state("ended", 8));

    const operation = controller.initiate(targetId);
    expect(controller.getSnapshot()).toMatchObject({ phase: "preparing", preparing: true, callId: null, projection: null });
    await operation;
    expect(controller.getSnapshot().callId).toBe(callId);
  });
});
