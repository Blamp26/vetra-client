import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/shared/utils/cn";
import { debugCall } from "@/features/calling/utils/callDebug";

interface ScreenShareStageProps {
  remoteScreenStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  isRemoteScreenLoading: boolean;
  isScreenShareUpdating: boolean;
  remoteUsername: string;
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

async function safelyPlayVideo(video: HTMLVideoElement, reason: string): Promise<void> {
  try {
    await video.play();
    debugCall("[ScreenShareStage] video play success", { reason });
  } catch (error) {
    debugCall("[ScreenShareStage] video play failed", {
      reason,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function ScreenShareStage({
  remoteScreenStream,
  localScreenStream,
  isRemoteScreenLoading,
  isScreenShareUpdating,
  remoteUsername,
}: ScreenShareStageProps) {
  const mainVideoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const [isMainVideoReady, setIsMainVideoReady] = useState(false);

  const mainShare = useMemo(() => {
    if (remoteScreenStream) {
      return {
        stream: remoteScreenStream,
        ownerLabel: remoteUsername,
        testId: "remote-screen-view",
        playReason: "remote_screen_stream",
      };
    }

    if (localScreenStream) {
      return {
        stream: localScreenStream,
        ownerLabel: "You",
        testId: "local-screen-view",
        playReason: "local_screen_stream",
      };
    }

    return null;
  }, [localScreenStream, remoteScreenStream, remoteUsername]);

  useEffect(() => {
    const video = mainVideoRef.current;
    setIsMainVideoReady(false);
    if (!video) return;

    if (!mainShare?.stream) {
      detachVideo(video);
      return;
    }

    video.srcObject = mainShare.stream;
    void safelyPlayVideo(video, mainShare.playReason);

    return () => {
      detachVideo(video);
    };
  }, [mainShare]);

  useEffect(() => {
    const video = previewVideoRef.current;
    if (!video) return;

    if (!remoteScreenStream || !localScreenStream) {
      detachVideo(video);
      return;
    }

    video.srcObject = localScreenStream;
    void safelyPlayVideo(video, "local_screen_preview");

    return () => {
      detachVideo(video);
    };
  }, [localScreenStream, remoteScreenStream]);

  const showWaitingState = !mainShare && isRemoteScreenLoading;
  const showFallbackState = !mainShare && !isRemoteScreenLoading;

  return (
    <div
      className="relative h-full min-h-0 overflow-hidden rounded-md border border-border bg-black"
      data-testid="screen-share-stage"
    >
      {mainShare && (
        <>
          <video
            ref={mainVideoRef}
            autoPlay
            playsInline
            muted={mainShare.stream === localScreenStream}
            onLoadedData={() => setIsMainVideoReady(true)}
            onCanPlay={() => setIsMainVideoReady(true)}
            className="h-full w-full bg-black object-contain"
            data-testid={mainShare.testId}
          />
          {!isMainVideoReady && (
            <div
              className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black text-sm text-zinc-400"
              data-testid="screen-share-video-loading"
            >
              Loading shared screen...
            </div>
          )}
          <div
            className="absolute left-3 top-3 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-200"
            data-testid="screen-share-owner"
          >
            <span className="block text-[10px] uppercase tracking-wide text-zinc-500">Watching</span>
            <span className="block max-w-48 truncate">
              {mainShare.ownerLabel === "You" ? "You are sharing" : `${mainShare.ownerLabel} is sharing`}
            </span>
          </div>
        </>
      )}

      {showWaitingState && (
        <div
          className="flex h-full min-h-52 items-center justify-center px-6 text-center text-sm text-zinc-400"
          data-testid="remote-screen-loading"
        >
          Waiting for shared screen
        </div>
      )}

      {showFallbackState && (
        <div
          className="flex h-full min-h-52 items-center justify-center px-6 text-center text-sm text-zinc-400"
          data-testid="screen-share-missing"
        >
          No shared screen is available.
        </div>
      )}

      {remoteScreenStream && localScreenStream && (
        <div className="absolute bottom-3 right-3 w-44 rounded-md border border-zinc-700 bg-zinc-950 p-2">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Your preview</div>
          <video
            ref={previewVideoRef}
            autoPlay
            muted
            playsInline
            className="h-24 w-full rounded bg-black object-contain"
            data-testid="local-screen-preview"
          />
        </div>
      )}

      {isScreenShareUpdating && (
        <div
          className={cn(
            "absolute inset-x-3 bottom-3 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-center text-xs text-zinc-300",
            remoteScreenStream && localScreenStream && "right-52",
          )}
          data-testid="screen-share-updating-overlay"
        >
          Updating screen share...
        </div>
      )}
    </div>
  );
}
