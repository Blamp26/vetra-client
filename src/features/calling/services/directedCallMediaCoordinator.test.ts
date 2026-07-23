import { describe, expect, it, vi } from "vitest";
import { DirectedCallSignalTransport } from "./directedCallSignalTransport";
import { DirectedCallMediaCoordinator } from "./directedCallMediaCoordinator";
import type { DirectedCallWebRtcAdapter, DirectedCallWebRtcAdapterOptions } from "./directedCallWebRtcAdapter";
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
  const syncListeners = new Set<() => void>();
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
    subscribeToSync: vi.fn((listener: () => void) => {
      syncListeners.add(listener);
      return () => syncListeners.delete(listener);
    }),
    emitSync() {
      syncListeners.forEach((listener) => listener());
    },
    requestSync: vi.fn().mockResolvedValue(undefined),
    sendSignal: vi.fn(),
  } as unknown as DirectedCallSession & { emit: (value: any) => void; emitSignal: (value: any) => void; emitSync: () => void };
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

function createTrack(kind: "audio" | "video" = "audio") {
  const listeners = new Map<string, Set<EventListener>>();
  const track = {
    kind,
    enabled: true,
    readyState: "live",
    stop: vi.fn(),
    addEventListener(type: string, listener: EventListener) {
      const entries = listeners.get(type) ?? new Set<EventListener>();
      entries.add(listener);
      listeners.set(type, entries);
    },
    removeEventListener(type: string, listener: EventListener) {
      listeners.get(type)?.delete(listener);
    },
    emit(type: string) {
      listeners.get(type)?.forEach((listener) => listener(new Event(type)));
    },
  };
  return track;
}

function createStream(tracks: ReturnType<typeof createTrack>[]) {
  const listeners = new Map<string, Set<EventListener>>();
  return {
    getTracks: () => tracks,
    addEventListener(type: string, listener: EventListener) {
      const entries = listeners.get(type) ?? new Set<EventListener>();
      entries.add(listener);
      listeners.set(type, entries);
    },
    removeEventListener(type: string, listener: EventListener) {
      listeners.get(type)?.delete(listener);
    },
    addTrack(track: ReturnType<typeof createTrack>) {
      tracks.push(track);
      listeners.get("addtrack")?.forEach((listener) => listener(new Event("addtrack")));
    },
    removeTrack(track: ReturnType<typeof createTrack>) {
      const index = tracks.indexOf(track);
      if (index >= 0) tracks.splice(index, 1);
      listeners.get("removetrack")?.forEach((listener) => listener(new Event("removetrack")));
    },
  };
}

function createCoordinator(session: ReturnType<typeof createSession>, transport: DirectedCallSignalTransport) {
  return new DirectedCallMediaCoordinator(session, transport, createLifecycle(), "g1", {
    adapterFactory: () => createAdapter(),
  });
}

describe("DirectedCallMediaCoordinator", () => {
  it("toggles only live local audio tracks and inherits mute for newly added tracks", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const audioOne = createTrack();
    const audioTwo = createTrack();
    const video = createTrack("video");
    const stream = createStream([audioOne, audioTwo, video]);
    let muted = false;
    const adapter = {
      prepareOffer: vi.fn().mockResolvedValue({ type: "offer", sdp: "offer" }),
      localMediaStream: stream,
      get isLocalAudioMuted() { return muted; },
      setLocalAudioMuted: vi.fn((next: boolean) => {
        const liveAudio = stream.getTracks().filter((track) => track.kind === "audio" && track.readyState !== "ended");
        if (liveAudio.length === 0) return false;
        muted = next;
        liveAudio.forEach((track) => { track.enabled = !next; });
        return true;
      }),
      dispose: vi.fn(),
    } as unknown as DirectedCallWebRtcAdapter;
    const lifecycle = createLifecycle();
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", {
      adapterFactory: () => adapter,
    });
    coordinator.start();
    session.emit(projection("accepted"));
    await vi.waitFor(() => expect(coordinator.getSnapshot().canToggleMute).toBe(true));

    expect(coordinator.getSnapshot()).toMatchObject({ isMuted: false, canToggleMute: true });
    expect(coordinator.toggleMute()).toBe(true);
    expect(audioOne.enabled).toBe(false);
    expect(audioTwo.enabled).toBe(false);
    expect(video.enabled).toBe(true);
    expect(coordinator.getSnapshot().isMuted).toBe(true);
    expect(session.sendSignal).not.toHaveBeenCalled();

    const replacement = createTrack();
    stream.addTrack(replacement);
    expect(replacement.enabled).toBe(false);
    expect(coordinator.getSnapshot().canToggleMute).toBe(true);

    expect(coordinator.toggleMute()).toBe(true);
    expect(audioOne.enabled).toBe(true);
    expect(audioTwo.enabled).toBe(true);
    expect(replacement.enabled).toBe(true);
    expect(video.enabled).toBe(true);
    expect(coordinator.getSnapshot().isMuted).toBe(false);

    audioOne.readyState = "ended";
    audioOne.emit("ended");
    stream.removeTrack(audioTwo);
    stream.removeTrack(replacement);
    expect(coordinator.getSnapshot().canToggleMute).toBe(false);
    expect(coordinator.toggleMute()).toBe(false);
    expect(coordinator.getSnapshot().isMuted).toBe(false);
  });

  it("clears mute state and track listeners on terminalization and disposal", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const track = createTrack();
    const stream = createStream([track]);
    let muted = false;
    const adapter = {
      prepareOffer: vi.fn().mockResolvedValue({ type: "offer", sdp: "offer" }),
      localMediaStream: stream,
      get isLocalAudioMuted() { return muted; },
      setLocalAudioMuted: vi.fn((next: boolean) => { muted = next; track.enabled = !next; return true; }),
      dispose: vi.fn(),
    } as unknown as DirectedCallWebRtcAdapter;
    const coordinator = new DirectedCallMediaCoordinator(session, transport, createLifecycle(), "g1", { adapterFactory: () => adapter });
    coordinator.start();
    session.emit(projection("accepted"));
    await vi.waitFor(() => expect(coordinator.getSnapshot().canToggleMute).toBe(true));
    coordinator.toggleMute();
    session.emit(projection("ended"));

    expect(coordinator.getSnapshot()).toMatchObject({ state: "disposed", isMuted: false, canToggleMute: false });
    track.readyState = "ended";
    track.emit("ended");
    expect(coordinator.getSnapshot()).toMatchObject({ state: "disposed", isMuted: false, canToggleMute: false });
    coordinator.dispose();
    expect(adapter.dispose).toHaveBeenCalledTimes(1);
  });
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

  it("disposes incomplete setup after sync without sending setup_failed", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", {
      adapterFactory: () => adapter,
    });
    coordinator.start();
    session.emit(projection("accepted"));
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());
    session.emit(projection("connecting"));
    session.emitSync();

    expect(adapter.dispose).toHaveBeenCalled();
    expect(coordinator.getSnapshot().localIssue).toBe("transport_recovery");
    expect(lifecycle.setupFailed).not.toHaveBeenCalled();
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

  it("retires a failed offer delivery and never replays it after sync", async () => {
    const session = createSession();
    (session.sendSignal as any).mockRejectedValueOnce(new Error("relay unavailable"));
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const coordinator = createCoordinator(session, transport);
    coordinator.start();

    session.emit(projection("accepted"));
    await vi.waitFor(() => expect(session.getProjection).toHaveBeenCalled());
    session.emit(projection("connecting"));
    await vi.waitFor(() => expect(session.sendSignal).toHaveBeenCalledTimes(1));
    session.emitSync();
    session.emit(projection("connecting"));

    expect(session.sendSignal).toHaveBeenCalledTimes(1);
    expect(coordinator.getSnapshot().localIssue).toBe("transport_recovery");
  });

  it("retires answer delivery failure without creating or sending another answer", async () => {
    const session = createSession();
    (session.sendSignal as any).mockRejectedValueOnce(new Error("relay unavailable"));
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    let options!: DirectedCallWebRtcAdapterOptions;
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", {
      adapterFactory: (next) => { options = next; return adapter; },
    });
    coordinator.start();
    session.emit({ ...projection("accepted"), participant_role: "recipient" as const });
    session.emit({ ...projection("connecting"), participant_role: "recipient" as const });
    session.emitSignal({ call_id: callId, signal_id: "99999999-9999-4999-8999-999999999999", kind: "offer", payload: { sdp: "offer" } });
    await vi.waitFor(() => expect(session.sendSignal).toHaveBeenCalledTimes(1));
    session.emitSignal({ call_id: callId, signal_id: "88888888-8888-4888-8888-888888888888", kind: "offer", payload: { sdp: "offer-2" } });

    expect(adapter.acceptOffer).toHaveBeenCalledTimes(1);
    expect(session.sendSignal).toHaveBeenCalledTimes(1);
    expect(options.onPeerConnectionState).toBeDefined();
  });

  it("turns active connection loss into only a local recoverable issue", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    let connectionState!: (state: RTCPeerConnectionState) => void;
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", {
      adapterFactory: (options) => {
        connectionState = options.onPeerConnectionState!;
        return adapter;
      },
    });
    coordinator.start();
    session.emit(projection("accepted"));
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());
    session.emit(projection("active"));
    connectionState("failed");

    expect(coordinator.getSnapshot()).toMatchObject({ state: "failed", localIssue: "transport_recovery", projection: projection("active") });
    expect(lifecycle.setupFailed).not.toHaveBeenCalled();
  });

  it("does not report setup failure from a stale media attempt", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    let resolveOffer!: (offer: RTCSessionDescriptionInit) => void;
    adapter.prepareOffer = vi.fn(() => new Promise((resolve) => { resolveOffer = resolve; })) as typeof adapter.prepareOffer;
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", {
      adapterFactory: () => adapter,
    });
    coordinator.start();
    session.emit(projection("accepted"));
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());
    session.emitSync();
    resolveOffer({ type: "offer", sdp: "stale" });
    await Promise.resolve();

    expect(lifecycle.setupFailed).not.toHaveBeenCalled();
    expect(session.sendSignal).not.toHaveBeenCalled();
  });

  it("emits one setup failure for genuine setup failure", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    adapter.prepareOffer = vi.fn().mockRejectedValue(new Error("sdp failed")) as typeof adapter.prepareOffer;
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", {
      adapterFactory: () => adapter,
    });
    coordinator.start();
    session.emit(projection("accepted"));
    await vi.waitFor(() => expect(lifecycle.setupFailed).toHaveBeenCalledTimes(1));
    session.emit(projection("connecting"));
    session.emitSync();

    expect(lifecycle.setupFailed).toHaveBeenCalledWith(callId, "peer_connection_failed");
    expect(lifecycle.setupFailed).toHaveBeenCalledTimes(1);
  });

  it("never creates a replacement adapter after media retirement", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const adapter = createAdapter();
    const factory = vi.fn(() => adapter);
    const coordinator = new DirectedCallMediaCoordinator(session, transport, createLifecycle(), "g1", { adapterFactory: factory });
    coordinator.start();
    session.emit(projection("accepted"));
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());
    session.emitSync();
    session.emit(projection("accepted"));

    expect(factory).toHaveBeenCalledTimes(1);
  });
});
