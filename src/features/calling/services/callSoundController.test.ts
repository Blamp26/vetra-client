import { afterEach, describe, expect, it, vi } from "vitest";
import { CallSoundController, legacyCallSoundEvent, persistentCallSoundEvent } from "./callSoundController";

type FakeAudio = HTMLAudioElement & {
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  setSinkId: ReturnType<typeof vi.fn>;
};

function audioFactory(play?: ReturnType<typeof vi.fn>) {
  const audios: FakeAudio[] = [];
  return {
    audios,
    create: (src: string) => {
      const audio = {
        src,
        preload: "",
        volume: 1,
        loop: false,
        currentTime: 0,
        setAttribute: vi.fn(),
        load: vi.fn(),
        play: play ?? vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
        setSinkId: vi.fn().mockResolvedValue(undefined),
      } as unknown as FakeAudio;
      audios.push(audio);
      return audio;
    },
  };
}

function target() {
  const listeners = new Map<string, EventListener>();
  return {
    addEventListener: vi.fn((name: string, listener: EventListener) => listeners.set(name, listener)),
    removeEventListener: vi.fn((name: string) => listeners.delete(name)),
    fire: (name: string) => listeners.get(name)?.(new Event(name)),
    listeners,
  };
}

async function flushAudio(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

afterEach(() => vi.restoreAllMocks());

describe("CallSoundController", () => {
  it("preserves legacy cleanup reasons as client-only sound events", () => {
    expect(legacyCallSoundEvent("a", "reject_call")).toEqual({ type: "ended", callKey: "a", reason: "declined" });
    expect(legacyCallSoundEvent("a", "outgoing_call_timeout")).toEqual({ type: "ended", callKey: "a", reason: "no_answer" });
    expect(legacyCallSoundEvent("a", "local_hang_up")).toEqual({ type: "ended", callKey: "a", reason: "cancelled" });
    expect(legacyCallSoundEvent("a", "call_channel_closed")).toEqual({ type: "failed", callKey: "a", reason: "transport" });
    expect(legacyCallSoundEvent("a", "accept_call_failed")).toEqual({ type: "failed", callKey: "a", reason: "connection_failed" });
  });

  it("maps authoritative persistent transitions and deduplicates one-shots", async () => {
    expect(persistentCallSoundEvent(null, { callId: "a", canonicalState: "delivered", participantRole: "recipient" })).toBeNull();
    expect(persistentCallSoundEvent(null, { callId: "a", canonicalState: "presented", participantRole: "recipient" })).toMatchObject({ type: "ringing_started", direction: "incoming" });
    expect(persistentCallSoundEvent({ callId: "a", state: "presented", participantRole: "recipient" }, { callId: "a", canonicalState: "connecting", participantRole: "recipient" })).toMatchObject({ type: "ringing_stopped" });

    const factory = audioFactory();
    const controller = new CallSoundController({ scopeKey: "scope", createAudio: factory.create });
    controller.handle({ type: "ringing_started", callKey: "a", direction: "outgoing" });
    await flushAudio();
    expect(factory.audios[1].loop).toBe(true);
    controller.handle({ type: "connected", callKey: "a" });
    controller.handle({ type: "connected", callKey: "a" });
    await flushAudio();
    expect(factory.audios[2].play).toHaveBeenCalledTimes(1);
    expect(factory.audios[1].pause).toHaveBeenCalled();
    controller.handle({ type: "ended", callKey: "a", reason: "ended" });
    controller.handle({ type: "ended", callKey: "a", reason: "ended" });
    await flushAudio();
    expect(factory.audios[3].play).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it("fences stale play completion during rapid call replacement", async () => {
    let resolvePlay!: () => void;
    const play = vi.fn(() => new Promise<void>((resolve) => { resolvePlay = resolve; }));
    const factory = audioFactory(play);
    const controller = new CallSoundController({ scopeKey: "scope", createAudio: factory.create });
    controller.handle({ type: "ringing_started", callKey: "old", direction: "incoming" });
    controller.handle({ type: "ringing_started", callKey: "new", direction: "outgoing" });
    await flushAudio();
    resolvePlay();
    await flushAudio();
    expect(factory.audios[1].pause).toHaveBeenCalled();
    expect(controller.getSnapshot().autoplayBlocked).toBe(false);
    controller.dispose();
  });

  it("ignores a stale autoplay rejection from a replaced call", async () => {
    const deferred: Array<{ resolve: () => void; reject: (error: unknown) => void }> = [];
    const play = vi.fn(() => new Promise<void>((resolve, reject) => deferred.push({ resolve, reject })));
    const factory = audioFactory(play);
    const events = target();
    const controller = new CallSoundController({ scopeKey: "scope", createAudio: factory.create, eventTarget: events });
    controller.handle({ type: "ringing_started", callKey: "old", direction: "incoming" });
    await flushAudio();
    controller.handle({ type: "ringing_started", callKey: "new", direction: "outgoing" });
    await flushAudio();
    deferred[0]?.reject(new DOMException("blocked", "NotAllowedError"));
    await flushAudio();
    expect(controller.getSnapshot().autoplayBlocked).toBe(false);
    expect(events.addEventListener).not.toHaveBeenCalled();
    deferred[1]?.resolve();
    await flushAudio();
    controller.dispose();
  });

  it.each(["incoming", "outgoing"] as const)("does not replay repeated %s ringing events", async (direction) => {
    const factory = audioFactory();
    const controller = new CallSoundController({ scopeKey: "scope", createAudio: factory.create });
    controller.handle({ type: "ringing_started", callKey: "a", direction });
    await flushAudio();
    const ringtone = direction === "incoming" ? factory.audios[0] : factory.audios[1];
    ringtone.pause.mockClear();
    ringtone.play.mockClear();
    ringtone.currentTime = 0.4;
    controller.handle({ type: "ringing_started", callKey: "a", direction });
    await flushAudio();
    expect(ringtone.play).not.toHaveBeenCalled();
    expect(ringtone.pause).not.toHaveBeenCalled();
    expect(ringtone.currentTime).toBe(0.4);
    controller.dispose();
  });

  it.each(["ended", "failed"] as const)("does not retain recovery after blocked terminal %s tone", async (type) => {
    const blocked = vi.fn().mockRejectedValue(new DOMException("blocked", "NotAllowedError"));
    const factory = audioFactory(blocked);
    const events = target();
    const controller = new CallSoundController({ scopeKey: "scope", createAudio: factory.create, eventTarget: events });
    controller.handle(type === "ended"
      ? { type, callKey: "a", reason: "ended" }
      : { type, callKey: "a", reason: "transport" });
    await flushAudio();
    await flushAudio();
    expect(controller.getSnapshot().autoplayBlocked).toBe(false);
    expect(events.addEventListener).not.toHaveBeenCalled();
    expect(controller.getSnapshot().enableCallSounds()).resolves.toBe(false);
    controller.dispose();
  });

  it.each([
    ["connected", { type: "connected", callKey: "a" }, 2],
    ["ended", { type: "ended", callKey: "a", reason: "ended" }, 3],
    ["failed", { type: "failed", callKey: "a", reason: "transport" }, 4],
  ] as const)("suppresses an active %s tone without replaying it", async (_name, event, audioIndex) => {
    const factory = audioFactory();
    const controller = new CallSoundController({ scopeKey: "scope", createAudio: factory.create });
    controller.handle(event);
    await flushAudio();
    const audio = factory.audios[audioIndex];
    expect(audio.play).toHaveBeenCalledTimes(1);
    controller.setProjection({ deafened: true });
    expect(audio.pause).toHaveBeenCalled();
    expect(audio.currentTime).toBe(0);
    controller.setProjection({ deafened: false });
    await flushAudio();
    expect(audio.play).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it("fences a one-shot play completion after suppression", async () => {
    let resolvePlay!: () => void;
    const play = vi.fn(() => new Promise<void>((resolve) => { resolvePlay = resolve; }));
    const factory = audioFactory(play);
    const events = target();
    const controller = new CallSoundController({ scopeKey: "scope", createAudio: factory.create, eventTarget: events });
    controller.handle({ type: "connected", callKey: "a" });
    await flushAudio();
    controller.setProjection({ soundEnabled: false });
    resolvePlay();
    await flushAudio();
    expect(controller.getSnapshot().autoplayBlocked).toBe(false);
    expect(events.addEventListener).not.toHaveBeenCalled();
    controller.dispose();
  });

  it.each(["incoming", "outgoing"] as const)("preserves %s ringtone eligibility across suppression and duplicate snapshots", async (direction) => {
    const factory = audioFactory();
    const controller = new CallSoundController({ scopeKey: "scope", createAudio: factory.create });
    const event = { type: "ringing_started" as const, callKey: "a", direction };
    controller.handle(event);
    await flushAudio();
    const audio = factory.audios[direction === "incoming" ? 0 : 1];
    controller.setProjection({ deafened: true });
    audio.play.mockClear();
    audio.pause.mockClear();
    audio.currentTime = 0.4;
    controller.handle(event);
    controller.handle(event);
    expect(audio.play).not.toHaveBeenCalled();
    expect(audio.pause).not.toHaveBeenCalled();
    expect(audio.currentTime).toBe(0.4);
    controller.setProjection({ deafened: false });
    await flushAudio();
    expect(audio.play).toHaveBeenCalledTimes(1);
    controller.setProjection({ deafened: false });
    await flushAudio();
    expect(audio.play).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it("does not resume a ringtone after a real stop during suppression", async () => {
    const factory = audioFactory();
    const controller = new CallSoundController({ scopeKey: "scope", createAudio: factory.create });
    controller.handle({ type: "ringing_started", callKey: "a", direction: "incoming" });
    await flushAudio();
    const audio = factory.audios[0];
    controller.setProjection({ deafened: true });
    controller.handle({ type: "ringing_stopped", callKey: "a" });
    controller.setProjection({ deafened: false });
    await flushAudio();
    expect(audio.play).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it("does not resume the old call after replacement during suppression", async () => {
    const factory = audioFactory();
    const controller = new CallSoundController({ scopeKey: "scope", createAudio: factory.create });
    controller.handle({ type: "ringing_started", callKey: "old", direction: "incoming" });
    await flushAudio();
    const oldAudio = factory.audios[0];
    controller.setProjection({ deafened: true });
    controller.handle({ type: "ringing_started", callKey: "new", direction: "outgoing" });
    await flushAudio();
    const newAudio = factory.audios[1];
    controller.setProjection({ deafened: false });
    await flushAudio();
    expect(oldAudio.play).toHaveBeenCalledTimes(1);
    expect(newAudio.play).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it("recovers one blocked play from one gesture and cleans listeners", async () => {
    const blocked = vi.fn()
      .mockRejectedValueOnce(new DOMException("blocked", "NotAllowedError"))
      .mockResolvedValue(undefined);
    const factory = audioFactory(blocked);
    const events = target();
    const controller = new CallSoundController({ scopeKey: "scope", createAudio: factory.create, eventTarget: events });
    controller.handle({ type: "ringing_started", callKey: "a", direction: "incoming" });
    await flushAudio();
    await flushAudio();
    expect(controller.getSnapshot().autoplayBlocked).toBe(true);
    expect(events.addEventListener).toHaveBeenCalledTimes(3);
    events.fire("pointerdown");
    await flushAudio();
    await flushAudio();
    expect(blocked).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().autoplayBlocked).toBe(false);
    expect(events.removeEventListener).toHaveBeenCalledTimes(3);
    controller.dispose();
  });

  it("routes every element and persists fallback only after default succeeds", async () => {
    const factory = audioFactory();
    const setOutputDeviceId = vi.fn();
    const fallback = vi.fn();
    factory.audios;
    const controller = new CallSoundController({
      scopeKey: "scope",
      createAudio: factory.create,
      getOutputDeviceId: () => "missing",
      setOutputDeviceId,
      onOutputDeviceFallback: fallback,
    });
    factory.audios.forEach((audio) => {
      audio.setSinkId
        .mockRejectedValueOnce(new DOMException("missing", "NotFoundError"))
        .mockResolvedValue(undefined);
    });
    controller.handle({ type: "ringing_started", callKey: "a", direction: "outgoing" });
    await flushAudio();
    await flushAudio();
    expect(factory.audios[1].setSinkId).toHaveBeenNthCalledWith(1, "missing");
    expect(factory.audios[1].setSinkId).toHaveBeenNthCalledWith(2, "default");
    expect(setOutputDeviceId).toHaveBeenCalledWith("default");
    expect(fallback).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it("keeps unsupported and security routing failures diagnostic-only", async () => {
    const factory = audioFactory();
    const diagnostics = vi.fn();
    const controller = new CallSoundController({ scopeKey: "scope", createAudio: factory.create, onDiagnostic: diagnostics });
    factory.audios[0].setSinkId.mockRejectedValue(new DOMException("unsupported", "NotSupportedError"));
    controller.handle({ type: "ringing_started", callKey: "a", direction: "incoming" });
    await flushAudio();
    expect(factory.audios[0].setSinkId).toHaveBeenCalledTimes(1);
    expect(diagnostics).toHaveBeenCalledWith("call_sound_output_route_failed", expect.anything());
    controller.dispose();
  });

  it("applies volume, suppresses while deafened, and resumes only eligible ringing", async () => {
    let soundEnabled = true;
    let deafened = false;
    const factory = audioFactory();
    const controller = new CallSoundController({
      scopeKey: "scope",
      createAudio: factory.create,
      getOutputVolume: () => 0.35,
      isSoundEnabled: () => soundEnabled,
      isDeafened: () => deafened,
    });
    controller.handle({ type: "ringing_started", callKey: "a", direction: "incoming" });
    await flushAudio();
    expect(factory.audios[0].volume).toBeCloseTo(0.35);
    deafened = true;
    controller.setProjection({ deafened: true, soundEnabled });
    expect(factory.audios[0].pause).toHaveBeenCalled();
    deafened = false;
    controller.setProjection({ deafened: false, soundEnabled });
    await flushAudio();
    expect(factory.audios[0].play).toHaveBeenCalledTimes(2);
    soundEnabled = false;
    controller.setProjection({ soundEnabled: false, deafened: false });
    expect(factory.audios[0].pause).toHaveBeenCalledTimes(3);
    controller.dispose();
  });
});
