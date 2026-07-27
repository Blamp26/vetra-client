import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { DirectedCallSignalTransport } from "./directedCallSignalTransport";
import { DirectedCallMediaCoordinator } from "./directedCallMediaCoordinator";
import { DirectedCallWebRtcError, DirectedCallWebRtcStaleError } from "./directedCallWebRtcAdapter";
import type {
  DirectedCallInitialMediaReadiness,
  DirectedCallMediaStream,
  DirectedCallWebRtcAdapter,
  DirectedCallWebRtcAdapterOptions,
} from "./directedCallWebRtcAdapter";
import type { DirectedCallSession } from "./directedCallSession";
import { getDirectedCallDiagnosticTimeline, getDirectedCallDiagnosticsProbe, resetDirectedCallDiagnosticsProbe, resetDirectedCallDiagnosticTimeline } from "./directedCallDiagnostics";
import { setCallDebugEnabled } from "../utils/callDebug";

const callId = "33333333-3333-4333-8333-333333333333";
const peerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const readySnapshot: DirectedCallInitialMediaReadiness = Object.freeze({
  transportConnected: true,
  localAudioSenderReady: true,
  remoteAudioTrackReady: true,
  remoteAudioStreamBound: true,
  ready: true,
});

function projection(
  state: "accepted" | "connecting" | "active" | "connection_failed" | "declined" | "ended",
  currentCallId = callId,
  participantRole: "initiator" | "recipient" = "initiator",
) {
  return {
    protocol_version: 1 as const,
    call_id: currentCallId,
    state,
    state_version: ["connection_failed", "declined", "ended"].includes(state) ? 4 : 1,
    media: "audio" as const,
    participant_role: participantRole,
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
  const iceRestartListeners = new Set<(value: any) => void>();
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
    emitIceRestart(value: any) {
      iceRestartListeners.forEach((listener) => listener(value));
    },
    subscribeToSignals: vi.fn((listener: (value: any) => void) => {
      signalListeners.add(listener);
      return () => signalListeners.delete(listener);
    }),
    subscribeToIceRestartSignals: vi.fn((listener: (value: any) => void) => {
      iceRestartListeners.add(listener);
      return () => iceRestartListeners.delete(listener);
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
    sendIceRestartRequest: vi.fn().mockResolvedValue({ status: "ok" }),
    sendIceRestartOffer: vi.fn().mockResolvedValue({ status: "ok" }),
    sendIceRestartAnswer: vi.fn().mockResolvedValue({ status: "ok" }),
  } as unknown as DirectedCallSession & { emit: (value: any) => void; emitSignal: (value: any) => void; emitIceRestart: (value: any) => void; emitSync: () => void };
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
  emitLocalScreenShareEnded(): void;
  emitRemoteScreenShareForTest(stream: DirectedCallMediaStream | null): void;
  emitLocalIceCandidate(candidate: RTCIceCandidateInit): void;
};

function mockedMethod(method: (...args: any[]) => any): ReturnType<typeof vi.fn> {
  return method as unknown as ReturnType<typeof vi.fn>;
}

function createAdapter(options: DirectedCallWebRtcAdapterOptions = {}): TestAdapter {
  let readiness: DirectedCallInitialMediaReadiness = Object.freeze({
    transportConnected: false,
    localAudioSenderReady: false,
    remoteAudioTrackReady: false,
    remoteAudioStreamBound: false,
    ready: false,
  });
  let localScreenShareStream: ReturnType<typeof createStream> | null = null;
  let remoteScreenShareStream: DirectedCallMediaStream | null = null;
  let localScreenShareEndedHandler: (() => void) | null = null;
  let remoteScreenShareChangedHandler: ((stream: DirectedCallMediaStream | null) => void) | null = null;
  let readinessCallback = options.onInitialMediaReadinessChange;
  let iceCandidateCallback = options.onIceCandidate;
  const adapter = {
    get initialMediaReadinessSnapshot() { return readiness; },
    configure(next: DirectedCallWebRtcAdapterOptions) {
      readinessCallback = next.onInitialMediaReadinessChange;
      iceCandidateCallback = next.onIceCandidate;
    },
    setReadiness(next: DirectedCallInitialMediaReadiness) {
      readiness = Object.freeze({ ...next });
      readinessCallback?.(readiness);
    },
    emitLocalIceCandidate(candidate: RTCIceCandidateInit) {
      void iceCandidateCallback?.(candidate);
    },
    prepareOffer: vi.fn().mockResolvedValue({ type: "offer", sdp: "offer" }),
    prepareAnswer: vi.fn().mockResolvedValue(undefined),
    acceptOffer: vi.fn().mockResolvedValue({ type: "answer", sdp: "answer" }),
    acceptAnswer: vi.fn().mockResolvedValue(true),
    createRenegotiationOffer: vi.fn().mockResolvedValue({ type: "offer", sdp: "renegotiation-offer" }),
    createIceRestartOffer: vi.fn().mockResolvedValue({ type: "offer", sdp: "ice-restart-offer" }),
    applyRenegotiationOffer: vi.fn().mockResolvedValue(undefined),
    applyIceRestartOffer: vi.fn().mockResolvedValue(undefined),
    createRenegotiationAnswer: vi.fn().mockResolvedValue({ type: "answer", sdp: "renegotiation-answer" }),
    createIceRestartAnswer: vi.fn().mockResolvedValue({ type: "answer", sdp: "ice-restart-answer" }),
    applyRenegotiationAnswer: vi.fn().mockResolvedValue(undefined),
    applyIceRestartAnswer: vi.fn().mockResolvedValue(undefined),
    getLocalScreenShareStream: vi.fn(() => localScreenShareStream),
    getRemoteScreenShareStream: vi.fn(() => remoteScreenShareStream),
    startScreenShare: vi.fn(async () => {
      localScreenShareStream = createStream([createTrack("video")]);
      return true;
    }),
    stopScreenShare: vi.fn(() => { localScreenShareStream = null; }),
    onLocalScreenShareEnded: vi.fn((handler: () => void) => {
      localScreenShareEndedHandler = handler;
      return () => {
        if (localScreenShareEndedHandler === handler) localScreenShareEndedHandler = null;
      };
    }),
    emitLocalScreenShareEnded: vi.fn(() => { localScreenShareEndedHandler?.(); }),
    onRemoteScreenShareChanged: vi.fn((handler: (stream: DirectedCallMediaStream | null) => void) => {
      remoteScreenShareChangedHandler = handler;
      return () => {
        if (remoteScreenShareChangedHandler === handler) remoteScreenShareChangedHandler = null;
      };
    }),
    emitRemoteScreenShareForTest: vi.fn((stream: DirectedCallMediaStream | null) => {
      remoteScreenShareStream = stream;
      remoteScreenShareChangedHandler?.(stream);
    }),
    setRemoteScreenShareReceptionEnabled: vi.fn(() => true),
    reconcileRemoteScreenShareState: vi.fn(),
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

function startActive(
  coordinator: DirectedCallMediaCoordinator,
  session: ReturnType<typeof createSession>,
  participantRole: "initiator" | "recipient" = "initiator",
) {
  coordinator.start();
  session.emit(projection("accepted", callId, participantRole));
  session.emit(projection("connecting", callId, participantRole));
  session.emit(projection("active", callId, participantRole));
}

function renegotiationAnswer(id: string, screenShare = false) {
  return {
    call_id: callId,
    signal_id: `${id.slice(0, 8)}-3333-4333-8333-333333333333`,
    kind: "renegotiate_answer" as const,
    payload: { renegotiation_id: id, screen_share: screenShare, sdp: "remote-renegotiation-answer" },
  };
}

function renegotiationOffer(id: string, screenShare = false) {
  return {
    call_id: callId,
    signal_id: `${id.slice(0, 8)}-4444-4444-8444-444444444444`,
    kind: "renegotiate_offer" as const,
    payload: { renegotiation_id: id, screen_share: screenShare, sdp: "remote-renegotiation-offer" },
  };
}

function renegotiationRequest(id: string, screenShare = false) {
  return {
    call_id: callId,
    signal_id: `${id.slice(0, 8)}-5555-4555-8555-555555555555`,
    kind: "renegotiate_request" as const,
    payload: { renegotiation_id: id, screen_share: screenShare },
  };
}

function iceCandidate(renegotiationId?: string, candidate = "candidate:one") {
  return {
    call_id: callId,
    signal_id: `${candidate.replace(/[^a-z0-9]/gi, "").slice(-8).padStart(8, "0")}-6666-4666-8666-666666666666`,
    kind: "ice_candidate" as const,
    payload: {
      candidate,
      sdp_mid: "0",
      sdp_mline_index: 0,
      username_fragment: "ufrag-one",
      ...(renegotiationId ? { renegotiation_id: renegotiationId } : {}),
    },
  };
}

function iceRestartCandidate(iceRestartId: string, candidate = "candidate:restart") {
  const signal = iceCandidate(undefined, candidate);
  return { ...signal, payload: { ...signal.payload, ice_restart_id: iceRestartId } };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe("DirectedCallMediaCoordinator", () => {
  beforeEach(() => setCallDebugEnabled(false));
  afterEach(() => { vi.useRealTimers(); resetDirectedCallDiagnosticTimeline(); resetDirectedCallDiagnosticsProbe(); setCallDebugEnabled(false); });

  it("records a real coordinator event after enabling diagnostics on an existing runtime", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const coordinator = createCoordinator(session, transport);
    startActive(coordinator, session);

    setCallDebugEnabled(true);
    resetDirectedCallDiagnosticsProbe();
    resetDirectedCallDiagnosticTimeline();
    await expect(coordinator.startScreenShare()).resolves.toBe(true);

    const probe = getDirectedCallDiagnosticsProbe();
    expect(probe.recorderEntryCount).toBeGreaterThan(0);
    expect(probe.timelineAppendCount).toBeGreaterThan(0);
    expect(probe.producerFamilies).toContain("coordinator");
  });

  it("routes direct and adapter callback diagnostics through the tagged coordinator helper", () => {
    const source = readFileSync("src/features/calling/services/directedCallMediaCoordinator.ts", "utf8");
    const directRecorderCalls = source.match(/(?<!recordMediaDiagnostic\()recordDirectedCallDiagnostic\(/g) ?? [];
    expect(directRecorderCalls).toHaveLength(1);
    expect(source).toContain("producerFamily: DirectedCallDiagnosticProducerFamily = \"coordinator\"");
    expect(source).toContain("this.recordMediaDiagnostic(event, details, adapterEpoch, \"adapter\")");
  });

  it("retains coordinator family tagging for direct cleanup after late enable", () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const coordinator = createCoordinator(session, transport);
    coordinator.start();

    setCallDebugEnabled(true);
    resetDirectedCallDiagnosticsProbe();
    resetDirectedCallDiagnosticTimeline();
    coordinator.dispose();

    const probe = getDirectedCallDiagnosticsProbe();
    expect(probe.producerFamilies).toEqual(["coordinator"]);
    expect(probe.timelineAppendCount).toBe(2);
    expect(getDirectedCallDiagnosticTimeline().map((entry) => entry.line)).toEqual([
      expect.stringContaining("reason=coordinator_dispose"),
      expect.stringContaining("reason=coordinator_disposed"),
    ]);
  });

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

    expect(coordinator.getSnapshot()).toMatchObject({ state: "signaling_ready", localIssue: "transport_recovery", projection: projection("active"), peerConnectionState: "failed" });
    expect(adapter.dispose).not.toHaveBeenCalled();
    expect(lifecycle.setupFailed).not.toHaveBeenCalled();
  });

  it("waits through a transient disconnect and cancels recovery when connected", async () => {
    vi.useFakeTimers();
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const adapter = createAdapter();
    let connectionState!: NonNullable<DirectedCallWebRtcAdapterOptions["onPeerConnectionState"]>;
    const coordinator = new DirectedCallMediaCoordinator(session, transport, createLifecycle(), "g1", {
      adapterFactory: (options) => { connectionState = options.onPeerConnectionState!; return bindAdapter(options, adapter); },
    });
    startActive(coordinator, session);
    connectionState("disconnected");
    await vi.advanceTimersByTimeAsync(2_999);
    expect(adapter.createIceRestartOffer).not.toHaveBeenCalled();
    connectionState("connected");
    await vi.advanceTimersByTimeAsync(3_001);
    expect(adapter.createIceRestartOffer).not.toHaveBeenCalled();
    expect(coordinator.getSnapshot().localIssue).toBeNull();
    coordinator.dispose();
  });

  it("starts one offerer restart after grace and suppresses duplicate state events", async () => {
    vi.useFakeTimers();
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const adapter = createAdapter();
    let connectionState!: NonNullable<DirectedCallWebRtcAdapterOptions["onPeerConnectionState"]>;
    const coordinator = new DirectedCallMediaCoordinator(session, transport, createLifecycle(), "g1", {
      adapterFactory: (options) => { connectionState = options.onPeerConnectionState!; return bindAdapter(options, adapter); },
    });
    startActive(coordinator, session);
    connectionState("disconnected");
    connectionState("disconnected");
    await vi.advanceTimersByTimeAsync(3_000);
    await Promise.resolve();
    expect(adapter.createIceRestartOffer).toHaveBeenCalledTimes(1);
    expect(session.sendIceRestartOffer).toHaveBeenCalledTimes(1);
    coordinator.dispose();
  });

  it("starts failed recovery immediately and keeps answerer request separate from offer creation", async () => {
    vi.useFakeTimers();
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const adapter = createAdapter();
    let connectionState!: NonNullable<DirectedCallWebRtcAdapterOptions["onPeerConnectionState"]>;
    const coordinator = new DirectedCallMediaCoordinator(session, transport, createLifecycle(), "g1", {
      adapterFactory: (options) => { connectionState = options.onPeerConnectionState!; return bindAdapter(options, adapter); },
    });
    startActive(coordinator, session, "recipient");
    connectionState("failed");
    await Promise.resolve();
    expect(session.sendIceRestartRequest).toHaveBeenCalledTimes(1);
    expect(adapter.createIceRestartOffer).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it("recovers successfully, then gives the incident a fresh budget", async () => {
    vi.useFakeTimers();
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const adapter = createAdapter();
    let connectionState!: NonNullable<DirectedCallWebRtcAdapterOptions["onPeerConnectionState"]>;
    const coordinator = new DirectedCallMediaCoordinator(session, transport, createLifecycle(), "g1", {
      adapterFactory: (options) => { connectionState = options.onPeerConnectionState!; return bindAdapter(options, adapter); },
    });
    startActive(coordinator, session);
    connectionState("failed");
    await Promise.resolve();
    connectionState("completed");
    await vi.advanceTimersByTimeAsync(20_000);
    connectionState("failed");
    await Promise.resolve();
    expect(adapter.createIceRestartOffer).toHaveBeenCalledTimes(2);
    expect(coordinator.getSnapshot().localIssue).toBe("transport_recovery");
    coordinator.dispose();
  });

  it("waits before the second attempt and emits only a safe exhaustion result", async () => {
    vi.useFakeTimers();
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const adapter = createAdapter();
    const onRecoveryResult = vi.fn();
    let connectionState!: NonNullable<DirectedCallWebRtcAdapterOptions["onPeerConnectionState"]>;
    const lifecycle = createLifecycle();
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", {
      onRecoveryResult,
      adapterFactory: (options) => { connectionState = options.onPeerConnectionState!; return bindAdapter(options, adapter); },
    });
    startActive(coordinator, session);
    connectionState("failed");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(adapter.createIceRestartOffer).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(adapter.createIceRestartOffer).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();
    expect(adapter.createIceRestartOffer).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onRecoveryResult).toHaveBeenCalledWith({ kind: "restart_exhausted", callId, generation: "g1" });
    expect(coordinator.getSnapshot().localIssue).toBe("restart_exhausted");
    expect(lifecycle.setupFailed).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it("cancels recovery timers on terminal call replacement, disposal, and generation invalidation", async () => {
    vi.useFakeTimers();
    const secondCallId = "44444444-4444-4444-8444-444444444444";
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const adapter = createAdapter();
    let currentGeneration = true;
    let connectionState!: NonNullable<DirectedCallWebRtcAdapterOptions["onPeerConnectionState"]>;
    const coordinator = new DirectedCallMediaCoordinator(session, transport, createLifecycle(), "g1", {
      isGenerationCurrent: () => currentGeneration,
      adapterFactory: (options) => { connectionState = options.onPeerConnectionState!; return bindAdapter(options, adapter); },
    });
    startActive(coordinator, session);
    connectionState("disconnected");
    session.emit(projection("ended"));
    session.emit(projection("accepted", secondCallId));
    currentGeneration = false;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(adapter.createIceRestartOffer).not.toHaveBeenCalled();
    coordinator.dispose();
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

  it("fences an active renegotiation transaction without lifecycle side effects", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", { adapterFactory: (options) => bindAdapter(options, adapter) });
    coordinator.start();
    session.emit(projection("accepted"));
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());
    session.emit(projection("connecting"));
    session.emit(projection("active"));
    const id = await coordinator.requestRenegotiation(true);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(session.sendSignal).toHaveBeenCalledWith(callId, expect.any(String), "renegotiate_request", { renegotiation_id: id, screen_share: true });
    expect(session.sendSignal).toHaveBeenCalledWith(callId, expect.any(String), "renegotiate_offer", { renegotiation_id: id, screen_share: true, sdp: "renegotiation-offer" });
    session.emitSignal({ call_id: callId, signal_id: "99999999-9999-4999-8999-999999999999", kind: "renegotiate_answer", payload: { renegotiation_id: id, screen_share: true, sdp: "answer" } });
    await vi.waitFor(() => expect(adapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(1));
    expect(lifecycle.mediaReady).not.toHaveBeenCalled();
    expect(lifecycle.setupFailed).not.toHaveBeenCalled();
    session.emitSignal({ call_id: callId, signal_id: "88888888-8888-4888-8888-888888888888", kind: "renegotiate_answer", payload: { renegotiation_id: id, screen_share: true, sdp: "answer" } });
    await Promise.resolve();
    expect(adapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(1);
    coordinator.dispose();
  });

  it("starts screen sharing as the canonical offerer and completes the matching answer", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const adapter = createAdapter();
    const coordinator = new DirectedCallMediaCoordinator(session, transport, createLifecycle(), "g1", {
      adapterFactory: (options) => bindAdapter(options, adapter),
    });
    const order: string[] = [];
    const defaultStartScreenShare = (adapter.startScreenShare as ReturnType<typeof vi.fn>).getMockImplementation() as () => Promise<boolean>;
    mockedMethod(adapter.startScreenShare).mockImplementationOnce(async () => { order.push("capture"); return defaultStartScreenShare(); });
    mockedMethod(adapter.createRenegotiationOffer).mockImplementationOnce(async () => { order.push("offer"); return { type: "offer", sdp: "screen-offer" }; });
    (session.sendSignal as ReturnType<typeof vi.fn>).mockImplementation(async (_callId: string, _signalId: string, kind: string) => { order.push(kind); });

    startActive(coordinator, session);
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());
    (session.sendSignal as ReturnType<typeof vi.fn>).mockClear();
    order.length = 0;

    await expect(coordinator.startScreenShare()).resolves.toBe(true);
    const request = (session.sendSignal as ReturnType<typeof vi.fn>).mock.calls.find(([, , kind]) => kind === "renegotiate_request");
    const offer = (session.sendSignal as ReturnType<typeof vi.fn>).mock.calls.find(([, , kind]) => kind === "renegotiate_offer");
    const id = request?.[3].renegotiation_id as string;
    expect(order).toEqual(["capture", "renegotiate_request", "offer", "renegotiate_offer"]);
    expect(request?.[3]).toEqual({ renegotiation_id: id, screen_share: true });
    expect(offer?.[3]).toEqual({ renegotiation_id: id, screen_share: true, sdp: "screen-offer" });
    expect(adapter.getLocalScreenShareStream?.()).not.toBeNull();
    expect(coordinator.getSnapshot().isLocalScreenShareActive).toBe(true);
    expect(coordinator.getSnapshot().localScreenShareStream).not.toBeNull();

    session.emitSignal(iceCandidate(id, "candidate:screen-offerer"));
    await vi.waitFor(() => expect(adapter.addRemoteIceCandidate).toHaveBeenCalledWith(expect.objectContaining({ candidate: "candidate:screen-offerer" })));
    session.emitSignal(renegotiationAnswer(id, true));
    await vi.waitFor(() => expect(adapter.applyRenegotiationAnswer).toHaveBeenCalledWith({ type: "answer", sdp: "remote-renegotiation-answer" }));
    expect(adapter.stopScreenShare).not.toHaveBeenCalled();
    expect(coordinator.getSnapshot().projection?.state).toBe("active");
    coordinator.dispose();
  });

  it("starts screen sharing as the canonical answerer and prepares the offerer to receive it", async () => {
    const recipientSession = createSession();
    const recipientTransport = new DirectedCallSignalTransport(recipientSession, { generation: "g1" });
    const recipientAdapter = createAdapter();
    const recipient = new DirectedCallMediaCoordinator(recipientSession, recipientTransport, createLifecycle(), "g1", {
      adapterFactory: (options) => bindAdapter(options, recipientAdapter),
    });
    startActive(recipient, recipientSession, "recipient");
    await vi.waitFor(() => expect(recipientAdapter.prepareAnswer).toHaveBeenCalled());
    (recipientSession.sendSignal as ReturnType<typeof vi.fn>).mockClear();
    await expect(recipient.startScreenShare()).resolves.toBe(true);
    const requestCall = (recipientSession.sendSignal as ReturnType<typeof vi.fn>).mock.calls.find(([, , kind]) => kind === "renegotiate_request");
    const id = requestCall?.[3].renegotiation_id as string;
    expect(requestCall?.[3]).toEqual({ renegotiation_id: id, screen_share: true });

    const initiatorSession = createSession();
    const initiatorTransport = new DirectedCallSignalTransport(initiatorSession, { generation: "g1" });
    const initiatorAdapter = createAdapter();
    const initiator = new DirectedCallMediaCoordinator(initiatorSession, initiatorTransport, createLifecycle(), "g1", {
      adapterFactory: (options) => bindAdapter(options, initiatorAdapter),
    });
    startActive(initiator, initiatorSession);
    await vi.waitFor(() => expect(initiatorAdapter.prepareOffer).toHaveBeenCalled());
    (initiatorSession.sendSignal as ReturnType<typeof vi.fn>).mockClear();
    const order: string[] = [];
    mockedMethod(initiatorAdapter.setRemoteScreenShareReceptionEnabled).mockImplementationOnce((enabled: boolean) => { order.push(`receive:${enabled}`); return true; });
    mockedMethod(initiatorAdapter.createRenegotiationOffer).mockImplementationOnce(async () => { order.push("offer"); return { type: "offer", sdp: "remote-screen-offer" }; });
    (initiatorSession.sendSignal as ReturnType<typeof vi.fn>).mockImplementation(async (_callId: string, _signalId: string, kind: string) => { order.push(kind); });

    initiatorSession.emitSignal(renegotiationRequest(id, true));
    await vi.waitFor(() => expect(initiatorAdapter.createRenegotiationOffer).toHaveBeenCalledTimes(1));
    expect(order).toEqual(["receive:true", "offer", "renegotiate_offer"]);
    expect(initiatorAdapter.reconcileRemoteScreenShareState).not.toHaveBeenCalled();

    recipientSession.emitSignal(renegotiationOffer(id, true));
    await vi.waitFor(() => expect(recipientAdapter.createRenegotiationAnswer).toHaveBeenCalledTimes(1));
    expect(recipientAdapter.getLocalScreenShareStream?.()).not.toBeNull();
    expect(recipientAdapter.setRemoteScreenShareReceptionEnabled).not.toHaveBeenCalled();
    const answerCall = (recipientSession.sendSignal as ReturnType<typeof vi.fn>).mock.calls.find(([, , kind]) => kind === "renegotiate_answer");
    expect(answerCall?.[3]).toEqual({ renegotiation_id: id, screen_share: true, sdp: "renegotiation-answer" });

    initiatorSession.emitSignal(renegotiationAnswer(id, true));
    await vi.waitFor(() => expect(initiatorAdapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(1));
    expect(initiatorAdapter.reconcileRemoteScreenShareState).toHaveBeenCalledWith(true);
    recipient.dispose();
    initiator.dispose();
  });

  it("exposes remote screen stream changes once without confusing local screen ownership", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const adapter = createAdapter();
    const lifecycle = createLifecycle();
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", {
      adapterFactory: (options) => bindAdapter(options, adapter),
    });
    const changes: Array<DirectedCallMediaStream | null> = [];
    coordinator.subscribe((snapshot) => changes.push(snapshot.remoteScreenShareStream));
    coordinator.start();
    session.emit(projection("accepted"));
    expect(coordinator.getSnapshot().remoteScreenShareStream).toBeNull();
    session.emit(projection("connecting"));
    session.emit(projection("active"));
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());
    const remoteStream = createStream([createTrack("video")]);

    adapter.emitRemoteScreenShareForTest(remoteStream);
    adapter.emitRemoteScreenShareForTest(remoteStream);
    expect(coordinator.getSnapshot().remoteScreenShareStream).toBe(remoteStream);
    expect(changes.filter((stream) => stream === remoteStream)).toHaveLength(1);

    await expect(coordinator.startScreenShare()).resolves.toBe(true);
    expect(coordinator.getSnapshot().remoteScreenShareStream).toBe(remoteStream);
    const startId = (session.sendSignal as ReturnType<typeof vi.fn>).mock.calls.find(([, , kind]) => kind === "renegotiate_request")?.[3].renegotiation_id as string;
    session.emitSignal(renegotiationAnswer(startId, true));
    await vi.waitFor(() => expect(adapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(1));
    await expect(coordinator.stopScreenShare()).resolves.toBe(true);
    expect(coordinator.getSnapshot().remoteScreenShareStream).toBe(remoteStream);
    expect(lifecycle.mediaReady).not.toHaveBeenCalled();

    const nullChangesBeforeRemoval = changes.filter((stream) => stream === null).length;
    adapter.emitRemoteScreenShareForTest(null);
    adapter.emitRemoteScreenShareForTest(null);
    expect(coordinator.getSnapshot().remoteScreenShareStream).toBeNull();
    expect(changes.filter((stream) => stream === null)).toHaveLength(nullChangesBeforeRemoval + 1);
    coordinator.dispose();
  });

  it("fences remote screen ownership across call and adapter rollover and disposal", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const adapters: TestAdapter[] = [];
    const coordinator = new DirectedCallMediaCoordinator(session, transport, createLifecycle(), "g1", {
      adapterFactory: (options) => {
        const adapter = createAdapter(options);
        adapters.push(adapter);
        return adapter;
      },
    });
    startActive(coordinator, session);
    await vi.waitFor(() => expect(adapters[0].prepareOffer).toHaveBeenCalled());
    const oldStream = createStream([createTrack("video")]);
    adapters[0].emitRemoteScreenShareForTest(oldStream);
    expect(coordinator.getSnapshot().remoteScreenShareStream).toBe(oldStream);

    const nextCallId = "44444444-4444-4444-8444-444444444444";
    session.emit(projection("ended"));
    expect(coordinator.getSnapshot().remoteScreenShareStream).toBeNull();
    expect(adapters).toHaveLength(2);
    session.emit(projection("accepted", nextCallId));
    session.emit(projection("connecting", nextCallId));
    session.emit(projection("active", nextCallId));
    await vi.waitFor(() => expect(adapters[1].prepareOffer).toHaveBeenCalled());

    adapters[0].emitRemoteScreenShareForTest(createStream([createTrack("video")]));
    expect(coordinator.getSnapshot().remoteScreenShareStream).toBeNull();
    const newStream = createStream([createTrack("video")]);
    adapters[1].emitRemoteScreenShareForTest(newStream);
    expect(coordinator.getSnapshot().remoteScreenShareStream).toBe(newStream);
    coordinator.dispose();
    adapters[1].emitRemoteScreenShareForTest(null);
    expect(coordinator.getSnapshot().remoteScreenShareStream).toBeNull();
  });

  it("stops screen sharing as the canonical offerer and binds the false transaction", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const adapter = createAdapter();
    const coordinator = new DirectedCallMediaCoordinator(session, transport, createLifecycle(), "g1", {
      adapterFactory: (options) => bindAdapter(options, adapter),
    });
    startActive(coordinator, session);
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());
    await expect(coordinator.startScreenShare()).resolves.toBe(true);
    const startId = (session.sendSignal as ReturnType<typeof vi.fn>).mock.calls.find(([, , kind]) => kind === "renegotiate_request")?.[3].renegotiation_id as string;
    session.emitSignal(renegotiationAnswer(startId, true));
    await vi.waitFor(() => expect(adapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(1));
    (session.sendSignal as ReturnType<typeof vi.fn>).mockClear();
    mockedMethod(adapter.stopScreenShare).mockClear();

    const stopPromise = coordinator.stopScreenShare();
    expect(adapter.stopScreenShare).toHaveBeenCalledTimes(1);
    const request = (session.sendSignal as ReturnType<typeof vi.fn>).mock.calls.find(([, , kind]) => kind === "renegotiate_request");
    const stopId = request?.[3].renegotiation_id as string;
    expect(request?.[3]).toEqual({ renegotiation_id: stopId, screen_share: false });
    await vi.waitFor(() => expect(adapter.createRenegotiationOffer).toHaveBeenCalledTimes(2));
    expect((session.sendSignal as ReturnType<typeof vi.fn>).mock.calls.find(([, , kind]) => kind === "renegotiate_offer")?.[3])
      .toEqual({ renegotiation_id: stopId, screen_share: false, sdp: "renegotiation-offer" });
    expect(adapter.getLocalScreenShareStream?.()).toBeNull();
    session.emitSignal(renegotiationAnswer(stopId, false));
    await expect(stopPromise).resolves.toBe(true);
    await vi.waitFor(() => expect(adapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(2));
    await expect(coordinator.stopScreenShare()).resolves.toBe(true);
    expect(session.sendSignal).toHaveBeenCalledTimes(2);
    expect(coordinator.getSnapshot().isLocalScreenShareActive).toBe(false);
    expect(coordinator.getSnapshot().localScreenShareStream).toBeNull();
    coordinator.dispose();
  });

  it("stops screen sharing as the canonical answerer and clears the offerer's committed reception on completion", async () => {
    const recipientSession = createSession();
    const recipientTransport = new DirectedCallSignalTransport(recipientSession, { generation: "g1" });
    const recipientAdapter = createAdapter();
    const recipient = new DirectedCallMediaCoordinator(recipientSession, recipientTransport, createLifecycle(), "g1", {
      adapterFactory: (options) => bindAdapter(options, recipientAdapter),
    });
    startActive(recipient, recipientSession, "recipient");
    await vi.waitFor(() => expect(recipientAdapter.prepareAnswer).toHaveBeenCalled());
    await expect(recipient.startScreenShare()).resolves.toBe(true);
    const startId = (recipientSession.sendSignal as ReturnType<typeof vi.fn>).mock.calls.find(([, , kind]) => kind === "renegotiate_request")?.[3].renegotiation_id as string;

    const initiatorSession = createSession();
    const initiatorTransport = new DirectedCallSignalTransport(initiatorSession, { generation: "g1" });
    const initiatorAdapter = createAdapter();
    const initiator = new DirectedCallMediaCoordinator(initiatorSession, initiatorTransport, createLifecycle(), "g1", {
      adapterFactory: (options) => bindAdapter(options, initiatorAdapter),
    });
    startActive(initiator, initiatorSession);
    await vi.waitFor(() => expect(initiatorAdapter.prepareOffer).toHaveBeenCalled());
    initiatorSession.emitSignal(renegotiationRequest(startId, true));
    await vi.waitFor(() => expect(initiatorAdapter.createRenegotiationOffer).toHaveBeenCalledTimes(1));
    recipientSession.emitSignal(renegotiationOffer(startId, true));
    await vi.waitFor(() => expect(recipientAdapter.createRenegotiationAnswer).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(recipientSession.sendSignal).toHaveBeenCalledWith(callId, expect.any(String), "renegotiate_answer", expect.objectContaining({ renegotiation_id: startId })));
    await Promise.resolve();
    await vi.waitFor(() => expect(recipientSession.sendSignal).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    initiatorSession.emitSignal(renegotiationAnswer(startId, true));
    await vi.waitFor(() => expect(initiatorAdapter.reconcileRemoteScreenShareState).toHaveBeenCalledWith(true));
    (recipientSession.sendSignal as ReturnType<typeof vi.fn>).mockClear();
    (initiatorSession.sendSignal as ReturnType<typeof vi.fn>).mockClear();
    mockedMethod(initiatorAdapter.setRemoteScreenShareReceptionEnabled).mockClear();
    mockedMethod(initiatorAdapter.reconcileRemoteScreenShareState).mockClear();

    const stopPromise = recipient.stopScreenShare();
    const request = (recipientSession.sendSignal as ReturnType<typeof vi.fn>).mock.calls[0];
    const stopId = request[3].renegotiation_id as string;
    expect(request[3]).toEqual({ renegotiation_id: stopId, screen_share: false });
    initiatorSession.emitSignal(renegotiationRequest(stopId, false));
    await vi.waitFor(() => expect(initiatorAdapter.createRenegotiationOffer).toHaveBeenCalledTimes(2));
    expect(initiatorAdapter.setRemoteScreenShareReceptionEnabled).toHaveBeenLastCalledWith(false);
    expect(initiatorAdapter.reconcileRemoteScreenShareState).not.toHaveBeenCalled();
    recipientSession.emitSignal(renegotiationOffer(stopId, false));
    await vi.waitFor(() => expect(recipientAdapter.createRenegotiationAnswer).toHaveBeenCalledTimes(2));
    initiatorSession.emitSignal(renegotiationAnswer(stopId, false));
    await expect(stopPromise).resolves.toBe(true);
    await vi.waitFor(() => expect(initiatorAdapter.reconcileRemoteScreenShareState).toHaveBeenCalledWith(false));
    expect(recipientAdapter.getLocalScreenShareStream?.()).toBeNull();
    recipient.dispose();
    initiator.dispose();
  });

  it("is idempotent for explicit stop and translates one browser-ended callback into one stop", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const adapter = createAdapter();
    const coordinator = new DirectedCallMediaCoordinator(session, transport, createLifecycle(), "g1", {
      adapterFactory: (options) => bindAdapter(options, adapter),
    });
    startActive(coordinator, session);
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());
    await expect(coordinator.startScreenShare()).resolves.toBe(true);
    const startId = (session.sendSignal as ReturnType<typeof vi.fn>).mock.calls.find(([, , kind]) => kind === "renegotiate_request")?.[3].renegotiation_id as string;
    session.emitSignal(renegotiationAnswer(startId, true));
    await vi.waitFor(() => expect(adapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(1));
    (session.sendSignal as ReturnType<typeof vi.fn>).mockClear();
    adapter.emitLocalScreenShareEnded();
    adapter.emitLocalScreenShareEnded();
    await vi.waitFor(() => expect(session.sendSignal).toHaveBeenCalledTimes(2));
    const stopRequest = (session.sendSignal as ReturnType<typeof vi.fn>).mock.calls[0];
    const stopId = stopRequest[3].renegotiation_id as string;
    expect(stopRequest[3]).toEqual({ renegotiation_id: stopId, screen_share: false });
    session.emitSignal(renegotiationAnswer(stopId, false));
    await vi.waitFor(() => expect(adapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(2));
    expect(session.sendSignal).toHaveBeenCalledTimes(2);
    coordinator.dispose();
  });

  it("queues browser-ended stop behind another transaction without duplicating it", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const adapter = createAdapter();
    const coordinator = new DirectedCallMediaCoordinator(session, transport, createLifecycle(), "g1", {
      adapterFactory: (options) => bindAdapter(options, adapter),
    });
    startActive(coordinator, session);
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());
    await expect(coordinator.startScreenShare()).resolves.toBe(true);
    const startId = (session.sendSignal as ReturnType<typeof vi.fn>).mock.calls.find(([, , kind]) => kind === "renegotiate_request")?.[3].renegotiation_id as string;
    session.emitSignal(renegotiationAnswer(startId, true));
    await vi.waitFor(() => expect(adapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(1));
    (session.sendSignal as ReturnType<typeof vi.fn>).mockClear();
    const ordinaryId = await coordinator.requestRenegotiation();
    adapter.emitLocalScreenShareEnded();
    expect(session.sendSignal).toHaveBeenCalledTimes(2);
    session.emitSignal(renegotiationAnswer(ordinaryId!));
    await vi.waitFor(() => expect(adapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(session.sendSignal).toHaveBeenCalledTimes(4));
    expect((session.sendSignal as ReturnType<typeof vi.fn>).mock.calls[2][3].screen_share).toBe(false);
    const stopId = (session.sendSignal as ReturnType<typeof vi.fn>).mock.calls[2][3].renegotiation_id as string;
    session.emitSignal(renegotiationAnswer(stopId, false));
    await vi.waitFor(() => expect(adapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(3));
    coordinator.dispose();
  });

  it("retains committed remote visibility and receive intent when stop answer fails, then permits retry", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const adapter = createAdapter();
    const remoteStream = createStream([createTrack("video")]);
    mockedMethod(adapter.getRemoteScreenShareStream).mockReturnValue(remoteStream);
    const coordinator = new DirectedCallMediaCoordinator(session, transport, createLifecycle(), "g1", {
      adapterFactory: (options) => bindAdapter(options, adapter),
    });
    startActive(coordinator, session);
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());
    const startId = "11111111-1111-4111-8111-111111111111";
    session.emitSignal(renegotiationRequest(startId, true));
    await vi.waitFor(() => expect(adapter.createRenegotiationOffer).toHaveBeenCalledTimes(1));
    session.emitSignal(renegotiationAnswer(startId, true));
    await vi.waitFor(() => expect(adapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(1));
    mockedMethod(adapter.applyRenegotiationAnswer).mockRejectedValueOnce(new Error("stop answer failed"));
    mockedMethod(adapter.setRemoteScreenShareReceptionEnabled).mockClear();
    mockedMethod(adapter.reconcileRemoteScreenShareState).mockClear();
    (session.sendSignal as ReturnType<typeof vi.fn>).mockClear();

    const firstId = "22222222-2222-4222-8222-222222222222";
    session.emitSignal(renegotiationRequest(firstId, false));
    await vi.waitFor(() => expect(adapter.createRenegotiationOffer).toHaveBeenCalledTimes(2));
    session.emitSignal(renegotiationAnswer(firstId, false));
    await vi.waitFor(() => expect(adapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(2));
    expect(adapter.getRemoteScreenShareStream?.()).toBe(remoteStream);
    expect(adapter.setRemoteScreenShareReceptionEnabled).toHaveBeenLastCalledWith(true);
    expect(adapter.reconcileRemoteScreenShareState).not.toHaveBeenCalledWith(false);

    const retryId = "33333333-3333-4333-8333-333333333333";
    session.emitSignal(renegotiationRequest(retryId, false));
    await vi.waitFor(() => expect(adapter.createRenegotiationOffer).toHaveBeenCalledTimes(3));
    session.emitSignal(renegotiationAnswer(retryId, false));
    await vi.waitFor(() => expect(adapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(3));
    await vi.waitFor(() => expect(adapter.reconcileRemoteScreenShareState).toHaveBeenCalledWith(false));
    coordinator.dispose();
  });

  it("rolls back failed stop request or offer delivery while allowing a later retry", async () => {
    for (const failure of ["request", "offer"] as const) {
      const session = createSession();
      const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
      const adapter = createAdapter();
      const coordinator = new DirectedCallMediaCoordinator(session, transport, createLifecycle(), "g1", {
        adapterFactory: (options) => bindAdapter(options, adapter),
      });
      startActive(coordinator, session);
      await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());
      await expect(coordinator.startScreenShare()).resolves.toBe(true);
      const startId = (session.sendSignal as ReturnType<typeof vi.fn>).mock.calls.find(([, , kind]) => kind === "renegotiate_request")?.[3].renegotiation_id as string;
      session.emitSignal(renegotiationAnswer(startId, true));
      await vi.waitFor(() => expect(adapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(1));
      (session.sendSignal as ReturnType<typeof vi.fn>).mockClear();
      if (failure === "request") mockedMethod(session.sendSignal).mockRejectedValueOnce(new Error("request failed"));
      if (failure === "offer") mockedMethod(adapter.createRenegotiationOffer).mockRejectedValueOnce(new Error("offer failed"));

      await expect(coordinator.stopScreenShare()).resolves.toBe(false);
      expect(adapter.getLocalScreenShareStream?.()).toBeNull();
      (session.sendSignal as ReturnType<typeof vi.fn>).mockClear();
      await expect(coordinator.stopScreenShare()).resolves.toBe(true);
      const retryId = (session.sendSignal as ReturnType<typeof vi.fn>).mock.calls.find(([, , kind]) => kind === "renegotiate_request")?.[3].renegotiation_id as string;
      session.emitSignal(renegotiationAnswer(retryId, false));
      await vi.waitFor(() => expect(adapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(2));
      coordinator.dispose();
    }
  });

  it("fences a pending stop request after disposal", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const adapter = createAdapter();
    const coordinator = new DirectedCallMediaCoordinator(session, transport, createLifecycle(), "g1", {
      adapterFactory: (options) => bindAdapter(options, adapter),
    });
    startActive(coordinator, session);
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());
    await expect(coordinator.startScreenShare()).resolves.toBe(true);
    const startId = (session.sendSignal as ReturnType<typeof vi.fn>).mock.calls.find(([, , kind]) => kind === "renegotiate_request")?.[3].renegotiation_id as string;
    session.emitSignal(renegotiationAnswer(startId, true));
    await vi.waitFor(() => expect(adapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(1));
    const request = deferred<unknown>();
    mockedMethod(session.sendSignal).mockReturnValueOnce(request.promise);
    const stop = coordinator.stopScreenShare();
    expect(adapter.getLocalScreenShareStream?.()).toBeNull();
    coordinator.dispose();
    request.resolve(undefined);
    await expect(stop).resolves.toBe(false);
    expect(adapter.createRenegotiationOffer).toHaveBeenCalledTimes(1);
  });

  it("rolls back screen ownership when capture, request, or offer fails", async () => {
    const cases: Array<"capture" | "request" | "offer"> = ["capture", "request", "offer"];
    for (const failure of cases) {
      const session = createSession();
      const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
      const adapter = createAdapter();
      const coordinator = new DirectedCallMediaCoordinator(session, transport, createLifecycle(), "g1", {
        adapterFactory: (options) => bindAdapter(options, adapter),
      });
      startActive(coordinator, session);
      await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());
      (session.sendSignal as ReturnType<typeof vi.fn>).mockClear();
      if (failure === "capture") mockedMethod(adapter.startScreenShare).mockRejectedValueOnce(new Error("capture denied"));
      if (failure === "request") (session.sendSignal as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("request failed"));
      if (failure === "offer") mockedMethod(adapter.createRenegotiationOffer).mockRejectedValueOnce(new Error("offer failed"));

      await expect(coordinator.startScreenShare()).resolves.toBe(false);
      if (failure === "capture") {
        expect(session.sendSignal).not.toHaveBeenCalledWith(callId, expect.any(String), "renegotiate_request", expect.anything());
      } else {
        expect(session.sendSignal).toHaveBeenCalledWith(callId, expect.any(String), "renegotiate_request", expect.objectContaining({ screen_share: true }));
      }
      if (failure === "offer") expect(session.sendSignal).not.toHaveBeenCalledWith(callId, expect.any(String), "renegotiate_offer", expect.anything());
      expect(adapter.getLocalScreenShareStream?.()).toBeNull();
      if (failure !== "capture") expect(adapter.stopScreenShare).toHaveBeenCalledTimes(1);
      coordinator.dispose();
    }
  });

  it("rolls back local screen ownership when the matching answer fails", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const adapter = createAdapter();
    mockedMethod(adapter.applyRenegotiationAnswer).mockRejectedValueOnce(new Error("answer failed"));
    const coordinator = new DirectedCallMediaCoordinator(session, transport, createLifecycle(), "g1", {
      adapterFactory: (options) => bindAdapter(options, adapter),
    });
    startActive(coordinator, session);
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());
    const started = coordinator.startScreenShare();
    await vi.waitFor(() => expect(adapter.createRenegotiationOffer).toHaveBeenCalledTimes(1));
    const id = (session.sendSignal as ReturnType<typeof vi.fn>).mock.calls.find(([, , kind]) => kind === "renegotiate_request")?.[3].renegotiation_id as string;
    session.emitSignal(renegotiationAnswer(id, true));
    await vi.waitFor(() => expect(adapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(1));
    await expect(started).resolves.toBe(true);
    await Promise.resolve();
    expect(adapter.stopScreenShare).toHaveBeenCalledTimes(1);
    expect(adapter.getLocalScreenShareStream?.()).toBeNull();
    coordinator.dispose();
  });

  it("rejects duplicate starts while capture and renegotiation are in flight", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const adapter = createAdapter();
    const capture = deferred<boolean>();
    mockedMethod(adapter.startScreenShare).mockReturnValueOnce(capture.promise);
    const coordinator = new DirectedCallMediaCoordinator(session, transport, createLifecycle(), "g1", {
      adapterFactory: (options) => bindAdapter(options, adapter),
    });
    startActive(coordinator, session);
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());

    const first = coordinator.startScreenShare();
    await expect(coordinator.startScreenShare()).resolves.toBe(false);
    expect(adapter.startScreenShare).toHaveBeenCalledTimes(1);
    capture.resolve(true);
    await expect(first).resolves.toBe(true);
    await expect(coordinator.requestRenegotiation()).resolves.toBeNull();
    coordinator.dispose();
  });

  it("fences stale screen capture across coordinator generation replacement", async () => {
    const session = createSession();
    const oldTransport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const oldAdapter = createAdapter();
    const capture = deferred<boolean>();
    const defaultStartScreenShare = (oldAdapter.startScreenShare as ReturnType<typeof vi.fn>).getMockImplementation() as () => Promise<boolean>;
    mockedMethod(oldAdapter.startScreenShare).mockReturnValueOnce(capture.promise.then((result) => result ? defaultStartScreenShare() : false));
    const oldCoordinator = new DirectedCallMediaCoordinator(session, oldTransport, createLifecycle(), "g1", {
      adapterFactory: (options) => bindAdapter(options, oldAdapter),
    });
    startActive(oldCoordinator, session);
    await vi.waitFor(() => expect(oldAdapter.prepareOffer).toHaveBeenCalled());
    const staleStart = oldCoordinator.startScreenShare();
    oldCoordinator.dispose();

    const newTransport = new DirectedCallSignalTransport(session, { generation: "g2" });
    const newAdapter = createAdapter();
    const newCoordinator = new DirectedCallMediaCoordinator(session, newTransport, createLifecycle(), "g2", {
      adapterFactory: (options) => bindAdapter(options, newAdapter),
    });
    startActive(newCoordinator, session);
    await vi.waitFor(() => expect(newAdapter.prepareOffer).toHaveBeenCalled());
    capture.resolve(true);
    await expect(staleStart).resolves.toBe(false);
    expect(oldAdapter.stopScreenShare).toHaveBeenCalledTimes(1);
    expect(session.sendSignal).not.toHaveBeenCalledWith(callId, expect.any(String), "renegotiate_request", expect.anything());
    expect(newAdapter.startScreenShare).not.toHaveBeenCalled();
    newCoordinator.dispose();
  });

  it("does not apply a duplicate answer while the matching answer is in flight", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    const applyAnswer = deferred<void>();
    mockedMethod(adapter.applyRenegotiationAnswer).mockReturnValueOnce(applyAnswer.promise);
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", {
      adapterFactory: (options) => bindAdapter(options, adapter),
    });

    startActive(coordinator, session);
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());
    const id = await coordinator.requestRenegotiation();
    const answer = renegotiationAnswer(id!);
    session.emitSignal(answer);
    session.emitSignal(answer);
    await vi.waitFor(() => expect(adapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(1));

    applyAnswer.resolve();
    await vi.waitFor(() => expect(adapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(1));
    expect(lifecycle.mediaReady).not.toHaveBeenCalled();
    expect(lifecycle.setupFailed).not.toHaveBeenCalled();
    expect(adapter.dispose).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it("releases a failed answer application so a later transaction can succeed", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    mockedMethod(adapter.applyRenegotiationAnswer).mockRejectedValueOnce(new Error("answer failed"));
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", {
      adapterFactory: (options) => bindAdapter(options, adapter),
    });

    startActive(coordinator, session);
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());
    const failedId = await coordinator.requestRenegotiation();
    session.emitSignal(renegotiationAnswer(failedId!));
    await vi.waitFor(() => expect(adapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    await Promise.resolve();

    const retryId = await coordinator.requestRenegotiation();
    expect(retryId).not.toBe(failedId);
    session.emitSignal(renegotiationAnswer(retryId!));
    await vi.waitFor(() => expect(adapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(2));
    expect(lifecycle.mediaReady).not.toHaveBeenCalled();
    expect(lifecycle.setupFailed).not.toHaveBeenCalled();
    expect(adapter.dispose).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it("ignores a stale answer completion after disposal and generation rollover", async () => {
    const session = createSession();
    const oldTransport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const oldLifecycle = createLifecycle();
    const oldAdapter = createAdapter();
    const applyAnswer = deferred<void>();
    mockedMethod(oldAdapter.applyRenegotiationAnswer).mockReturnValueOnce(applyAnswer.promise);
    const oldCoordinator = new DirectedCallMediaCoordinator(session, oldTransport, oldLifecycle, "g1", {
      adapterFactory: (options) => bindAdapter(options, oldAdapter),
    });

    startActive(oldCoordinator, session);
    await vi.waitFor(() => expect(oldAdapter.prepareOffer).toHaveBeenCalled());
    const oldId = await oldCoordinator.requestRenegotiation();
    session.emitSignal(renegotiationAnswer(oldId!));
    await vi.waitFor(() => expect(oldAdapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(1));

    oldCoordinator.dispose();
    const newTransport = new DirectedCallSignalTransport(session, { generation: "g2" });
    const newLifecycle = createLifecycle();
    const newAdapter = createAdapter();
    const newCoordinator = new DirectedCallMediaCoordinator(session, newTransport, newLifecycle, "g2", {
      adapterFactory: (options) => bindAdapter(options, newAdapter),
    });
    startActive(newCoordinator, session);
    await vi.waitFor(() => expect(newAdapter.prepareOffer).toHaveBeenCalled());

    applyAnswer.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(newLifecycle.mediaReady).not.toHaveBeenCalled();
    expect(newLifecycle.setupFailed).not.toHaveBeenCalled();
    expect(newAdapter.applyRenegotiationAnswer).not.toHaveBeenCalled();
    expect(newAdapter.dispose).not.toHaveBeenCalled();
    expect(oldAdapter.dispose).toHaveBeenCalledTimes(1);
    newCoordinator.dispose();
  });

  it("does not create a duplicate offer while the matching request is in flight", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    const createOffer = deferred<RTCSessionDescriptionInit>();
    mockedMethod(adapter.createRenegotiationOffer).mockReturnValueOnce(createOffer.promise);
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", {
      adapterFactory: (options) => bindAdapter(options, adapter),
    });

    startActive(coordinator, session);
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const request = {
      call_id: callId,
      signal_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      kind: "renegotiate_request" as const,
      payload: { renegotiation_id: id, screen_share: false },
    };
    session.emitSignal(request);
    session.emitSignal(request);
    await vi.waitFor(() => expect(adapter.createRenegotiationOffer).toHaveBeenCalledTimes(1));
    expect(session.sendSignal).not.toHaveBeenCalledWith(
      callId,
      expect.any(String),
      "renegotiate_offer",
      expect.anything(),
    );

    createOffer.resolve({ type: "offer", sdp: "renegotiation-offer" });
    await vi.waitFor(() => expect(session.sendSignal).toHaveBeenCalledWith(
      callId,
      expect.any(String),
      "renegotiate_offer",
      { renegotiation_id: id, screen_share: false, sdp: "renegotiation-offer" },
    ));
    session.emitSignal(request);
    await Promise.resolve();
    expect(adapter.createRenegotiationOffer).toHaveBeenCalledTimes(1);
    expect(session.sendSignal).toHaveBeenCalledTimes(1);
    expect(lifecycle.mediaReady).not.toHaveBeenCalled();
    expect(lifecycle.setupFailed).not.toHaveBeenCalled();
    expect(adapter.dispose).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it("releases a failed offer creation so a later transaction can succeed", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    mockedMethod(adapter.createRenegotiationOffer).mockRejectedValueOnce(new Error("offer failed"));
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", {
      adapterFactory: (options) => bindAdapter(options, adapter),
    });

    startActive(coordinator, session);
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());
    const failedId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    session.emitSignal({
      call_id: callId,
      signal_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      kind: "renegotiate_request" as const,
      payload: { renegotiation_id: failedId, screen_share: false },
    });
    await vi.waitFor(() => expect(adapter.createRenegotiationOffer).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    await Promise.resolve();

    const retryId = await coordinator.requestRenegotiation();
    expect(retryId).not.toBe(failedId);
    await vi.waitFor(() => expect(adapter.createRenegotiationOffer).toHaveBeenCalledTimes(2));
    expect(session.sendSignal).toHaveBeenCalledWith(
      callId,
      expect.any(String),
      "renegotiate_offer",
      { renegotiation_id: retryId, screen_share: false, sdp: "renegotiation-offer" },
    );
    expect(lifecycle.mediaReady).not.toHaveBeenCalled();
    expect(lifecycle.setupFailed).not.toHaveBeenCalled();
    expect(adapter.dispose).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it("ignores stale offer creation after disposal and generation rollover", async () => {
    const session = createSession();
    const oldTransport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const oldLifecycle = createLifecycle();
    const oldAdapter = createAdapter();
    const createOffer = deferred<RTCSessionDescriptionInit>();
    mockedMethod(oldAdapter.createRenegotiationOffer).mockReturnValueOnce(createOffer.promise);
    const oldCoordinator = new DirectedCallMediaCoordinator(session, oldTransport, oldLifecycle, "g1", {
      adapterFactory: (options) => bindAdapter(options, oldAdapter),
    });
    const oldSignalCallback = (session.subscribeToSignals as ReturnType<typeof vi.fn>).mock.calls[0][0] as (signal: any) => void;

    startActive(oldCoordinator, session);
    await vi.waitFor(() => expect(oldAdapter.prepareOffer).toHaveBeenCalled());
    const oldId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const oldRequest = {
      call_id: callId,
      signal_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      kind: "renegotiate_request" as const,
      payload: { renegotiation_id: oldId, screen_share: false },
    };
    session.emitSignal(oldRequest);
    await vi.waitFor(() => expect(oldAdapter.createRenegotiationOffer).toHaveBeenCalledTimes(1));

    oldCoordinator.dispose();
    oldSignalCallback(oldRequest);
    const newTransport = new DirectedCallSignalTransport(session, { generation: "g2" });
    const newLifecycle = createLifecycle();
    const newAdapter = createAdapter();
    const newCoordinator = new DirectedCallMediaCoordinator(session, newTransport, newLifecycle, "g2", {
      adapterFactory: (options) => bindAdapter(options, newAdapter),
    });
    startActive(newCoordinator, session);
    await vi.waitFor(() => expect(newAdapter.prepareOffer).toHaveBeenCalled());

    createOffer.resolve({ type: "offer", sdp: "stale-offer" });
    await Promise.resolve();
    await Promise.resolve();
    expect(session.sendSignal).not.toHaveBeenCalledWith(
      callId,
      expect.any(String),
      "renegotiate_offer",
      expect.objectContaining({ renegotiation_id: oldId }),
    );
    expect(newAdapter.createRenegotiationOffer).not.toHaveBeenCalled();
    expect(newLifecycle.mediaReady).not.toHaveBeenCalled();
    expect(newLifecycle.setupFailed).not.toHaveBeenCalled();
    expect(newAdapter.dispose).not.toHaveBeenCalled();
    expect(oldAdapter.dispose).toHaveBeenCalledTimes(1);
    newCoordinator.dispose();
  });

  it("does not apply a duplicate offer while remote SDP application is in flight", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    const applyOffer = deferred<void>();
    mockedMethod(adapter.applyRenegotiationOffer).mockReturnValueOnce(applyOffer.promise);
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", {
      adapterFactory: (options) => bindAdapter(options, adapter),
    });

    startActive(coordinator, session, "recipient");
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const offer = renegotiationOffer(id);
    session.emitSignal(offer);
    session.emitSignal(offer);
    await vi.waitFor(() => expect(adapter.applyRenegotiationOffer).toHaveBeenCalledTimes(1));
    expect(adapter.createRenegotiationAnswer).not.toHaveBeenCalled();
    expect(session.sendSignal).not.toHaveBeenCalled();

    applyOffer.resolve();
    await vi.waitFor(() => expect(session.sendSignal).toHaveBeenCalledWith(
      callId,
      expect.any(String),
      "renegotiate_answer",
      { renegotiation_id: id, screen_share: false, sdp: "renegotiation-answer" },
    ));
    expect(adapter.applyRenegotiationOffer).toHaveBeenCalledTimes(1);
    expect(adapter.createRenegotiationAnswer).toHaveBeenCalledTimes(1);
    expect(adapter.applyRenegotiationAnswer).not.toHaveBeenCalled();
    expect(adapter.createRenegotiationOffer).not.toHaveBeenCalled();
    expect(session.sendSignal).toHaveBeenCalledTimes(1);
    expect(lifecycle.mediaReady).not.toHaveBeenCalled();
    expect(lifecycle.setupFailed).not.toHaveBeenCalled();
    expect(adapter.dispose).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it("does not create a duplicate answer while answer creation is in flight", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    const createAnswer = deferred<RTCSessionDescriptionInit>();
    mockedMethod(adapter.createRenegotiationAnswer).mockReturnValueOnce(createAnswer.promise);
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", {
      adapterFactory: (options) => bindAdapter(options, adapter),
    });

    startActive(coordinator, session, "recipient");
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const offer = renegotiationOffer(id);
    session.emitSignal(offer);
    await vi.waitFor(() => expect(adapter.applyRenegotiationOffer).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(adapter.createRenegotiationAnswer).toHaveBeenCalledTimes(1));
    session.emitSignal(offer);
    await Promise.resolve();
    expect(adapter.applyRenegotiationOffer).toHaveBeenCalledTimes(1);
    expect(adapter.createRenegotiationAnswer).toHaveBeenCalledTimes(1);
    expect(session.sendSignal).not.toHaveBeenCalled();

    createAnswer.resolve({ type: "answer", sdp: "renegotiation-answer" });
    await vi.waitFor(() => expect(session.sendSignal).toHaveBeenCalledWith(
      callId,
      expect.any(String),
      "renegotiate_answer",
      { renegotiation_id: id, screen_share: false, sdp: "renegotiation-answer" },
    ));
    session.emitSignal(offer);
    await Promise.resolve();
    expect(adapter.applyRenegotiationOffer).toHaveBeenCalledTimes(1);
    expect(adapter.createRenegotiationAnswer).toHaveBeenCalledTimes(1);
    expect(session.sendSignal).toHaveBeenCalledTimes(1);
    expect(lifecycle.mediaReady).not.toHaveBeenCalled();
    expect(lifecycle.setupFailed).not.toHaveBeenCalled();
    expect(adapter.dispose).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it("releases a failed remote offer application so a later offer can succeed", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    mockedMethod(adapter.applyRenegotiationOffer).mockRejectedValueOnce(new Error("offer application failed"));
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", {
      adapterFactory: (options) => bindAdapter(options, adapter),
    });

    startActive(coordinator, session, "recipient");
    const failedId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    session.emitSignal(renegotiationOffer(failedId));
    await vi.waitFor(() => expect(adapter.applyRenegotiationOffer).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    await Promise.resolve();
    expect(adapter.createRenegotiationAnswer).not.toHaveBeenCalled();
    expect(session.sendSignal).not.toHaveBeenCalled();

    const retryId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    session.emitSignal(renegotiationOffer(retryId));
    await vi.waitFor(() => expect(session.sendSignal).toHaveBeenCalledWith(
      callId,
      expect.any(String),
      "renegotiate_answer",
      { renegotiation_id: retryId, screen_share: false, sdp: "renegotiation-answer" },
    ));
    expect(adapter.applyRenegotiationOffer).toHaveBeenCalledTimes(2);
    expect(adapter.createRenegotiationAnswer).toHaveBeenCalledTimes(1);
    expect(session.sendSignal).toHaveBeenCalledTimes(1);
    expect(lifecycle.mediaReady).not.toHaveBeenCalled();
    expect(lifecycle.setupFailed).not.toHaveBeenCalled();
    expect(adapter.dispose).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it("releases a failed answer creation so a later offer can succeed", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    mockedMethod(adapter.createRenegotiationAnswer).mockRejectedValueOnce(new Error("answer creation failed"));
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", {
      adapterFactory: (options) => bindAdapter(options, adapter),
    });

    startActive(coordinator, session, "recipient");
    const failedId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    session.emitSignal(renegotiationOffer(failedId));
    await vi.waitFor(() => expect(adapter.createRenegotiationAnswer).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    await Promise.resolve();
    expect(session.sendSignal).not.toHaveBeenCalled();

    const retryId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    session.emitSignal(renegotiationOffer(retryId));
    await vi.waitFor(() => expect(session.sendSignal).toHaveBeenCalledWith(
      callId,
      expect.any(String),
      "renegotiate_answer",
      { renegotiation_id: retryId, screen_share: false, sdp: "renegotiation-answer" },
    ));
    expect(adapter.applyRenegotiationOffer).toHaveBeenCalledTimes(2);
    expect(adapter.createRenegotiationAnswer).toHaveBeenCalledTimes(2);
    expect(session.sendSignal).toHaveBeenCalledTimes(1);
    expect(lifecycle.mediaReady).not.toHaveBeenCalled();
    expect(lifecycle.setupFailed).not.toHaveBeenCalled();
    expect(adapter.dispose).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it("ignores stale offer application completion after disposal and generation rollover", async () => {
    const session = createSession();
    const oldTransport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const oldLifecycle = createLifecycle();
    const oldAdapter = createAdapter();
    const applyOffer = deferred<void>();
    mockedMethod(oldAdapter.applyRenegotiationOffer).mockReturnValueOnce(applyOffer.promise);
    const oldCoordinator = new DirectedCallMediaCoordinator(session, oldTransport, oldLifecycle, "g1", {
      adapterFactory: (options) => bindAdapter(options, oldAdapter),
    });
    const oldSignalCallback = (session.subscribeToSignals as ReturnType<typeof vi.fn>).mock.calls[0][0] as (signal: any) => void;

    startActive(oldCoordinator, session, "recipient");
    const oldId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const oldOffer = renegotiationOffer(oldId);
    session.emitSignal(oldOffer);
    await vi.waitFor(() => expect(oldAdapter.applyRenegotiationOffer).toHaveBeenCalledTimes(1));

    oldCoordinator.dispose();
    oldSignalCallback(oldOffer);
    const newTransport = new DirectedCallSignalTransport(session, { generation: "g2" });
    const newLifecycle = createLifecycle();
    const newAdapter = createAdapter();
    const newCoordinator = new DirectedCallMediaCoordinator(session, newTransport, newLifecycle, "g2", {
      adapterFactory: (options) => bindAdapter(options, newAdapter),
    });
    startActive(newCoordinator, session, "recipient");

    applyOffer.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(oldAdapter.createRenegotiationAnswer).not.toHaveBeenCalled();
    expect(session.sendSignal).not.toHaveBeenCalled();
    expect(newAdapter.createRenegotiationAnswer).not.toHaveBeenCalled();
    expect(newLifecycle.mediaReady).not.toHaveBeenCalled();
    expect(newLifecycle.setupFailed).not.toHaveBeenCalled();
    expect(newAdapter.dispose).not.toHaveBeenCalled();
    expect(oldAdapter.dispose).toHaveBeenCalledTimes(1);
    newCoordinator.dispose();
  });

  it("ignores stale offer application failure after disposal and generation rollover", async () => {
    const session = createSession();
    const oldTransport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const oldLifecycle = createLifecycle();
    const oldAdapter = createAdapter();
    const applyOffer = deferred<void>();
    mockedMethod(oldAdapter.applyRenegotiationOffer).mockReturnValueOnce(applyOffer.promise);
    const oldCoordinator = new DirectedCallMediaCoordinator(session, oldTransport, oldLifecycle, "g1", {
      adapterFactory: (options) => bindAdapter(options, oldAdapter),
    });

    startActive(oldCoordinator, session, "recipient");
    const oldId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    session.emitSignal(renegotiationOffer(oldId));
    await vi.waitFor(() => expect(oldAdapter.applyRenegotiationOffer).toHaveBeenCalledTimes(1));
    oldCoordinator.dispose();

    const newTransport = new DirectedCallSignalTransport(session, { generation: "g2" });
    const newLifecycle = createLifecycle();
    const newAdapter = createAdapter();
    const newAnswer = deferred<RTCSessionDescriptionInit>();
    mockedMethod(newAdapter.createRenegotiationAnswer).mockReturnValueOnce(newAnswer.promise);
    const newCoordinator = new DirectedCallMediaCoordinator(session, newTransport, newLifecycle, "g2", {
      adapterFactory: (options) => bindAdapter(options, newAdapter),
    });
    startActive(newCoordinator, session, "recipient");
    const newId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    session.emitSignal(renegotiationOffer(newId));
    await vi.waitFor(() => expect(newAdapter.createRenegotiationAnswer).toHaveBeenCalledTimes(1));

    applyOffer.reject(new Error("stale offer application failed"));
    await Promise.resolve();
    await Promise.resolve();
    expect(newAdapter.createRenegotiationAnswer).toHaveBeenCalledTimes(1);
    expect(session.sendSignal).not.toHaveBeenCalled();

    newAnswer.resolve({ type: "answer", sdp: "renegotiation-answer" });
    await vi.waitFor(() => expect(session.sendSignal).toHaveBeenCalledWith(
      callId,
      expect.any(String),
      "renegotiate_answer",
      { renegotiation_id: newId, screen_share: false, sdp: "renegotiation-answer" },
    ));
    expect(session.sendSignal).toHaveBeenCalledTimes(1);
    expect(newLifecycle.mediaReady).not.toHaveBeenCalled();
    expect(newLifecycle.setupFailed).not.toHaveBeenCalled();
    expect(newAdapter.dispose).not.toHaveBeenCalled();
    expect(oldAdapter.createRenegotiationAnswer).not.toHaveBeenCalled();
    newCoordinator.dispose();
  });

  it("ignores stale answer creation completion after disposal and generation rollover", async () => {
    const session = createSession();
    const oldTransport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const oldLifecycle = createLifecycle();
    const oldAdapter = createAdapter();
    const createAnswer = deferred<RTCSessionDescriptionInit>();
    mockedMethod(oldAdapter.createRenegotiationAnswer).mockReturnValueOnce(createAnswer.promise);
    const oldCoordinator = new DirectedCallMediaCoordinator(session, oldTransport, oldLifecycle, "g1", {
      adapterFactory: (options) => bindAdapter(options, oldAdapter),
    });

    startActive(oldCoordinator, session, "recipient");
    const oldId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    session.emitSignal(renegotiationOffer(oldId));
    await vi.waitFor(() => expect(oldAdapter.createRenegotiationAnswer).toHaveBeenCalledTimes(1));
    oldCoordinator.dispose();

    const newTransport = new DirectedCallSignalTransport(session, { generation: "g2" });
    const newLifecycle = createLifecycle();
    const newAdapter = createAdapter();
    const newCoordinator = new DirectedCallMediaCoordinator(session, newTransport, newLifecycle, "g2", {
      adapterFactory: (options) => bindAdapter(options, newAdapter),
    });
    startActive(newCoordinator, session, "recipient");

    createAnswer.resolve({ type: "answer", sdp: "stale-answer" });
    await Promise.resolve();
    await Promise.resolve();
    expect(session.sendSignal).not.toHaveBeenCalled();
    expect(newAdapter.createRenegotiationAnswer).not.toHaveBeenCalled();
    expect(newLifecycle.mediaReady).not.toHaveBeenCalled();
    expect(newLifecycle.setupFailed).not.toHaveBeenCalled();
    expect(newAdapter.dispose).not.toHaveBeenCalled();
    expect(oldAdapter.dispose).toHaveBeenCalledTimes(1);
    newCoordinator.dispose();
  });

  it("ignores stale answer creation failure after disposal and generation rollover", async () => {
    const session = createSession();
    const oldTransport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const oldLifecycle = createLifecycle();
    const oldAdapter = createAdapter();
    const createAnswer = deferred<RTCSessionDescriptionInit>();
    mockedMethod(oldAdapter.createRenegotiationAnswer).mockReturnValueOnce(createAnswer.promise);
    const oldCoordinator = new DirectedCallMediaCoordinator(session, oldTransport, oldLifecycle, "g1", {
      adapterFactory: (options) => bindAdapter(options, oldAdapter),
    });

    startActive(oldCoordinator, session, "recipient");
    const oldId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    session.emitSignal(renegotiationOffer(oldId));
    await vi.waitFor(() => expect(oldAdapter.createRenegotiationAnswer).toHaveBeenCalledTimes(1));
    oldCoordinator.dispose();

    const newTransport = new DirectedCallSignalTransport(session, { generation: "g2" });
    const newLifecycle = createLifecycle();
    const newAdapter = createAdapter();
    const newCoordinator = new DirectedCallMediaCoordinator(session, newTransport, newLifecycle, "g2", {
      adapterFactory: (options) => bindAdapter(options, newAdapter),
    });
    startActive(newCoordinator, session, "recipient");

    createAnswer.reject(new Error("stale answer creation failed"));
    await Promise.resolve();
    await Promise.resolve();
    expect(session.sendSignal).not.toHaveBeenCalled();
    expect(newAdapter.createRenegotiationAnswer).not.toHaveBeenCalled();
    expect(newLifecycle.mediaReady).not.toHaveBeenCalled();
    expect(newLifecycle.setupFailed).not.toHaveBeenCalled();
    expect(newAdapter.dispose).not.toHaveBeenCalled();
    expect(oldAdapter.dispose).toHaveBeenCalledTimes(1);
    newCoordinator.dispose();
  });

  it("ignores a competing request while offer creation is pending", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    const createOffer = deferred<RTCSessionDescriptionInit>();
    mockedMethod(adapter.createRenegotiationOffer).mockReturnValueOnce(createOffer.promise);
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", {
      adapterFactory: (options) => bindAdapter(options, adapter),
    });

    startActive(coordinator, session);
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());
    const idA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const idB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const request = (id: string, signalId: string) => ({
      call_id: callId,
      signal_id: signalId,
      kind: "renegotiate_request" as const,
      payload: { renegotiation_id: id, screen_share: false },
    });
    session.emitSignal(request(idA, "cccccccc-cccc-4ccc-8ccc-cccccccccccc"));
    await vi.waitFor(() => expect(adapter.createRenegotiationOffer).toHaveBeenCalledTimes(1));
    session.emitSignal(request(idB, "dddddddd-dddd-4ddd-8ddd-dddddddddddd"));
    await Promise.resolve();
    expect(adapter.createRenegotiationOffer).toHaveBeenCalledTimes(1);
    expect(session.sendSignal).not.toHaveBeenCalled();

    createOffer.resolve({ type: "offer", sdp: "renegotiation-offer" });
    await vi.waitFor(() => expect(session.sendSignal).toHaveBeenCalledWith(
      callId,
      expect.any(String),
      "renegotiate_offer",
      { renegotiation_id: idA, screen_share: false, sdp: "renegotiation-offer" },
    ));
    expect(session.sendSignal).toHaveBeenCalledTimes(1);
    expect(lifecycle.mediaReady).not.toHaveBeenCalled();
    expect(lifecycle.setupFailed).not.toHaveBeenCalled();
    expect(adapter.dispose).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it("ignores a competing request while waiting for an answer", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", {
      adapterFactory: (options) => bindAdapter(options, adapter),
    });

    startActive(coordinator, session);
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());
    const idA = await coordinator.requestRenegotiation();
    const idB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    session.emitSignal({
      call_id: callId,
      signal_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      kind: "renegotiate_request" as const,
      payload: { renegotiation_id: idB, screen_share: false },
    });
    await Promise.resolve();
    expect(adapter.createRenegotiationOffer).toHaveBeenCalledTimes(1);
    expect(session.sendSignal).toHaveBeenCalledTimes(2);

    session.emitSignal(renegotiationAnswer(idA!));
    await vi.waitFor(() => expect(adapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(1));
    expect(session.sendSignal).toHaveBeenCalledTimes(2);
    expect(lifecycle.mediaReady).not.toHaveBeenCalled();
    expect(lifecycle.setupFailed).not.toHaveBeenCalled();
    expect(adapter.dispose).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it("ignores a competing offer while remote SDP application is pending", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    const applyOffer = deferred<void>();
    mockedMethod(adapter.applyRenegotiationOffer).mockReturnValueOnce(applyOffer.promise);
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", {
      adapterFactory: (options) => bindAdapter(options, adapter),
    });

    startActive(coordinator, session, "recipient");
    const idA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const idB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    session.emitSignal(renegotiationOffer(idA));
    await vi.waitFor(() => expect(adapter.applyRenegotiationOffer).toHaveBeenCalledTimes(1));
    session.emitSignal(renegotiationOffer(idB));
    await Promise.resolve();
    expect(adapter.applyRenegotiationOffer).toHaveBeenCalledTimes(1);
    expect(adapter.createRenegotiationAnswer).not.toHaveBeenCalled();

    applyOffer.resolve();
    await vi.waitFor(() => expect(session.sendSignal).toHaveBeenCalledWith(
      callId,
      expect.any(String),
      "renegotiate_answer",
      { renegotiation_id: idA, screen_share: false, sdp: "renegotiation-answer" },
    ));
    expect(session.sendSignal).toHaveBeenCalledTimes(1);
    expect(lifecycle.mediaReady).not.toHaveBeenCalled();
    expect(lifecycle.setupFailed).not.toHaveBeenCalled();
    expect(adapter.dispose).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it("ignores a competing offer while answer creation is pending", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    const createAnswer = deferred<RTCSessionDescriptionInit>();
    mockedMethod(adapter.createRenegotiationAnswer).mockReturnValueOnce(createAnswer.promise);
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", {
      adapterFactory: (options) => bindAdapter(options, adapter),
    });

    startActive(coordinator, session, "recipient");
    const idA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const idB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    session.emitSignal(renegotiationOffer(idA));
    await vi.waitFor(() => expect(adapter.createRenegotiationAnswer).toHaveBeenCalledTimes(1));
    session.emitSignal(renegotiationOffer(idB));
    await Promise.resolve();
    expect(adapter.applyRenegotiationOffer).toHaveBeenCalledTimes(1);
    expect(adapter.createRenegotiationAnswer).toHaveBeenCalledTimes(1);
    expect(session.sendSignal).not.toHaveBeenCalled();

    createAnswer.resolve({ type: "answer", sdp: "renegotiation-answer" });
    await vi.waitFor(() => expect(session.sendSignal).toHaveBeenCalledWith(
      callId,
      expect.any(String),
      "renegotiate_answer",
      { renegotiation_id: idA, screen_share: false, sdp: "renegotiation-answer" },
    ));
    expect(session.sendSignal).toHaveBeenCalledTimes(1);
    expect(lifecycle.mediaReady).not.toHaveBeenCalled();
    expect(lifecycle.setupFailed).not.toHaveBeenCalled();
    expect(adapter.dispose).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it("ignores a competing answer while answer application is pending", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    const applyAnswer = deferred<void>();
    mockedMethod(adapter.applyRenegotiationAnswer).mockReturnValueOnce(applyAnswer.promise);
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", {
      adapterFactory: (options) => bindAdapter(options, adapter),
    });

    startActive(coordinator, session);
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());
    const idA = await coordinator.requestRenegotiation();
    const idB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    session.emitSignal(renegotiationAnswer(idA!));
    await vi.waitFor(() => expect(adapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(1));
    session.emitSignal(renegotiationAnswer(idB));
    await Promise.resolve();
    expect(adapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(1);

    applyAnswer.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(adapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(1);
    expect(session.sendSignal).toHaveBeenCalledTimes(2);
    expect(lifecycle.mediaReady).not.toHaveBeenCalled();
    expect(lifecycle.setupFailed).not.toHaveBeenCalled();
    expect(adapter.dispose).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it("ignores a wrong-ID answer before answer application begins", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", {
      adapterFactory: (options) => bindAdapter(options, adapter),
    });

    startActive(coordinator, session);
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());
    const idA = await coordinator.requestRenegotiation();
    const idB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    session.emitSignal(renegotiationAnswer(idB));
    await Promise.resolve();
    expect(adapter.applyRenegotiationAnswer).not.toHaveBeenCalled();
    session.emitSignal(renegotiationAnswer(idA!));
    await vi.waitFor(() => expect(adapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(1));
    expect(session.sendSignal).toHaveBeenCalledTimes(2);
    expect(lifecycle.mediaReady).not.toHaveBeenCalled();
    expect(lifecycle.setupFailed).not.toHaveBeenCalled();
    expect(adapter.dispose).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it("ignores a replayed completed request", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", {
      adapterFactory: (options) => bindAdapter(options, adapter),
    });

    startActive(coordinator, session);
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const request = renegotiationRequest(id);
    session.emitSignal(request);
    await vi.waitFor(() => expect(adapter.createRenegotiationOffer).toHaveBeenCalledTimes(1));
    session.emitSignal(renegotiationAnswer(id));
    await vi.waitFor(() => expect(adapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(1));
    session.emitSignal(request);
    await Promise.resolve();
    expect(adapter.createRenegotiationOffer).toHaveBeenCalledTimes(1);
    expect(session.sendSignal).toHaveBeenCalledTimes(1);
    expect(lifecycle.mediaReady).not.toHaveBeenCalled();
    expect(lifecycle.setupFailed).not.toHaveBeenCalled();
    expect(adapter.dispose).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it("ignores a replayed completed offer", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", {
      adapterFactory: (options) => bindAdapter(options, adapter),
    });

    startActive(coordinator, session, "recipient");
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const offer = renegotiationOffer(id);
    session.emitSignal(offer);
    await vi.waitFor(() => expect(session.sendSignal).toHaveBeenCalledTimes(1));
    session.emitSignal(offer);
    await Promise.resolve();
    expect(adapter.applyRenegotiationOffer).toHaveBeenCalledTimes(1);
    expect(adapter.createRenegotiationAnswer).toHaveBeenCalledTimes(1);
    expect(session.sendSignal).toHaveBeenCalledTimes(1);
    expect(lifecycle.mediaReady).not.toHaveBeenCalled();
    expect(lifecycle.setupFailed).not.toHaveBeenCalled();
    expect(adapter.dispose).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it("ignores a replayed completed answer", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", {
      adapterFactory: (options) => bindAdapter(options, adapter),
    });

    startActive(coordinator, session);
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());
    const id = await coordinator.requestRenegotiation();
    const answer = renegotiationAnswer(id!);
    session.emitSignal(answer);
    await vi.waitFor(() => expect(adapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(1));
    session.emitSignal(answer);
    await Promise.resolve();
    expect(adapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(1);
    expect(session.sendSignal).toHaveBeenCalledTimes(2);
    expect(lifecycle.mediaReady).not.toHaveBeenCalled();
    expect(lifecycle.setupFailed).not.toHaveBeenCalled();
    expect(adapter.dispose).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it("retains exactly 32 completed IDs and evicts them FIFO", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", {
      adapterFactory: (options) => bindAdapter(options, adapter),
    });

    startActive(coordinator, session);
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());
    const ids = Array.from({ length: 35 }, (_, index) =>
      `${index.toString(16).padStart(8, "0")}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
    );
    let offerCount = 0;
    let answerCount = 0;
    const completeIncomingTransaction = async (id: string) => {
      session.emitSignal(renegotiationRequest(id));
      offerCount += 1;
      await vi.waitFor(() => expect(adapter.createRenegotiationOffer).toHaveBeenCalledTimes(offerCount));
      session.emitSignal(renegotiationAnswer(id));
      answerCount += 1;
      await vi.waitFor(() => expect(adapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(answerCount));
    };

    for (const id of ids.slice(0, 32)) await completeIncomingTransaction(id);
    const completedOfferCount = 32;
    session.emitSignal(renegotiationRequest(ids[0]));
    session.emitSignal(renegotiationRequest(ids[16]));
    session.emitSignal(renegotiationRequest(ids[31]));
    await Promise.resolve();
    expect(adapter.createRenegotiationOffer).toHaveBeenCalledTimes(32);
    expect(session.sendSignal).toHaveBeenCalledTimes(completedOfferCount);

    await completeIncomingTransaction(ids[32]);
    expect(adapter.createRenegotiationOffer).toHaveBeenCalledTimes(33);
    expect(adapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(33);
    session.emitSignal(renegotiationRequest(ids[1]));
    session.emitSignal(renegotiationRequest(ids[32]));
    await Promise.resolve();
    expect(adapter.createRenegotiationOffer).toHaveBeenCalledTimes(33);
    expect(session.sendSignal).toHaveBeenCalledTimes(completedOfferCount + 1);

    await completeIncomingTransaction(ids[0]);
    expect(adapter.createRenegotiationOffer).toHaveBeenCalledTimes(34);
    expect(adapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(34);

    await completeIncomingTransaction(ids[33]);
    await completeIncomingTransaction(ids[34]);
    session.emitSignal(renegotiationRequest(ids[4]));
    await Promise.resolve();
    expect(adapter.createRenegotiationOffer).toHaveBeenCalledTimes(36);
    session.emitSignal(renegotiationRequest(ids[1]));
    await vi.waitFor(() => expect(adapter.createRenegotiationOffer).toHaveBeenCalledTimes(37));
    expect(adapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(36);
    expect(lifecycle.mediaReady).not.toHaveBeenCalled();
    expect(lifecycle.setupFailed).not.toHaveBeenCalled();
    expect(adapter.dispose).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it("accepts matching tagged ICE on an offerer-side transaction without lifecycle effects", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", { adapterFactory: (options) => bindAdapter(options, adapter) });

    startActive(coordinator, session);
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());
    const id = await coordinator.requestRenegotiation();
    const candidate = iceCandidate(id!, "candidate:offerer");
    session.emitSignal(candidate);
    session.emitSignal(candidate);
    await vi.waitFor(() => expect(adapter.addRemoteIceCandidate).toHaveBeenCalledTimes(2));

    expect(adapter.addRemoteIceCandidate).toHaveBeenCalledWith({
      candidate: "candidate:offerer",
      sdpMid: "0",
      sdpMLineIndex: 0,
      usernameFragment: "ufrag-one",
    });
    expect(adapter.addRemoteIceCandidate).toHaveBeenNthCalledWith(2, {
      candidate: "candidate:offerer",
      sdpMid: "0",
      sdpMLineIndex: 0,
      usernameFragment: "ufrag-one",
    });
    expect(session.sendSignal).toHaveBeenCalledTimes(2);
    expect(lifecycle.mediaReady).not.toHaveBeenCalled();
    expect(lifecycle.setupFailed).not.toHaveBeenCalled();
    expect(adapter.dispose).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it("accepts matching tagged ICE on an answerer-side transaction without changing its phase", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    const createAnswer = deferred<RTCSessionDescriptionInit>();
    mockedMethod(adapter.createRenegotiationAnswer).mockReturnValueOnce(createAnswer.promise);
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", { adapterFactory: (options) => bindAdapter(options, adapter) });

    startActive(coordinator, session, "recipient");
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    session.emitSignal(renegotiationOffer(id));
    await vi.waitFor(() => expect(adapter.createRenegotiationAnswer).toHaveBeenCalledTimes(1));
    session.emitSignal(iceCandidate(id, "candidate:answerer"));
    await vi.waitFor(() => expect(adapter.addRemoteIceCandidate).toHaveBeenCalledTimes(1));
    expect(adapter.addRemoteIceCandidate).toHaveBeenCalledWith(expect.objectContaining({ candidate: "candidate:answerer" }));
    expect(session.sendSignal).not.toHaveBeenCalled();

    createAnswer.resolve({ type: "answer", sdp: "renegotiation-answer" });
    await vi.waitFor(() => expect(session.sendSignal).toHaveBeenCalledTimes(1));
    expect(lifecycle.mediaReady).not.toHaveBeenCalled();
    expect(lifecycle.setupFailed).not.toHaveBeenCalled();
    expect(adapter.dispose).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it("ignores competing and completed tagged ICE while preserving the active transaction", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", { adapterFactory: (options) => bindAdapter(options, adapter) });

    startActive(coordinator, session);
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());
    const idA = await coordinator.requestRenegotiation();
    const idB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    session.emitSignal(iceCandidate(idB, "candidate:competing"));
    session.emitSignal(iceCandidate(idA!, "candidate:matching"));
    await vi.waitFor(() => expect(adapter.addRemoteIceCandidate).toHaveBeenCalledTimes(1));
    expect(adapter.addRemoteIceCandidate).toHaveBeenCalledWith(expect.objectContaining({ candidate: "candidate:matching" }));

    session.emitSignal(renegotiationAnswer(idA!));
    await vi.waitFor(() => expect(adapter.applyRenegotiationAnswer).toHaveBeenCalledTimes(1));
    session.emitSignal(iceCandidate(idA!, "candidate:completed"));
    await Promise.resolve();
    expect(adapter.addRemoteIceCandidate).toHaveBeenCalledTimes(1);
    expect(session.sendSignal).toHaveBeenCalledTimes(2);
    expect(lifecycle.mediaReady).not.toHaveBeenCalled();
    expect(lifecycle.setupFailed).not.toHaveBeenCalled();
    expect(adapter.dispose).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it("ignores tagged ICE when no renegotiation is active and preserves untagged ICE compatibility", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", { adapterFactory: (options) => bindAdapter(options, adapter) });

    startActive(coordinator, session);
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());
    session.emitSignal(iceCandidate("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "candidate:tagged-without-transaction"));
    session.emitSignal(iceCandidate(undefined, "candidate:untagged-active"));
    await vi.waitFor(() => expect(adapter.addRemoteIceCandidate).toHaveBeenCalledTimes(1));
    expect(adapter.addRemoteIceCandidate).toHaveBeenCalledWith(expect.objectContaining({ candidate: "candidate:untagged-active" }));

    const id = await coordinator.requestRenegotiation();
    session.emitSignal(iceCandidate(undefined, "candidate:untagged-renegotiation"));
    session.emitSignal(iceCandidate(id!, "candidate:tagged-renegotiation"));
    await vi.waitFor(() => expect(adapter.addRemoteIceCandidate).toHaveBeenCalledTimes(3));
    expect(adapter.addRemoteIceCandidate).toHaveBeenCalledWith(expect.objectContaining({ candidate: "candidate:untagged-renegotiation" }));
    expect(adapter.addRemoteIceCandidate).toHaveBeenCalledWith(expect.objectContaining({ candidate: "candidate:tagged-renegotiation" }));
    expect(lifecycle.mediaReady).not.toHaveBeenCalled();
    expect(lifecycle.setupFailed).not.toHaveBeenCalled();
    expect(adapter.dispose).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it("accepts untagged ICE during initial connecting establishment", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", { adapterFactory: (options) => bindAdapter(options, adapter) });

    coordinator.start();
    session.emit(projection("accepted"));
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());
    session.emit(projection("connecting"));
    session.emitSignal(iceCandidate(undefined, "candidate:initial-connecting"));
    await vi.waitFor(() => expect(adapter.addRemoteIceCandidate).toHaveBeenCalledTimes(1));
    expect(adapter.addRemoteIceCandidate).toHaveBeenCalledWith(expect.objectContaining({ candidate: "candidate:initial-connecting" }));
    expect(lifecycle.mediaReady).not.toHaveBeenCalled();
    expect(lifecycle.setupFailed).not.toHaveBeenCalled();
    expect(adapter.dispose).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it("ignores tagged ICE delivered through an old generation callback", async () => {
    const session = createSession();
    const oldTransport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const oldLifecycle = createLifecycle();
    const oldAdapter = createAdapter();
    const oldCoordinator = new DirectedCallMediaCoordinator(session, oldTransport, oldLifecycle, "g1", { adapterFactory: (options) => bindAdapter(options, oldAdapter) });
    const oldSignalCallback = (session.subscribeToSignals as ReturnType<typeof vi.fn>).mock.calls[0][0] as (signal: any) => void;

    startActive(oldCoordinator, session);
    await vi.waitFor(() => expect(oldAdapter.prepareOffer).toHaveBeenCalled());
    const oldId = await oldCoordinator.requestRenegotiation();
    oldCoordinator.dispose();

    const newTransport = new DirectedCallSignalTransport(session, { generation: "g2" });
    const newLifecycle = createLifecycle();
    const newAdapter = createAdapter();
    const newCoordinator = new DirectedCallMediaCoordinator(session, newTransport, newLifecycle, "g2", { adapterFactory: (options) => bindAdapter(options, newAdapter) });
    startActive(newCoordinator, session);
    await vi.waitFor(() => expect(newAdapter.prepareOffer).toHaveBeenCalled());
    oldSignalCallback(iceCandidate(oldId!, "candidate:old-generation"));
    await Promise.resolve();

    expect(oldAdapter.addRemoteIceCandidate).not.toHaveBeenCalled();
    expect(newAdapter.addRemoteIceCandidate).not.toHaveBeenCalled();
    expect(newLifecycle.mediaReady).not.toHaveBeenCalled();
    expect(newLifecycle.setupFailed).not.toHaveBeenCalled();
    expect(newAdapter.dispose).not.toHaveBeenCalled();
    expect(oldAdapter.dispose).toHaveBeenCalledTimes(1);
    newCoordinator.dispose();
  });

  it("executes an offerer ICE restart, tags candidates, and preserves active projection", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", { adapterFactory: (options) => bindAdapter(options, adapter) });

    startActive(coordinator, session);
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());
    const restartId = await coordinator.requestIceRestart();

    expect(restartId).toEqual(expect.any(String));
    expect(adapter.createIceRestartOffer).toHaveBeenCalledTimes(1);
    expect(session.sendIceRestartOffer).toHaveBeenCalledWith(expect.objectContaining({ ice_restart_id: restartId }));

    adapter.emitLocalIceCandidate({ candidate: "candidate:restart", sdpMid: "0", sdpMLineIndex: 0 });
    await vi.waitFor(() => expect(session.sendSignal).toHaveBeenCalledWith(
      callId,
      expect.any(String),
      "ice_candidate",
      expect.objectContaining({ ice_restart_id: restartId }),
    ));

    session.emitSignal({ ...iceRestartCandidate(restartId!, "candidate:remote"), payload: { ...iceRestartCandidate(restartId!, "candidate:remote").payload } });
    expect(adapter.addRemoteIceCandidate).not.toHaveBeenCalled();
    session.emitIceRestart({ kind: "answer", protocol_version: 1, call_id: callId, signal_id: restartId, ice_restart_id: restartId, sdp: "restart-answer" });
    await vi.waitFor(() => expect(adapter.applyIceRestartAnswer).toHaveBeenCalledWith({ type: "answer", sdp: "restart-answer" }, restartId));
    await vi.waitFor(() => expect(adapter.addRemoteIceCandidate).toHaveBeenCalledWith(expect.objectContaining({ candidate: "candidate:remote" }), restartId));
    expect(coordinator.getSnapshot().projection?.state).toBe("active");
    expect(lifecycle.setupFailed).not.toHaveBeenCalled();
    coordinator.dispose();
  });

  it("routes answerer requests to the offerer and answers matching restart offers", async () => {
    const initiatorSession = createSession();
    const initiatorTransport = new DirectedCallSignalTransport(initiatorSession, { generation: "g1" });
    const initiatorAdapter = createAdapter();
    const initiator = new DirectedCallMediaCoordinator(initiatorSession, initiatorTransport, createLifecycle(), "g1", { adapterFactory: (options) => bindAdapter(options, initiatorAdapter) });
    startActive(initiator, initiatorSession, "initiator");
    await vi.waitFor(() => expect(initiatorAdapter.prepareOffer).toHaveBeenCalled());
    initiatorSession.emitIceRestart({ kind: "request", protocol_version: 1, call_id: callId, signal_id: "99999999-9999-4999-8999-999999999999" });
    await vi.waitFor(() => expect(initiatorAdapter.createIceRestartOffer).toHaveBeenCalledTimes(1));

    const answererSession = createSession();
    const answererTransport = new DirectedCallSignalTransport(answererSession, { generation: "g1" });
    const answererAdapter = createAdapter();
    const answerer = new DirectedCallMediaCoordinator(answererSession, answererTransport, createLifecycle(), "g1", { adapterFactory: (options) => bindAdapter(options, answererAdapter) });
    startActive(answerer, answererSession, "recipient");
    await vi.waitFor(() => expect(answererAdapter.prepareAnswer).toHaveBeenCalled());
    const restartId = "77777777-7777-4777-8777-777777777777";
    const requestId = await answerer.requestIceRestart();
    expect(requestId).toEqual(expect.any(String));
    expect(answererSession.sendIceRestartRequest).toHaveBeenCalledTimes(1);

    answererSession.emitIceRestart({ kind: "offer", protocol_version: 1, call_id: callId, signal_id: requestId!, ice_restart_id: restartId, sdp: "restart-offer" });
    answererSession.emitSignal(iceRestartCandidate(restartId, "candidate:queued"));
    await vi.waitFor(() => expect(answererAdapter.createIceRestartAnswer).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(answererAdapter.addRemoteIceCandidate).toHaveBeenCalledWith(expect.objectContaining({ candidate: "candidate:queued" }), restartId));
    expect(answererSession.sendIceRestartAnswer).toHaveBeenCalledWith(expect.objectContaining({ ice_restart_id: restartId }));

    initiator.dispose();
    answerer.dispose();
  });

  it("single-flights restart requests, serializes with screen share, and reports no setup failure", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", { adapterFactory: (options) => bindAdapter(options, adapter) });
    startActive(coordinator, session);
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());

    const first = coordinator.requestIceRestart();
    const second = coordinator.requestIceRestart();
    await expect(second).resolves.toBeNull();
    await first;
    expect(adapter.createIceRestartOffer).toHaveBeenCalledTimes(1);

    coordinator.dispose();
    const failingAdapter = createAdapter();
    mockedMethod(failingAdapter.createIceRestartOffer).mockRejectedValueOnce(new DirectedCallWebRtcError("sdp_failed"));
    const failingSession = createSession();
    const failingTransport = new DirectedCallSignalTransport(failingSession, { generation: "g1" });
    const failingLifecycle = createLifecycle();
    const failingCoordinator = new DirectedCallMediaCoordinator(failingSession, failingTransport, failingLifecycle, "g1", { adapterFactory: (options) => bindAdapter(options, failingAdapter) });
    startActive(failingCoordinator, failingSession);
    await vi.waitFor(() => expect(failingAdapter.prepareOffer).toHaveBeenCalled());
    await expect(failingCoordinator.requestIceRestart()).resolves.toBeNull();
    expect(failingLifecycle.setupFailed).not.toHaveBeenCalled();
    expect(failingCoordinator.getSnapshot().projection?.state).toBe("active");
    failingCoordinator.dispose();
  });

  it("supersedes an incomplete answerer transaction and invalidates disposed restart work", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const lifecycle = createLifecycle();
    const adapter = createAdapter();
    let resolveFirstOffer!: () => void;
    mockedMethod(adapter.applyIceRestartOffer).mockImplementationOnce(() => new Promise<void>((resolve) => { resolveFirstOffer = resolve; }));
    const coordinator = new DirectedCallMediaCoordinator(session, transport, lifecycle, "g1", { adapterFactory: (options) => bindAdapter(options, adapter) });
    startActive(coordinator, session, "recipient");
    await vi.waitFor(() => expect(adapter.prepareAnswer).toHaveBeenCalled());

    const firstId = "77777777-7777-4777-8777-777777777777";
    const secondId = "88888888-8888-4888-8888-888888888888";
    session.emitIceRestart({ kind: "offer", protocol_version: 1, call_id: callId, signal_id: firstId, ice_restart_id: firstId, sdp: "first-offer" });
    await vi.waitFor(() => expect(adapter.applyIceRestartOffer).toHaveBeenCalledTimes(1));
    session.emitIceRestart({ kind: "offer", protocol_version: 1, call_id: callId, signal_id: secondId, ice_restart_id: secondId, sdp: "second-offer" });
    await vi.waitFor(() => expect(adapter.applyIceRestartOffer).toHaveBeenCalledTimes(2));
    resolveFirstOffer();
    await vi.waitFor(() => expect(adapter.createIceRestartAnswer).toHaveBeenCalledTimes(1));
    expect(adapter.createIceRestartAnswer).not.toHaveBeenCalledWith(firstId);
    expect(session.sendIceRestartAnswer).toHaveBeenCalledWith(expect.objectContaining({ ice_restart_id: secondId }));
    coordinator.dispose();

    const pendingSession = createSession();
    const pendingTransport = new DirectedCallSignalTransport(pendingSession, { generation: "g1" });
    const pendingAdapter = createAdapter();
    let resolvePendingOffer!: (offer: RTCSessionDescriptionInit) => void;
    mockedMethod(pendingAdapter.createIceRestartOffer).mockImplementationOnce(() => new Promise((resolve) => { resolvePendingOffer = resolve; }));
    const pendingCoordinator = new DirectedCallMediaCoordinator(pendingSession, pendingTransport, createLifecycle(), "g1", { adapterFactory: (options) => bindAdapter(options, pendingAdapter) });
    startActive(pendingCoordinator, pendingSession);
    await vi.waitFor(() => expect(pendingAdapter.prepareOffer).toHaveBeenCalled());
    const operation = pendingCoordinator.requestIceRestart();
    await vi.waitFor(() => expect(pendingAdapter.createIceRestartOffer).toHaveBeenCalled());
    pendingCoordinator.dispose();
    resolvePendingOffer({ type: "offer", sdp: "stale-offer" });
    await expect(operation).resolves.toBeNull();
    expect(pendingSession.sendIceRestartOffer).not.toHaveBeenCalled();
  });

  it("does not overlap an explicit restart with screen-share renegotiation", async () => {
    const session = createSession();
    const transport = new DirectedCallSignalTransport(session, { generation: "g1" });
    const adapter = createAdapter();
    const coordinator = new DirectedCallMediaCoordinator(session, transport, createLifecycle(), "g1", { adapterFactory: (options) => bindAdapter(options, adapter) });
    startActive(coordinator, session);
    await vi.waitFor(() => expect(adapter.prepareOffer).toHaveBeenCalled());

    const screenOperation = coordinator.requestRenegotiation(true);
    await vi.waitFor(() => expect(adapter.createRenegotiationOffer).toHaveBeenCalled());
    await expect(coordinator.requestIceRestart()).resolves.toBeNull();
    expect(adapter.createIceRestartOffer).not.toHaveBeenCalled();
    await screenOperation;
    coordinator.dispose();
  });
});
