import { describe, expect, it, vi } from "vitest";
import { DirectedCallSignalTransport } from "./directedCallSignalTransport";
import { DirectedCallMediaCoordinator } from "./directedCallMediaCoordinator";
import type { DirectedCallWebRtcAdapter } from "./directedCallWebRtcAdapter";
import type { DirectedCallSession } from "./directedCallSession";

const callId = "33333333-3333-4333-8333-333333333333";
const peerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function projection(state: "accepted" | "connecting" | "active" | "ended") {
  return {
    protocol_version: 1 as const,
    call_id: callId,
    state,
    state_version: state === "ended" ? 4 : 1,
    media: "audio" as const,
    participant_role: "initiator" as const,
    peer: { user_id: peerId, username: "alice" },
    created_at: "2026-01-02T03:04:05.123456Z",
    presented_at: null,
    accepted_at: state === "accepted" || state === "connecting" || state === "active" ? "2026-01-02T03:04:06.123456Z" : null,
    connecting_at: state === "connecting" || state === "active" ? "2026-01-02T03:04:07.123456Z" : null,
    active_at: state === "active" ? "2026-01-02T03:04:08.123456Z" : null,
    ended_at: state === "ended" ? "2026-01-02T03:04:09.123456Z" : null,
  };
}

function createSession() {
  const projectionListeners = new Set<(value: any) => void>();
  const signalListeners = new Set<(value: any) => void>();
  const stored: any[] = [];
  const session = {
    getProjections: vi.fn(() => stored),
    getProjection: vi.fn((callId: string) => stored.find((projection) => projection.call_id === callId) ?? null),
    subscribeToProjections: vi.fn((listener: (value: any) => void) => {
      projectionListeners.add(listener);
      return () => projectionListeners.delete(listener);
    }),
    emit(value: any) {
      stored.push(value);
      projectionListeners.forEach((listener) => listener(value));
    },
    emitSignal(value: any) {
      signalListeners.forEach((listener) => listener(value));
    },
    subscribeToSignals: vi.fn((listener: (value: any) => void) => {
      signalListeners.add(listener);
      return () => signalListeners.delete(listener);
    }),
    sendSignal: vi.fn(),
  } as unknown as DirectedCallSession & { emit: (value: any) => void; emitSignal: (value: any) => void };
  return session;
}

function createLifecycle() {
  return {
    beginConnecting: vi.fn().mockResolvedValue({ status: "acknowledged" }),
    mediaReady: vi.fn().mockResolvedValue({ status: "acknowledged" }),
    setupFailed: vi.fn().mockResolvedValue({ status: "acknowledged" }),
  };
}

function createAdapter() {
  return {
    prepareOffer: vi.fn().mockResolvedValue({ type: "offer", sdp: "offer" }),
    prepareAnswer: vi.fn().mockResolvedValue(undefined),
    acceptOffer: vi.fn().mockResolvedValue({ type: "answer", sdp: "answer" }),
    acceptAnswer: vi.fn().mockResolvedValue(true),
    addRemoteIceCandidate: vi.fn().mockResolvedValue(true),
    dispose: vi.fn(),
  } as unknown as DirectedCallWebRtcAdapter;
}

function createCoordinator(session: ReturnType<typeof createSession>, transport: DirectedCallSignalTransport) {
  return new DirectedCallMediaCoordinator(session, transport, createLifecycle(), "g1", {
    adapterFactory: () => createAdapter(),
  });
}

describe("DirectedCallMediaCoordinator", () => {
  it("observes authoritative accepted/connecting state without media actions", () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const coordinator = createCoordinator(session, transport);
    coordinator.start();

    session.emit(projection("accepted"));
    expect(coordinator.getSnapshot()).toMatchObject({ state: "accepted", callId });
    expect(session.sendSignal).not.toHaveBeenCalled();
    expect(vi.isMockFunction(globalThis.navigator?.mediaDevices?.getUserMedia)).toBe(false);
  });

  it("becomes signaling-ready only from authoritative connecting/active state", () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const coordinator = createCoordinator(session, transport);
    coordinator.start();

    session.emit(projection("connecting"));
    expect(coordinator.getSnapshot().state).toBe("signaling_ready");
    expect(session.sendSignal).not.toHaveBeenCalled();
  });

  it("runs the initiator offer flow only after connecting and reports readiness", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", {
      adapterFactory: () => adapter,
    });
    coordinator.start();

    session.emit(projection("accepted"));
    await vi.waitFor(() => expect(lifecycle.beginConnecting).toHaveBeenCalledWith(callId));
    expect(session.sendSignal).not.toHaveBeenCalled();

    session.emit(projection("connecting"));
    await vi.waitFor(() => expect(lifecycle.mediaReady).toHaveBeenCalledWith(callId));
    expect(session.sendSignal).toHaveBeenCalledWith(callId, expect.any(String), "offer", { sdp: "offer" });
  });

  it("runs the recipient answer flow only for a bound connecting call", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", {
      adapterFactory: () => adapter,
    });
    coordinator.start();
    const accepted = { ...projection("accepted"), participant_role: "recipient" as const };
    const connecting = { ...projection("connecting"), participant_role: "recipient" as const };
    session.emit(accepted);
    session.emit(connecting);
    session.emitSignal({ call_id: callId, signal_id: "99999999-9999-4999-8999-999999999999", kind: "offer", payload: { sdp: "offer" } });
    await vi.waitFor(() => expect(lifecycle.mediaReady).toHaveBeenCalledWith(callId));

    expect(adapter.acceptOffer).toHaveBeenCalledTimes(1);
    expect(session.sendSignal).toHaveBeenCalledWith(callId, expect.any(String), "answer", { sdp: "answer" });
    expect(lifecycle.mediaReady).toHaveBeenCalledWith(callId);
    expect(lifecycle.beginConnecting).not.toHaveBeenCalled();
  });

  it("disposes on terminal projection and unsubscribes the transport", () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const transportDispose = vi.spyOn(transport, "dispose");
    const coordinator = createCoordinator(session, transport);
    coordinator.start();

    session.emit(projection("accepted"));
    session.emit(projection("ended"));

    expect(coordinator.getSnapshot().state).toBe("disposed");
    expect(transportDispose).toHaveBeenCalledTimes(1);
    expect(session.sendSignal).not.toHaveBeenCalled();
  });

  it("does not bind a terminal or second call and can be deterministically disposed", () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const coordinator = createCoordinator(session, transport);
    coordinator.start();

    session.emit({ ...projection("ended"), call_id: peerId });
    expect(coordinator.getSnapshot().state).toBe("idle");
    coordinator.dispose();
    expect(coordinator.getSnapshot().state).toBe("disposed");
  });
});
