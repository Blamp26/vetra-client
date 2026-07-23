import { beforeEach, describe, expect, it, vi } from "vitest";
import { DirectedCallSignalTransport } from "./directedCallSignalTransport";
import type { DirectedCallSession } from "./directedCallSession";

const callId = "33333333-3333-4333-8333-333333333333";
const otherCallId = "44444444-4444-4444-8444-444444444444";
const signalId = "99999999-9999-4999-8999-999999999999";

function createSession() {
  const listeners = new Set<(signal: any) => void>();
  return {
    sendSignal: vi.fn().mockResolvedValue({ ok: true }),
    subscribeToSignals: vi.fn((listener: (signal: any) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    emit(signal: unknown) {
      listeners.forEach((listener) => listener(signal));
    },
  } as unknown as DirectedCallSession & { emit: (signal: unknown) => void };
}

describe("DirectedCallSignalTransport", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends only the bound call through the existing session", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { callId, generation: "g1" });
    const payload = { sdp: "v=0" };

    await transport.send(signalId, "offer", payload);

    expect(session.sendSignal).toHaveBeenCalledWith(callId, signalId, "offer", payload);
  });

  it("filters foreign signals and delivers valid own-call signals", () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { callId, generation: "g1" });
    const received = vi.fn();
    transport.subscribe(received);
    const own = { call_id: callId, signal_id: signalId, kind: "ice_candidate", payload: {} };

    session.emit({ ...own, call_id: otherCallId });
    session.emit(own);

    expect(received).toHaveBeenCalledTimes(1);
    expect(received).toHaveBeenCalledWith(own);
  });

  it("fences stale generations and never exposes signal payloads in errors", async () => {
    let current = true;
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, {
      callId,
      generation: "g1",
      isGenerationCurrent: () => current,
    });

    current = false;
    await expect(transport.send(signalId, "offer", { sdp: "secret-sdp" })).rejects.toThrow("disposed directed-call signal transport");
    expect(() => new DirectedCallSignalTransport(session, { callId: "not-a-uuid", generation: "g1" })).toThrow("invalid directed-call signal transport");
    expect(() => new DirectedCallSignalTransport(session, { callId, generation: "g1" }).bindCall(otherCallId)).toThrow("invalid directed-call signal transport call");
  });

  it("disposes subscriptions and rejects later sends", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { callId, generation: "g1" });
    const received = vi.fn();
    transport.subscribe(received);
    transport.dispose();
    session.emit({ call_id: callId, signal_id: signalId, kind: "offer", payload: { sdp: "v=0" } });

    expect(received).not.toHaveBeenCalled();
    await expect(transport.send(signalId, "offer", { sdp: "v=0" })).rejects.toThrow("disposed directed-call signal transport");
  });

  it("fences an in-flight signal when the media attempt is invalidated", async () => {
    let resolveSend!: (value: unknown) => void;
    const session = createSession();
    (session.sendSignal as any).mockImplementationOnce(() => new Promise((resolve) => { resolveSend = resolve; }));
    const transport = new DirectedCallSignalTransport(session, { callId, generation: "g1" });
    const operation = transport.send(signalId, "offer", { sdp: "v=0" });

    transport.invalidate();
    resolveSend({ ok: true });

    await expect(operation).rejects.toThrow("stale directed-call signal");
  });

  it("can safely unbind and rebind for a later call", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { callId, generation: "g1" });
    const received = vi.fn();
    transport.subscribe(received);
    transport.unbindCall();
    expect(transport.callId).toBeNull();
    await expect(transport.send(signalId, "offer", { sdp: "v=0" })).rejects.toThrow("unbound directed-call signal transport");

    transport.bindCall(otherCallId);
    await transport.send(signalId, "offer", { sdp: "v=0" });
    expect(session.sendSignal).toHaveBeenCalledWith(otherCallId, signalId, "offer", { sdp: "v=0" });
    session.emit({ call_id: callId, signal_id: signalId, kind: "offer", payload: {} });
    session.emit({ call_id: otherCallId, signal_id: signalId, kind: "offer", payload: {} });
    expect(received).toHaveBeenCalledTimes(1);
    expect(received).toHaveBeenCalledWith(expect.objectContaining({ call_id: otherCallId }));
  });

  it("fences an in-flight send when the call is unbound for rollover", async () => {
    let resolveSend!: (value: unknown) => void;
    const session = createSession();
    (session.sendSignal as any).mockImplementationOnce(() => new Promise((resolve) => { resolveSend = resolve; }));
    const transport = new DirectedCallSignalTransport(session, { callId, generation: "g1" });
    const operation = transport.send(signalId, "offer", { sdp: "v=0" });
    transport.unbindCall();
    resolveSend({ ok: true });

    await expect(operation).rejects.toThrow("stale directed-call signal");
  });
});
