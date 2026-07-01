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
});
