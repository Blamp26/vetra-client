import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DirectedCallWebRtcAdapter,
  DirectedCallWebRtcError,
  DirectedCallWebRtcStaleError,
  type DirectedCallMediaStream,
  type DirectedCallInitialMediaReadiness,
  type DirectedCallWebRtcAdapterOptions,
  type DirectedCallWebRtcDiagnosticDetails,
} from "./directedCallWebRtcAdapter";
import { getDirectedCallDiagnosticTimeline, resetDirectedCallDiagnosticTimeline } from "./directedCallDiagnostics";
import { setCallDebugEnabled } from "../utils/callDebug";
import type { RtcConfigurationSource } from "./iceServerConfig";

function createHarness(options: Pick<DirectedCallWebRtcAdapterOptions, "onDiagnostic"> = {}) {
  const trackListeners = new Map<string, Set<EventListener>>();
  const track = {
    kind: "audio",
    readyState: "live",
    enabled: true,
    stop: vi.fn(),
    addEventListener(type: string, listener: EventListener) {
      const listeners = trackListeners.get(type) ?? new Set<EventListener>();
      listeners.add(listener);
      trackListeners.set(type, listeners);
    },
    removeEventListener(type: string, listener: EventListener) {
      trackListeners.get(type)?.delete(listener);
    },
    emit(type: string) {
      trackListeners.get(type)?.forEach((listener) => listener(new Event(type)));
    },
  };
  const stream = { getTracks: () => [track] };
  const sender = {
    track,
    replaceTrack: vi.fn().mockResolvedValue(undefined),
  };
  const screenTrackListeners = new Map<string, Set<EventListener>>();
  const screenTrack = {
    kind: "video",
    readyState: "live",
    stop: vi.fn(),
    addEventListener(type: string, listener: EventListener) {
      const listeners = screenTrackListeners.get(type) ?? new Set<EventListener>();
      listeners.add(listener);
      screenTrackListeners.set(type, listeners);
    },
    removeEventListener(type: string, listener: EventListener) {
      screenTrackListeners.get(type)?.delete(listener);
    },
    emit(type: string) {
      screenTrackListeners.get(type)?.forEach((listener) => listener(new Event(type)));
    },
  };
  const screenSender = {
    track: null as typeof screenTrack | null,
    replaceTrack: vi.fn(async (nextTrack: typeof screenTrack | null) => { screenSender.track = nextTrack; }),
  };
  const screenTransceiver = {
    kind: "video" as const,
    direction: "inactive" as RTCRtpTransceiverDirection,
    currentDirection: null as RTCRtpTransceiverDirection | null,
    mid: "1" as string | null,
    sender: screenSender,
    receiver: { track: null },
    stop: vi.fn(),
  };
  const audioTransceiver = {
    kind: "audio" as const,
    direction: "sendrecv" as RTCRtpTransceiverDirection,
  };
  const transceivers: Array<{ kind?: "audio" | "video"; direction: RTCRtpTransceiverDirection; mid?: string | null; sender?: unknown; receiver?: unknown }> = [audioTransceiver];
  const pc = {
    localDescription: null as RTCSessionDescription | null,
    remoteDescription: null as RTCSessionDescription | null,
    connectionState: "new" as RTCPeerConnectionState,
    iceConnectionState: "new" as RTCIceConnectionState,
    iceGatheringState: "new" as RTCIceGatheringState,
    onicecandidate: null as ((event: RTCPeerConnectionIceEvent) => void) | null,
    ontrack: null as ((event: RTCTrackEvent) => void) | null,
    onconnectionstatechange: null as (() => void) | null,
    oniceconnectionstatechange: null as (() => void) | null,
    onicegatheringstatechange: null as (() => void) | null,
    onsignalingstatechange: null as (() => void) | null,
    addTrack: vi.fn((nextTrack: { kind?: string }) => {
      if (nextTrack.kind === "audio" && !transceivers.includes(audioTransceiver)) transceivers.push(audioTransceiver);
    }),
    addTransceiver: vi.fn(() => {
      transceivers.push(screenTransceiver);
      return screenTransceiver;
    }),
    getTransceivers: vi.fn(() => transceivers as unknown as Array<typeof screenTransceiver>),
    getSenders: vi.fn(() => [sender]),
    createOffer: vi.fn(async (): Promise<RTCSessionDescriptionInit> => {
      const video = transceivers.find((transceiver) => transceiver.kind === "video");
      const sdp = video
        ? `offer|audio:${audioTransceiver.direction}|video:${video.direction}`
        : "offer";
      return { type: "offer", sdp };
    }),
    createAnswer: vi.fn().mockResolvedValue({ type: "answer", sdp: "answer" }),
    setLocalDescription: vi.fn(async (description: RTCSessionDescriptionInit) => {
      pc.localDescription = description as RTCSessionDescription;
    }),
    setRemoteDescription: vi.fn(async (description: RTCSessionDescriptionInit) => {
      pc.remoteDescription = description as RTCSessionDescription;
    }),
    addIceCandidate: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
  };
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  const getDisplayMedia = vi.fn();
  const createPeerConnection = vi.fn(() => pc);
  const createRemoteStream = vi.fn(() => {
    const tracks: any[] = [];
    return {
      getTracks: () => tracks,
      addTrack: (nextTrack: any) => tracks.push(nextTrack),
      removeTrack: (trackToRemove: any) => {
        const index = tracks.indexOf(trackToRemove);
        if (index >= 0) tracks.splice(index, 1);
      },
    };
  });
  const adapter = new DirectedCallWebRtcAdapter({ dependencies: { getUserMedia, getDisplayMedia, createPeerConnection, createRemoteStream }, ...options });
  return { adapter, pc, sender, track, stream, screenTrack, screenSender, screenTransceiver, transceivers, getUserMedia, getDisplayMedia, createPeerConnection, createRemoteStream };
}

function displayStream(...tracks: any[]) {
  return { getTracks: () => tracks };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function rejectingScreenDetach(harness: ReturnType<typeof createHarness>) {
  let rejectDetach!: (reason?: unknown) => void;
  const detach = new Promise<void>((_, reject) => { rejectDetach = reject; });
  const catchObserver = vi.spyOn(detach, "catch");
  harness.screenSender.replaceTrack.mockImplementation((nextTrack) => {
    if (nextTrack) {
      harness.screenSender.track = nextTrack;
      return Promise.resolve();
    }
    return detach;
  });
  return { rejectDetach, catchObserver };
}

function createRemoteTrack(kind: "audio" | "video" = "audio") {
  const listeners = new Map<string, Set<EventListener>>();
  return {
    kind,
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
}

function createRemoteStream(track: ReturnType<typeof createRemoteTrack>) {
  const tracks = [track];
  return {
    getTracks: () => tracks,
    addTrack: (nextTrack: typeof track) => tracks.push(nextTrack),
    removeTrack: (trackToRemove: typeof track) => {
      const index = tracks.indexOf(trackToRemove);
      if (index >= 0) tracks.splice(index, 1);
    },
  };
}

function readinessHarness() {
  const readiness: DirectedCallInitialMediaReadiness[] = [];
  const onRemoteStream = vi.fn();
  const harness = createHarness();
  const adapter = new DirectedCallWebRtcAdapter({
    dependencies: {
      getUserMedia: harness.getUserMedia,
      createPeerConnection: harness.createPeerConnection,
      createRemoteStream: () => {
        const tracks: any[] = [];
        return { getTracks: () => tracks, addTrack: (track: any) => tracks.push(track) };
      },
    },
    onRemoteStream,
    onInitialMediaReadinessChange: (snapshot) => readiness.push(snapshot),
  } satisfies DirectedCallWebRtcAdapterOptions);
  return { ...harness, adapter, readiness, onRemoteStream };
}

describe("DirectedCallWebRtcAdapter", () => {
  beforeEach(() => setCallDebugEnabled(true));

  it("retains a live local screen capture and restores its sender after rebuild", async () => {
    const harness = createHarness();
    harness.getDisplayMedia.mockResolvedValue(displayStream(harness.screenTrack));
    const adapter = harness.adapter;

    await adapter.startScreenShare();
    expect(harness.getDisplayMedia).toHaveBeenCalledTimes(1);
    await adapter.rebuildPeerConnection();

    expect(harness.getDisplayMedia).toHaveBeenCalledTimes(1);
    expect(adapter.getLocalScreenShareStream()).toBeTruthy();
    expect(harness.screenSender.replaceTrack).toHaveBeenCalledWith(harness.screenTrack);
    expect(harness.screenSender.track).toBe(harness.screenTrack);
    expect(harness.screenTransceiver.direction).toBe("sendonly");
    expect(harness.createPeerConnection).toHaveBeenCalledTimes(2);
  });
  afterEach(() => {
    resetDirectedCallDiagnosticTimeline();
    setCallDebugEnabled(false);
  });

  it("starts with a fully false initial media readiness snapshot", () => {
    const harness = readinessHarness();

    expect(harness.adapter.initialMediaReadinessSnapshot).toEqual({
      transportConnected: false,
      localAudioSenderReady: false,
      remoteAudioTrackReady: false,
      remoteAudioStreamBound: false,
      ready: false,
    });
  });

  it("requires the full readiness conjunction", async () => {
    const harness = readinessHarness();
    await harness.adapter.prepareOffer();

    expect(harness.adapter.initialMediaReadinessSnapshot).toMatchObject({
      transportConnected: false,
      localAudioSenderReady: true,
      remoteAudioTrackReady: false,
      remoteAudioStreamBound: false,
      ready: false,
    });

    harness.pc.connectionState = "connected";
    harness.pc.onconnectionstatechange?.();
    expect(harness.adapter.initialMediaReadinessSnapshot.ready).toBe(false);

    const remoteTrack = createRemoteTrack();
    const remoteStream = createRemoteStream(remoteTrack);
    harness.pc.ontrack?.({ track: remoteTrack, streams: [remoteStream] } as unknown as RTCTrackEvent);
    expect(harness.adapter.initialMediaReadinessSnapshot).toMatchObject({
      transportConnected: true,
      localAudioSenderReady: true,
      remoteAudioTrackReady: true,
      remoteAudioStreamBound: true,
      ready: true,
    });
    expect(Object.isFrozen(harness.readiness[harness.readiness.length - 1])).toBe(true);
    expect(harness.readiness.filter((snapshot) => snapshot.ready)).toHaveLength(1);
  });

  it("delivers onRemoteStream before readiness becomes true", async () => {
    const harness = readinessHarness();
    const ordering: string[] = [];
    harness.onRemoteStream.mockImplementation(() => ordering.push("remote-stream"));
    harness.adapter = new DirectedCallWebRtcAdapter({
      dependencies: { getUserMedia: harness.getUserMedia, createPeerConnection: harness.createPeerConnection },
      onRemoteStream: harness.onRemoteStream,
      onInitialMediaReadinessChange: (snapshot) => {
        if (snapshot.ready) ordering.push("ready");
      },
    });
    await harness.adapter.prepareOffer();
    harness.pc.connectionState = "connected";
    harness.pc.onconnectionstatechange?.();
    const remoteTrack = createRemoteTrack();
    harness.pc.ontrack?.({ track: remoteTrack, streams: [createRemoteStream(remoteTrack)] } as unknown as RTCTrackEvent);

    expect(ordering).toEqual(["remote-stream", "ready"]);
  });

  it("keeps muted local audio ready and reacts to ended local and remote tracks", async () => {
    const harness = readinessHarness();
    await harness.adapter.prepareOffer();
    expect(harness.adapter.setLocalAudioMuted(true)).toBe(true);
    harness.pc.connectionState = "connected";
    harness.pc.onconnectionstatechange?.();
    const remoteTrack = createRemoteTrack();
    harness.pc.ontrack?.({ track: remoteTrack, streams: [createRemoteStream(remoteTrack)] } as unknown as RTCTrackEvent);
    expect(harness.adapter.initialMediaReadinessSnapshot.ready).toBe(true);

    harness.track.readyState = "ended";
    harness.track.emit("ended");
    expect(harness.adapter.initialMediaReadinessSnapshot.localAudioSenderReady).toBe(false);
    expect(harness.adapter.initialMediaReadinessSnapshot.ready).toBe(false);

    harness.track.readyState = "live";
    harness.sender.track = harness.track;
    harness.track.emit("ended");
    remoteTrack.readyState = "ended";
    remoteTrack.emit("ended");
    expect(harness.adapter.initialMediaReadinessSnapshot.remoteAudioTrackReady).toBe(false);
    expect(harness.adapter.initialMediaReadinessSnapshot.ready).toBe(false);
  });

  it("does not treat video-only tracks or ICE gathering as audio readiness", async () => {
    const harness = readinessHarness();
    await harness.adapter.prepareOffer();
    harness.pc.iceGatheringState = "complete";
    harness.pc.onicegatheringstatechange?.();
    expect(harness.adapter.initialMediaReadinessSnapshot.transportConnected).toBe(false);

    const videoTrack = createRemoteTrack("video");
    harness.pc.ontrack?.({ track: videoTrack, streams: [createRemoteStream(videoTrack)] } as unknown as RTCTrackEvent);
    expect(harness.adapter.initialMediaReadinessSnapshot.remoteAudioTrackReady).toBe(false);
    expect(harness.onRemoteStream).not.toHaveBeenCalled();
  });

  it("supports streamless audio ontrack and binds the created stream", async () => {
    const harness = readinessHarness();
    await harness.adapter.prepareOffer();
    const remoteTrack = createRemoteTrack();
    harness.pc.ontrack?.({ track: remoteTrack, streams: [] } as unknown as RTCTrackEvent);

    expect(harness.onRemoteStream).toHaveBeenCalledTimes(1);
    expect(harness.adapter.remoteMediaStream?.getTracks()).toContain(remoteTrack);
    expect(harness.adapter.initialMediaReadinessSnapshot.remoteAudioStreamBound).toBe(true);
  });

  it("does not become ready when remote audio arrives before transport", async () => {
    const harness = readinessHarness();
    await harness.adapter.prepareOffer();
    const remoteTrack = createRemoteTrack();
    harness.pc.ontrack?.({ track: remoteTrack, streams: [createRemoteStream(remoteTrack)] } as unknown as RTCTrackEvent);

    expect(harness.adapter.initialMediaReadinessSnapshot).toMatchObject({
      transportConnected: false,
      localAudioSenderReady: true,
      remoteAudioTrackReady: true,
      remoteAudioStreamBound: true,
      ready: false,
    });
  });

  it("emits only semantic readiness changes and keeps failed transport states false", async () => {
    const harness = readinessHarness();
    await harness.adapter.prepareOffer();
    const remoteTrack = createRemoteTrack();
    harness.pc.ontrack?.({ track: remoteTrack, streams: [createRemoteStream(remoteTrack)] } as unknown as RTCTrackEvent);
    for (const state of ["connecting", "disconnected", "failed", "closed"] as RTCPeerConnectionState[]) {
      harness.pc.connectionState = state;
      harness.pc.onconnectionstatechange?.();
      expect(harness.adapter.initialMediaReadinessSnapshot.ready).toBe(false);
    }
    expect(harness.readiness.filter((snapshot) => snapshot.ready)).toHaveLength(0);
    const before = harness.readiness.length;
    harness.pc.onconnectionstatechange?.();
    harness.pc.onconnectionstatechange?.();
    expect(harness.readiness.length).toBe(before);
  });

  it("uses ICE connected/completed only when connectionState is unavailable", async () => {
    const harness = readinessHarness();
    await harness.adapter.prepareOffer();
    harness.pc.connectionState = undefined as unknown as RTCPeerConnectionState;
    harness.pc.iceConnectionState = "connected";
    harness.pc.oniceconnectionstatechange?.();
    expect(harness.adapter.initialMediaReadinessSnapshot.transportConnected).toBe(true);

    harness.pc.connectionState = "failed";
    harness.pc.iceConnectionState = "completed";
    harness.pc.onconnectionstatechange?.();
    expect(harness.adapter.initialMediaReadinessSnapshot.transportConnected).toBe(false);
  });

  it("recomputes readiness for successful and failed audio input replacement", async () => {
    const harness = readinessHarness();
    await harness.adapter.prepareOffer();
    const remoteTrack = createRemoteTrack();
    harness.pc.ontrack?.({ track: remoteTrack, streams: [createRemoteStream(remoteTrack)] } as unknown as RTCTrackEvent);
    harness.pc.connectionState = "connected";
    harness.pc.onconnectionstatechange?.();
    expect(harness.adapter.initialMediaReadinessSnapshot.ready).toBe(true);

    const replacement = { ...createRemoteTrack(), kind: "audio" as const };
    const replacementStream = { getTracks: () => [replacement] };
    harness.getUserMedia.mockResolvedValueOnce(replacementStream);
    harness.sender.replaceTrack.mockImplementationOnce(async (track) => { harness.sender.track = track; });
    await expect(harness.adapter.switchAudioInput({ audio: true, video: false })).resolves.toBe(true);
    expect(harness.adapter.initialMediaReadinessSnapshot.ready).toBe(true);
    expect(harness.pc.createOffer).toHaveBeenCalledTimes(1);

    harness.sender.replaceTrack.mockRejectedValueOnce(new Error("replace failed"));
    const failedReplacement = { ...createRemoteTrack(), kind: "audio" as const };
    harness.getUserMedia.mockResolvedValueOnce({ getTracks: () => [failedReplacement] });
    await expect(harness.adapter.switchAudioInput({ audio: true, video: false })).resolves.toBe(false);
    expect(harness.sender.track).toBe(replacement);
    expect(harness.adapter.initialMediaReadinessSnapshot.ready).toBe(true);
  });

  it("resets readiness on dispose and ignores stale events and sensitive values", async () => {
    const harness = readinessHarness();
    await harness.adapter.prepareOffer();
    const oldConnection = harness.pc.onconnectionstatechange;
    const oldTrack = harness.pc.ontrack;
    const remoteTrack = createRemoteTrack();
    oldTrack?.({ track: remoteTrack, streams: [createRemoteStream(remoteTrack)] } as unknown as RTCTrackEvent);
    harness.pc.connectionState = "connected";
    oldConnection?.();
    expect(harness.adapter.initialMediaReadinessSnapshot.ready).toBe(true);
    harness.adapter.dispose();
    expect(harness.adapter.initialMediaReadinessSnapshot).toEqual({
      transportConnected: false,
      localAudioSenderReady: false,
      remoteAudioTrackReady: false,
      remoteAudioStreamBound: false,
      ready: false,
    });
    const countAfterDispose = harness.readiness.length;
    oldConnection?.();
    oldTrack?.({ track: remoteTrack, streams: [createRemoteStream(remoteTrack)] } as unknown as RTCTrackEvent);
    expect(harness.readiness.length).toBe(countAfterDispose);
    expect(JSON.stringify(harness.readiness)).not.toMatch(/secret-sdp|candidate:|credential|device-id/);
  });

  it("keeps old adapter events isolated from a newly created adapter", async () => {
    const oldHarness = readinessHarness();
    await oldHarness.adapter.prepareOffer();
    const oldConnection = oldHarness.pc.onconnectionstatechange;
    const oldTrack = oldHarness.pc.ontrack;
    oldHarness.adapter.dispose();

    const newHarness = readinessHarness();
    await newHarness.adapter.prepareOffer();
    oldHarness.pc.connectionState = "connected";
    oldConnection?.();
    oldTrack?.({ track: createRemoteTrack(), streams: [] } as unknown as RTCTrackEvent);

    expect(newHarness.adapter.initialMediaReadinessSnapshot).toEqual({
      transportConnected: false,
      localAudioSenderReady: true,
      remoteAudioTrackReady: false,
      remoteAudioStreamBound: false,
      ready: false,
    });
    expect(newHarness.readiness.filter((snapshot) => snapshot.ready)).toHaveLength(0);
  });

  it("acquires audio-only media and creates one offerer peer", async () => {
    const harness = createHarness();

    const first = await harness.adapter.prepareOffer();
    const second = await harness.adapter.prepareOffer();

    expect(harness.getUserMedia).toHaveBeenCalledWith({
      audio: {
        noiseSuppression: true,
        echoCancellation: true,
        autoGainControl: true,
      },
      video: false,
    });
    expect(harness.createPeerConnection).toHaveBeenCalledTimes(1);
    expect(harness.pc.createOffer).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(harness.pc.addTrack).toHaveBeenCalledTimes(1);
  });

  it("passes the shared STUN configuration to the persistent peer", async () => {
    const harness = createHarness();
    await harness.adapter.prepareOffer();
    expect(harness.createPeerConnection).toHaveBeenCalledWith({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
  });

  it("passes TURN only when the shared configuration has complete credentials", async () => {
    vi.stubEnv("VITE_WEBRTC_STUN_URL", "stun:stun.example.test:3478");
    vi.stubEnv("VITE_WEBRTC_TURN_URL", "turn:turn.example.test:3478");
    vi.stubEnv("VITE_WEBRTC_TURN_USERNAME", "test-user");
    vi.stubEnv("VITE_WEBRTC_TURN_CREDENTIAL", "test-secret");
    const harness = createHarness();
    await harness.adapter.prepareOffer();

    expect(harness.createPeerConnection).toHaveBeenCalledWith({
      iceServers: [
        { urls: "stun:stun.example.test:3478" },
        { urls: "turn:turn.example.test:3478", username: "test-user", credential: "test-secret" },
      ],
    });
    vi.unstubAllEnvs();
  });

  it("resolves an injected RTC configuration once per peer and passes a defensive snapshot", async () => {
    const harness = createHarness();
    const sourceConfiguration: RTCConfiguration = {
      iceServers: [{ urls: ["stun:source.example.test"], username: "source-user", credential: "source-secret" }],
    };
    const source: RtcConfigurationSource = {
      getConfiguration: vi.fn(async () => sourceConfiguration),
    };
    const createPeerConnection = vi.fn((configuration?: RTCConfiguration) => {
      if (!configuration) throw new Error("missing RTC configuration");
      (configuration.iceServers![0].urls as string[])[0] = "stun:mutated-by-peer";
      return harness.pc;
    });
    const adapter = new DirectedCallWebRtcAdapter({
      dependencies: { getUserMedia: harness.getUserMedia, createPeerConnection },
      rtcConfigurationSource: source,
    });

    await adapter.prepareOffer();
    await adapter.prepareOffer();

    expect(source.getConfiguration).toHaveBeenCalledTimes(1);
    expect(createPeerConnection).toHaveBeenCalledWith({
      iceServers: [{ urls: ["stun:mutated-by-peer"], username: "source-user", credential: "source-secret" }],
    });
    expect(sourceConfiguration).toEqual({
      iceServers: [{ urls: ["stun:source.example.test"], username: "source-user", credential: "source-secret" }],
    });
  });

  it("uses a fresh source resolution for a separate peer", async () => {
    const source: RtcConfigurationSource = {
      getConfiguration: vi.fn(async () => ({ iceServers: [{ urls: "stun:source.example.test" }] })),
    };
    const first = createHarness();
    const second = createHarness();
    const firstAdapter = new DirectedCallWebRtcAdapter({
      dependencies: { getUserMedia: first.getUserMedia, createPeerConnection: first.createPeerConnection },
      rtcConfigurationSource: source,
    });
    const secondAdapter = new DirectedCallWebRtcAdapter({
      dependencies: { getUserMedia: second.getUserMedia, createPeerConnection: second.createPeerConnection },
      rtcConfigurationSource: source,
    });

    await firstAdapter.prepareOffer();
    await secondAdapter.prepareOffer();

    expect(source.getConfiguration).toHaveBeenCalledTimes(2);
  });

  it("uses the existing setup failure path when RTC configuration resolution fails", async () => {
    const harness = createHarness();
    const adapter = new DirectedCallWebRtcAdapter({
      dependencies: { getUserMedia: harness.getUserMedia, createPeerConnection: harness.createPeerConnection },
      rtcConfigurationSource: {
        getConfiguration: async () => { throw new Error("credential=private-secret"); },
      },
    });

    let error: Error & { failureCode?: string };
    try {
      await adapter.prepareOffer();
      throw new Error("expected configuration failure");
    } catch (reason) {
      error = reason as Error & { failureCode?: string };
    }

    expect(error.failureCode).toBe("media_binding_failed");
    expect(error.message).not.toContain("private-secret");
    expect(harness.createPeerConnection).not.toHaveBeenCalled();
    expect(harness.track.stop).toHaveBeenCalled();
  });

  it("single-flights concurrent creation-triggering operations", async () => {
    const harness = createHarness();
    const configuration = deferred<RTCConfiguration>();
    const source: RtcConfigurationSource = {
      getConfiguration: vi.fn(() => configuration.promise),
    };
    const adapter = new DirectedCallWebRtcAdapter({
      dependencies: { getUserMedia: harness.getUserMedia, createPeerConnection: harness.createPeerConnection },
      rtcConfigurationSource: source,
    });

    const offer = adapter.prepareOffer();
    const answer = adapter.prepareAnswer();
    await flushMicrotasks();
    expect(source.getConfiguration).toHaveBeenCalledTimes(1);
    expect(harness.getUserMedia).toHaveBeenCalledTimes(1);
    expect(harness.createPeerConnection).not.toHaveBeenCalled();

    configuration.resolve({ iceServers: [{ urls: "stun:single-flight.example.test" }] });
    await Promise.all([offer, answer]);

    expect(harness.createPeerConnection).toHaveBeenCalledTimes(1);
    expect(harness.track.stop).not.toHaveBeenCalled();
  });

  it.each([
    ["null", null],
    ["array", []],
    ["primitive", 1],
    ["non-array iceServers", { iceServers: "invalid" }],
    ["malformed ICE server", { iceServers: [null] }],
    ["malformed urls", { iceServers: [{ urls: [" "] }] }],
    ["invalid credential fields", { iceServers: [{ urls: "turn:example.test", username: 1, credential: "secret" }] }],
  ])("rejects malformed injected configuration without constructing a peer: %s", async (_name, invalid) => {
    const harness = createHarness();
    let valid = false;
    const source: RtcConfigurationSource = {
      getConfiguration: vi.fn(async () => {
        if (!valid) return invalid as RTCConfiguration;
        return { iceServers: [{ urls: "stun:retry.example.test" }] };
      }),
    };
    const adapter = new DirectedCallWebRtcAdapter({
      dependencies: { getUserMedia: harness.getUserMedia, createPeerConnection: harness.createPeerConnection },
      rtcConfigurationSource: source,
    });

    const error = await adapter.prepareOffer().then(
      () => null,
      (reason) => reason as Error & { failureCode?: string },
    );
    if (!error) throw new Error("Expected malformed RTC configuration to fail");
    expect(error.failureCode).toBe("media_binding_failed");
    expect(error.message).not.toContain("secret");
    expect(harness.createPeerConnection).not.toHaveBeenCalled();
    expect(harness.track.stop).toHaveBeenCalledOnce();

    valid = true;
    await adapter.prepareOffer();
    expect(source.getConfiguration).toHaveBeenCalledTimes(2);
    expect(harness.createPeerConnection).toHaveBeenCalledTimes(1);
  });

  it("does not construct or restore a peer after disposal while configuration is pending", async () => {
    const harness = createHarness();
    const configuration = deferred<RTCConfiguration>();
    const adapter = new DirectedCallWebRtcAdapter({
      dependencies: { getUserMedia: harness.getUserMedia, createPeerConnection: harness.createPeerConnection },
      rtcConfigurationSource: { getConfiguration: () => configuration.promise },
    });

    const operation = adapter.prepareOffer();
    await flushMicrotasks();
    adapter.dispose();
    configuration.resolve({ iceServers: [{ urls: "stun:stale.example.test" }] });

    await expect(operation).rejects.toBeInstanceOf(DirectedCallWebRtcStaleError);
    expect(harness.createPeerConnection).not.toHaveBeenCalled();
    expect(harness.track.stop).toHaveBeenCalledOnce();
    expect(adapter.localMediaStream).toBeNull();
  });

  it("does not let a stale adapter attempt affect a later adapter", async () => {
    const staleHarness = createHarness();
    const staleConfiguration = deferred<RTCConfiguration>();
    const staleAdapter = new DirectedCallWebRtcAdapter({
      dependencies: { getUserMedia: staleHarness.getUserMedia, createPeerConnection: staleHarness.createPeerConnection },
      rtcConfigurationSource: { getConfiguration: () => staleConfiguration.promise },
    });
    const staleOperation = staleAdapter.prepareOffer();
    await flushMicrotasks();
    staleAdapter.dispose();

    const currentHarness = createHarness();
    const currentAdapter = new DirectedCallWebRtcAdapter({
      dependencies: { getUserMedia: currentHarness.getUserMedia, createPeerConnection: currentHarness.createPeerConnection },
      rtcConfigurationSource: { getConfiguration: async () => ({ iceServers: [{ urls: "stun:current.example.test" }] }) },
    });
    await currentAdapter.prepareOffer();
    staleConfiguration.resolve({ iceServers: [{ urls: "stun:stale.example.test" }] });
    await expect(staleOperation).rejects.toBeInstanceOf(DirectedCallWebRtcStaleError);

    expect(staleHarness.createPeerConnection).not.toHaveBeenCalled();
    expect(currentHarness.createPeerConnection).toHaveBeenCalledTimes(1);
    expect(currentHarness.track.stop).not.toHaveBeenCalled();
  });

  it("uses the injected exact microphone and processing preferences", async () => {
    const harness = createHarness();
    const getAudioConstraints = () => ({
      audio: {
        deviceId: { exact: "fifine-input" },
        noiseSuppression: false,
        echoCancellation: true,
        autoGainControl: false,
      },
      video: false,
    });
    const adapter = new DirectedCallWebRtcAdapter({
      dependencies: { getUserMedia: harness.getUserMedia, createPeerConnection: harness.createPeerConnection },
      getAudioConstraints,
    });

    await adapter.prepareOffer();

    expect(harness.getUserMedia).toHaveBeenCalledWith(getAudioConstraints());
  });

  it("does not fall back when an explicitly selected microphone is unavailable", async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new DOMException("not found", "NotFoundError"));
    const createPeerConnection = vi.fn();
    const adapter = new DirectedCallWebRtcAdapter({
      dependencies: { getUserMedia, createPeerConnection },
      getAudioConstraints: () => ({
        audio: { deviceId: { exact: "missing-input" } },
        video: false,
      }),
    });

    await expect(adapter.prepareOffer()).rejects.toMatchObject({ failureCode: "microphone_unavailable" });
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: { deviceId: { exact: "missing-input" } },
      video: false,
    });
    expect(createPeerConnection).not.toHaveBeenCalled();
  });

  it("replaces the existing sender track without recreating the peer connection", async () => {
    const harness = createHarness();
    await harness.adapter.prepareOffer();
    const replacement = { kind: "audio", readyState: "live", enabled: true, stop: vi.fn() };
    const replacementStream = { getTracks: () => [replacement] };
    harness.getUserMedia.mockResolvedValueOnce(replacementStream);
    harness.sender.replaceTrack.mockImplementation(async (track) => {
      expect(harness.track.stop).not.toHaveBeenCalled();
      expect(track).toBe(replacement);
    });

    await expect(harness.adapter.switchAudioInput({ audio: { deviceId: { exact: "new-mic" } }, video: false })).resolves.toBe(true);

    expect(harness.getUserMedia).toHaveBeenLastCalledWith({ audio: { deviceId: { exact: "new-mic" } }, video: false });
    expect(harness.sender.replaceTrack).toHaveBeenCalledWith(replacement);
    expect(harness.createPeerConnection).toHaveBeenCalledTimes(1);
    expect(harness.track.stop).toHaveBeenCalledOnce();
    expect(harness.adapter.localMediaStream).toBe(replacementStream);
  });

  it("keeps the old track when replacement fails and stops the new stream", async () => {
    const harness = createHarness();
    await harness.adapter.prepareOffer();
    const replacement = { kind: "audio", readyState: "live", enabled: true, stop: vi.fn() };
    const replacementStream = { getTracks: () => [replacement] };
    harness.getUserMedia.mockResolvedValueOnce(replacementStream);
    harness.sender.replaceTrack.mockRejectedValueOnce(new Error("replace failed"));

    await expect(harness.adapter.switchAudioInput({ audio: true, video: false })).resolves.toBe(false);

    expect(harness.track.stop).not.toHaveBeenCalled();
    expect(replacement.stop).toHaveBeenCalledOnce();
    expect(harness.adapter.localMediaStream).toBe(harness.stream);
  });

  it("preserves mute state on a replacement and later unmutes it", async () => {
    const harness = createHarness();
    await harness.adapter.prepareOffer();
    expect(harness.adapter.setLocalAudioMuted(true)).toBe(true);
    const replacement = { kind: "audio", readyState: "live", enabled: true, stop: vi.fn() };
    harness.getUserMedia.mockResolvedValueOnce({ getTracks: () => [replacement] });

    await expect(harness.adapter.switchAudioInput({ audio: true, video: false })).resolves.toBe(true);
    expect(replacement.enabled).toBe(false);
    expect(harness.adapter.setLocalAudioMuted(false)).toBe(true);
    expect(replacement.enabled).toBe(true);
  });

  it("stops an acquired replacement when the adapter is disposed during acquisition", async () => {
    const harness = createHarness();
    await harness.adapter.prepareOffer();
    let resolveMedia!: (stream: any) => void;
    harness.getUserMedia.mockReturnValueOnce(new Promise((resolve) => { resolveMedia = resolve; }));
    const switching = harness.adapter.switchAudioInput({ audio: true, video: false });
    await vi.waitFor(() => expect(harness.getUserMedia).toHaveBeenCalledTimes(2));
    harness.adapter.dispose();
    const replacement = { kind: "audio", readyState: "live", enabled: true, stop: vi.fn() };
    resolveMedia({ getTracks: () => [replacement] });

    await expect(switching).resolves.toBe(false);
    expect(replacement.stop).toHaveBeenCalledOnce();
  });

  it("queues and deduplicates ICE until the remote description exists", async () => {
    const harness = createHarness();
    await harness.adapter.prepareAnswer();
    const candidate = { candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 0 };

    expect(await harness.adapter.addRemoteIceCandidate(candidate)).toBe(true);
    expect(await harness.adapter.addRemoteIceCandidate(candidate)).toBe(false);
    expect(harness.pc.addIceCandidate).not.toHaveBeenCalled();

    await harness.adapter.acceptOffer({ type: "offer", sdp: "offer" });
    expect(harness.pc.addIceCandidate).toHaveBeenCalledTimes(1);
  });

  it("forwards distinct ICE candidates once and does not carry deduplication across generations", async () => {
    const first = createHarness();
    await first.adapter.prepareAnswer();
    await first.adapter.acceptOffer({ type: "offer", sdp: "offer" });
    const candidateOne = { candidate: "candidate:one", sdpMid: "0", sdpMLineIndex: 0, usernameFragment: "ufrag" };
    const candidateTwo = { candidate: "candidate:two", sdpMid: "0", sdpMLineIndex: 0, usernameFragment: "ufrag" };

    expect(await first.adapter.addRemoteIceCandidate(candidateOne)).toBe(true);
    expect(await first.adapter.addRemoteIceCandidate(candidateTwo)).toBe(true);
    expect(first.pc.addIceCandidate).toHaveBeenCalledTimes(2);
    expect(first.pc.addIceCandidate).toHaveBeenNthCalledWith(1, candidateOne);
    expect(first.pc.addIceCandidate).toHaveBeenNthCalledWith(2, candidateTwo);

    first.adapter.dispose();
    const second = createHarness();
    await second.adapter.prepareAnswer();
    await second.adapter.acceptOffer({ type: "offer", sdp: "offer" });
    expect(await second.adapter.addRemoteIceCandidate(candidateOne)).toBe(true);
    expect(second.pc.addIceCandidate).toHaveBeenCalledTimes(1);
    expect(second.pc.addIceCandidate).toHaveBeenCalledWith(candidateOne);
  });

  it("does not create a second peer connection for duplicate offer or answer", async () => {
    const harness = createHarness();
    await harness.adapter.prepareAnswer();
    expect(await harness.adapter.acceptOffer({ type: "offer", sdp: "offer" })).not.toBeNull();
    expect(await harness.adapter.acceptOffer({ type: "offer", sdp: "offer" })).toBeNull();
    expect(harness.createPeerConnection).toHaveBeenCalledTimes(1);

    const offerer = createHarness();
    await offerer.adapter.prepareOffer();
    expect(await offerer.adapter.acceptAnswer({ type: "answer", sdp: "answer" })).toBe(true);
    expect(await offerer.adapter.acceptAnswer({ type: "answer", sdp: "answer" })).toBe(false);
    expect(offerer.createPeerConnection).toHaveBeenCalledTimes(1);
  });

  it("maps permission failures and cleans every media resource idempotently", async () => {
    const track = { stop: vi.fn() };
    const getUserMedia = vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    const adapter = new DirectedCallWebRtcAdapter({ dependencies: {
      getUserMedia,
      createPeerConnection: vi.fn(),
    } });

    await expect(adapter.prepareOffer()).rejects.toMatchObject({ failureCode: "permission_denied" });
    expect(adapter).toBeDefined();
    adapter.dispose();
    adapter.dispose();
    expect(track.stop).not.toHaveBeenCalled();
  });

  it("does not expose SDP or ICE in adapter errors", async () => {
    const harness = createHarness();
    harness.pc.createOffer.mockRejectedValue(new Error("secret-sdp"));

    try {
      await harness.adapter.prepareOffer();
    } catch (error) {
      expect(error).toBeInstanceOf(DirectedCallWebRtcError);
      expect(String(error)).not.toContain("secret-sdp");
    }
  });

  it("stops tracks and closes the peer on disposal", async () => {
    const harness = createHarness();
    await harness.adapter.prepareOffer();
    harness.adapter.dispose();

    expect(harness.track.stop).toHaveBeenCalledTimes(1);
    expect(harness.pc.close).toHaveBeenCalledTimes(1);
  });

  it("stops media resolved after disposal without constructing a peer", async () => {
    let resolveMedia!: (stream: any) => void;
    const track = { stop: vi.fn() };
    const stream = { getTracks: () => [track] };
    const getUserMedia = vi.fn(() => new Promise<any>((resolve) => { resolveMedia = resolve; }));
    const createPeerConnection = vi.fn();
    const adapter = new DirectedCallWebRtcAdapter({ dependencies: { getUserMedia, createPeerConnection } });
    const operation = adapter.prepareOffer();

    adapter.dispose();
    resolveMedia(stream);

    await expect(operation).rejects.toBeInstanceOf(DirectedCallWebRtcStaleError);
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(createPeerConnection).not.toHaveBeenCalled();
  });

  it("cleans acquired media when peer construction fails", async () => {
    const track = { stop: vi.fn() };
    const stream = { getTracks: () => [track] };
    const adapter = new DirectedCallWebRtcAdapter({ dependencies: {
      getUserMedia: vi.fn().mockResolvedValue(stream),
      createPeerConnection: vi.fn(() => { throw new Error("peer failed"); }),
    } });

    await expect(adapter.prepareOffer()).rejects.toMatchObject({ failureCode: "media_binding_failed" });
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it("cleans acquired media and the partial peer when track binding fails", async () => {
    const track = { stop: vi.fn() };
    const stream = { getTracks: () => [track] };
    const pc = { ...createHarness().pc, addTrack: vi.fn(() => { throw new Error("track failed"); }) };
    const adapter = new DirectedCallWebRtcAdapter({ dependencies: {
      getUserMedia: vi.fn().mockResolvedValue(stream),
      createPeerConnection: vi.fn(() => pc),
    } });

    await expect(adapter.prepareOffer()).rejects.toMatchObject({ failureCode: "media_binding_failed" });
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(pc.close).toHaveBeenCalledTimes(1);
  });

  it("ignores late offer and local-description completions", async () => {
    const harness = createHarness();
    let resolveOffer!: (offer: RTCSessionDescriptionInit) => void;
    harness.pc.createOffer.mockImplementationOnce(() => new Promise((resolve) => { resolveOffer = resolve; }));
    const operation = harness.adapter.prepareOffer();
    await vi.waitFor(() => expect(harness.pc.createOffer).toHaveBeenCalled());
    harness.adapter.dispose();
    resolveOffer({ type: "offer", sdp: "late-offer" });

    await expect(operation).rejects.toBeInstanceOf(DirectedCallWebRtcStaleError);
    expect(harness.pc.setLocalDescription).not.toHaveBeenCalled();

    const second = createHarness();
    let resolveLocal!: () => void;
    second.pc.setLocalDescription.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveLocal = resolve; }));
    const secondOperation = second.adapter.prepareOffer();
    await vi.waitFor(() => expect(second.pc.setLocalDescription).toHaveBeenCalled());
    second.adapter.dispose();
    resolveLocal();

    await expect(secondOperation).rejects.toBeInstanceOf(DirectedCallWebRtcStaleError);
  });

  it("ignores late remote-description and answer completions", async () => {
    const harness = createHarness();
    await harness.adapter.prepareAnswer();
    let resolveRemote!: () => void;
    harness.pc.setRemoteDescription.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveRemote = resolve; }));
    const offerOperation = harness.adapter.acceptOffer({ type: "offer", sdp: "offer" });
    await vi.waitFor(() => expect(harness.pc.setRemoteDescription).toHaveBeenCalled());
    harness.adapter.dispose();
    resolveRemote();
    await expect(offerOperation).rejects.toBeInstanceOf(DirectedCallWebRtcStaleError);
    expect(harness.pc.createAnswer).not.toHaveBeenCalled();

    const answerer = createHarness();
    await answerer.adapter.prepareOffer();
    let resolveAnswerRemote!: () => void;
    answerer.pc.setRemoteDescription.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveAnswerRemote = resolve; }));
    const answerOperation = answerer.adapter.acceptAnswer({ type: "answer", sdp: "answer" });
    await vi.waitFor(() => expect(answerer.pc.setRemoteDescription).toHaveBeenCalled());
    answerer.adapter.dispose();
    resolveAnswerRemote();
    await expect(answerOperation).rejects.toBeInstanceOf(DirectedCallWebRtcStaleError);
  });

  it("keeps post-active SDP operations separate from initial establishment", async () => {
    const harness = createHarness();
    await harness.adapter.prepareOffer();
    const offer = await harness.adapter.createRenegotiationOffer();
    expect(offer.sdp).toBe("offer");
    await harness.adapter.applyRenegotiationOffer({ type: "offer", sdp: "remote-offer" });
    const answer = await harness.adapter.createRenegotiationAnswer();
    expect(answer.sdp).toBe("answer");
    await harness.adapter.applyRenegotiationAnswer({ type: "answer", sdp: "remote-answer" });
    expect(harness.getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("executes an ICE restart offer on the existing peer connection", async () => {
    const harness = createHarness();
    await harness.adapter.prepareOffer();
    const peerConnection = harness.createPeerConnection.mock.results[0]?.value;

    const offer = await harness.adapter.createIceRestartOffer();

    expect(offer.sdp).toBe("offer");
    expect(harness.pc.createOffer).toHaveBeenLastCalledWith({ iceRestart: true });
    expect(harness.createPeerConnection).toHaveBeenCalledTimes(1);
    expect(harness.pc.localDescription).toEqual(offer);
    expect(peerConnection).toBe(harness.pc);
  });

  it("retires the old peer before rebuilding, resolves configuration again, and restores audio", async () => {
    const harness = createHarness();
    const onRemoteStream = vi.fn();
    const pendingConfiguration = deferred<RTCConfiguration>();
    const configurationSource = { getConfiguration: vi.fn()
      .mockResolvedValueOnce({ iceServers: [{ urls: "stun:first.example" }] })
      .mockReturnValueOnce(pendingConfiguration.promise) };
    const adapter = new DirectedCallWebRtcAdapter({
      dependencies: {
        getUserMedia: harness.getUserMedia,
        createPeerConnection: harness.createPeerConnection,
        createRemoteStream: harness.createRemoteStream,
      },
      rtcConfigurationSource: configurationSource,
      onRemoteStream,
    });
    await adapter.prepareOffer();
    const remoteTrack = createRemoteTrack();
    const remoteStream = createRemoteStream(remoteTrack);
    harness.pc.ontrack?.({ track: remoteTrack, streams: [remoteStream] } as unknown as RTCTrackEvent);
    expect(adapter.remoteMediaStream).toBe(remoteStream);

    const rebuildPromise = adapter.rebuildPeerConnection();
    await vi.waitFor(() => expect(configurationSource.getConfiguration).toHaveBeenCalledTimes(2));
    const concurrentOffer = adapter.prepareOffer();
    await Promise.resolve();
    expect(harness.createPeerConnection).toHaveBeenCalledTimes(1);
    pendingConfiguration.resolve({ iceServers: [{ urls: "stun:second.example" }] });
    await rebuildPromise;
    await concurrentOffer;

    expect(harness.pc.close).toHaveBeenCalledTimes(1);
    expect(configurationSource.getConfiguration).toHaveBeenCalledTimes(2);
    expect(harness.createPeerConnection).toHaveBeenCalledTimes(2);
    expect((harness.createPeerConnection.mock.calls as any[])[0][0]).toEqual({ iceServers: [{ urls: "stun:first.example" }] });
    expect((harness.createPeerConnection.mock.calls as any[])[1][0]).toEqual({ iceServers: [{ urls: "stun:second.example" }] });
    expect(harness.getUserMedia).toHaveBeenCalledTimes(1);
    expect(harness.pc.addTrack).toHaveBeenCalledTimes(2);
    expect(remoteStream.getTracks()).toEqual([]);

    const replacementRemoteTrack = createRemoteTrack();
    const replacementRemoteStream = createRemoteStream(replacementRemoteTrack);
    harness.pc.ontrack?.({ track: replacementRemoteTrack, streams: [replacementRemoteStream] } as unknown as RTCTrackEvent);
    expect(adapter.remoteMediaStream).toBe(replacementRemoteStream);
    expect(onRemoteStream).toHaveBeenCalledTimes(2);
  });

  it("queues and flushes restart candidates by transaction", async () => {
    const harness = createHarness();
    await harness.adapter.prepareOffer();
    const restartId = "77777777-7777-4777-8777-777777777777";
    const candidate = { candidate: "candidate:restart", sdpMid: "0", sdpMLineIndex: 0 };

    await harness.adapter.addRemoteIceCandidate(candidate, restartId);
    expect(harness.pc.addIceCandidate).not.toHaveBeenCalled();
    await harness.adapter.applyIceRestartAnswer({ type: "answer", sdp: "restart-answer" }, restartId);

    expect(harness.pc.addIceCandidate).toHaveBeenCalledWith(candidate);
  });

  it("detaches ICE and track callbacks and clears queued candidates on disposal", async () => {
    const harness = createHarness();
    await harness.adapter.prepareAnswer();
    const candidate = { candidate: "candidate:queued", sdpMid: "0", sdpMLineIndex: 0 };
    await harness.adapter.addRemoteIceCandidate(candidate);
    harness.adapter.dispose();

    expect(harness.pc.onicecandidate).toBeNull();
    expect(harness.pc.ontrack).toBeNull();
    expect(await harness.adapter.addRemoteIceCandidate(candidate)).toBe(false);
    expect(harness.pc.addIceCandidate).not.toHaveBeenCalled();
  });

  it("does not emit end-of-candidates or remote tracks after disposal", async () => {
    const onIceCandidate = vi.fn();
    const onRemoteStream = vi.fn();
    const harness = createHarness();
    const adapter = new DirectedCallWebRtcAdapter({
      dependencies: { getUserMedia: harness.getUserMedia, createPeerConnection: harness.createPeerConnection },
      onIceCandidate,
      onRemoteStream,
    });
    await adapter.prepareOffer();
    const iceHandler = harness.pc.onicecandidate;
    const trackHandler = harness.pc.ontrack;
    adapter.dispose();
    iceHandler?.({ candidate: null } as unknown as RTCPeerConnectionIceEvent);
    trackHandler?.({ streams: [], track: {} } as unknown as RTCTrackEvent);

    expect(onIceCandidate).not.toHaveBeenCalled();
    expect(onRemoteStream).not.toHaveBeenCalled();
  });

  it("starts display capture with video-only intent and attaches one video track", async () => {
    const harness = createHarness();
    harness.getDisplayMedia.mockResolvedValue(displayStream(harness.screenTrack));

    await expect(harness.adapter.startScreenShare()).resolves.toBe(true);

    expect(harness.getDisplayMedia).toHaveBeenCalledWith({ video: true, audio: false });
    expect(harness.pc.addTransceiver).toHaveBeenCalledTimes(1);
    expect(harness.pc.addTransceiver).toHaveBeenCalledWith("video", { direction: "sendonly" });
    expect(harness.screenSender.replaceTrack).toHaveBeenCalledWith(harness.screenTrack);
    expect(harness.adapter.getLocalScreenShareStream()?.getTracks()).toEqual([harness.screenTrack]);
    expect(harness.getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("labels local and remote SDP video directions without swapping them", async () => {
    const diagnostics: DirectedCallWebRtcDiagnosticDetails[] = [];
    const harness = createHarness({ onDiagnostic: (_event, details) => diagnostics.push(details) });
    await harness.adapter.prepareOffer();
    harness.pc.createOffer.mockResolvedValueOnce({ type: "offer", sdp: "v=0\r\nm=video 9 RTP/AVP 96\r\nsendonly\r\n" });
    await harness.adapter.createRenegotiationOffer();
    expect(diagnostics[diagnostics.length - 1]).toMatchObject({ localVideoDirection: "sendonly", remoteVideoDirection: null });

    await harness.adapter.applyRenegotiationOffer({ type: "offer", sdp: "v=0\r\nm=video 9 RTP/AVP 96\r\nrecvonly\r\n" });
    expect(diagnostics[diagnostics.length - 1]).toMatchObject({ localVideoDirection: null, remoteVideoDirection: "recvonly" });
  });

  it("supports every screen direction transition on one reusable transceiver", async () => {
    const harness = createHarness();
    const trackA = harness.screenTrack;
    const trackB = { ...harness.screenTrack, stop: vi.fn() };
    harness.getDisplayMedia.mockResolvedValueOnce(displayStream(trackA)).mockResolvedValueOnce(displayStream(trackB));

    await harness.adapter.prepareOffer();
    await harness.adapter.startScreenShare();
    expect(harness.screenTransceiver.direction).toBe("sendonly");

    expect(harness.adapter.setRemoteScreenShareReceptionEnabled(true)).toBe(true);
    expect(harness.screenTransceiver.direction).toBe("sendrecv");
    harness.adapter.stopScreenShare();
    expect(harness.screenTransceiver.direction).toBe("recvonly");
    expect(harness.adapter.setRemoteScreenShareReceptionEnabled(false)).toBe(true);
    expect(harness.screenTransceiver.direction).toBe("inactive");

    expect(harness.adapter.setRemoteScreenShareReceptionEnabled(true)).toBe(true);
    expect(harness.screenTransceiver.direction).toBe("recvonly");
    await harness.adapter.startScreenShare();
    expect(harness.screenTransceiver.direction).toBe("sendrecv");
    expect(harness.adapter.setRemoteScreenShareReceptionEnabled(false)).toBe(true);
    expect(harness.screenTransceiver.direction).toBe("sendonly");
    harness.adapter.stopScreenShare();
    expect(harness.screenTransceiver.direction).toBe("inactive");

    expect(harness.pc.addTransceiver).toHaveBeenCalledTimes(1);
    expect(harness.track.stop).not.toHaveBeenCalled();
  });

  it("prepares answerer-originated reception before creating an offer", async () => {
    const harness = createHarness();
    await harness.adapter.prepareOffer();
    expect(harness.getDisplayMedia).not.toHaveBeenCalled();

    expect(harness.adapter.setRemoteScreenShareReceptionEnabled(true)).toBe(true);
    expect(harness.screenTransceiver.direction).toBe("recvonly");
    expect(harness.pc.addTransceiver).toHaveBeenCalledTimes(1);

    const offer = await harness.adapter.createRenegotiationOffer();
    expect(harness.pc.createOffer).toHaveBeenCalledTimes(2);
    expect(offer.sdp).toBe("offer|audio:sendrecv|video:recvonly");
    expect(harness.screenTransceiver.direction).toBe("recvonly");
    const videoTransceivers = harness.pc.getTransceivers().filter((transceiver) => transceiver.kind === "video");
    expect(videoTransceivers).toHaveLength(1);
    expect(videoTransceivers[0]).toBe(harness.screenTransceiver);
    expect(videoTransceivers[0].direction).toBe("recvonly");
    expect(harness.pc.localDescription?.sdp).toContain("video:recvonly");
    expect(harness.pc.localDescription?.sdp).toContain("audio:sendrecv");
    const remoteTrack = createRemoteTrack("video");
    harness.pc.ontrack?.({ track: remoteTrack, streams: [], transceiver: harness.screenTransceiver } as unknown as RTCTrackEvent);
    expect(harness.adapter.getRemoteScreenShareStream()?.getTracks()).toEqual([remoteTrack]);
    expect(harness.pc.addTransceiver).toHaveBeenCalledTimes(1);
    expect(harness.track.stop).not.toHaveBeenCalled();
  });

  it("ignores a remote video track from a conflicting transceiver", async () => {
    const onRemoteScreenShareChanged = vi.fn();
    const harness = createHarness();
    harness.adapter.onRemoteScreenShareChanged(onRemoteScreenShareChanged);
    await harness.adapter.prepareOffer();
    expect(harness.adapter.setRemoteScreenShareReceptionEnabled(true)).toBe(true);

    const ownedTrack = createRemoteTrack("video");
    harness.pc.ontrack?.({ track: ownedTrack, streams: [], transceiver: harness.screenTransceiver } as unknown as RTCTrackEvent);
    const ownedRemoteScreen = harness.adapter.getRemoteScreenShareStream();
    const conflictingTransceiver = { ...harness.screenTransceiver, mid: "2", direction: "recvonly" as const };
    const conflictingTrack = createRemoteTrack("video");
    harness.pc.ontrack?.({ track: conflictingTrack, streams: [], transceiver: conflictingTransceiver } as unknown as RTCTrackEvent);

    expect(harness.pc.getTransceivers().filter((transceiver) => transceiver.kind === "video")).toHaveLength(1);
    expect(harness.screenTransceiver).toEqual(expect.objectContaining({ direction: "recvonly" }));
    expect(harness.adapter.getRemoteScreenShareStream()).toBe(ownedRemoteScreen);
    expect(harness.adapter.getRemoteScreenShareStream()?.getTracks()).toEqual([ownedTrack]);
    expect(onRemoteScreenShareChanged).toHaveBeenCalledTimes(1);
    expect(onRemoteScreenShareChanged).toHaveBeenCalledWith(ownedRemoteScreen);

    const remoteAudioTrack = createRemoteTrack("audio");
    const remoteAudioStream = harness.createRemoteStream();
    harness.pc.ontrack?.({ track: remoteAudioTrack, streams: [remoteAudioStream] } as unknown as RTCTrackEvent);
    expect(remoteAudioStream.getTracks()).toEqual([remoteAudioTrack]);
    expect(harness.adapter.remoteMediaStream).toBe(remoteAudioStream);
    expect(harness.sender.track).toBe(harness.track);
    expect(harness.getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("exposes remote screen video separately and handles duplicate, replacement, and ended tracks", async () => {
    const harness = createHarness();
    const changes: Array<DirectedCallMediaStream | null> = [];
    const unsubscribe = harness.adapter.onRemoteScreenShareChanged((stream) => changes.push(stream));
    await harness.adapter.prepareOffer();
    const remoteTransceiver = { ...harness.screenTransceiver, direction: "recvonly" as const };
    const firstTrack = createRemoteTrack("video");
    const secondTrack = createRemoteTrack("video");

    harness.pc.ontrack?.({ track: firstTrack, streams: [], transceiver: remoteTransceiver } as unknown as RTCTrackEvent);
    const firstStream = harness.adapter.getRemoteScreenShareStream();
    expect(firstStream?.getTracks()).toEqual([firstTrack]);
    expect(harness.adapter.remoteMediaStream).toBeNull();
    harness.pc.ontrack?.({ track: firstTrack, streams: [], transceiver: remoteTransceiver } as unknown as RTCTrackEvent);
    expect(changes).toHaveLength(1);

    harness.pc.ontrack?.({ track: secondTrack, streams: [], transceiver: remoteTransceiver } as unknown as RTCTrackEvent);
    expect(harness.adapter.getRemoteScreenShareStream()?.getTracks()).toEqual([secondTrack]);
    firstTrack.emit("ended");
    expect(harness.adapter.getRemoteScreenShareStream()?.getTracks()).toEqual([secondTrack]);
    secondTrack.emit("ended");
    expect(harness.adapter.getRemoteScreenShareStream()).toBeNull();
    expect(changes).toHaveLength(3);
    expect(changes[2]).toBeNull();

    unsubscribe();
    const thirdTrack = createRemoteTrack("video");
    harness.pc.ontrack?.({ track: thirdTrack, streams: [], transceiver: remoteTransceiver } as unknown as RTCTrackEvent);
    expect(changes).toHaveLength(3);
  });

  it("preserves a browser-provided remote screen stream", async () => {
    const diagnostics: Array<{ event: string; details: unknown }> = [];
    const harness = createHarness({ onDiagnostic: (event, details) => diagnostics.push({ event, details }) });
    await harness.adapter.prepareOffer();
    const remoteTrack = createRemoteTrack("video");
    const browserStream = createRemoteStream(remoteTrack);

    harness.pc.ontrack?.({
      track: remoteTrack,
      streams: [browserStream],
      transceiver: harness.screenTransceiver,
    } as unknown as RTCTrackEvent);

    expect(harness.adapter.getRemoteScreenShareStream()).toBe(browserStream);
    expect(browserStream.getTracks()).toEqual([remoteTrack]);
    expect(diagnostics.find(({ event }) => event === "remote_screen_stream_created")).toEqual(expect.objectContaining({
      event: "remote_screen_stream_created",
      details: expect.objectContaining({ remoteStreamSource: "browser-provided" }),
    }));
  });

  it("adopts the distinct MID 1 transceiver exposed by a remote screen offer", async () => {
    const diagnostics: Array<{ event: string; details: DirectedCallWebRtcDiagnosticDetails }> = [];
    const harness = createHarness({ onDiagnostic: (event, details) => diagnostics.push({ event, details }) });
    await harness.adapter.prepareOffer();
    expect(harness.adapter.setRemoteScreenShareReceptionEnabled(true)).toBe(true);
    harness.screenTransceiver.mid = null;
    const remoteTrack = createRemoteTrack("video");
    const authoritative = {
      direction: "recvonly" as RTCRtpTransceiverDirection,
      currentDirection: null as RTCRtpTransceiverDirection | null,
      mid: "1",
      sender: { track: null, replaceTrack: vi.fn().mockResolvedValue(undefined) },
      receiver: { track: remoteTrack },
    };
    const unrelated = {
      kind: "video" as const,
      direction: "inactive" as RTCRtpTransceiverDirection,
      currentDirection: "inactive" as RTCRtpTransceiverDirection,
      mid: "2",
      sender: { track: null, replaceTrack: vi.fn().mockResolvedValue(undefined) },
      receiver: { track: null },
    };
    harness.pc.setRemoteDescription = vi.fn(async (description: RTCSessionDescriptionInit) => {
      harness.pc.remoteDescription = description as RTCSessionDescription;
      harness.transceivers.push(unrelated);
      harness.transceivers.push(authoritative);
    });

    await harness.adapter.applyRenegotiationOffer({
      type: "offer",
      sdp: "v=0\r\nm=audio 9 RTP/AVP 111\r\nm=video 0 RTP/AVP 96\r\na=mid:2\r\na=inactive\r\nm=video 9 RTP/AVP 96\r\na=mid:1\r\na=sendonly\r\n",
    });
    harness.pc.ontrack?.({ track: remoteTrack, streams: [], transceiver: authoritative } as unknown as RTCTrackEvent);

    expect(harness.adapter.getRemoteScreenShareStream()?.getTracks()).toEqual([remoteTrack]);
    expect(harness.screenTransceiver.direction).toBe("inactive");
    expect(authoritative.direction).toBe("recvonly");
    expect(harness.pc.addTransceiver).toHaveBeenCalledTimes(1);
    expect(diagnostics.some(({ details }) => details.associationStrategy === "offer_mid" && details.associationAccepted === true)).toBe(true);
    expect(diagnostics.some(({ details }) => details.transceiverMid === "1" && details.selectedScreenTransceiver === true)).toBe(true);

    harness.pc.ontrack?.({ track: createRemoteTrack("video"), streams: [], transceiver: harness.screenTransceiver } as unknown as RTCTrackEvent);
    expect(harness.adapter.getRemoteScreenShareStream()?.getTracks()).toEqual([remoteTrack]);

    await harness.adapter.applyRenegotiationOffer({
      type: "offer",
      sdp: "v=0\r\nm=audio 9 RTP/AVP 111\r\nm=video 0 RTP/AVP 96\r\na=mid:2\r\na=inactive\r\nm=video 9 RTP/AVP 96\r\na=mid:1\r\na=sendonly\r\n",
    });
    expect(harness.pc.addTransceiver).toHaveBeenCalledTimes(1);
    expect(harness.adapter.getRemoteScreenShareStream()?.getTracks()).toEqual([remoteTrack]);
  });

  it("uses receiver-track identity when the adopted transceiver MID is temporarily missing", async () => {
    const harness = createHarness();
    await harness.adapter.prepareOffer();
    expect(harness.adapter.setRemoteScreenShareReceptionEnabled(true)).toBe(true);
    harness.screenTransceiver.mid = null;
    const remoteTrack = createRemoteTrack("video");
    const wrapper = { ...harness.screenTransceiver, receiver: { track: remoteTrack }, mid: null };

    harness.pc.ontrack?.({ track: remoteTrack, streams: [], transceiver: wrapper } as unknown as RTCTrackEvent);

    expect(harness.adapter.getRemoteScreenShareStream()?.getTracks()).toEqual([remoteTrack]);
    expect(harness.adapter.getRemoteScreenShareStream()).not.toBeNull();
  });

  it("moves an existing local screen sender onto the offer MID before creating a sendonly answer", async () => {
    const harness = createHarness();
    harness.getDisplayMedia.mockResolvedValue(displayStream(harness.screenTrack));
    await harness.adapter.prepareOffer();
    expect(harness.adapter.setRemoteScreenShareReceptionEnabled(true)).toBe(true);
    harness.screenTransceiver.mid = null;
    await harness.adapter.startScreenShare();
    const authoritative = {
      direction: "inactive" as RTCRtpTransceiverDirection,
      currentDirection: null as RTCRtpTransceiverDirection | null,
      mid: "1",
      sender: { track: null, replaceTrack: vi.fn(async (track) => { authoritative.sender.track = track; }) },
      receiver: { track: null },
    };
    harness.pc.setRemoteDescription = vi.fn(async (description: RTCSessionDescriptionInit) => {
      harness.pc.remoteDescription = description as RTCSessionDescription;
      harness.transceivers.push(authoritative);
    });
    harness.pc.createAnswer.mockResolvedValue({
      type: "answer",
      sdp: "v=0\r\nm=video 9 RTP/AVP 96\r\na=mid:1\r\na=sendonly\r\n",
    });

    await harness.adapter.applyRenegotiationOffer({
      type: "offer",
      sdp: "v=0\r\nm=video 9 RTP/AVP 96\r\na=mid:1\r\na=recvonly\r\n",
    });
    const answer = await harness.adapter.createRenegotiationAnswer();

    expect(harness.screenTransceiver.direction).toBe("inactive");
    expect(harness.screenSender.track).toBeNull();
    expect(authoritative.sender.track).toBe(harness.screenTrack);
    expect(authoritative.direction).toBe("sendonly");
    expect(answer.sdp).toContain("a=sendonly");
    expect(harness.pc.addTransceiver).toHaveBeenCalledTimes(1);
  });

  it("adopts equal-MID transceiver wrappers without requiring object identity", async () => {
    const diagnostics: Array<{ event: string; details: any }> = [];
    const harness = createHarness({ onDiagnostic: (event, details) => diagnostics.push({ event, details }) });
    await harness.adapter.prepareOffer();
    harness.adapter.setRemoteScreenShareReceptionEnabled(true);
    const eventTransceiver = { ...harness.screenTransceiver, mid: "1" };
    harness.pc.ontrack?.({ track: createRemoteTrack("video"), streams: [], transceiver: eventTransceiver } as unknown as RTCTrackEvent);

    const adoption = diagnostics.find(({ event, details }) => event === "remote_video_ontrack" && details.diagnosticStage === "association_checked" && details.associationAccepted);
    expect(adoption?.details).toMatchObject({
      diagnosticReason: "succeeded",
      eventTransceiverPresent: true,
      eventTransceiverMid: "1",
      expectedScreenTransceiverMid: "1",
      transceiverIdentityMatch: true,
      associationStrategy: "offer_mid",
      associationAccepted: true,
    });
    expect(harness.adapter.getRemoteScreenShareStream()).not.toBeNull();
  });

  it("records a fixed value for a missing event transceiver MID", async () => {
    const diagnostics: any[] = [];
    const harness = createHarness({ onDiagnostic: (_event, details) => diagnostics.push(details) });
    await harness.adapter.prepareOffer();
    harness.adapter.setRemoteScreenShareReceptionEnabled(true);
    harness.pc.ontrack?.({ track: createRemoteTrack("video"), streams: [], transceiver: { ...harness.screenTransceiver, mid: null } } as unknown as RTCTrackEvent);

    expect(diagnostics.find((details) => details.diagnosticStage === "association_rejected")).toMatchObject({
      eventTransceiverMid: null,
      expectedScreenTransceiverMid: "1",
      diagnosticReason: "transceiver_identity_mismatch",
    });
  });

  it.each([
    ["stream_constructor_failed", () => { throw new Error("constructor-secret"); }],
    ["add_track_failed", () => { throw new Error("add-track-secret"); }],
  ] as const)("records %s without exposing the exception", async (diagnosticReason, failure) => {
    const diagnostics: any[] = [];
    const harness = createHarness({ onDiagnostic: (_event, details) => diagnostics.push(details) });
    await harness.adapter.prepareOffer();
    harness.adapter.setRemoteScreenShareReceptionEnabled(true);
    if (diagnosticReason === "stream_constructor_failed") {
      harness.createRemoteStream.mockImplementationOnce(failure);
    } else {
      harness.createRemoteStream.mockImplementationOnce(() => ({ getTracks: () => [], addTrack: failure, removeTrack: vi.fn() }));
    }

    expect(() => harness.pc.ontrack?.({ track: createRemoteTrack("video"), streams: [], transceiver: harness.screenTransceiver } as unknown as RTCTrackEvent)).toThrow();
    expect(diagnostics).toContainEqual(expect.objectContaining({ diagnosticReason }));
    expect(JSON.stringify(diagnostics)).not.toContain("secret");
  });

  it("records listener and publication callback failures while preserving throws", async () => {
    const listenerDiagnostics: any[] = [];
    const listenerHarness = createHarness({ onDiagnostic: (_event, details) => listenerDiagnostics.push(details) });
    await listenerHarness.adapter.prepareOffer();
    listenerHarness.adapter.setRemoteScreenShareReceptionEnabled(true);
    const listenerTrack = createRemoteTrack("video");
    listenerTrack.addEventListener = () => { throw new Error("listener-secret"); };
    expect(() => listenerHarness.pc.ontrack?.({ track: listenerTrack, streams: [], transceiver: listenerHarness.screenTransceiver } as unknown as RTCTrackEvent)).toThrow("listener-secret");
    expect(listenerDiagnostics).toContainEqual(expect.objectContaining({ diagnosticReason: "listener_binding_failed" }));
    expect(JSON.stringify(listenerDiagnostics)).not.toContain("listener-secret");

    const callbackDiagnostics: any[] = [];
    const callbackHarness = createHarness({ onDiagnostic: (_event, details) => callbackDiagnostics.push(details) });
    const callbackAdapter = new DirectedCallWebRtcAdapter({
      dependencies: {
        getUserMedia: callbackHarness.getUserMedia,
        createPeerConnection: callbackHarness.createPeerConnection,
        createRemoteStream: callbackHarness.createRemoteStream,
      },
      onRemoteScreenShareChanged: () => { throw new Error("callback-secret"); },
      onDiagnostic: (_event, details) => callbackDiagnostics.push(details),
    });
    await callbackAdapter.prepareOffer();
    callbackAdapter.setRemoteScreenShareReceptionEnabled(true);
    expect(() => callbackHarness.pc.ontrack?.({ track: createRemoteTrack("video"), streams: [], transceiver: callbackHarness.screenTransceiver } as unknown as RTCTrackEvent)).toThrow("callback-secret");
    expect(callbackDiagnostics).toContainEqual(expect.objectContaining({ diagnosticReason: "publication_callback_failed" }));
    expect(JSON.stringify(callbackDiagnostics)).not.toContain("callback-secret");
  });

  it("summarizes every video transceiver and SDP video section with stable safe indices", async () => {
    const diagnostics: any[] = [];
    const harness = createHarness({ onDiagnostic: (_event, details) => diagnostics.push(details) });
    const secondTransceiver = {
      kind: "video" as const,
      mid: null,
      direction: "inactive" as RTCRtpTransceiverDirection,
      currentDirection: "inactive" as RTCRtpTransceiverDirection,
      sender: { track: null, replaceTrack: vi.fn().mockResolvedValue(undefined) },
      receiver: { track: null },
    };
    harness.transceivers.push(secondTransceiver as any);
    await harness.adapter.prepareOffer();
    harness.adapter.setRemoteScreenShareReceptionEnabled(true);
    harness.pc.createOffer.mockResolvedValueOnce({
      type: "offer",
      sdp: "v=0\r\nm=video 9 RTP/AVP 96\r\na=mid:screen\r\na=sendonly\r\nm=video 0 RTP/AVP 96\r\na=mid:backup\r\na=inactive\r\n",
    });
    await harness.adapter.createRenegotiationOffer();

    const snapshots = diagnostics.filter((details) => details.diagnosticStage === "before_create_offer");
    expect(snapshots.map((details) => details.videoTransceiverIndex)).toEqual([0, 1]);
    expect(snapshots.find((details) => details.selectedScreenTransceiver)).toMatchObject({ selectedScreenTransceiver: true, localScreenSenderTransceiver: false });
    const summaries = diagnostics.filter((details) => details.diagnosticStage === "sdp_summary" && details.diagnosticReason === "after_set_local_offer");
    expect(summaries).toEqual(expect.arrayContaining([
      expect.objectContaining({ videoMLineCount: 2, videoMLineIndex: 0, videoMLineMid: "screen", videoMLineDirection: "sendonly", videoMLineRejected: false }),
      expect.objectContaining({ videoMLineCount: 2, videoMLineIndex: 1, videoMLineMid: "backup", videoMLineDirection: "inactive", videoMLineRejected: true }),
    ]));
    expect(JSON.stringify(diagnostics)).not.toMatch(/v=0|candidate:|track_id|label=|device_id|stream_id|secret/i);
  });

  it("does not append diagnostics when the existing diagnostics gate is disabled", async () => {
    setCallDebugEnabled(false);
    resetDirectedCallDiagnosticTimeline();
    const harness = createHarness();
    await harness.adapter.prepareOffer();
    harness.adapter.setRemoteScreenShareReceptionEnabled(true);
    harness.pc.ontrack?.({ track: createRemoteTrack("video"), streams: [], transceiver: harness.screenTransceiver } as unknown as RTCTrackEvent);
    expect(getDirectedCallDiagnosticTimeline()).toEqual([]);
  });

  it("distinguishes remote ontrack from remote stream publication diagnostics", async () => {
    const diagnostics: string[] = [];
    const harness = createHarness({ onDiagnostic: (event) => diagnostics.push(event) });
    await harness.adapter.prepareOffer();
    const remoteTrack = createRemoteTrack("video");
    harness.pc.ontrack?.({ track: remoteTrack, streams: [], transceiver: harness.screenTransceiver } as unknown as RTCTrackEvent);

    expect(diagnostics[0]).toBe("remote_video_ontrack");
    expect(diagnostics).toContain("remote_screen_stream_created");
  });

  it("keeps remote screen ownership until committed inactive reconciliation", async () => {
    const harness = createHarness();
    const changes: Array<DirectedCallMediaStream | null> = [];
    harness.getDisplayMedia.mockResolvedValue(displayStream(harness.screenTrack));
    harness.adapter.onRemoteScreenShareChanged((stream) => changes.push(stream));
    await harness.adapter.prepareOffer();
    await harness.adapter.startScreenShare();
    const remoteTrack = createRemoteTrack("video");
    expect(harness.adapter.setRemoteScreenShareReceptionEnabled(true)).toBe(true);
    harness.pc.ontrack?.({ track: remoteTrack, streams: [], transceiver: harness.screenTransceiver } as unknown as RTCTrackEvent);
    const visibleStream = harness.adapter.getRemoteScreenShareStream();
    expect(visibleStream).not.toBeNull();

    expect(harness.adapter.setRemoteScreenShareReceptionEnabled(false)).toBe(true);
    expect(harness.adapter.getRemoteScreenShareStream()).toBe(visibleStream);
    expect(harness.adapter.setRemoteScreenShareReceptionEnabled(true)).toBe(true);
    expect(harness.adapter.getRemoteScreenShareStream()).toBe(visibleStream);
    expect(harness.screenTransceiver.direction).toBe("sendrecv");
    expect(harness.adapter.setRemoteScreenShareReceptionEnabled(false)).toBe(true);
    harness.adapter.reconcileRemoteScreenShareState(false);
    expect(harness.adapter.getRemoteScreenShareStream()).toBeNull();
    expect(changes).toHaveLength(2);
    expect(changes[1]).toBeNull();
    harness.adapter.reconcileRemoteScreenShareState(false);
    expect(changes).toHaveLength(2);
    expect(harness.screenTransceiver.direction).toBe("sendonly");

    expect(harness.adapter.setRemoteScreenShareReceptionEnabled(true)).toBe(true);
    expect(harness.screenTransceiver.direction).toBe("sendrecv");
    expect(harness.adapter.getRemoteScreenShareStream()).toBeNull();
    expect(harness.track.stop).not.toHaveBeenCalled();
  });

  it("does not let stale remote video populate a replacement adapter", async () => {
    const first = createHarness();
    await first.adapter.prepareOffer();
    const oldOnTrack = first.pc.ontrack;
    first.adapter.dispose();

    const second = createHarness();
    await second.adapter.prepareOffer();
    const staleTrack = createRemoteTrack("video");
    oldOnTrack?.({ track: staleTrack, streams: [], transceiver: first.screenTransceiver } as unknown as RTCTrackEvent);

    expect(first.adapter.getRemoteScreenShareStream()).toBeNull();
    expect(second.adapter.getRemoteScreenShareStream()).toBeNull();
    expect(second.pc.addTransceiver).not.toHaveBeenCalled();
  });

  it("clears remote screen ownership on disposal without disturbing audio cleanup", async () => {
    const harness = createHarness();
    const changes: Array<DirectedCallMediaStream | null> = [];
    harness.adapter.onRemoteScreenShareChanged((stream) => changes.push(stream));
    await harness.adapter.prepareOffer();
    const remoteTrack = createRemoteTrack("video");
    harness.pc.ontrack?.({ track: remoteTrack, streams: [], transceiver: { ...harness.screenTransceiver, direction: "recvonly" } } as unknown as RTCTrackEvent);
    expect(harness.adapter.getRemoteScreenShareStream()).not.toBeNull();

    harness.adapter.dispose();
    expect(harness.adapter.getRemoteScreenShareStream()).toBeNull();
    expect(changes).toHaveLength(1);
    expect(harness.track.stop).toHaveBeenCalledOnce();
    remoteTrack.emit("ended");
    expect(changes).toHaveLength(1);
  });

  it("preserves microphone ownership throughout screen-share operations", async () => {
    const harness = createHarness();
    harness.getDisplayMedia.mockResolvedValue(displayStream(harness.screenTrack));
    const onIceCandidate = vi.fn();
    const onPeerConnectionState = vi.fn();
    const adapter = new DirectedCallWebRtcAdapter({
      dependencies: { getUserMedia: harness.getUserMedia, getDisplayMedia: harness.getDisplayMedia, createPeerConnection: harness.createPeerConnection },
      onIceCandidate,
      onPeerConnectionState,
    });

    await adapter.prepareOffer();
    await adapter.startScreenShare();
    adapter.stopScreenShare();

    expect(harness.track.stop).not.toHaveBeenCalled();
    expect(harness.sender.track).toBe(harness.track);
    expect(harness.pc.addTrack).toHaveBeenCalledWith(harness.track, harness.stream);
    expect(harness.pc.addTrack).toHaveBeenCalledTimes(1);
    expect(harness.getUserMedia).toHaveBeenCalledTimes(1);
    expect(onIceCandidate).not.toHaveBeenCalled();
    expect(onPeerConnectionState).not.toHaveBeenCalled();
  });

  it("coalesces concurrent starts into one display capture operation", async () => {
    const harness = createHarness();
    let resolveDisplay!: (stream: any) => void;
    harness.getDisplayMedia.mockReturnValue(new Promise((resolve) => { resolveDisplay = resolve; }));
    const first = harness.adapter.startScreenShare();
    const second = harness.adapter.startScreenShare();
    await flushMicrotasks();
    expect(harness.getDisplayMedia).toHaveBeenCalledTimes(1);
    resolveDisplay(displayStream(harness.screenTrack));

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(harness.pc.addTransceiver).toHaveBeenCalledTimes(1);
    expect(harness.screenSender.replaceTrack).toHaveBeenCalledTimes(1);
  });

  it("leaves reusable state after display capture cancellation", async () => {
    const harness = createHarness();
    harness.getDisplayMedia.mockRejectedValueOnce(new DOMException("cancelled", "NotAllowedError"));
    await expect(harness.adapter.startScreenShare()).resolves.toBe(false);
    expect(harness.adapter.getLocalScreenShareStream()).toBeNull();
    expect(harness.pc.addTransceiver).not.toHaveBeenCalled();
    harness.getDisplayMedia.mockResolvedValueOnce(displayStream(harness.screenTrack));
    await expect(harness.adapter.startScreenShare()).resolves.toBe(true);
  });

  it("stops every returned track when display capture has no usable video", async () => {
    const harness = createHarness();
    const audioTrack = { kind: "audio", readyState: "live", stop: vi.fn() };
    harness.getDisplayMedia.mockResolvedValue(displayStream(audioTrack));

    await expect(harness.adapter.startScreenShare()).resolves.toBe(false);
    expect(audioTrack.stop).toHaveBeenCalledOnce();
    expect(harness.pc.addTransceiver).not.toHaveBeenCalled();
    expect(harness.screenSender.replaceTrack).not.toHaveBeenCalled();
    expect(harness.track.stop).not.toHaveBeenCalled();
  });

  it("explicitly stops screen media and is idempotent", async () => {
    const harness = createHarness();
    harness.getDisplayMedia.mockResolvedValue(displayStream(harness.screenTrack));
    await harness.adapter.startScreenShare();
    harness.adapter.stopScreenShare();
    harness.adapter.stopScreenShare();

    expect(harness.screenSender.replaceTrack).toHaveBeenCalledTimes(2);
    expect(harness.screenSender.replaceTrack).toHaveBeenCalledWith(null);
    expect(harness.screenTrack.stop).toHaveBeenCalledOnce();
    expect(harness.adapter.getLocalScreenShareStream()).toBeNull();
    expect(harness.track.stop).not.toHaveBeenCalled();
  });

  it("contains an explicit-stop screen detach rejection after deterministic cleanup", async () => {
    const harness = createHarness();
    const extraDisplayTrack = { stop: vi.fn() };
    harness.getDisplayMedia.mockResolvedValue(displayStream(harness.screenTrack, extraDisplayTrack));
    const onEnded = vi.fn();
    harness.adapter.onLocalScreenShareEnded(onEnded);
    await harness.adapter.startScreenShare();
    const detach = rejectingScreenDetach(harness);

    expect(() => harness.adapter.stopScreenShare()).not.toThrow();
    expect(harness.adapter.getLocalScreenShareStream()).toBeNull();
    expect(harness.screenTrack.stop).toHaveBeenCalledOnce();
    expect(extraDisplayTrack.stop).toHaveBeenCalledOnce();
    expect(harness.track.stop).not.toHaveBeenCalled();
    detach.rejectDetach(new Error("detach failed"));
    await flushMicrotasks();

    expect(detach.catchObserver).toHaveBeenCalledOnce();
    expect(onEnded).not.toHaveBeenCalled();
    expect(() => harness.adapter.stopScreenShare()).not.toThrow();
  });

  it("cleans browser-ended screen media and notifies exactly once", async () => {
    const harness = createHarness();
    const onEnded = vi.fn();
    harness.getDisplayMedia.mockResolvedValue(displayStream(harness.screenTrack));
    harness.adapter.onLocalScreenShareEnded(onEnded);
    await harness.adapter.startScreenShare();
    harness.screenTrack.readyState = "ended";
    harness.screenTrack.emit("ended");
    harness.screenTrack.emit("ended");

    expect(harness.screenSender.replaceTrack).toHaveBeenCalledWith(null);
    expect(harness.screenTrack.stop).toHaveBeenCalledOnce();
    expect(onEnded).toHaveBeenCalledOnce();
    expect(harness.adapter.getLocalScreenShareStream()).toBeNull();
    expect(harness.track.stop).not.toHaveBeenCalled();
  });

  it("contains a browser-ended screen detach rejection and preserves exactly-once notification", async () => {
    const harness = createHarness();
    const onEnded = vi.fn();
    harness.getDisplayMedia.mockResolvedValue(displayStream(harness.screenTrack));
    harness.adapter.onLocalScreenShareEnded(onEnded);
    await harness.adapter.startScreenShare();
    const detach = rejectingScreenDetach(harness);

    harness.screenTrack.emit("ended");
    expect(harness.adapter.getLocalScreenShareStream()).toBeNull();
    expect(harness.screenTrack.stop).toHaveBeenCalledOnce();
    expect(harness.track.stop).not.toHaveBeenCalled();
    detach.rejectDetach(new Error("detach failed"));
    await flushMicrotasks();
    harness.screenTrack.emit("ended");

    expect(detach.catchObserver).toHaveBeenCalledOnce();
    expect(onEnded).toHaveBeenCalledOnce();
  });

  it("does not notify when explicit stop causes an ended event", async () => {
    const harness = createHarness();
    const onEnded = vi.fn();
    harness.screenTrack.stop.mockImplementation(() => harness.screenTrack.emit("ended"));
    harness.getDisplayMedia.mockResolvedValue(displayStream(harness.screenTrack));
    harness.adapter.onLocalScreenShareEnded(onEnded);
    await harness.adapter.startScreenShare();
    harness.adapter.stopScreenShare();

    expect(onEnded).not.toHaveBeenCalled();
    expect(harness.screenSender.replaceTrack).toHaveBeenCalledTimes(2);
  });

  it("rejects a late display capture after stop without attaching stale media", async () => {
    const harness = createHarness();
    let resolveDisplay!: (stream: any) => void;
    harness.getDisplayMedia.mockReturnValue(new Promise((resolve) => { resolveDisplay = resolve; }));
    const operation = harness.adapter.startScreenShare();
    await flushMicrotasks();
    harness.adapter.stopScreenShare();
    const lateTrack = { ...harness.screenTrack, stop: vi.fn() };
    resolveDisplay(displayStream(lateTrack));

    await expect(operation).resolves.toBe(false);
    expect(lateTrack.stop).toHaveBeenCalledOnce();
    expect(harness.screenSender.replaceTrack).not.toHaveBeenCalled();
    expect(harness.adapter.getLocalScreenShareStream()).toBeNull();
  });

  it("stops a late display capture after disposal without creating screen state", async () => {
    const harness = createHarness();
    let resolveDisplay!: (stream: any) => void;
    harness.getDisplayMedia.mockReturnValue(new Promise((resolve) => { resolveDisplay = resolve; }));
    const onEnded = vi.fn();
    harness.adapter.onLocalScreenShareEnded(onEnded);
    const operation = harness.adapter.startScreenShare();
    await flushMicrotasks();
    harness.adapter.dispose();
    const lateTrack = { ...harness.screenTrack, stop: vi.fn() };
    resolveDisplay(displayStream(lateTrack));

    await expect(operation).resolves.toBe(false);
    expect(lateTrack.stop).toHaveBeenCalledOnce();
    expect(harness.pc.addTransceiver).not.toHaveBeenCalled();
    expect(onEnded).not.toHaveBeenCalled();
  });

  it("reuses one screen transceiver across explicit restart cycles", async () => {
    const harness = createHarness();
    const trackA = harness.screenTrack;
    const trackB = { ...harness.screenTrack, stop: vi.fn() };
    harness.getDisplayMedia.mockResolvedValueOnce(displayStream(trackA)).mockResolvedValueOnce(displayStream(trackB));

    await harness.adapter.startScreenShare();
    harness.adapter.stopScreenShare();
    await harness.adapter.startScreenShare();

    expect(trackA.stop).toHaveBeenCalledOnce();
    expect(trackB.stop).not.toHaveBeenCalled();
    expect(harness.pc.addTransceiver).toHaveBeenCalledTimes(1);
    expect(harness.screenSender.replaceTrack).toHaveBeenNthCalledWith(1, trackA);
    expect(harness.screenSender.replaceTrack).toHaveBeenNthCalledWith(2, null);
    expect(harness.screenSender.replaceTrack).toHaveBeenNthCalledWith(3, trackB);
    expect(harness.sender.track).toBe(harness.track);
  });

  it("restarts after browser-ended cleanup with the same transceiver", async () => {
    const harness = createHarness();
    const trackB = { ...harness.screenTrack, stop: vi.fn() };
    harness.getDisplayMedia.mockResolvedValueOnce(displayStream(harness.screenTrack)).mockResolvedValueOnce(displayStream(trackB));
    const onEnded = vi.fn();
    harness.adapter.onLocalScreenShareEnded(onEnded);

    await harness.adapter.startScreenShare();
    harness.screenTrack.emit("ended");
    await expect(harness.adapter.startScreenShare()).resolves.toBe(true);

    expect(onEnded).toHaveBeenCalledOnce();
    expect(harness.pc.addTransceiver).toHaveBeenCalledTimes(1);
    expect(harness.screenSender.track).toBe(trackB);
  });

  it("isolates disposed generation screen state from a fresh adapter", async () => {
    const first = createHarness();
    first.getDisplayMedia.mockResolvedValue(displayStream(first.screenTrack));
    const firstEnded = vi.fn();
    first.adapter.onLocalScreenShareEnded(firstEnded);
    await first.adapter.startScreenShare();
    first.adapter.dispose();

    const second = createHarness();
    second.getDisplayMedia.mockResolvedValue(displayStream(second.screenTrack));
    const secondEnded = vi.fn();
    second.adapter.onLocalScreenShareEnded(secondEnded);
    await second.adapter.startScreenShare();
    first.screenTrack.emit("ended");

    expect(first.screenTrack.stop).toHaveBeenCalledOnce();
    expect(firstEnded).not.toHaveBeenCalled();
    expect(second.adapter.getLocalScreenShareStream()).not.toBeNull();
    expect(secondEnded).not.toHaveBeenCalled();
  });

  it("stops active display media during full adapter disposal", async () => {
    const harness = createHarness();
    harness.getDisplayMedia.mockResolvedValue(displayStream(harness.screenTrack));
    await harness.adapter.startScreenShare();
    harness.adapter.dispose();

    expect(harness.screenTrack.stop).toHaveBeenCalledOnce();
    expect(harness.screenSender.replaceTrack).toHaveBeenCalledWith(null);
    expect(harness.track.stop).toHaveBeenCalledOnce();
    expect(harness.pc.close).toHaveBeenCalledOnce();
  });

  it("contains a disposal screen detach rejection while completing full cleanup", async () => {
    const harness = createHarness();
    const onEnded = vi.fn();
    harness.getDisplayMedia.mockResolvedValue(displayStream(harness.screenTrack));
    harness.adapter.onLocalScreenShareEnded(onEnded);
    await harness.adapter.startScreenShare();
    const detach = rejectingScreenDetach(harness);

    expect(() => harness.adapter.dispose()).not.toThrow();
    expect(harness.adapter.getLocalScreenShareStream()).toBeNull();
    expect(harness.screenTrack.stop).toHaveBeenCalledOnce();
    expect(harness.track.stop).toHaveBeenCalledOnce();
    expect(harness.pc.close).toHaveBeenCalledOnce();
    detach.rejectDetach(new Error("detach failed"));
    await flushMicrotasks();
    harness.adapter.dispose();

    expect(detach.catchObserver).toHaveBeenCalledOnce();
    expect(onEnded).not.toHaveBeenCalled();
    expect(harness.track.stop).toHaveBeenCalledOnce();
    expect(harness.pc.close).toHaveBeenCalledOnce();
  });

  it("keeps a restarted screen share isolated from a late rejected detach", async () => {
    const harness = createHarness();
    const trackA = harness.screenTrack;
    const trackB = { ...harness.screenTrack, stop: vi.fn() };
    const streamB = displayStream(trackB);
    const onEnded = vi.fn();
    harness.getDisplayMedia.mockResolvedValueOnce(displayStream(trackA)).mockResolvedValueOnce(streamB);
    harness.adapter.onLocalScreenShareEnded(onEnded);

    await harness.adapter.startScreenShare();
    const detach = rejectingScreenDetach(harness);
    harness.adapter.stopScreenShare();
    await expect(harness.adapter.startScreenShare()).resolves.toBe(true);
    detach.rejectDetach(new Error("late detach failed"));
    await flushMicrotasks();

    expect(detach.catchObserver).toHaveBeenCalledOnce();
    expect(harness.adapter.getLocalScreenShareStream()).toBe(streamB);
    expect(harness.screenSender.track).toBe(trackB);
    expect(trackA.stop).toHaveBeenCalledOnce();
    expect(trackB.stop).not.toHaveBeenCalled();
    expect(onEnded).not.toHaveBeenCalled();
    expect(harness.pc.addTransceiver).toHaveBeenCalledOnce();
  });
});
