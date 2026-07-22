import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Socket } from "phoenix";
import { buildSignal } from "../protocol/directedCallProtocol";
import { DirectedCallSession, createDirectedCallProjectionStore } from "./directedCallSession";

const deviceId = "11111111-1111-4111-8111-111111111111";
const callId = "33333333-3333-4333-8333-333333333333";
const signalId = "99999999-9999-4999-8999-999999999999";
const peerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const state = (version: number, stateName: "presented" | "accepted" = "presented") => ({
  protocol_version: 1 as const,
  call_id: callId,
  state: stateName,
  state_version: version,
  media: "audio" as const,
  participant_role: "recipient" as const,
  peer: { user_id: peerId, username: "alice" },
  created_at: "2026-01-02T03:04:05.123456Z",
  presented_at: "2026-01-02T03:04:09.123456Z",
  accepted_at: null,
  connecting_at: null,
  active_at: null,
  ended_at: null,
});

type Handler = (payload: unknown) => void;

function createMockChannel() {
  const handlers = new Map<string, Map<number, Handler>>();
  const pushes: Array<{ event: string; payload: unknown }> = [];
  let nextRef = 1;
  let nextResponse: unknown[] = [];
  let joinResponse: { event: "ok" | "error" | "timeout"; value?: unknown } = { event: "ok" };

  const channel = {
    on: vi.fn((event: string, handler: Handler) => {
      const eventHandlers = handlers.get(event) ?? new Map<number, Handler>();
      const ref = nextRef++;
      eventHandlers.set(ref, handler);
      handlers.set(event, eventHandlers);
      return ref;
    }),
    off: vi.fn((event: string, ref?: number) => {
      if (ref === undefined) handlers.delete(event);
      else handlers.get(event)?.delete(ref);
    }),
    emit(event: string, payload: unknown) {
      handlers.get(event)?.forEach((handler) => handler(payload));
    },
    push: vi.fn((event: string, payload: unknown) => {
      pushes.push({ event, payload });
      const response = nextResponse.shift() ?? {
        protocol_version: 1,
        status: "ok",
        request_id: (payload as { request_id: string }).request_id,
        calls: [],
      };
      return {
        receive(receiveEvent: string, callback: (value?: unknown) => void) {
          if (receiveEvent === "ok") callback(response);
          return this;
        },
      };
    }),
    join: vi.fn(() => ({
      receive(receiveEvent: string, callback: (value?: unknown) => void) {
        if (receiveEvent === joinResponse.event) callback(joinResponse.value);
        return this;
      },
    })),
    leave: vi.fn(),
    pushes,
    queueResponse(response: unknown) {
      nextResponse.push(response);
    },
    queueJoinResponse(event: "ok" | "error" | "timeout", value?: unknown) {
      joinResponse = { event, value };
    },
  };

  return channel;
}

function createMockSocket(channel: ReturnType<typeof createMockChannel>) {
  const openHandlers = new Map<string, () => void>();
  let nextRef = 1;
  return {
    channel: vi.fn(() => channel),
    onOpen: vi.fn((handler: () => void) => {
      const ref = String(nextRef++);
      openHandlers.set(ref, handler);
      return ref;
    }),
    off: vi.fn((refs: string[]) => refs.forEach((ref) => openHandlers.delete(ref))),
    emitOpen() {
      openHandlers.forEach((handler) => handler());
    },
  };
}

describe("DirectedCallSession", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "44444444-4444-4444-8444-444444444444") });
  });

  it("does no network work while the feature gate is disabled", async () => {
    const channel = createMockChannel();
    const socket = createMockSocket(channel);
    const session = new DirectedCallSession({
      socket: socket as unknown as Socket,
      publicUserRef: peerId,
      deviceId,
      enabled: false,
    });

    expect(await session.start()).toBe(false);
    expect(socket.channel).not.toHaveBeenCalled();
    expect(channel.join).not.toHaveBeenCalled();
    expect(channel.push).not.toHaveBeenCalled();
  });

  it("joins the exact directed-call topic and performs bounded initial sync", async () => {
    const channel = createMockChannel();
    const socket = createMockSocket(channel);
    const trace = vi.fn();
    const session = new DirectedCallSession({
      socket: socket as unknown as Socket,
      publicUserRef: peerId,
      deviceId,
      enabled: true,
      trace,
    });

    await session.start();

    expect(socket.channel).toHaveBeenCalledWith("directed_call:" + peerId, {
      protocol_version: 1,
      capabilities: ["directed_calls_v1"],
      device_id: deviceId,
    });
    expect(channel.join).toHaveBeenCalledTimes(1);
    expect(channel.push).toHaveBeenCalledTimes(1);
    expect(channel.pushes[0].event).toBe("call:sync");
    expect((channel.pushes[0].payload as { known_calls: unknown[] }).known_calls).toEqual([]);
    expect(trace.mock.calls.filter(([event]) => event === "session_start_phase_succeeded").map(([, details]) => details.sessionPhase)).toEqual([
      "channel_creation",
      "subscription_installation",
      "channel_join_acknowledgement",
      "channel_join_request",
      "sync_acknowledgement",
      "initial_request_sync",
    ]);
  });

  it("traces each startup phase and safely serializes a Phoenix plain-object join rejection", async () => {
    const channel = createMockChannel();
    channel.queueJoinResponse("error", { error: { code: "feature_disabled", secret: "must not log" }, protocol_version: 1, status: "error" });
    const socket = createMockSocket(channel);
    const trace = vi.fn();
    const session = new DirectedCallSession({
      socket: socket as unknown as Socket,
      publicUserRef: peerId,
      deviceId,
      enabled: true,
      trace,
    });

    await expect(session.start()).rejects.toEqual({ error: { code: "feature_disabled", secret: "must not log" }, protocol_version: 1, status: "error" });
    expect(trace.mock.calls.map(([event, details]) => [event, details.sessionPhase])).toEqual([
      ["session_start_phase_started", "channel_creation"],
      ["session_start_phase_succeeded", "channel_creation"],
      ["session_start_phase_started", "subscription_installation"],
      ["session_start_phase_succeeded", "subscription_installation"],
      ["session_start_phase_started", "channel_join_request"],
      ["session_start_phase_started", "channel_join_acknowledgement"],
      ["session_start_phase_failed", "channel_join_acknowledgement"],
      ["session_start_phase_failed", "channel_join_request"],
    ]);
    const failure = trace.mock.calls.find(([event]) => event === "session_start_phase_failed");
    expect(failure?.[1]).toMatchObject({
      errorCategory: "plain_object",
      errorDetails: "keys=error,protocol_version,status; status=error",
      serverErrorCode: "feature_disabled",
    });
    expect(failure?.[1].errorDetails).not.toContain("must not log");
  });

  it("classifies projections and publishes only valid durable states", () => {
    const conflicts: string[] = [];
    const store = createDirectedCallProjectionStore((id) => conflicts.push(id));
    const received: string[] = [];
    store.subscribe((projection, classification) => received.push(String(projection.state_version) + ":" + classification));

    expect(store.apply(state(2))).toBe("accepted");
    expect(store.apply(state(1))).toBe("stale");
    expect(store.apply(state(2))).toBe("duplicate");
    expect(store.apply({ ...state(2), state: "accepted" })).toBe("conflict");
    expect(store.apply({ ...state(2), state: "accepted" })).toBe("conflict");
    expect(store.apply({ ...state(2), state: "invalid" })).toBe("malformed");
    expect(conflicts).toEqual([callId]);
    expect(received).toEqual(["2:accepted"]);
    expect(store.get(callId)?.state).toBe("presented");
  });

  it("requests one bounded repair for an equal-version conflict", async () => {
    const channel = createMockChannel();
    const socket = createMockSocket(channel);
    const session = new DirectedCallSession({
      socket: socket as unknown as Socket,
      publicUserRef: peerId,
      deviceId,
      enabled: true,
    });
    await session.start();
    channel.emit("call:state", state(2));
    channel.emit("call:state", { ...state(2), state: "accepted" });
    channel.emit("call:state", { ...state(2), state: "accepted" });

    expect(channel.pushes.filter(({ event }) => event === "call:sync")).toHaveLength(2);
  });

  it("sends known projections again after socket reconnect without clearing them", async () => {
    const channel = createMockChannel();
    const socket = createMockSocket(channel);
    const session = new DirectedCallSession({
      socket: socket as unknown as Socket,
      publicUserRef: peerId,
      deviceId,
      enabled: true,
    });
    await session.start();
    channel.emit("call:state", state(4));
    socket.emitOpen();

    expect(session.getProjection(callId)).toEqual(state(4));
    expect(channel.pushes.filter(({ event }) => event === "call:sync")).toHaveLength(2);
    expect((channel.pushes[1].payload as { known_calls: unknown[] }).known_calls).toEqual([
      { call_id: callId, state_version: 4 },
    ]);
  });

  it("publishes a completion notification only after each successful sync", async () => {
    const channel = createMockChannel();
    const socket = createMockSocket(channel);
    const session = new DirectedCallSession({
      socket: socket as unknown as Socket,
      publicUserRef: peerId,
      deviceId,
      enabled: true,
    });
    const syncCompleted = vi.fn();
    session.subscribeToSync?.(syncCompleted);

    await session.start();
    expect(syncCompleted).toHaveBeenCalledTimes(1);
    socket.emitOpen();
    expect(syncCompleted).toHaveBeenCalledTimes(2);
  });

  it("delivers valid signals independently and rejects malformed signals", async () => {
    const channel = createMockChannel();
    const socket = createMockSocket(channel);
    const session = new DirectedCallSession({
      socket: socket as unknown as Socket,
      publicUserRef: peerId,
      deviceId,
      enabled: true,
    });
    const signals: string[] = [];
    session.subscribeToSignals((signal) => signals.push(signal.signal_id));
    await session.start();

    const signal = buildSignal(callId, signalId, deviceId, "ice_candidate", {
      candidate: "candidate:1",
      sdp_mid: null,
      sdp_mline_index: 0,
      username_fragment: null,
    });
    const { device_id: _, ...inbound } = signal;
    channel.emit("call:signal", inbound);
    channel.emit("call:signal", inbound);
    channel.emit("call:signal", { ...inbound, payload: { candidate: "" } });

    expect(signals).toEqual([signalId, signalId]);
    expect(session.getProjection(callId)).toBeNull();
  });

  it("disposes handlers, signals, and account-scoped projections", async () => {
    const channel = createMockChannel();
    const socket = createMockSocket(channel);
    const session = new DirectedCallSession({
      socket: socket as unknown as Socket,
      publicUserRef: peerId,
      deviceId,
      enabled: true,
    });
    const received = vi.fn();
    session.subscribeToSignals(received);
    await session.start();
    channel.emit("call:state", state(1));
    session.dispose();
    channel.emit("call:state", state(2));

    expect(session.getProjections()).toEqual([]);
    expect(received).not.toHaveBeenCalled();
    expect(channel.leave).toHaveBeenCalledTimes(1);
    expect(socket.off).toHaveBeenCalledTimes(1);
  });

  it("can start a new account session without leaking the old projection", async () => {
    const firstChannel = createMockChannel();
    const firstSocket = createMockSocket(firstChannel);
    const first = new DirectedCallSession({
      socket: firstSocket as unknown as Socket,
      publicUserRef: peerId,
      deviceId,
      enabled: true,
    });
    await first.start();
    firstChannel.emit("call:state", state(1));
    first.dispose();

    const nextUser = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const nextChannel = createMockChannel();
    const nextSocket = createMockSocket(nextChannel);
    const next = new DirectedCallSession({
      socket: nextSocket as unknown as Socket,
      publicUserRef: nextUser,
      deviceId,
      enabled: true,
    });
    await next.start();

    expect(next.topic).toBe("directed_call:" + nextUser);
    expect(next.getProjection(callId)).toBeNull();
  });

  it("retries a transient sync failure with bounded injectable backoff and resets after success", async () => {
    const channel = createMockChannel();
    channel.queueResponse(new Error("temporary sync failure"));
    const socket = createMockSocket(channel);
    const timers: Array<{ callback: () => void; delay: number }> = [];
    const clearTimeout = vi.fn();
    const session = new DirectedCallSession({
      socket: socket as unknown as Socket,
      publicUserRef: peerId,
      deviceId,
      enabled: true,
      retry: {
        setTimeout: (callback, delay) => {
          timers.push({ callback, delay });
          return timers.length as unknown as ReturnType<typeof setTimeout>;
        },
        clearTimeout,
        baseDelayMs: 25,
        maxDelayMs: 40,
      },
    });

    await expect(session.start()).rejects.toBeTruthy();
    expect(timers).toHaveLength(1);
    expect(timers[0].delay).toBe(25);
    timers.shift()!.callback();
    await Promise.resolve();
    await Promise.resolve();
    expect(channel.pushes.filter(({ event }) => event === "call:sync")).toHaveLength(2);

    channel.queueResponse(new Error("temporary sync failure"));
    socket.emitOpen();
    await Promise.resolve();
    await Promise.resolve();
    expect(timers[0]?.delay).toBe(25);
  });

  it("cancels retry work on disposal", async () => {
    const channel = createMockChannel();
    channel.queueResponse(new Error("temporary sync failure"));
    const socket = createMockSocket(channel);
    const timer = vi.fn(() => 1 as unknown as ReturnType<typeof setTimeout>);
    const clearTimeout = vi.fn();
    const session = new DirectedCallSession({
      socket: socket as unknown as Socket,
      publicUserRef: peerId,
      deviceId,
      enabled: true,
      retry: { setTimeout: timer, clearTimeout },
    });

    await expect(session.start()).rejects.toBeTruthy();
    session.dispose();
    expect(clearTimeout).toHaveBeenCalledWith(1);
  });
});
