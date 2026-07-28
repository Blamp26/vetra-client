export type ScreenShareErrorCode =
  | "cancelled"
  | "permission_denied"
  | "unsupported"
  | "no_source"
  | "replace_failed"
  | "platform_restricted"
  | "renegotiation_failed";

export interface ScreenShareIssue {
  code: ScreenShareErrorCode;
  message: string;
}

type ScreenShareVideoConstraints = MediaTrackConstraints & {
  cursor?: "always" | "motion" | "never";
  selfBrowserSurface?: "include" | "exclude";
  surfaceSwitching?: "include" | "exclude";
  monitorTypeSurfaces?: "include" | "exclude";
};

export const SCREEN_SHARE_MESSAGES: Record<ScreenShareErrorCode, string> = {
  cancelled: "",
  permission_denied: "Screen sharing permission was denied. Allow screen capture access, then try again.",
  unsupported: "Screen sharing is unavailable in this browser or desktop environment.",
  no_source: "No screen source was selected. Choose a screen, window, or tab and try again.",
  replace_failed: "Couldn’t update screen sharing. Try again.",
  platform_restricted: "Screen sharing is blocked by platform permissions. Allow screen capture access in system settings, then try again.",
  renegotiation_failed: "Couldn’t start screen sharing. Try again.",
};

const BASE_VIDEO: ScreenShareVideoConstraints = {
  width: { ideal: 1280, max: 1920 },
  height: { ideal: 720, max: 1080 },
  frameRate: { ideal: 15, max: 30 },
  cursor: "motion",
};

export function buildScreenShareConstraints(includeOptionalHints = true): MediaStreamConstraints {
  const video: ScreenShareVideoConstraints = { ...BASE_VIDEO };
  if (includeOptionalHints) {
    video.selfBrowserSurface = "exclude";
    video.surfaceSwitching = "include";
    video.monitorTypeSurfaces = "include";
  }
  return { video, audio: false };
}

export class ScreenShareCaptureError extends Error {
  readonly code: ScreenShareErrorCode;

  constructor(code: ScreenShareErrorCode, message = SCREEN_SHARE_MESSAGES[code]) {
    super(message);
    this.name = "ScreenShareCaptureError";
    this.code = code;
  }
}

function isDomException(error: unknown): error is DOMException {
  return typeof DOMException !== "undefined" && error instanceof DOMException;
}

function errorName(error: unknown): string {
  if (error instanceof Error || isDomException(error)) return error.name;
  if (typeof error === "object" && error !== null && "name" in error && typeof error.name === "string") return error.name;
  return "";
}

export function isUnsupportedScreenShareConstraintError(error: unknown): boolean {
  return errorName(error) === "TypeError";
}

export async function captureScreenShare<T>(
  getDisplayMedia: (constraints: MediaStreamConstraints) => Promise<T>,
): Promise<T> {
  try {
    return await getDisplayMedia(buildScreenShareConstraints(true));
  } catch (error) {
    if (!isUnsupportedScreenShareConstraintError(error)) throw error;
    return getDisplayMedia(buildScreenShareConstraints(false));
  }
}

export function classifyScreenShareError(
  error: unknown,
  context: "capture" | "replace" | "renegotiation" = "capture",
): ScreenShareIssue {
  if (error instanceof ScreenShareCaptureError) return { code: error.code, message: error.message };

  const name = errorName(error);
  if (context === "replace") return { code: "replace_failed", message: SCREEN_SHARE_MESSAGES.replace_failed };
  if (context === "renegotiation") return { code: "renegotiation_failed", message: SCREEN_SHARE_MESSAGES.renegotiation_failed };
  if (name === "NotSupportedError" || name === "NotImplementedError") return { code: "unsupported", message: SCREEN_SHARE_MESSAGES.unsupported };
  if (name === "SecurityError") {
    return { code: "platform_restricted", message: SCREEN_SHARE_MESSAGES.platform_restricted };
  }
  if (name === "NotAllowedError") return { code: "permission_denied", message: SCREEN_SHARE_MESSAGES.permission_denied };
  if (name === "AbortError") return { code: "cancelled", message: SCREEN_SHARE_MESSAGES.cancelled };
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return { code: "no_source", message: SCREEN_SHARE_MESSAGES.no_source };
  }
  return { code: "unsupported", message: SCREEN_SHARE_MESSAGES.unsupported };
}

export function screenShareIssue(code: ScreenShareErrorCode): ScreenShareIssue {
  return { code, message: SCREEN_SHARE_MESSAGES[code] };
}
