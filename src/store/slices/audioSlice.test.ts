import { describe, expect, it, vi } from "vitest";
import { createAudioSlice } from "./audioSlice";

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

    expect(slice.selectedInputDeviceId).toBe("default");
    expect(slice.selectedOutputDeviceId).toBe("default");
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
    let state: any = {
      selectedInputDeviceId: "missing-input",
      selectedOutputDeviceId: "missing-output",
    };
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
    expect(state.selectedInputDeviceId).toBe("default");
    expect(state.selectedOutputDeviceId).toBe("default");
  });
});
