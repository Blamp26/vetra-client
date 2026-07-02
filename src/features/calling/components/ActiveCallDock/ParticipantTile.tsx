import { useEffect, useRef, useState } from "react";
import {
  Maximize2,
  MonitorUp,
  MonitorX,
  Volume2,
} from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { detachVideo, safelyPlayVideo } from "./mediaVideo";

export type ParticipantTileVariant = "camera" | "avatar" | "screenShare";
export type ScreenShareTileState = "idle" | "watchingInline";

export interface ParticipantTileProps {
  name: string;
  label: string;
  variant: ParticipantTileVariant;
  stream?: MediaStream | null;
  screenShareState?: ScreenShareTileState;
  isLocalSharer?: boolean;
  isMuted?: boolean;
  onWatch?: () => void;
  onExpand?: () => void;
  onStopScreenShare?: () => void;
  isScreenShareUpdating?: boolean;
  compact?: boolean;
  "data-testid"?: string;
}

export function ParticipantTile({
  name,
  label,
  variant,
  stream = null,
  screenShareState = "idle",
  isLocalSharer = false,
  isMuted = false,
  onWatch,
  onExpand,
  onStopScreenShare,
  isScreenShareUpdating = false,
  compact = false,
  "data-testid": testId = "participant-tile",
}: ParticipantTileProps) {
  if (variant === "screenShare") {
    return (
      <ScreenShareParticipantTile
        name={name}
        stream={stream}
        state={screenShareState}
        isLocalSharer={isLocalSharer}
        onWatch={onWatch}
        onExpand={onExpand}
        onStopScreenShare={onStopScreenShare}
        isScreenShareUpdating={isScreenShareUpdating}
        testId={testId}
      />
    );
  }

  return (
    <div
      className={cn(
        "relative flex min-h-0 flex-col items-center justify-center overflow-hidden rounded-md border border-border bg-card p-3",
        compact ? "aspect-[16/9]" : "aspect-[16/9] min-h-24",
      )}
      data-testid={testId}
      data-variant={variant}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-full border border-border bg-background text-foreground",
          compact ? "h-9 w-9 text-base" : "h-14 w-14 text-xl",
        )}
      >
        {name.charAt(0).toUpperCase()}
      </div>
      <p className={cn("mt-2 max-w-full truncate text-foreground", compact ? "text-sm" : "text-base")}>
        {name}
      </p>
      <p className="max-w-full truncate text-xs uppercase text-muted-foreground">
        {isMuted ? "Muted" : label}
      </p>
    </div>
  );
}

function ScreenShareParticipantTile({
  name,
  stream,
  state,
  isLocalSharer,
  onWatch,
  onExpand,
  onStopScreenShare,
  isScreenShareUpdating,
  testId,
}: {
  name: string;
  stream: MediaStream | null;
  state: ScreenShareTileState;
  isLocalSharer: boolean;
  onWatch?: () => void;
  onExpand?: () => void;
  onStopScreenShare?: () => void;
  isScreenShareUpdating: boolean;
  testId: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const isWatchingInline = state === "watchingInline" && Boolean(stream);

  useEffect(() => {
    const video = videoRef.current;
    setIsVideoReady(false);
    if (!video) return;

    if (!isWatchingInline || !stream) {
      detachVideo(video);
      return;
    }

    video.srcObject = stream;
    void safelyPlayVideo(video, "inline_screen_share");

    return () => {
      detachVideo(video);
    };
  }, [isWatchingInline, stream]);

  return (
    <div
      className="relative aspect-[16/9] min-h-0 overflow-hidden rounded-md border border-border bg-zinc-950 text-white"
      data-testid={testId}
      data-variant="screenShare"
      data-state={state}
    >
      {isWatchingInline ? (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isLocalSharer}
            onLoadedData={() => setIsVideoReady(true)}
            onCanPlay={() => setIsVideoReady(true)}
            className="h-full w-full bg-black object-contain"
            data-testid="participant-screen-video"
          />
          {!isVideoReady && (
            <div
              className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-zinc-400"
              data-testid="participant-screen-loading"
            >
              Loading shared screen...
            </div>
          )}
          <span
            className="absolute left-2 top-2 rounded-sm bg-red-600 px-2 py-1 text-[10px] uppercase text-white"
            data-testid="participant-screen-live-badge"
          >
            720p · LIVE
          </span>
          <Volume2
            className="absolute bottom-2 right-2 h-4 w-4 text-zinc-200"
            aria-label="Stream volume"
          />
          <button
            type="button"
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-md bg-black/70 text-white hover:bg-black"
            onClick={onExpand}
            aria-label={`Expand ${name}'s screen`}
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950 text-zinc-300">
          <MonitorUp className="h-8 w-8 text-zinc-500" />
          {stream ? (
            <button
              type="button"
              className="rounded-md bg-white px-4 py-2 text-sm text-zinc-950 hover:bg-zinc-200"
              onClick={onWatch}
            >
              Watch stream
            </button>
          ) : (
            <span className="text-sm text-zinc-500">Waiting for shared screen...</span>
          )}
        </div>
      )}

      {isLocalSharer && onStopScreenShare && (
        <button
          type="button"
          className={cn(
            "absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-md bg-black/70 text-white hover:bg-black disabled:opacity-60",
            isWatchingInline && "right-12",
          )}
          onClick={onStopScreenShare}
          disabled={isScreenShareUpdating}
          aria-label={isScreenShareUpdating ? "Updating screen share" : "Stop sharing"}
        >
          <MonitorX className="h-4 w-4" />
        </button>
      )}

      <div className="pointer-events-none absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2 pt-8">
        <p className="truncate text-sm text-white" data-testid="participant-screen-name">
          {name}
        </p>
      </div>
    </div>
  );
}
