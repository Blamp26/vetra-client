import { describe, expect, it, vi } from "vitest";
import {
  buildScreenShareConstraints,
  captureScreenShare,
  classifyScreenShareError,
  SCREEN_SHARE_MESSAGES,
} from "./screenShare";

describe("screen-share policy", () => {
  it("builds the exact base policy with optional hints", () => {
    expect(buildScreenShareConstraints()).toEqual({
      video: {
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 15, max: 30 },
        cursor: "motion",
        selfBrowserSurface: "exclude",
        surfaceSwitching: "include",
        monitorTypeSurfaces: "include",
      },
      audio: false,
    });
    expect(buildScreenShareConstraints(false)).toEqual({
      video: {
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 15, max: 30 },
        cursor: "motion",
      },
      audio: false,
    });
  });

  it("falls back once for unsupported optional constraints", async () => {
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const getDisplayMedia = vi.fn()
      .mockRejectedValueOnce(new TypeError("Unsupported constraint dictionary member"))
      .mockResolvedValueOnce(stream);

    await expect(captureScreenShare(getDisplayMedia)).resolves.toBe(stream);
    expect(getDisplayMedia).toHaveBeenCalledTimes(2);
    expect(getDisplayMedia.mock.calls[1]?.[0]).toEqual(buildScreenShareConstraints(false));
  });

  it("falls back once for an arbitrary TypeError without inspecting its message", async () => {
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const getDisplayMedia = vi.fn()
      .mockRejectedValueOnce(new TypeError())
      .mockResolvedValueOnce(stream);

    await expect(captureScreenShare(getDisplayMedia)).resolves.toBe(stream);
    expect(getDisplayMedia).toHaveBeenCalledTimes(2);
    expect(getDisplayMedia.mock.calls[1]?.[0]).toEqual(buildScreenShareConstraints(false));
  });

  it("does not retry cancellation or permission denial", async () => {
    const cancelled = vi.fn().mockRejectedValue(new DOMException("", "NotAllowedError"));
    await expect(captureScreenShare(cancelled)).rejects.toThrow();
    expect(cancelled).toHaveBeenCalledTimes(1);

    const denied = vi.fn().mockRejectedValue(new DOMException("Permission denied", "NotAllowedError"));
    await expect(captureScreenShare(denied)).rejects.toThrow();
    expect(denied).toHaveBeenCalledTimes(1);
  });

  it("shares the required user-facing error wording", () => {
    expect(classifyScreenShareError(new DOMException("Permission denied", "NotAllowedError"))).toEqual({
      code: "permission_denied",
      message: SCREEN_SHARE_MESSAGES.permission_denied,
    });
    expect(classifyScreenShareError(new DOMException("", "NotAllowedError")).code).toBe("permission_denied");
    expect(classifyScreenShareError(new DOMException("arbitrary", "NotAllowedError")).code).toBe("permission_denied");
    expect(classifyScreenShareError(new DOMException("arbitrary", "SecurityError")).code).toBe("platform_restricted");
    expect(classifyScreenShareError(new Error("no source selected")).code).toBe("unsupported");
    expect(classifyScreenShareError(new Error("replace failed"), "replace").message).toBe(SCREEN_SHARE_MESSAGES.replace_failed);
    expect(classifyScreenShareError(new Error("offer failed"), "renegotiation").message).toBe(SCREEN_SHARE_MESSAGES.renegotiation_failed);
  });
});
