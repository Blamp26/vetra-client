import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { SpeakingDetector, speakingDetectorConstants } from "./speakingDetector";

class FakeTrack extends EventTarget {
  kind = "audio";
  enabled = true;
  readyState = "live";
  muted = false;
}

class FakeStream extends EventTarget {
  private tracks: FakeTrack[];
  constructor(track: FakeTrack) {
    super();
    this.tracks = [track];
  }
  getTracks() { return [...this.tracks]; }
  addTrack(track: FakeTrack) {
    this.tracks.push(track);
    this.dispatchEvent(new Event("addtrack"));
  }
  removeTrack(track: FakeTrack) {
    this.tracks = this.tracks.filter((candidate) => candidate !== track);
    this.dispatchEvent(new Event("removetrack"));
  }
}

class FakeAnalyser {
  fftSize = 0;
  level = 128;
  getByteTimeDomainData(data: Uint8Array) { data.fill(this.level); }
  disconnect = vi.fn();
}

class FakeAudioContext {
  analyser = new FakeAnalyser();
  readonly analysers: FakeAnalyser[] = [];
  readonly sources: Array<{ connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
  createMediaStreamSource = vi.fn(() => {
    const source = { connect: vi.fn(), disconnect: vi.fn() };
    this.sources.push(source);
    return source;
  });
  createAnalyser = vi.fn(() => {
    this.analyser = new FakeAnalyser();
    this.analysers.push(this.analyser);
    return this.analyser;
  });
  resume = vi.fn(async () => undefined);
  close = vi.fn(async () => undefined);
}

function advance(ms: number) {
  vi.advanceTimersByTime(ms);
}

describe("SpeakingDetector", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("uses RMS threshold, EMA, activation delay, and release hysteresis", () => {
    const context = new FakeAudioContext();
    const changes: Array<{ localSpeaking: boolean; remoteSpeaking: boolean }> = [];
    const detector = new SpeakingDetector({
      createAudioContext: () => context,
      onChange: (projection) => changes.push(projection),
    });
    const track = new FakeTrack();
    detector.registerStream("remote", new FakeStream(track));

    context.analyser.level = 140;
    advance(speakingDetectorConstants.activationDelayMs);
    expect(detector.getSnapshot().remoteSpeaking).toBe(false);
    advance(speakingDetectorConstants.sampleIntervalMs * 2);
    expect(detector.getSnapshot().remoteSpeaking).toBe(true);

    context.analyser.level = 128;
    advance(speakingDetectorConstants.releaseDelayMs + speakingDetectorConstants.sampleIntervalMs * 6);
    expect(detector.getSnapshot().remoteSpeaking).toBe(false);
    expect(changes.some((change) => change.remoteSpeaking)).toBe(true);
    detector.dispose();
  });

  it("coalesces published updates to at most 15Hz", () => {
    const context = new FakeAudioContext();
    const changes = vi.fn();
    const detector = new SpeakingDetector({ createAudioContext: () => context, onChange: changes });
    detector.registerStream("remote", new FakeStream(new FakeTrack()));
    context.analyser.level = 140;
    advance(400);
    expect(changes.mock.calls.length).toBeLessThanOrEqual(1 + Math.ceil(400 / speakingDetectorConstants.publishIntervalMs));
    detector.dispose();
  });

  it("clears immediately for mute/end and replaces without duplicate analysers", () => {
    const context = new FakeAudioContext();
    const detector = new SpeakingDetector({ createAudioContext: () => context });
    const first = new FakeTrack();
    detector.registerStream("remote", new FakeStream(first));
    context.analyser.level = 140;
    advance(150);
    expect(detector.getSnapshot().remoteSpeaking).toBe(true);

    first.muted = true;
    first.dispatchEvent(new Event("mute"));
    expect(detector.getSnapshot().remoteSpeaking).toBe(false);

    const replacement = new FakeTrack();
    detector.registerStream("remote", new FakeStream(replacement));
    expect(context.createAnalyser).toHaveBeenCalledTimes(2);
    expect(context.sources[0].disconnect).toHaveBeenCalledTimes(1);
    expect(context.sources[1].disconnect).not.toHaveBeenCalled();
    expect((context.analyser.disconnect as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    replacement.readyState = "ended";
    replacement.dispatchEvent(new Event("ended"));
    expect(detector.getSnapshot().remoteSpeaking).toBe(false);
    detector.dispose();
    expect(context.sources[1].disconnect).toHaveBeenCalledTimes(1);
  });

  it("re-registers a same-identity stream after removal and replacement", () => {
    const context = new FakeAudioContext();
    const detector = new SpeakingDetector({ createAudioContext: () => context });
    const first = new FakeTrack();
    const stream = new FakeStream(first);
    detector.registerStream("remote", stream);
    stream.removeTrack(first);
    expect(detector.getSnapshot().remoteSpeaking).toBe(false);
    expect(context.sources[0].disconnect).toHaveBeenCalledTimes(1);
    const replacement = new FakeTrack();
    stream.addTrack(replacement);
    expect(context.createAnalyser).toHaveBeenCalledTimes(2);
    expect(context.sources[1].disconnect).not.toHaveBeenCalled();
    stream.addTrack(new FakeTrack());
    expect(context.createAnalyser).toHaveBeenCalledTimes(2);
    detector.dispose();
    expect(context.sources[1].disconnect).toHaveBeenCalledTimes(1);
  });

  it("disconnects both nodes after partial registration failure", () => {
    const context = new FakeAudioContext();
    context.sources.push({ connect: vi.fn(() => { throw new Error("connect failed"); }), disconnect: vi.fn() });
    context.createMediaStreamSource = vi.fn(() => context.sources[0]) as typeof context.createMediaStreamSource;
    const detector = new SpeakingDetector({ createAudioContext: () => context });
    detector.registerStream("remote", new FakeStream(new FakeTrack()));
    expect(context.sources[0].disconnect).toHaveBeenCalledTimes(1);
    expect(context.analyser.disconnect).toHaveBeenCalledTimes(1);
    detector.dispose();
  });

  it("forces local mute false, keeps remote detection while deafened, and pauses while hidden", () => {
    const context = new FakeAudioContext();
    const detector = new SpeakingDetector({ createAudioContext: () => context });
    const local = new FakeTrack();
    const remote = new FakeTrack();
    detector.registerStream("local", new FakeStream(local));
    detector.registerStream("remote", new FakeStream(remote));
    context.analysers.forEach((analyser) => { analyser.level = 140; });
    advance(150);
    expect(detector.getSnapshot()).toEqual({ localSpeaking: true, remoteSpeaking: true });

    detector.setLocalMuted(true);
    expect(detector.getSnapshot().localSpeaking).toBe(false);
    expect(detector.getSnapshot().remoteSpeaking).toBe(true);

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(detector.getSnapshot()).toEqual({ localSpeaking: false, remoteSpeaking: false });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(detector.getSnapshot()).toEqual({ localSpeaking: false, remoteSpeaking: false });
    detector.dispose();
  });
});
