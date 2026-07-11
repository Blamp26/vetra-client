export const VOICE_RECORDING_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mp4",
] as const;

export function selectVoiceRecordingMimeType(
  recorderConstructor: typeof MediaRecorder | undefined = globalThis.MediaRecorder,
): string | null {
  if (!recorderConstructor) return null;

  const isSupported = recorderConstructor.isTypeSupported;
  return VOICE_RECORDING_MIME_TYPES.find((mimeType) =>
    typeof isSupported !== "function" || isSupported.call(recorderConstructor, mimeType),
  ) ?? null;
}

export function getVoiceRecordingExtension(mimeType: string): string {
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mp4")) return "m4a";
  return "webm";
}

export function createVoiceRecordingFile(
  chunks: BlobPart[],
  mimeType: string,
  recordedAt = Date.now(),
): File {
  const blob = new Blob(chunks, { type: mimeType });
  const extension = getVoiceRecordingExtension(mimeType);
  return new File([blob], `voice-message-${recordedAt}.${extension}`, {
    type: mimeType,
    lastModified: recordedAt,
  });
}

export function formatVoiceDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
