import { describe, expect, it, vi } from "vitest";
import { DirectedCallSignalTransport } from "./directedCallSignalTransport";
import { DirectedCallMediaCoordinator } from "./directedCallMediaCoordinator";
import { DirectedCallWebRtcError, DirectedCallWebRtcStaleError } from "./directedCallWebRtcAdapter";
import type {
  DirectedCallInitialMediaReadiness,
  DirectedCallWebRtcAdapter,
  DirectedCallWebRtcAdapterOptions,
} from "./directedCallWebRtcAdapter";
import type { DirectedCallSession } from "./directedCallSession";

const callId = "33333333-3333-4333-8333-333333333333";
const peerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const readySnapshot: DirectedCallInitialMediaReadiness = Object.freeze({
  transportConnected: true,
  localAudioSenderReady: true,
  remoteAudioTrackReady: true,
  remoteAudioStreamBound: true,
  ready: true,
});

function projection(state: "accepted" | "connecting" | "active" | "connection_failed" | "declined" | "ended", currentCallId = callId) {
  return {
    protocol_version: 1 as const,
    call_id: currentCallId,
    state,
    state_version: ["connection_failed", "declined", "ended"].includes(state) ? 4 : 1,
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
  const acknowledgedSetupFailure = {
    status: "acknowledged" as const,
    event: "call:setup_failed" as const,
    commandId: "55555555-5555-4555-8555-555555555555",
    result: { call_id: callId, state: "connection_failed" as const, state_version: 2, result_code: "applied" as const },
  };
  return {
    beginConnecting: vi.fn().mockResolvedValue({ status: "acknowledged" }),
    mediaReady: vi.fn().mockResolvedValue({ status: "acknowledged" }),
    setupFailed: vi.fn().mockResolvedValue(acknowledgedSetupFailure),
  };
}

type TestAdapter = DirectedCallWebRtcAdapter & {
  configure(options: DirectedCallWebRtcAdapterOptions): void;
  setReadiness(readiness: DirectedCallInitialMediaReadiness): void;
};

function createAdapter(options: DirectedCallWebRtcAdapterOptions = {}): TestAdapter {
  let readiness: DirectedCallInitialMediaReadiness = Object.freeze({
    transportConnected: false,
    localAudioSenderReady: false,
    remoteAudioTrackReady: false,
    remoteAudioStreamBound: false,
    ready: false,
  });
  let readinessCallback = options.onInitialMediaReadinessChange;
  const adapter = {
    get initialMediaReadinessSnapshot() { return readiness; },
    configure(next: DirectedCallWebRtcAdapterOptions) {
      readinessCallback = next.onInitialMediaReadinessChange;
    },
    setReadiness(next: DirectedCallInitialMediaReadiness) {
      readiness = Object.freeze({ ...next });
      readinessCallback?.(readiness);
    },
    prepareOffer: vi.fn().mockResolvedValue({ type: "offer", sdp: "offer" }),
    prepareAnswer: vi.fn().mockResolvedValue(undefined),
    acceptOffer: vi.fn().mockResolvedValue({ type: "answer", sdp: "answer" }),
    acceptAnswer: vi.fn().mockResolvedValue(true),
    addRemoteIceCandidate: vi.fn().mockResolvedValue(true),
    switchAudioInput: vi.fn().mockResolvedValue(true),
    dispose: vi.fn(),
  } as unknown as TestAdapter;
  return adapter;
}

function bindAdapter(options: DirectedCallWebRtcAdapterOptions, adapter: TestAdapter): TestAdapter {
  adapter.configure(options);
  return adapter;
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
    adapterFactory: (options) => createAdapter(options),
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

    expect(coordinator.getSnapshot()).toMatchObject({ state: "idle", callId: null, isMuted: false, canToggleMute: false });
    track.readyState = "ended";
    track.emit("ended");
    expect(coordinator.getSnapshot()).toMatchObject({ state: "idle", callId: null, isMuted: false, canToggleMute: false });
    coordinator.dispose();
    expect(coordinator.getSnapshot().state).toBe("disposed");
    expect(adapter.dispose).toHaveBeenCalledTimes(2);
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

  it("forwards active-call microphone preference changes to the adapter", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const adapter = createAdapter();
    const coordinator = new DirectedCallMediaCoordinator(session, transport, createLifecycle(), "g1", {
      adapterFactory: (options) => bindAdapter(options, adapter),
    });
    coordinator.start();
    session.emit(projection("accepted"));
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());

    const constraints = { audio: { deviceId: { exact: "new-microphone" } }, video: false };
    await expect(coordinator.switchAudioInput(constraints)).resolves.toBe(true);

    expect(adapter.switchAudioInput).toHaveBeenCalledWith(constraints);
  });

  it("does not acquire a replacement microphone while idle", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const adapter = createAdapter();
    const coordinator = new DirectedCallMediaCoordinator(session, transport, createLifecycle(), "g1", {
      adapterFactory: (options) => bindAdapter(options, adapter),
    });
    coordinator.start();

    await expect(coordinator.switchAudioInput({ audio: true, video: false })).resolves.toBe(false);
    expect(adapter.switchAudioInput).not.toHaveBeenCalled();
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
      adapterFactory: (options) => bindAdapter(options, adapter),
    });
    coordinator.start();

    session.emit(projection("accepted"));
    await vi.waitFor(() => expect(lifecycle.beginConnecting).toHaveBeenCalledWith(callId));
    expect(session.sendSignal).not.toHaveBeenCalled();

    session.emit(projection("connecting"));
    await vi.waitFor(() => expect(session.sendSignal).toHaveBeenCalledWith(callId, expect.any(String), "offer", { sdp: "offer" }));
    expect(lifecycle.mediaReady).not.toHaveBeenCalled();
    adapter.setReadiness({ transportConnected: true, localAudioSenderReady: true, remoteAudioTrackReady: true, remoteAudioStreamBound: true, ready: true });
    await vi.waitFor(() => expect(lifecycle.mediaReady).toHaveBeenCalledWith(callId));
  });

  it("queues accepted-phase local ICE and flushes it once in order when connecting", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const adapter = createAdapter();
    let onIceCandidate!: (candidate: RTCIceCandidateInit) => void;
    const coordinator = new DirectedCallMediaCoordinator(session, transport, createLifecycle(), "g1", {
      adapterFactory: (options) => {
        onIceCandidate = options.onIceCandidate!;
        return bindAdapter(options, adapter);
      },
    });
    coordinator.start();
    session.emit(projection("accepted"));
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());

    const first = { candidate: "candidate:one", sdpMid: "0", sdpMLineIndex: 0 };
    const second = { candidate: "candidate:two", sdpMid: "0", sdpMLineIndex: 0 };
    onIceCandidate(first);
    onIceCandidate(second);
    onIceCandidate(first);
    expect(session.sendSignal).not.toHaveBeenCalledWith(callId, expect.any(String), "ice_candidate", expect.anything());

    session.emit(projection("connecting"));
    await vi.waitFor(() => expect(session.sendSignal).toHaveBeenCalledWith(callId, expect.any(String), "ice_candidate", expect.objectContaining({ candidate: "candidate:one" })));
    await vi.waitFor(() => expect(session.sendSignal).toHaveBeenCalledWith(callId, expect.any(String), "ice_candidate", expect.objectContaining({ candidate: "candidate:two" })));

    const candidates = (session.sendSignal as any).mock.calls
      .filter((call: [string, string, string]) => call[2] === "ice_candidate")
      .map(([, , , payload]: any[]) => payload.candidate);
    expect(candidates).toEqual(["candidate:one", "candidate:two"]);
  });

  it("discards local ICE callbacks after terminal disposal", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const adapter = createAdapter();
    let onIceCandidate!: (candidate: RTCIceCandidateInit) => void;
    const coordinator = new DirectedCallMediaCoordinator(session, transport, createLifecycle(), "g1", {
      adapterFactory: (options) => { onIceCandidate = options.onIceCandidate!; return bindAdapter(options, adapter); },
    });
    coordinator.start();
    session.emit(projection("accepted"));
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());
    session.emit(projection("ended"));
    onIceCandidate({ candidate: "candidate:stale", sdpMid: "0", sdpMLineIndex: 0 });
    await Promise.resolve();
    expect(session.sendSignal).not.toHaveBeenCalledWith(callId, expect.any(String), "ice_candidate", expect.anything());
  });

  it("runs the recipient answer flow only for a bound connecting call", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", {
      adapterFactory: (options) => bindAdapter(options, adapter),
    });
    coordinator.start();
    const accepted = { ...projection("accepted"), participant_role: "recipient" as const };
    const connecting = { ...projection("connecting"), participant_role: "recipient" as const };
    session.emit(accepted);
    session.emit(connecting);
    session.emitSignal({ call_id: callId, signal_id: "99999999-9999-4999-8999-999999999999", kind: "offer", payload: { sdp: "offer" } });
    await vi.waitFor(() => expect(session.sendSignal).toHaveBeenCalledWith(callId, expect.any(String), "answer", { sdp: "answer" }));
    expect(lifecycle.mediaReady).not.toHaveBeenCalled();
    adapter.setReadiness({ transportConnected: true, localAudioSenderReady: true, remoteAudioTrackReady: true, remoteAudioStreamBound: true, ready: true });
    await vi.waitFor(() => expect(lifecycle.mediaReady).toHaveBeenCalledWith(callId));

    expect(adapter.acceptOffer).toHaveBeenCalledTimes(1);
    expect(session.sendSignal).toHaveBeenCalledWith(callId, expect.any(String), "answer", { sdp: "answer" });
    expect(lifecycle.mediaReady).toHaveBeenCalledWith(callId);
    expect(lifecycle.beginConnecting).not.toHaveBeenCalled();
  });

  it("does not report readiness merely after applying the initiator answer", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", { adapterFactory: (options) => bindAdapter(options, adapter) });
    coordinator.start();
    session.emit(projection("accepted"));
    await vi.waitFor(() => expect(lifecycle.beginConnecting).toHaveBeenCalledWith(callId));
    session.emit(projection("connecting"));
    await vi.waitFor(() => expect(session.sendSignal).toHaveBeenCalledWith(callId, expect.any(String), "offer", { sdp: "offer" }));
    session.emitSignal({ call_id: callId, signal_id: "77777777-7777-4777-8777-777777777777", kind: "answer", payload: { sdp: "answer" } });
    await vi.waitFor(() => expect(adapter.acceptAnswer).toHaveBeenCalled());
    expect(lifecycle.mediaReady).not.toHaveBeenCalled();
    adapter.setReadiness(readySnapshot);
    await vi.waitFor(() => expect(lifecycle.mediaReady).toHaveBeenCalledTimes(1));
  });

  it("handles readiness before connecting without using readiness as SDP proof", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", { adapterFactory: (options) => bindAdapter(options, adapter) });
    coordinator.start();
    session.emit(projection("accepted"));
    adapter.setReadiness(readySnapshot);
    expect(lifecycle.mediaReady).not.toHaveBeenCalled();
    session.emit(projection("connecting"));
    await vi.waitFor(() => expect(lifecycle.mediaReady).toHaveBeenCalledWith(callId));
  });

  it("does not dispatch for an incomplete adapter snapshot", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", { adapterFactory: (options) => bindAdapter(options, adapter) });
    coordinator.start();
    session.emit(projection("accepted"));
    await vi.waitFor(() => expect(lifecycle.beginConnecting).toHaveBeenCalledWith(callId));
    session.emit(projection("connecting"));
    await vi.waitFor(() => expect(session.sendSignal).toHaveBeenCalledWith(callId, expect.any(String), "offer", { sdp: "offer" }));
    adapter.setReadiness({ ...readySnapshot, remoteAudioStreamBound: false, ready: false });
    await Promise.resolve();
    expect(lifecycle.mediaReady).not.toHaveBeenCalled();
  });

  it("deduplicates readiness and connecting triggers while a command is in flight", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    let resolveMediaReady!: (outcome: unknown) => void;
    lifecycle.mediaReady = vi.fn(() => new Promise((resolve) => { resolveMediaReady = resolve; })) as typeof lifecycle.mediaReady;
    const adapter = createAdapter();
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", { adapterFactory: (options) => bindAdapter(options, adapter) });
    coordinator.start();
    session.emit(projection("accepted"));
    await vi.waitFor(() => expect(lifecycle.beginConnecting).toHaveBeenCalledWith(callId));
    session.emit(projection("connecting"));
    await vi.waitFor(() => expect(session.sendSignal).toHaveBeenCalledWith(callId, expect.any(String), "offer", { sdp: "offer" }));
    adapter.setReadiness(readySnapshot);
    adapter.setReadiness(readySnapshot);
    session.emit(projection("connecting"));
    expect(lifecycle.mediaReady).toHaveBeenCalledTimes(1);
    resolveMediaReady({ status: "acknowledged" });
    await vi.waitFor(() => expect(lifecycle.mediaReady).toHaveBeenCalledTimes(1));
  });

  it("retries a failed lifecycle outcome but not an acknowledged one", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    lifecycle.mediaReady = vi.fn().mockResolvedValueOnce({ status: "failed" }).mockResolvedValueOnce({ status: "acknowledged" }) as typeof lifecycle.mediaReady;
    const adapter = createAdapter();
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", { adapterFactory: (options) => bindAdapter(options, adapter) });
    coordinator.start();
    session.emit(projection("accepted"));
    await vi.waitFor(() => expect(lifecycle.beginConnecting).toHaveBeenCalledWith(callId));
    session.emit(projection("connecting"));
    await vi.waitFor(() => expect(session.sendSignal).toHaveBeenCalled());
    adapter.setReadiness(readySnapshot);
    await vi.waitFor(() => expect(lifecycle.mediaReady).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    await Promise.resolve();
    adapter.setReadiness(readySnapshot);
    await vi.waitFor(() => expect(lifecycle.mediaReady).toHaveBeenCalledTimes(2));
    adapter.setReadiness(readySnapshot);
    session.emit(projection("connecting"));
    await Promise.resolve();
    expect(lifecycle.mediaReady).toHaveBeenCalledTimes(2);
  });

  it("does not dispatch after active or terminal projection", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", { adapterFactory: (options) => bindAdapter(options, adapter) });
    coordinator.start();
    session.emit(projection("accepted"));
    session.emit(projection("active"));
    adapter.setReadiness(readySnapshot);
    session.emit(projection("ended"));
    adapter.setReadiness(readySnapshot);
    expect(lifecycle.mediaReady).not.toHaveBeenCalled();
  });

  it("ignores stale readiness callbacks across adapter rollover and disposal", async () => {
    const secondCallId = "44444444-4444-4444-8444-444444444444";
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const options: DirectedCallWebRtcAdapterOptions[] = [];
    const adapters: TestAdapter[] = [];
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", {
      adapterFactory: (next) => { options.push(next); const adapter = createAdapter(next); adapters.push(adapter); return adapter; },
    });
    coordinator.start();
    session.emit(projection("accepted"));
    await vi.waitFor(() => expect(lifecycle.beginConnecting).toHaveBeenCalledWith(callId));
    session.emit(projection("connecting"));
    await vi.waitFor(() => expect(session.sendSignal).toHaveBeenCalled());
    session.emit(projection("ended"));
    session.emit(projection("accepted", secondCallId));
    session.emit(projection("connecting", secondCallId));
    options[0].onInitialMediaReadinessChange?.(readySnapshot);
    adapters[0].setReadiness(readySnapshot);
    expect(lifecycle.mediaReady).not.toHaveBeenCalled();
    adapters[1].setReadiness(readySnapshot);
    await vi.waitFor(() => expect(lifecycle.mediaReady).toHaveBeenCalledWith(secondCallId));
    coordinator.dispose();
    adapters[1].setReadiness(readySnapshot);
    expect(lifecycle.mediaReady).toHaveBeenCalledTimes(1);
  });

  it("resets media-ready deduplication for a new call", async () => {
    const secondCallId = "44444444-4444-4444-8444-444444444444";
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapters: TestAdapter[] = [];
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", {
      adapterFactory: (options) => { const adapter = createAdapter(options); adapters.push(adapter); return adapter; },
    });
    coordinator.start();
    session.emit(projection("accepted"));
    await vi.waitFor(() => expect(lifecycle.beginConnecting).toHaveBeenCalledWith(callId));
    session.emit(projection("connecting"));
    await vi.waitFor(() => expect(session.sendSignal).toHaveBeenCalled());
    adapters[0].setReadiness(readySnapshot);
    await vi.waitFor(() => expect(lifecycle.mediaReady).toHaveBeenCalledTimes(1));
    session.emit(projection("ended"));
    session.emit(projection("accepted", secondCallId));
    session.emit(projection("connecting", secondCallId));
    await vi.waitFor(() => expect(adapters).toHaveLength(2));
    adapters[1].setReadiness(readySnapshot);
    await vi.waitFor(() => expect(lifecycle.mediaReady).toHaveBeenCalledTimes(2));
    expect(lifecycle.mediaReady).toHaveBeenLastCalledWith(secondCallId);
  });

  it("disposes on terminal projection and unsubscribes the transport", () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const transportDispose = vi.spyOn(transport, "dispose");
    const coordinator = createCoordinator(session, transport);
    coordinator.start();

    session.emit(projection("accepted"));
    session.emit(projection("ended"));

    expect(coordinator.getSnapshot().state).toBe("idle");
    expect(transportDispose).not.toHaveBeenCalled();
    expect(session.sendSignal).not.toHaveBeenCalled();
  });

  it("supports a second distinct call after terminal cleanup in the same runtime", async () => {
    const secondCallId = "44444444-4444-4444-8444-444444444444";
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const adapters: DirectedCallWebRtcAdapter[] = [];
    const coordinator = new DirectedCallMediaCoordinator(session, transport, createLifecycle(), "g1", {
      adapterFactory: (options) => {
        const adapter = createAdapter(options);
        adapters.push(adapter);
        return adapter;
      },
    });
    coordinator.start();

    session.emit(projection("accepted"));
    await vi.waitFor(() => expect(adapters[0].prepareOffer).toHaveBeenCalled());
    session.emit(projection("connecting"));
    session.emit(projection("active"));
    expect(coordinator.getSnapshot().callId).toBe(callId);

    session.emit(projection("ended"));
    expect(coordinator.getSnapshot()).toMatchObject({ state: "idle", callId: null, isMuted: false, canToggleMute: false });
    expect(adapters[0].dispose).toHaveBeenCalledTimes(1);
    expect(coordinator.getSignalTransport().callId).toBeNull();

    session.emit(projection("accepted", secondCallId));
    await vi.waitFor(() => expect(adapters[1]?.prepareOffer).toHaveBeenCalled());
    expect(adapters).toHaveLength(2);
    session.emit(projection("connecting", secondCallId));
    session.emit(projection("active", secondCallId));
    expect(coordinator.getSnapshot().callId).toBe(secondCallId);

    session.emit(projection("ended"));
    expect(coordinator.getSnapshot().callId).toBe(secondCallId);
    expect(coordinator.getSnapshot().state).toBe("signaling_ready");
  });

  it("fences callbacks and local ICE from the disposed adapter after rollover", async () => {
    const secondCallId = "44444444-4444-4444-8444-444444444444";
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const adapterOptions: DirectedCallWebRtcAdapterOptions[] = [];
    const adapters: DirectedCallWebRtcAdapter[] = [];
    const coordinator = new DirectedCallMediaCoordinator(session, transport, createLifecycle(), "g1", {
      adapterFactory: (options) => {
        adapterOptions.push(options);
        const adapter = createAdapter(options);
        adapters.push(adapter);
        return adapter;
      },
    });
    coordinator.start();
    session.emit(projection("accepted"));
    await vi.waitFor(() => expect(adapters[0].prepareOffer).toHaveBeenCalled());
    session.emit(projection("ended"));
    session.emit(projection("accepted", secondCallId));
    await vi.waitFor(() => expect(adapters[1]?.prepareOffer).toHaveBeenCalled());

    adapterOptions[0].onRemoteStream?.({ getTracks: () => [] });
    adapterOptions[0].onIceCandidate?.({ candidate: "candidate:old", sdpMid: "0", sdpMLineIndex: 0 });
    adapterOptions[0].onPeerConnectionState?.("failed");
    adapterOptions[1].onIceCandidate?.({ candidate: "candidate:new", sdpMid: "0", sdpMLineIndex: 0 });
    session.emit(projection("connecting", secondCallId));
    await vi.waitFor(() => expect(session.sendSignal).toHaveBeenCalledWith(secondCallId, expect.any(String), "ice_candidate", expect.objectContaining({ candidate: "candidate:new" })));
    await Promise.resolve();

    expect(coordinator.getSnapshot().callId).toBe(secondCallId);
    expect(coordinator.getSnapshot().remoteAudioStream).toBeNull();
    expect(session.sendSignal).not.toHaveBeenCalledWith(secondCallId, expect.any(String), "ice_candidate", expect.objectContaining({ candidate: "candidate:old" }));
  });

  it("keeps runtime disposal final and idempotent after call reset", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const transportDispose = vi.spyOn(transport, "dispose");
    const adapters: DirectedCallWebRtcAdapter[] = [];
    const coordinator = new DirectedCallMediaCoordinator(session, transport, createLifecycle(), "g1", {
      adapterFactory: (options) => {
        const adapter = createAdapter(options);
        adapters.push(adapter);
        return adapter;
      },
    });
    coordinator.start();
    session.emit(projection("accepted"));
    await vi.waitFor(() => expect(adapters[0].prepareOffer).toHaveBeenCalled());
    session.emit(projection("ended"));
    expect(adapters).toHaveLength(2);

    coordinator.dispose();
    coordinator.dispose();
    expect(coordinator.getSnapshot().state).toBe("disposed");
    expect(adapters[0].dispose).toHaveBeenCalledTimes(1);
    expect(adapters[1].dispose).toHaveBeenCalledTimes(1);
    expect(transportDispose).toHaveBeenCalledTimes(1);
  });

  it("disposes incomplete setup after sync without sending setup_failed", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", {
      adapterFactory: (options) => bindAdapter(options, adapter),
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
      adapterFactory: (next) => { options = next; return bindAdapter(next, adapter); },
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
        return bindAdapter(options, adapter);
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
      adapterFactory: (options) => bindAdapter(options, adapter),
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
      adapterFactory: (options) => bindAdapter(options, adapter),
    });
    coordinator.start();
    session.emit(projection("accepted"));
    await vi.waitFor(() => expect(lifecycle.setupFailed).toHaveBeenCalledTimes(1));
    session.emit(projection("connecting"));
    session.emitSync();

    expect(lifecycle.setupFailed).toHaveBeenCalledWith(callId, "peer_connection_failed");
    expect(lifecycle.setupFailed).toHaveBeenCalledTimes(1);
  });

  it("preserves every safe setup failure code", async () => {
    const failureCodes = ["permission_denied", "microphone_unavailable", "peer_connection_failed", "sdp_failed", "ice_failed", "media_binding_failed"] as const;
    for (const failureCode of failureCodes) {
      const session = createSession();
      const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
      const lifecycle = createLifecycle();
      const adapter = createAdapter();
      adapter.prepareOffer = vi.fn().mockRejectedValue(new DirectedCallWebRtcError(failureCode)) as typeof adapter.prepareOffer;
      const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", { adapterFactory: (options) => bindAdapter(options, adapter) });
      coordinator.start();
      session.emit(projection("accepted"));
      await vi.waitFor(() => expect(lifecycle.setupFailed).toHaveBeenCalledWith(callId, failureCode));
    }
  });

  it("reports connecting-phase failures and maps unknown errors safely", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    adapter.acceptAnswer = vi.fn().mockRejectedValue(new DirectedCallWebRtcError("ice_failed")) as typeof adapter.acceptAnswer;
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", { adapterFactory: (options) => bindAdapter(options, adapter) });
    coordinator.start();
    session.emit(projection("accepted"));
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());
    session.emit(projection("connecting"));
    await vi.waitFor(() => expect(session.sendSignal).toHaveBeenCalledWith(callId, expect.any(String), "offer", { sdp: "offer" }));
    session.emitSignal({ call_id: callId, signal_id: "88888888-8888-4888-8888-888888888888", kind: "answer", payload: { sdp: "answer" } });
    await vi.waitFor(() => expect(lifecycle.setupFailed).toHaveBeenCalledWith(callId, "ice_failed"));

    const unknownSession = createSession();
    const unknownTransport = new DirectedCallSignalTransport(unknownSession, { generation: "g1" });
    const unknownLifecycle = createLifecycle();
    const unknownAdapter = createAdapter();
    unknownAdapter.prepareOffer = vi.fn().mockRejectedValue(new Error("secret browser detail")) as typeof unknownAdapter.prepareOffer;
    const unknownCoordinator = new DirectedCallMediaCoordinator(unknownSession, unknownTransport, unknownLifecycle, "g1", { adapterFactory: (options) => bindAdapter(options, unknownAdapter) });
    unknownCoordinator.start();
    unknownSession.emit(projection("accepted"));
    await vi.waitFor(() => expect(unknownLifecycle.setupFailed).toHaveBeenCalledWith(callId, "peer_connection_failed"));
    expect(JSON.stringify(unknownLifecycle.setupFailed.mock.calls)).not.toContain("secret browser detail");
  });

  it("ignores stale failures and performs first-failure cleanup once", async () => {
    const staleSession = createSession();
    const staleTransport = new DirectedCallSignalTransport(staleSession, { generation: "g1" });
    const staleLifecycle = createLifecycle();
    const staleAdapter = createAdapter();
    staleAdapter.prepareOffer = vi.fn().mockRejectedValue(new DirectedCallWebRtcStaleError()) as typeof staleAdapter.prepareOffer;
    const staleCoordinator = new DirectedCallMediaCoordinator(staleSession, staleTransport, staleLifecycle, "g1", { adapterFactory: (options) => bindAdapter(options, staleAdapter) });
    staleCoordinator.start();
    staleSession.emit(projection("accepted"));
    await Promise.resolve();
    expect(staleLifecycle.setupFailed).not.toHaveBeenCalled();

    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    let resolveReport!: (outcome: unknown) => void;
    lifecycle.setupFailed = vi.fn(() => new Promise((resolve) => { resolveReport = resolve; })) as typeof lifecycle.setupFailed;
    const adapter = createAdapter();
    adapter.prepareOffer = vi.fn().mockRejectedValue(new DirectedCallWebRtcError("sdp_failed")) as typeof adapter.prepareOffer;
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", { adapterFactory: (options) => bindAdapter(options, adapter) });
    coordinator.start();
    session.emit(projection("accepted"));
    await vi.waitFor(() => expect(lifecycle.setupFailed).toHaveBeenCalledTimes(1));
    session.emit(projection("connecting"));
    expect(lifecycle.setupFailed).toHaveBeenCalledTimes(1);
    expect(adapter.dispose).toHaveBeenCalledTimes(1);
    resolveReport({ status: "failed", event: "call:setup_failed", commandId: "55555555-5555-4555-8555-555555555555", error: { kind: "transport_timeout" } });
  });

  it("keeps a transport-failed report retryable without recursive retry or media restart", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    lifecycle.setupFailed = vi.fn()
      .mockResolvedValueOnce({ status: "failed", event: "call:setup_failed", commandId: "55555555-5555-4555-8555-555555555555", error: { kind: "transport_timeout" } })
      .mockResolvedValueOnce({ status: "acknowledged", event: "call:setup_failed", commandId: "55555555-5555-4555-8555-555555555555", result: { call_id: callId, state: "connection_failed", state_version: 2, result_code: "applied" } }) as typeof lifecycle.setupFailed;
    const adapter = createAdapter();
    adapter.prepareOffer = vi.fn().mockRejectedValue(new DirectedCallWebRtcError("microphone_unavailable")) as typeof adapter.prepareOffer;
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", { adapterFactory: (options) => bindAdapter(options, adapter) });
    coordinator.start();
    session.emit(projection("accepted"));
    await vi.waitFor(() => expect(lifecycle.setupFailed).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(lifecycle.setupFailed).toHaveBeenCalledTimes(1);
    session.emit(projection("connecting"));
    await vi.waitFor(() => expect(lifecycle.setupFailed).toHaveBeenCalledTimes(2));
    expect(lifecycle.setupFailed).toHaveBeenNthCalledWith(1, callId, "microphone_unavailable");
    expect(lifecycle.setupFailed).toHaveBeenNthCalledWith(2, callId, "microphone_unavailable");
    expect(adapter.prepareOffer).toHaveBeenCalledTimes(1);
  });

  it("retires non-retryable reports and never rewrites authoritative active or terminal state", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    lifecycle.setupFailed = vi.fn().mockResolvedValue({ status: "failed", event: "call:setup_failed", commandId: "55555555-5555-4555-8555-555555555555", error: { kind: "protocol_validation" } }) as typeof lifecycle.setupFailed;
    const adapter = createAdapter();
    adapter.prepareOffer = vi.fn().mockRejectedValue(new DirectedCallWebRtcError("sdp_failed")) as typeof adapter.prepareOffer;
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", { adapterFactory: (options) => bindAdapter(options, adapter) });
    coordinator.start();
    session.emit(projection("accepted"));
    await vi.waitFor(() => expect(lifecycle.setupFailed).toHaveBeenCalledTimes(1));
    session.emit(projection("connecting"));
    await Promise.resolve();
    expect(lifecycle.setupFailed).toHaveBeenCalledTimes(1);
    session.emit(projection("active"));
    expect(coordinator.getSnapshot().projection?.state).toBe("active");
    expect(coordinator.getSnapshot().state).not.toBe("failed");
    session.emit(projection("ended"));
    expect(coordinator.getSnapshot().projection).toBeNull();
    expect(lifecycle.setupFailed).toHaveBeenCalledTimes(1);
  });

  it("accepts canonical connection_failed confirmation before command completion", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    let resolveReport!: (outcome: unknown) => void;
    lifecycle.setupFailed = vi.fn(() => new Promise((resolve) => { resolveReport = resolve; })) as typeof lifecycle.setupFailed;
    const adapter = createAdapter();
    adapter.prepareOffer = vi.fn().mockRejectedValue(new DirectedCallWebRtcError("sdp_failed")) as typeof adapter.prepareOffer;
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", { adapterFactory: (options) => bindAdapter(options, adapter) });
    coordinator.start();
    session.emit(projection("accepted"));
    await vi.waitFor(() => expect(lifecycle.setupFailed).toHaveBeenCalledTimes(1));
    session.emit(projection("connection_failed"));
    expect(coordinator.getSnapshot().callId).toBeNull();
    resolveReport({ status: "acknowledged", event: "call:setup_failed", commandId: "55555555-5555-4555-8555-555555555555", result: { call_id: callId, state: "connection_failed", state_version: 2, result_code: "applied" } });
    await Promise.resolve();
    expect(lifecycle.setupFailed).toHaveBeenCalledTimes(1);
  });

  it("ignores setup-failure completion after disposal and call rollover", async () => {
    const secondCallId = "44444444-4444-4444-8444-444444444444";
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const resolvers: Array<(outcome: unknown) => void> = [];
    lifecycle.setupFailed = vi.fn(() => new Promise((resolve) => { resolvers.push(resolve); })) as typeof lifecycle.setupFailed;
    const adapters: TestAdapter[] = [];
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", {
      adapterFactory: (options) => {
        const adapter = createAdapter(options);
        adapters.push(adapter);
        if (adapters.length === 1) adapter.prepareOffer = vi.fn().mockRejectedValue(new DirectedCallWebRtcError("sdp_failed")) as typeof adapter.prepareOffer;
        if (adapters.length === 2) adapter.prepareOffer = vi.fn().mockRejectedValue(new DirectedCallWebRtcError("microphone_unavailable")) as typeof adapter.prepareOffer;
        return adapter;
      },
    });
    coordinator.start();
    session.emit(projection("accepted"));
    await vi.waitFor(() => expect(lifecycle.setupFailed).toHaveBeenCalledTimes(1));
    session.emit(projection("ended"));
    session.emit(projection("accepted", secondCallId));
    await vi.waitFor(() => expect(lifecycle.setupFailed).toHaveBeenCalledTimes(2));
    resolvers[0]({ status: "acknowledged", event: "call:setup_failed", commandId: "55555555-5555-4555-8555-555555555555", result: { call_id: callId, state: "connection_failed", state_version: 2, result_code: "applied" } });
    await Promise.resolve();
    expect(lifecycle.setupFailed).toHaveBeenNthCalledWith(2, secondCallId, "microphone_unavailable");
    coordinator.dispose();
    resolvers[1]({ status: "acknowledged", event: "call:setup_failed", commandId: "66666666-6666-4666-8666-666666666666", result: { call_id: secondCallId, state: "connection_failed", state_version: 2, result_code: "applied" } });
    expect(lifecycle.setupFailed).toHaveBeenCalledTimes(2);
  });

  it("does not create a setup-failure report from a stale media-attempt error", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    let rejectOffer!: (error: unknown) => void;
    const adapter = createAdapter();
    adapter.prepareOffer = vi.fn(() => new Promise<RTCSessionDescriptionInit>((_, reject) => { rejectOffer = reject; })) as typeof adapter.prepareOffer;
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", { adapterFactory: (options) => bindAdapter(options, adapter) });
    coordinator.start();
    session.emit(projection("accepted"));
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());
    session.emitSync();
    rejectOffer(new DirectedCallWebRtcError("sdp_failed"));
    await Promise.resolve();
    expect(lifecycle.setupFailed).not.toHaveBeenCalled();
  });

  it("never creates a replacement adapter after media retirement", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const adapter = createAdapter();
    const factory = vi.fn((options: DirectedCallWebRtcAdapterOptions) => bindAdapter(options, adapter));
    const coordinator = new DirectedCallMediaCoordinator(session, transport, createLifecycle(), "g1", { adapterFactory: factory });
    coordinator.start();
    session.emit(projection("accepted"));
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());
    session.emitSync();
    session.emit(projection("accepted"));

    expect(factory).toHaveBeenCalledTimes(1);
  });
});
