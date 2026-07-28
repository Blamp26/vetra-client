import { classifyAudioOutputError } from "./callMediaErrors";

export function isMissingOutputDeviceError(error: unknown): boolean {
  return classifyAudioOutputError(error) === "audio_output_unavailable";
}

export function isOutputDeviceSecurityError(error: unknown): boolean {
  if (!(error instanceof DOMException) && !(error instanceof Error)) {
    return false;
  }

  const name = "name" in error ? String(error.name) : "";
  const message = "message" in error ? String(error.message).toLowerCase() : "";

  return (
    name === "SecurityError" ||
    name === "NotAllowedError" ||
    message.includes("insecure") ||
    message.includes("permission denied") ||
    message.includes("not allowed")
  );
}
