import { useEffect, useRef, useState } from "react";
import { MonitorX, X } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { debugCall } from "@/features/calling/utils/callDebug";

interface WatchStreamModalProps {
  stream: MediaStream;
  sharerName: string;
  isLocalSharer: boolean;
  remoteUsername: string;
  isMuted: boolean;
  isScreenShareUpdating: boolean;
  onClose: () => void;
  onStopScreenShare: () => void;
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
    debugCall("[WatchStreamModal] video play success");
  } catch (error) {
    debugCall("[WatchStreamModal] video play failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function WatchStreamModal({
  stream,
  sharerName,
  isLocalSharer,
  remoteUsername,
  isMuted,
  isScreenShareUpdating,
  onClose,
  onStopScreenShare,
}: WatchStreamModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    setIsVideoReady(false);
    if (!video) return;

    video.srcObject = stream;
    void safelyPlayVideo(video);

    return () => {
      detachVideo(video);
    };
  }, [stream]);

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/75 p-5 text-white"
      data-testid="watch-stream-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Watch screen share"
    >
      <div
        className="flex h-[min(88vh,920px)] w-[min(92vw,1320px)] min-h-0 flex-col overflow-hidden rounded-2xl bg-[#1e1f22]"
        data-testid="watch-stream-surface"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 bg-[#2b2d31] px-5 py-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-zinc-400">Live stream</p>
            <h2 className="truncate text-sm font-medium text-zinc-100">
              {isLocalSharer ? "Watching your screen" : `Watching ${sharerName}'s screen`}
            </h2>
          </div>
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#313338] text-zinc-200 hover:bg-[#3f4147]"
            onClick={onClose}
            aria-label="Close stream"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 bg-[#111214] p-4">
          <div
            className="relative h-full overflow-hidden rounded-xl bg-black"
            data-testid="watch-stream-stage"
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted={isLocalSharer}
              onLoadedData={() => setIsVideoReady(true)}
              onCanPlay={() => setIsVideoReady(true)}
              className="h-full w-full bg-black object-contain"
              data-testid="watch-stream-video"
            />
            {!isVideoReady && (
              <div
                className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-zinc-400"
                data-testid="watch-stream-loading"
              >
                Loading shared screen...
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-3 bg-[#2b2d31] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 gap-2 overflow-x-auto" data-testid="watch-stream-participants">
            <ParticipantChip name="You" label={isMuted ? "Muted" : isLocalSharer ? "Sharing" : "Connected"} />
            <ParticipantChip name={remoteUsername} label={isLocalSharer ? "Connected" : "Sharing"} />
          </div>

          {isLocalSharer && (
            <button
              type="button"
              className={cn(
                "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md px-3 text-sm text-zinc-100",
                isScreenShareUpdating ? "bg-[#313338] opacity-60" : "bg-[#313338] hover:bg-[#3f4147]",
              )}
              onClick={onStopScreenShare}
              disabled={isScreenShareUpdating}
              aria-label={isScreenShareUpdating ? "Updating screen share" : "Stop sharing"}
            >
              <MonitorX className="h-4 w-4" />
              <span>{isScreenShareUpdating ? "Updating..." : "Stop sharing"}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ParticipantChip({ name, label }: { name: string; label: string }) {
  return (
    <div className="flex min-w-36 items-center gap-2 rounded-md bg-[#313338] px-3 py-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1e1f22] text-sm text-zinc-100">
        {name.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm text-zinc-100">{name}</p>
        <p className="truncate text-[10px] uppercase text-zinc-500">{label}</p>
      </div>
    </div>
  );
}
