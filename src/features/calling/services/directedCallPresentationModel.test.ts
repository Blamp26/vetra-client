import { describe, expect, it, vi } from "vitest";
import type { StateProjection } from "../protocol/directedCallProtocol";
import type {
  DirectedCallControllerSnapshot,
  DirectedCallSessionPort,
  LifecycleCommandOutcome,
  PendingLifecycleCommand,
} from "./directedCallLifecycleController";
import type { IncomingPresentationSnapshot } from "./directedCallIncomingCoordinator";
import {
  DirectedCallPresentationModel,
  type DirectedCallPresentationIncomingPort,
  type DirectedCallPresentationLifecyclePort,
} from "./directedCallPresentationModel";

const CALL_ID = "11111111-1111-4111-8111-111111111111";
const DEVICE_ID = "22222222-2222-4222-8222-222222222222";
const PEER_ID = "33333333-3333-4333-8333-333333333333";
const TARGET_ID = "44444444-4444-4444-8444-444444444444";
const SECOND_CALL_ID = "66666666-6666-4666-8666-666666666666";

function projection(
  state: StateProjection["state"],
  role: StateProjection["participant_role"] = "initiator",
  version = 1,
  callId = CALL_ID,
  username = "Alice",
): StateProjection {
  return {
    protocol_version: 1,
    call_id: callId,
    state,
    state_version: version,
    media: "audio",
    participant_role: role,
    peer: { user_id: PEER_ID, username },
    created_at: "2026-07-20T10:00:00.000000Z",
    presented_at: state === "presented" ? "2026-07-20T10:00:02.000000Z" : null,
    accepted_at: ["accepted", "connecting", "active"].includes(state) ? "2026-07-20T10:00:03.000000Z" : null,
    connecting_at: ["connecting", "active"].includes(state) ? "2026-07-20T10:00:04.000000Z" : null,
    active_at: state === "active" ? "2026-07-20T10:00:05.000000Z" : null,
    ended_at: ["declined", "cancelled", "no_answer", "connection_failed", "ended"].includes(state)
      ? "2026-07-20T10:00:06.000000Z"
      : null,
  };
}

function commandReply(event: string): LifecycleCommandOutcome {
  return {
    status: "acknowledged",
    event: event as LifecycleCommandOutcome & never,
    commandId: "55555555-5555-4555-8555-555555555555",
    result: { call_id: CALL_ID, state: "presented", state_version: 2, result_code: "applied" },
  } as LifecycleCommandOutcome;
}

function transportFailure(event: "call:accept" | "call:decline" | "call:cancel" | "call:hangup"): LifecycleCommandOutcome {
  return {
    status: "failed",
    event,
    commandId: "55555555-5555-4555-8555-555555555555",
    error: { kind: "transport_timeout" },
  };
}

function createHarness() {
  let projectionListener: ((value: StateProjection, classification: "accepted" | "duplicate") => void) | null = null;
  let syncListener: (() => void) | null = null;
  let controllerListener: ((snapshot: DirectedCallControllerSnapshot) => void) | null = null;
  let incomingListener: ((snapshot: IncomingPresentationSnapshot) => void) | null = null;
  const pushes: Array<{ event: string; payload?: unknown }> = [];
  const state: DirectedCallControllerSnapshot = {
    phase: "idle",
    preparing: false,
    disposed: false,
    callId: null,
    projection: null,
    pendingCommand: null,
    lastCommandError: null,
  };
  const incomingState: IncomingPresentationSnapshot = {
    disposed: false,
    visible: false,
    callId: null,
    projection: null,
    recoverableError: null,
  };
  const session: DirectedCallSessionPort = {
    deviceId: DEVICE_ID,
    getProjection: (callId) => state.projection?.call_id === callId ? state.projection : null,
    subscribeToProjections: (listener) => {
      projectionListener = listener;
      return () => { projectionListener = null; };
    },
    subscribeToSync: (listener) => {
      syncListener = listener;
      return () => { syncListener = null; };
    },
    pushCommand: vi.fn(),
  };
  const lifecycle = {
    initiate: vi.fn(async (_target: string) => commandReply("call:initiate")),
    received: vi.fn(async () => commandReply("call:received")),
    presented: vi.fn(async () => commandReply("call:presented")),
    accept: vi.fn(async () => commandReply("call:accept")),
    cancel: vi.fn(async () => commandReply("call:cancel")),
    decline: vi.fn(async () => commandReply("call:decline")),
    hangup: vi.fn(async () => commandReply("call:hangup")),
    retryPendingCommand: vi.fn(async () => commandReply("call:initiate")),
    getSnapshot: () => state,
    subscribe: (listener) => {
      controllerListener = listener;
      return () => { controllerListener = null; };
    },
  } satisfies DirectedCallPresentationLifecyclePort;
  const incoming: DirectedCallPresentationIncomingPort = {
    getSnapshot: () => incomingState,
    subscribe: (listener) => {
      incomingListener = listener;
      return () => { incomingListener = null; };
    },
    onModalPresented: vi.fn(),
  };
  const model = new DirectedCallPresentationModel(session, lifecycle, incoming, { enabled: true });
  const emit = (next: StateProjection) => {
    state.callId = next.call_id;
    state.projection = next;
    state.preparing = false;
    incomingState.callId = next.call_id;
    incomingState.projection = next;
    incomingState.visible = next.participant_role === "recipient" && ["delivered", "presented"].includes(next.state);
    projectionListener?.(next, "accepted");
    controllerListener?.(state);
    incomingListener?.(incomingState);
  };
  return {
    model,
    lifecycle,
    incoming,
    session,
    state,
    incomingState,
    pushes,
    emit,
    emitSync: () => syncListener?.(),
    setPending: (pending: PendingLifecycleCommand | null) => {
      state.pendingCommand = pending;
      controllerListener?.(state);
    },
    setPreparing: (value: boolean) => { state.preparing = value; controllerListener?.(state); },
  };
}

describe("DirectedCallPresentationModel", () => {
  it("is dormant by default", () => {
    const harness = createHarness();
    const dormant = new DirectedCallPresentationModel(harness.session, harness.lifecycle, harness.incoming);
    expect(dormant.getSnapshot().phase).toBe("idle");
    dormant.dispose();
  });

  it("rejects numeric targets and uses public UUID targets", async () => {
    const harness = createHarness();
    await expect(harness.model.startCall("42", "Alice")).resolves.toMatchObject({ status: "failed" });
    expect(harness.lifecycle.initiate).not.toHaveBeenCalled();

    await harness.model.startCall(TARGET_ID, "Alice");
    expect(harness.lifecycle.initiate).toHaveBeenCalledWith(TARGET_ID);
  });

  it("exposes preparing before initiation completes and never invents a call ID", async () => {
    const harness = createHarness();
    let resolve!: (outcome: LifecycleCommandOutcome) => void;
    harness.lifecycle.initiate = vi.fn((_target: string) => {
      harness.setPreparing(true);
      return new Promise<LifecycleCommandOutcome>((next) => { resolve = next; });
    });
    const operation = harness.model.startCall(TARGET_ID, "Alice");
    expect(harness.model.getSnapshot()).toMatchObject({ phase: "preparing", callId: null, peerUsername: "Alice" });
    resolve(commandReply("call:initiate"));
    await operation;
    expect(harness.model.getSnapshot().callId).toBeNull();
  });

  it.each([
    ["dispatching", "calling"], ["delivered", "calling"], ["presented", "ringing"],
    ["accepted", "connecting"], ["connecting", "connecting"], ["active", "active"],
    ["declined", "terminal"], ["cancelled", "terminal"], ["ended", "terminal"],
  ] as const)("maps initiator %s to %s", (state, phase) => {
    const harness = createHarness();
    harness.emit(projection(state));
    expect(harness.model.getSnapshot().phase).toBe(phase);
  });

  it.each(["delivered", "presented"] as const)("maps recipient %s to incoming", (state) => {
    const harness = createHarness();
    harness.emit(projection(state, "recipient"));
    expect(harness.model.getSnapshot()).toMatchObject({ phase: "incoming", callId: CALL_ID, peerUsername: "Alice" });
    expect(harness.model.getSnapshot().incomingModal.presentationKey).toBe(CALL_ID);
  });

  it("maps recipient dispatching to no visible incoming presentation", () => {
    const harness = createHarness();
    harness.emit(projection("dispatching", "recipient"));
    expect(harness.model.getSnapshot()).toMatchObject({ phase: "idle", incomingModal: { visible: false } });
  });

  it("queues accept and decline during delivered until presented, mutually exclusively", async () => {
    const harness = createHarness();
    harness.emit(projection("delivered", "recipient"));
    await expect(harness.model.accept()).resolves.toMatchObject({ status: "queued" });
    await expect(harness.model.decline()).resolves.toMatchObject({ status: "ignored" });
    expect(harness.lifecycle.accept).not.toHaveBeenCalled();

    harness.emit(projection("presented", "recipient", 2));
    await Promise.resolve();
    expect(harness.lifecycle.accept).toHaveBeenCalledTimes(1);
    expect(harness.lifecycle.decline).not.toHaveBeenCalled();
  });

  it("sends accept and decline once from presented without optimistic state", async () => {
    const acceptHarness = createHarness();
    acceptHarness.emit(projection("presented", "recipient"));
    await acceptHarness.model.accept();
    await acceptHarness.model.accept();
    expect(acceptHarness.lifecycle.accept).toHaveBeenCalledTimes(1);
    expect(acceptHarness.model.getSnapshot().canonicalState).toBe("presented");

    const declineHarness = createHarness();
    declineHarness.emit(projection("presented", "recipient"));
    await declineHarness.model.decline();
    await declineHarness.model.decline();
    expect(declineHarness.lifecycle.decline).toHaveBeenCalledTimes(1);
  });

  it("sends caller cancel only in pre-accept states and hangup only after acceptance", async () => {
    const harness = createHarness();
    harness.emit(projection("delivered"));
    await harness.model.cancelCall();
    await harness.model.cancelCall();
    expect(harness.lifecycle.cancel).toHaveBeenCalledTimes(1);

    harness.emit(projection("accepted", "initiator", 2));
    expect(await harness.model.cancelCall()).toMatchObject({ status: "ignored" });
    await harness.model.hangup();
    await harness.model.hangup();
    expect(harness.lifecycle.hangup).toHaveBeenCalledTimes(1);
  });

  it("resolves uncertain initiation cancellation with bounded same-command retry and distinct cancel", async () => {
    const harness = createHarness();
    let resolveInitiate!: (outcome: LifecycleCommandOutcome) => void;
    const initiate = vi.fn((_target: string) => {
      harness.setPreparing(true);
      return new Promise<LifecycleCommandOutcome>((resolve) => { resolveInitiate = resolve; });
    });
    harness.lifecycle.initiate = initiate;
    harness.lifecycle.getSnapshot = () => ({ ...harness.state, pendingCommand: { event: "call:initiate", callId: null, commandId: "77777777-7777-4777-8777-777777777777", attempts: 1 } });
    harness.lifecycle.retryPendingCommand = vi.fn(async (): Promise<LifecycleCommandOutcome> => ({
      status: "acknowledged",
      event: "call:initiate",
      commandId: "77777777-7777-4777-8777-777777777777",
      result: {
        call_id: CALL_ID,
        state: "dispatching",
        state_version: 1,
        media: "audio",
        participant_role: "initiator",
        merged: false,
        attempt_created: true,
      },
    }));
    const operation = harness.model.startCall(TARGET_ID, "Alice");
    await harness.model.cancelCall();
    resolveInitiate({ status: "failed", event: "call:initiate", commandId: "77777777-7777-4777-8777-777777777777", error: { kind: "transport_timeout" } });
    await operation;

    expect(harness.lifecycle.retryPendingCommand).toHaveBeenCalledTimes(1);
    expect(harness.lifecycle.cancel).toHaveBeenCalledTimes(1);
  });

  it("does not send begin_connecting, media, or terminal commands automatically", () => {
    const harness = createHarness();
    harness.emit(projection("accepted"));
    expect(harness.lifecycle.hangup).not.toHaveBeenCalled();
    expect(harness.lifecycle).not.toHaveProperty("beginConnecting");
  });

  it("keeps terminal labels stable and clears local intents on authoritative advancement", async () => {
    const harness = createHarness();
    harness.emit(projection("delivered", "recipient"));
    await harness.model.accept();
    harness.emit(projection("declined", "recipient", 2));
    expect(harness.model.getSnapshot()).toMatchObject({ phase: "terminal", terminalState: "declined", terminalLabel: "Call declined", pendingAction: null });
  });

  it.each(["delivered", "presented"] as const)("rolls from terminal call A to incoming call B in %s", (stateName) => {
    const harness = createHarness();
    harness.emit(projection("ended", "initiator", 8, CALL_ID, "Old call"));
    harness.emit(projection(stateName, "recipient", 1, SECOND_CALL_ID, "New caller"));

    expect(harness.model.getSnapshot()).toMatchObject({
      callId: SECOND_CALL_ID,
      phase: "incoming",
      canonicalState: stateName,
      peerUsername: "New caller",
      incomingModal: { visible: true, presentationKey: SECOND_CALL_ID },
    });
  });

  it("clears old-call action, error, and fallback data during rollover", async () => {
    const harness = createHarness();
    harness.emit(projection("presented", "recipient", 1, CALL_ID, "Old caller"));
    harness.lifecycle.accept.mockResolvedValueOnce({
      status: "failed",
      event: "call:accept",
      commandId: "77777777-7777-4777-8777-777777777777",
      error: { kind: "rejected" },
    });
    await harness.model.accept();
    expect(harness.model.getSnapshot().recoverableError).toMatchObject({ callId: CALL_ID });

    harness.emit(projection("delivered", "recipient", 1, SECOND_CALL_ID, "New caller"));
    expect(harness.model.getSnapshot()).toMatchObject({
      callId: SECOND_CALL_ID,
      pendingAction: null,
      recoverableError: null,
      peerUsername: "New caller",
    });
    expect(harness.lifecycle.retryPendingCommand).not.toHaveBeenCalled();
  });

  it("does not retry an old-call command after rollover", async () => {
    const harness = createHarness();
    harness.emit(projection("presented", "recipient", 1, CALL_ID));
    harness.setPending({ event: "call:accept", callId: CALL_ID, commandId: "77777777-7777-4777-8777-777777777777", attempts: 1 });
    harness.lifecycle.accept.mockResolvedValueOnce(transportFailure("call:accept"));
    await harness.model.accept();
    harness.emit(projection("delivered", "recipient", 1, SECOND_CALL_ID, "New caller"));
    harness.emitSync();
    await Promise.resolve();

    expect(harness.lifecycle.retryPendingCommand).not.toHaveBeenCalled();
    expect(harness.model.getSnapshot().callId).toBe(SECOND_CALL_ID);
  });

  it("preserves presentation on disconnect-like silence and clears everything on disposal", () => {
    const harness = createHarness();
    harness.emit(projection("active"));
    expect(harness.model.getSnapshot().phase).toBe("active");
    harness.model.dispose();
    expect(harness.model.getSnapshot()).toMatchObject({ disposed: true, callId: null, pendingAction: null });
    expect(harness.lifecycle.hangup).not.toHaveBeenCalled();
  });

  it("retains an accept transport failure and retries the controller command without a second accept", async () => {
    const harness = createHarness();
    harness.emit(projection("presented", "recipient"));
    harness.setPending({ event: "call:accept", callId: CALL_ID, commandId: "77777777-7777-4777-8777-777777777777", attempts: 1 });
    harness.lifecycle.accept.mockResolvedValueOnce(transportFailure("call:accept"));
    await harness.model.accept();

    expect(harness.model.getSnapshot()).toMatchObject({ pendingAction: "accepting", recoverableError: { kind: "transport" } });
    harness.lifecycle.retryPendingCommand.mockResolvedValueOnce(commandReply("call:accept"));
    harness.emitSync();
    await Promise.resolve();

    expect(harness.lifecycle.accept).toHaveBeenCalledTimes(1);
    expect(harness.lifecycle.retryPendingCommand).toHaveBeenCalledTimes(1);
    expect(harness.model.getSnapshot()).toMatchObject({ pendingAction: "accepting", canonicalState: "presented" });
  });

  it.each([
    ["decline", "presented", "recipient", "declining", "call:decline"],
    ["cancel", "delivered", "initiator", "cancelling", "call:cancel"],
    ["hangup", "active", "recipient", "hanging_up", "call:hangup"],
  ] as const)("recovers a %s transport failure through the retained command", async (action, stateName, role, pending, event) => {
    const harness = createHarness();
    harness.emit(projection(stateName, role));
    harness.setPending({ event, callId: CALL_ID, commandId: "77777777-7777-4777-8777-777777777777", attempts: 1 });
    const method = action === "decline" ? harness.lifecycle.decline : action === "cancel" ? harness.lifecycle.cancel : harness.lifecycle.hangup;
    method.mockResolvedValueOnce(transportFailure(event));
    const result = action === "decline" ? harness.model.decline() : action === "cancel" ? harness.model.cancelCall() : harness.model.hangup();
    await result;

    expect(harness.model.getSnapshot().pendingAction).toBe(pending);
    harness.lifecycle.retryPendingCommand.mockResolvedValueOnce(commandReply(event));
    harness.emitSync();
    await Promise.resolve();
    expect(method).toHaveBeenCalledTimes(1);
    expect(harness.lifecycle.retryPendingCommand).toHaveBeenCalledTimes(1);
  });

  it("supports explicit retry, coalesces sync, and never makes a fourth attempt", async () => {
    const harness = createHarness();
    harness.emit(projection("presented", "recipient"));
    harness.setPending({ event: "call:accept", callId: CALL_ID, commandId: "77777777-7777-4777-8777-777777777777", attempts: 2 });
    harness.lifecycle.accept.mockResolvedValueOnce(transportFailure("call:accept"));
    await harness.model.accept();
    let resolveRetry!: (outcome: LifecycleCommandOutcome) => void;
    harness.lifecycle.retryPendingCommand.mockImplementationOnce(() => new Promise((resolve) => { resolveRetry = resolve; }));
    const firstRetry = harness.model.retryPendingAction();
    const secondRetry = harness.model.retryPendingAction();
    harness.emitSync();
    expect(harness.lifecycle.retryPendingCommand).toHaveBeenCalledTimes(1);
    await expect(secondRetry).resolves.toMatchObject({ status: "ignored" });
    resolveRetry({
      status: "failed",
      event: "call:accept",
      commandId: "77777777-7777-4777-8777-777777777777",
      error: { kind: "retry_exhausted" },
    });
    await firstRetry;
    expect(harness.model.getSnapshot().recoverableError).toMatchObject({ kind: "retry_exhausted" });
    harness.emitSync();
    expect(harness.lifecycle.retryPendingCommand).toHaveBeenCalledTimes(1);
  });

  it("does not treat applied, duplicate, or no-op replies as canonical projection changes", async () => {
    for (const resultCode of ["applied", "duplicate", "no_op"] as const) {
      const harness = createHarness();
      harness.emit(projection("presented", "recipient"));
      harness.lifecycle.accept.mockResolvedValueOnce({
        ...commandReply("call:accept"),
        result: { call_id: CALL_ID, state: "accepted", state_version: 2, result_code: resultCode },
      } as LifecycleCommandOutcome);
      await harness.model.accept();
      expect(harness.model.getSnapshot().canonicalState).toBe("presented");
      expect(harness.model.getSnapshot().pendingAction).toBe("accepting");
    }
  });

  it("scopes rejection errors and clears them when authoritative state advances", async () => {
    const harness = createHarness();
    harness.emit(projection("presented", "recipient"));
    harness.lifecycle.accept.mockResolvedValueOnce({
      status: "acknowledged",
      event: "call:accept",
      commandId: "55555555-5555-4555-8555-555555555555",
      result: { call_id: CALL_ID, state: "presented", state_version: 1, result_code: "rejected" },
    });
    await harness.model.accept();
    expect(harness.model.getSnapshot().recoverableError).toMatchObject({ kind: "rejected", callId: CALL_ID, action: "accepting" });
    harness.emit(projection("accepted", "recipient", 2));
    expect(harness.model.getSnapshot().recoverableError).toBeNull();
  });

  it("checks the newest projection before uncertain initiation cancellation", async () => {
    const harness = createHarness();
    let resolveInitiate!: (outcome: LifecycleCommandOutcome) => void;
    harness.lifecycle.initiate = vi.fn((_target: string) => {
      harness.setPreparing(true);
      return new Promise<LifecycleCommandOutcome>((resolve) => { resolveInitiate = resolve; });
    });
    const operation = harness.model.startCall(TARGET_ID, "Alice");
    await harness.model.cancelCall();
    harness.emit(projection("accepted", "initiator", 2));
    resolveInitiate({
      status: "acknowledged",
      event: "call:initiate",
      commandId: "77777777-7777-4777-8777-777777777777",
      result: { call_id: CALL_ID, state: "dispatching", state_version: 1, media: "audio", participant_role: "initiator", merged: false, attempt_created: true },
    });
    await operation;
    expect(harness.lifecycle.cancel).not.toHaveBeenCalled();
  });
});
