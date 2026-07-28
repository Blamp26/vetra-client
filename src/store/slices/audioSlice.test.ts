import { describe, expect, it, vi } from "vitest";
import { createAudioSlice, invalidateAudioDeviceRefreshes } from "./audioSlice";
import { mediaSettingsStore } from "@/shared/utils/mediaSettings";

describe("createAudioSlice", () => {
  it("uses the expected defaults for microphone preferences", () => {
    let state: any = {};
    const set = vi.fn((updater: any) => {
      state =
        typeof updater === "function"
          ? { ...state, ...updater(state) }
          : { ...state, ...updater };
    });

    const slice = createAudioSlice(set as any, () => state as any, {} as any);

    expect(slice).not.toHaveProperty("selectedInputDeviceId");
    expect(slice).not.toHaveProperty("selectedOutputDeviceId");
    expect(slice.noiseSuppression).toBe(true);
    expect(slice.echoCancellation).toBe(true);
    expect(slice.autoGainControl).toBe(true);
  });

  it("updates microphone processing preferences through setters", () => {
    let state: any = {};
    const set = vi.fn((updater: any) => {
      state =
        typeof updater === "function"
          ? { ...state, ...updater(state) }
          : { ...state, ...updater };
    });

    const slice = createAudioSlice(set as any, () => state as any, {} as any);

    slice.setNoiseSuppression(false);
    expect(state.noiseSuppression).toBe(false);

    slice.setEchoCancellation(false);
    expect(state.echoCancellation).toBe(false);

    slice.setAutoGainControl(false);
    expect(state.autoGainControl).toBe(false);
  });

  it("falls back missing saved devices to the system defaults after enumeration", async () => {
    mediaSettingsStore.setInputDeviceId("missing-input");
    mediaSettingsStore.setOutputDeviceId("missing-output");
    let state: any = {};
    const set = vi.fn((updater: any) => {
      state = typeof updater === "function" ? { ...state, ...updater(state) } : { ...state, ...updater };
    });
    const mediaDevices = {
      enumerateDevices: vi.fn().mockResolvedValue([
        { kind: "audioinput", deviceId: "default", label: "Default microphone" },
        { kind: "audiooutput", deviceId: "default", label: "Default speakers" },
      ]),
    };
    Object.defineProperty(global.navigator, "mediaDevices", { value: mediaDevices, configurable: true });
    const slice = createAudioSlice(set as any, () => state as any, {} as any);

    await expect(slice.refreshDevices()).resolves.toMatchObject({
      inputDeviceFallback: true,
      outputDeviceFallback: true,
    });
    expect(mediaSettingsStore.getSnapshot().preferences.inputDeviceId).toBe("default");
    expect(mediaSettingsStore.getSnapshot().preferences.outputDeviceId).toBe("default");
  });

  it("coalesces pending passive refreshes and marks the older caller stale", async () => {
    mediaSettingsStore.reset();
    let resolveFirst!: (devices: MediaDeviceInfo[]) => void;
    const enumerateDevices = vi.fn()
      .mockReturnValueOnce(new Promise<MediaDeviceInfo[]>((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce([{ kind: "audioinput", deviceId: "default", label: "Default" }]);
    Object.defineProperty(global.navigator, "mediaDevices", { value: { enumerateDevices }, configurable: true });
    let state: any = {};
    const set = vi.fn((updater: any) => {
      state = typeof updater === "function" ? { ...state, ...updater(state) } : { ...state, ...updater };
    });
    const slice = createAudioSlice(set as any, () => state as any, {} as any);

    const first = slice.refreshDevices({ source: "devicechange" });
    const second = slice.refreshDevices({ source: "devicechange" });
    resolveFirst([{ kind: "audioinput", deviceId: "missing-input", label: "Old" } as MediaDeviceInfo]);

    await expect(first).resolves.toMatchObject({ committed: false });
    await expect(second).resolves.toMatchObject({ committed: true });
    expect(enumerateDevices).toHaveBeenCalledTimes(2);
  });

  it("keeps permission refreshes as barriers ahead of passive work", async () => {
    mediaSettingsStore.reset();
    let resolvePermission!: (stream: MediaStream) => void;
    const track = { stop: vi.fn() };
    const getUserMedia = vi.fn(() => new Promise<MediaStream>((resolve) => { resolvePermission = resolve; }));
    const enumerateDevices = vi.fn().mockResolvedValue([
      { kind: "audioinput", deviceId: "default", label: "Default" },
    ]);
    Object.defineProperty(global.navigator, "mediaDevices", { value: { getUserMedia, enumerateDevices }, configurable: true });
    let state: any = {};
    const set = vi.fn((updater: any) => {
      state = typeof updater === "function" ? { ...state, ...updater(state) } : { ...state, ...updater };
    });
    const slice = createAudioSlice(set as any, () => state as any, {} as any);

    const permission = slice.refreshDevices({ requestPermission: true, source: "permission" });
    const passive = slice.refreshDevices({ source: "devicechange" });
    expect(enumerateDevices).not.toHaveBeenCalled();

    resolvePermission({ getTracks: () => [track] } as unknown as MediaStream);
    await expect(permission).resolves.toMatchObject({ committed: true, permissionState: "granted" });
    await expect(passive).resolves.toMatchObject({ committed: true });
    expect(track.stop).toHaveBeenCalledOnce();
    expect(enumerateDevices).toHaveBeenCalledTimes(2);
  });

  it("does not let a stale inventory write fallback preferences", async () => {
    mediaSettingsStore.setInputDeviceId("missing-input");
    let resolveFirst!: (devices: MediaDeviceInfo[]) => void;
    let resolveSecond!: (devices: MediaDeviceInfo[]) => void;
    const enumerateDevices = vi.fn()
      .mockReturnValueOnce(new Promise<MediaDeviceInfo[]>((resolve) => { resolveFirst = resolve; }))
      .mockReturnValueOnce(new Promise<MediaDeviceInfo[]>((resolve) => { resolveSecond = resolve; }));
    Object.defineProperty(global.navigator, "mediaDevices", { value: { enumerateDevices }, configurable: true });
    let state: any = {};
    const set = vi.fn((updater: any) => {
      state = typeof updater === "function" ? { ...state, ...updater(state) } : { ...state, ...updater };
    });
    const slice = createAudioSlice(set as any, () => state as any, {} as any);

    const stale = slice.refreshDevices({ source: "devicechange" });
    const current = slice.refreshDevices({ source: "settings" });
    resolveFirst([{ kind: "audioinput", deviceId: "default", label: "Default" } as MediaDeviceInfo]);
    await expect(stale).resolves.toMatchObject({ committed: false });
    expect(mediaSettingsStore.getSnapshot().preferences.inputDeviceId).toBe("missing-input");

    resolveSecond([{ kind: "audioinput", deviceId: "missing-input", label: "Returned" } as MediaDeviceInfo]);
    await expect(current).resolves.toMatchObject({ committed: true });
    expect(mediaSettingsStore.getSnapshot().preferences.inputDeviceId).toBe("missing-input");
    mediaSettingsStore.reset();
  });

  it("invalidates observer work without cancelling manual refreshes", async () => {
    mediaSettingsStore.setInputDeviceId("missing-input");
    let resolveObserver!: (devices: MediaDeviceInfo[]) => void;
    const enumerateDevices = vi.fn()
      .mockReturnValueOnce(new Promise<MediaDeviceInfo[]>((resolve) => { resolveObserver = resolve; }))
      .mockResolvedValueOnce([{ kind: "audioinput", deviceId: "missing-input", label: "Returned" }]);
    Object.defineProperty(global.navigator, "mediaDevices", { value: { enumerateDevices }, configurable: true });
    let state: any = {};
    const set = vi.fn((updater: any) => {
      state = typeof updater === "function" ? { ...state, ...updater(state) } : { ...state, ...updater };
    });
    const slice = createAudioSlice(set as any, () => state as any, {} as any);
    const observerScope = Symbol("observer");

    const observerRefresh = slice.refreshDevices({ source: "devicechange", observerScope });
    const manualRefresh = slice.refreshDevices({ source: "settings" });
    invalidateAudioDeviceRefreshes(observerScope);
    resolveObserver([{ kind: "audioinput", deviceId: "default", label: "Default" } as MediaDeviceInfo]);

    await expect(observerRefresh).resolves.toMatchObject({ committed: false });
    await expect(manualRefresh).resolves.toMatchObject({ committed: true });
    expect(mediaSettingsStore.getSnapshot().preferences.inputDeviceId).toBe("missing-input");
    expect(state.availableInputDevices[0].deviceId).toBe("missing-input");
    mediaSettingsStore.reset();
  });

  it("does not cancel a permission barrier when an observer scope stops", async () => {
    mediaSettingsStore.reset();
    let resolvePermission!: (stream: MediaStream) => void;
    const track = { stop: vi.fn() };
    const getUserMedia = vi.fn(() => new Promise<MediaStream>((resolve) => { resolvePermission = resolve; }));
    const enumerateDevices = vi.fn().mockResolvedValue([
      { kind: "audioinput", deviceId: "default", label: "Default" },
    ]);
    Object.defineProperty(global.navigator, "mediaDevices", { value: { getUserMedia, enumerateDevices }, configurable: true });
    let state: any = {};
    const set = vi.fn((updater: any) => {
      state = typeof updater === "function" ? { ...state, ...updater(state) } : { ...state, ...updater };
    });
    const slice = createAudioSlice(set as any, () => state as any, {} as any);

    const permissionRefresh = slice.refreshDevices({ requestPermission: true, source: "permission" });
    invalidateAudioDeviceRefreshes(Symbol("different-observer"));
    resolvePermission({ getTracks: () => [track] } as unknown as MediaStream);

    await expect(permissionRefresh).resolves.toMatchObject({ committed: true, permissionState: "granted" });
    expect(track.stop).toHaveBeenCalledOnce();
    expect(state.availableInputDevices[0].deviceId).toBe("default");
    mediaSettingsStore.reset();
  });

  it("keeps a new observer scope valid after the old scope stops", async () => {
    mediaSettingsStore.setInputDeviceId("missing-input");
    let resolveA!: (devices: MediaDeviceInfo[]) => void;
    let resolveB!: (devices: MediaDeviceInfo[]) => void;
    const enumerateDevices = vi.fn()
      .mockReturnValueOnce(new Promise<MediaDeviceInfo[]>((resolve) => { resolveA = resolve; }))
      .mockReturnValueOnce(new Promise<MediaDeviceInfo[]>((resolve) => { resolveB = resolve; }));
    Object.defineProperty(global.navigator, "mediaDevices", { value: { enumerateDevices }, configurable: true });
    let state: any = {};
    const set = vi.fn((updater: any) => {
      state = typeof updater === "function" ? { ...state, ...updater(state) } : { ...state, ...updater };
    });
    const slice = createAudioSlice(set as any, () => state as any, {} as any);
    const scopeA = Symbol("observer-a");
    const scopeB = Symbol("observer-b");

    const refreshA = slice.refreshDevices({ source: "devicechange", observerScope: scopeA });
    invalidateAudioDeviceRefreshes(scopeA);
    const refreshB = slice.refreshDevices({ source: "devicechange", observerScope: scopeB });
    resolveA([{ kind: "audioinput", deviceId: "default", label: "Old" } as MediaDeviceInfo]);
    resolveB([{ kind: "audioinput", deviceId: "missing-input", label: "Current" } as MediaDeviceInfo]);

    await expect(refreshA).resolves.toMatchObject({ committed: false });
    await expect(refreshB).resolves.toMatchObject({ committed: true });
    expect(state.availableInputDevices[0].label).toBe("Current");
    expect(mediaSettingsStore.getSnapshot().preferences.inputDeviceId).toBe("missing-input");
    mediaSettingsStore.reset();
  });

  it("returns unavailable without mutating lists or preferences when mediaDevices is absent", async () => {
    mediaSettingsStore.setInputDeviceId("saved-input");
    mediaSettingsStore.setOutputDeviceId("saved-output");
    Object.defineProperty(global.navigator, "mediaDevices", { value: undefined, configurable: true });
    let state: any = { availableInputDevices: [{ deviceId: "existing" }], availableOutputDevices: [{ deviceId: "existing" }] };
    const set = vi.fn((updater: any) => {
      state = typeof updater === "function" ? { ...state, ...updater(state) } : { ...state, ...updater };
    });
    const slice = createAudioSlice(set as any, () => state as any, {} as any);

    await expect(slice.refreshDevices()).resolves.toMatchObject({ permissionState: "unavailable", committed: false });
    expect(set).not.toHaveBeenCalled();
    expect(mediaSettingsStore.getSnapshot().preferences.inputDeviceId).toBe("saved-input");
    expect(mediaSettingsStore.getSnapshot().preferences.outputDeviceId).toBe("saved-output");
    mediaSettingsStore.reset();
  });

  it("releases the queue after getUserMedia rejection", async () => {
    const enumerateDevices = vi.fn().mockResolvedValue([{ kind: "audioinput", deviceId: "default", label: "Default" }]);
    const getUserMedia = vi.fn().mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
    Object.defineProperty(global.navigator, "mediaDevices", { value: { getUserMedia, enumerateDevices }, configurable: true });
    let state: any = {};
    const set = vi.fn((updater: any) => { state = typeof updater === "function" ? { ...state, ...updater(state) } : { ...state, ...updater }; });
    const slice = createAudioSlice(set as any, () => state as any, {} as any);

    await expect(slice.refreshDevices({ requestPermission: true, source: "permission" })).resolves.toMatchObject({ committed: true, permissionState: "denied" });
    await expect(slice.refreshDevices({ source: "settings" })).resolves.toMatchObject({ committed: true });
    expect(enumerateDevices).toHaveBeenCalledOnce();
  });

  it("releases the queue after enumerateDevices rejection", async () => {
    const enumerateDevices = vi.fn()
      .mockRejectedValueOnce(new Error("enumeration failed"))
      .mockResolvedValueOnce([{ kind: "audioinput", deviceId: "default", label: "Default" }]);
    Object.defineProperty(global.navigator, "mediaDevices", { value: { enumerateDevices }, configurable: true });
    let state: any = {};
    const set = vi.fn((updater: any) => { state = typeof updater === "function" ? { ...state, ...updater(state) } : { ...state, ...updater }; });
    const slice = createAudioSlice(set as any, () => state as any, {} as any);

    await expect(slice.refreshDevices({ source: "devicechange" })).resolves.toMatchObject({ committed: true });
    await expect(slice.refreshDevices({ source: "settings" })).resolves.toMatchObject({ committed: true });
    expect(enumerateDevices).toHaveBeenCalledTimes(2);
  });

  it("releases the queue after a synchronous browser exception", async () => {
    const enumerateDevices = vi.fn()
      .mockImplementationOnce(() => { throw new Error("synchronous enumeration failure"); })
      .mockResolvedValueOnce([{ kind: "audioinput", deviceId: "default", label: "Default" }]);
    Object.defineProperty(global.navigator, "mediaDevices", { value: { enumerateDevices }, configurable: true });
    let state: any = {};
    const set = vi.fn((updater: any) => { state = typeof updater === "function" ? { ...state, ...updater(state) } : { ...state, ...updater }; });
    const slice = createAudioSlice(set as any, () => state as any, {} as any);

    await expect(slice.refreshDevices({ source: "devicechange" })).resolves.toMatchObject({ committed: true });
    await expect(slice.refreshDevices({ source: "settings" })).resolves.toMatchObject({ committed: true });
    expect(enumerateDevices).toHaveBeenCalledTimes(2);
  });

  it("stops permission tracks even when enumeration fails", async () => {
    const track = { stop: vi.fn() };
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [track] });
    const enumerateDevices = vi.fn().mockRejectedValue(new Error("enumeration failed"));
    Object.defineProperty(global.navigator, "mediaDevices", { value: { getUserMedia, enumerateDevices }, configurable: true });
    let state: any = {};
    const set = vi.fn((updater: any) => { state = typeof updater === "function" ? { ...state, ...updater(state) } : { ...state, ...updater }; });
    const slice = createAudioSlice(set as any, () => state as any, {} as any);

    await expect(slice.refreshDevices({ requestPermission: true, source: "permission" })).resolves.toMatchObject({ committed: true, permissionState: "granted" });
    expect(track.stop).toHaveBeenCalledOnce();
  });
});
