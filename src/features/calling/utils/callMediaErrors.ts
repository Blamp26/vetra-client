export type CallMediaErrorCode =
  | "microphone_permission_denied"
  | "microphone_unavailable"
  | "selected_input_unavailable"
  | "audio_input_switch_failed"
  | "audio_output_unavailable"
  | "media_initialization_failed";

export const CALL_MEDIA_ERROR_MESSAGES: Record<CallMediaErrorCode, string> = {
  microphone_permission_denied: "Microphone permission is blocked. Allow microphone access in browser or system settings, then try again.",
  microphone_unavailable: "No microphone is available. Connect or enable a microphone, then try again.",
  selected_input_unavailable: "The selected microphone is unavailable. Choose another microphone, then try again.",
  audio_input_switch_failed: "Couldn’t switch microphone. Your previous microphone is still active.",
  audio_output_unavailable: "Audio output is unavailable. The system default speakers are being used.",
  media_initialization_failed: "Microphone could not be started. Check the device and try again.",
};

type ErrorLike = { name?: unknown; message?: unknown };

function errorName(error: unknown): string {
  return error instanceof Error || error instanceof DOMException
    ? error.name
    : typeof error === "object" && error !== null && "name" in error
      ? String((error as ErrorLike).name ?? "")
      : "";
}

function errorMessage(error: unknown): string {
  return error instanceof Error || error instanceof DOMException
    ? error.message.toLowerCase()
    : typeof error === "object" && error !== null && "message" in error
      ? String((error as ErrorLike).message ?? "").toLowerCase()
      : String(error ?? "").toLowerCase();
}

export function hasExactInputConstraint(constraints?: MediaStreamConstraints): boolean {
  if (!constraints || constraints.audio === false || constraints.audio === undefined || constraints.audio === true) return false;
  if (typeof constraints.audio !== "object") return false;
  const deviceId = (constraints.audio as MediaTrackConstraints).deviceId;
  return typeof deviceId === "object" && deviceId !== null && "exact" in deviceId && Boolean(deviceId.exact);
}

export function classifyMicrophoneError(
  error: unknown,
  constraints?: MediaStreamConstraints,
): CallMediaErrorCode {
  const name = errorName(error);
  const message = errorMessage(error);
  if (
    name === "NotAllowedError" ||
    name === "SecurityError" ||
    message.includes("permission denied") ||
    message.includes("permission dismissed") ||
    message.includes("denied permission")
  ) return "microphone_permission_denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return hasExactInputConstraint(constraints) ? "selected_input_unavailable" : "microphone_unavailable";
  }
  if (message.includes("no mic") || message.includes("device not found") || message.includes("requested device not found") || message.includes("no microphone")) {
    return hasExactInputConstraint(constraints) ? "selected_input_unavailable" : "microphone_unavailable";
  }
  return "media_initialization_failed";
}

export function classifyAudioOutputError(error: unknown): CallMediaErrorCode | null {
  return errorName(error) === "NotFoundError" ? "audio_output_unavailable" : null;
}

export function callMediaErrorMessage(code: CallMediaErrorCode): string {
  return CALL_MEDIA_ERROR_MESSAGES[code];
}
