import { describe, expect, it } from "vitest";
import { buildMicrophoneConstraints } from "./audioConstraints";

describe("buildMicrophoneConstraints", () => {
  it("uses an exact selected microphone and all processing preferences", () => {
    expect(buildMicrophoneConstraints({
      selectedInputDeviceId: "fifine-input",
      noiseSuppression: false,
      echoCancellation: true,
      autoGainControl: false,
    })).toEqual({
      audio: {
        deviceId: { exact: "fifine-input" },
        noiseSuppression: false,
        echoCancellation: true,
        autoGainControl: false,
      },
      video: false,
    });
  });

  it("omits an exact device constraint for the system default", () => {
    expect(buildMicrophoneConstraints({
      selectedInputDeviceId: "default",
      noiseSuppression: true,
      echoCancellation: true,
      autoGainControl: true,
    })).toEqual({
      audio: {
        noiseSuppression: true,
        echoCancellation: true,
        autoGainControl: true,
      },
      video: false,
    });
  });
});
