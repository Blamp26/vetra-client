import { describe, expect, it, vi } from "vitest";
import { DirectedCallSignalTransport } from "./directedCallSignalTransport";
import { DirectedCallMediaCoordinator } from "./directedCallMediaCoordinator";
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
  const stored: any[] = [];
  const session = {
    getProjections: vi.fn(() => stored),
    subscribeToProjections: vi.fn((listener: (value: any) => void) => {
      projectionListeners.add(listener);
      return () => projectionListeners.delete(listener);
    }),
    emit(value: any) {
      stored.push(value);
      projectionListeners.forEach((listener) => listener(value));
    },
    subscribeToSignals: vi.fn(() => () => undefined),
    sendSignal: vi.fn(),
  } as unknown as DirectedCallSession & { emit: (value: any) => void };
  return session;
}

describe("DirectedCallMediaCoordinator", () => {
  it("observes authoritative accepted/connecting state without media actions", () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const coordinator = new DirectedCallMediaCoordinator(session, transport, "g1");
    coordinator.start();

    session.emit(projection("accepted"));
    expect(coordinator.getSnapshot()).toMatchObject({ state: "accepted", callId });
    expect(session.sendSignal).not.toHaveBeenCalled();
    expect(vi.isMockFunction(globalThis.navigator?.mediaDevices?.getUserMedia)).toBe(false);
  });

  it("becomes signaling-ready only from authoritative connecting/active state", () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const coordinator = new DirectedCallMediaCoordinator(session, transport, "g1");
    coordinator.start();

    session.emit(projection("connecting"));
    expect(coordinator.getSnapshot().state).toBe("signaling_ready");
    expect(session.sendSignal).not.toHaveBeenCalled();
  });

  it("disposes on terminal projection and unsubscribes the transport", () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const transportDispose = vi.spyOn(transport, "dispose");
    const coordinator = new DirectedCallMediaCoordinator(session, transport, "g1");
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
    const coordinator = new DirectedCallMediaCoordinator(session, transport, "g1");
    coordinator.start();

    session.emit({ ...projection("ended"), call_id: peerId });
    expect(coordinator.getSnapshot().state).toBe("idle");
    coordinator.dispose();
    expect(coordinator.getSnapshot().state).toBe("disposed");
  });
});
