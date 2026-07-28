import { describe, expect, it } from "vitest";
import { callMediaErrorMessage, classifyAudioOutputError, classifyMicrophoneError } from "./callMediaErrors";

describe("call media error classification", () => {
  const selected = { audio: { deviceId: { exact: "missing-mic" } }, video: false } as MediaStreamConstraints;
  const defaultInput = { audio: true, video: false } as MediaStreamConstraints;

  it.each([
    ["NotAllowedError", "microphone_permission_denied"],
    ["SecurityError", "microphone_permission_denied"],
    ["NotReadableError", "media_initialization_failed"],
    ["AbortError", "media_initialization_failed"],
  ])("classifies %s", (name, expected) => {
    expect(classifyMicrophoneError(new DOMException("failure", name), defaultInput)).toBe(expected);
  });

  it.each([
    ["permission denied", "microphone_permission_denied"],
    ["device not found", "microphone_unavailable"],
  ])("classifies the shared generic message %s", (message, expected) => {
    expect(classifyMicrophoneError(new Error(message), defaultInput)).toBe(expected);
  });

  it("distinguishes an unavailable selected input from a missing default input", () => {
    expect(classifyMicrophoneError(new DOMException("missing", "NotFoundError"), selected)).toBe("selected_input_unavailable");
    expect(classifyMicrophoneError(new DOMException("missing", "NotFoundError"), defaultInput)).toBe("microphone_unavailable");
  });

  it("classifies unknown and replacement failures without using wire codes", () => {
    expect(classifyMicrophoneError(new TypeError("browser failure"), defaultInput)).toBe("media_initialization_failed");
    expect(callMediaErrorMessage("audio_input_switch_failed")).toContain("previous microphone is still active");
  });

  it("classifies only missing output sinks as user-actionable output errors", () => {
    expect(classifyAudioOutputError(new DOMException("not found", "NotFoundError"))).toBe("audio_output_unavailable");
    expect(classifyAudioOutputError(new DOMException("unsupported", "NotSupportedError"))).toBeNull();
    expect(classifyAudioOutputError(new DOMException("insecure", "SecurityError"))).toBeNull();
    expect(classifyAudioOutputError(new Error("the requested route was not found in cache"))).toBeNull();
  });
});
