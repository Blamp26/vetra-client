import { useEffect, useRef } from "react";
import { MonitorUp } from "lucide-react";
import { debugCall } from "@/features/calling/utils/callDebug";

interface StreamPreviewTileProps {
  stream: MediaStream | null;
  sharerName: string;
  isLocalSharer: boolean;
  onWatch: () => void;
  attachPreviewVideo?: boolean;
}

function detachVideo(video: HTMLVideoElement): void {
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

async function safelyPlayVideo(video: HTMLVideoElement): Promise<void> {
  try {
    await video.play();
    debugCall("[StreamPreviewTile] preview play success");
  } catch (error) {
    debugCall("[StreamPreviewTile] preview play failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function StreamPreviewTile({
  stream,
  sharerName,
  isLocalSharer,
  onWatch,
  attachPreviewVideo = false,
}: StreamPreviewTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sharingLabel = isLocalSharer
    ? "You are sharing your screen"
    : `${sharerName} is sharing their screen`;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!attachPreviewVideo || !stream) {
      detachVideo(video);
      return;
    }

    video.srcObject = stream;
    void safelyPlayVideo(video);

    return () => {
      detachVideo(video);
    };
  }, [attachPreviewVideo, stream]);

  return (
    <div
      className="overflow-hidden rounded-md border border-border bg-card"
      data-testid="stream-preview-tile"
    >
      <div
        className="relative aspect-video min-h-0 bg-zinc-950"
        data-testid="stream-preview-area"
      >
        {attachPreviewVideo && stream ? (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full bg-black object-cover"
            data-testid="stream-preview-video"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-zinc-950 text-zinc-500">
            <MonitorUp className="h-7 w-7" />
          </div>
        )}
        <button
          type="button"
          className="absolute bottom-2 right-2 rounded-md bg-white px-3 py-1 text-xs font-medium text-zinc-950 hover:bg-zinc-200"
          onClick={onWatch}
        >
          Watch
        </button>
      </div>
      <div className="px-3 py-2">
        <p className="truncate text-sm text-foreground" data-testid="stream-preview-label">
          {sharingLabel}
        </p>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Screen share
        </p>
      </div>
    </div>
  );
}
