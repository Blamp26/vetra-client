import { describe, expect, it, vi } from "vitest";
import {
  createVoiceRecordingFile,
  formatVoiceDuration,
  getVoiceRecordingExtension,
  selectVoiceRecordingMimeType,
} from "./voiceRecording";

describe("voice recording utilities", () => {
  it("selects the first runtime-supported compressed voice format", () => {
    const recorder = {
      isTypeSupported: vi.fn((mimeType: string) => mimeType === "audio/ogg"),
    } as unknown as typeof MediaRecorder;

    expect(selectVoiceRecordingMimeType(recorder)).toBe("audio/ogg");
  });

  it("creates a voice file with a matching extension and MIME type", () => {
    const file = createVoiceRecordingFile([new Uint8Array([1, 2, 3])], "audio/webm", 123);

    expect(file.name).toBe("voice-message-123.webm");
    expect(file.type).toBe("audio/webm");
    expect(file.size).toBe(3);
    expect(getVoiceRecordingExtension("audio/ogg;codecs=opus")).toBe("ogg");
  });

  it("formats elapsed voice time", () => {
    expect(formatVoiceDuration(0)).toBe("0:00");
    expect(formatVoiceDuration(65_200)).toBe("1:05");
  });
});
