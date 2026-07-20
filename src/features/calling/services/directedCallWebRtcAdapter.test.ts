import { describe, expect, it, vi } from "vitest";
import { DirectedCallWebRtcAdapter, DirectedCallWebRtcError } from "./directedCallWebRtcAdapter";

function createHarness() {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] };
  const pc = {
    localDescription: null as RTCSessionDescription | null,
    remoteDescription: null as RTCSessionDescription | null,
    onicecandidate: null as ((event: RTCPeerConnectionIceEvent) => void) | null,
    ontrack: null as ((event: RTCTrackEvent) => void) | null,
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

    expect(harness.getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
    expect(harness.createPeerConnection).toHaveBeenCalledTimes(1);
    expect(harness.pc.createOffer).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(harness.pc.addTrack).toHaveBeenCalledTimes(1);
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
});
