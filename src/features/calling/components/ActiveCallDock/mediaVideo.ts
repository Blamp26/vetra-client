import { debugCall } from "@/features/calling/utils/callDebug";

export function detachVideo(video: HTMLVideoElement): void {
  const hadAttachedMedia = Boolean(video.srcObject || video.currentSrc || video.hasAttribute("src"));
  if (hadAttachedMedia) {
    video.pause();
  }
  video.srcObject = null;
  video.removeAttribute("src");
  if (hadAttachedMedia) {
    video.load();
  }
}

export async function safelyPlayVideo(video: HTMLVideoElement, reason: string): Promise<void> {
  try {
    await video.play();
    debugCall("[ActiveCallDock] video play success", { reason });
  } catch (error) {
    debugCall("[ActiveCallDock] video play failed", {
      reason,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
