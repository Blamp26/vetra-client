import { describe, expect, it, vi } from "vitest";
import { DirectedCallWebRtcAdapter, DirectedCallWebRtcError, DirectedCallWebRtcStaleError } from "./directedCallWebRtcAdapter";

function createHarness() {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] };
  const pc = {
    localDescription: null as RTCSessionDescription | null,
    remoteDescription: null as RTCSessionDescription | null,
    connectionState: "new" as RTCPeerConnectionState,
    onicecandidate: null as ((event: RTCPeerConnectionIceEvent) => void) | null,
    ontrack: null as ((event: RTCTrackEvent) => void) | null,
    onconnectionstatechange: null as (() => void) | null,
    addTrack: vi.fn(),
    createOffer: vi.fn().mockResolvedValue({ type: "offer", sdp: "offer" }),
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
  const createPeerConnection = vi.fn(() => pc);
  const adapter = new DirectedCallWebRtcAdapter({ dependencies: { getUserMedia, createPeerConnection } });
  return { adapter, pc, track, stream, getUserMedia, createPeerConnection };
}

describe("DirectedCallWebRtcAdapter", () => {
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
});
