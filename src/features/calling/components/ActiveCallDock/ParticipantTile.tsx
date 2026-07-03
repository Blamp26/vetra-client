import { useEffect, useRef, useState } from "react";
import {
  Maximize2,
  MonitorX,
  ScreenShare,
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
  className?: string;
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
  className,
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
        className={className}
        testId={testId}
      />
    );
  }

  return (
    <div
      className={cn(
        "participant-tile participant-tile--avatar relative flex min-h-0 items-center justify-center overflow-hidden rounded-md bg-[var(--call-surface-2)]",
        className,
      )}
      data-testid={testId}
      data-variant={variant}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-primary text-primary-foreground",
          compact ? "h-11 w-11 text-base" : "h-12 w-12 text-lg",
        )}
      >
        {name.charAt(0).toUpperCase()}
      </div>
      <p
        className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-full bg-black/55 px-2 py-1 text-[11px] leading-none text-white"
        data-testid="participant-avatar-name"
      >
        {name}
      </p>
      <span className="sr-only">{isMuted ? "Muted" : label}</span>
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
  className,
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
  className?: string;
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
      className={cn(
        "participant-tile participant-tile--screen relative min-h-0 overflow-hidden rounded-md bg-zinc-950 text-white",
        isWatchingInline && "participant-tile--watching",
        className,
      )}
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
            className="absolute left-2 top-2 rounded-full bg-red-600 px-2 py-1 text-[10px] leading-none text-white"
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
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border-0 bg-black/70 p-0 text-white hover:bg-black"
            onClick={onExpand}
            aria-label={`Expand ${name}'s screen`}
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-950 text-zinc-300">
          <ScreenShare className="h-6 w-6 text-zinc-500" />
          {stream ? (
            <button
              type="button"
              className="rounded-full border-0 bg-white px-4 py-1.5 text-xs text-zinc-950 hover:bg-zinc-200"
              onClick={onWatch}
            >
              Watch stream
            </button>
          ) : (
            <span className="px-3 text-center text-xs text-zinc-500">Waiting for shared screen...</span>
          )}
        </div>
      )}

      {isLocalSharer && onStopScreenShare && (
        <button
          type="button"
          className={cn(
            "absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border-0 bg-black/70 p-0 text-white hover:bg-black disabled:opacity-60",
            isWatchingInline && "right-11",
          )}
          onClick={onStopScreenShare}
          disabled={isScreenShareUpdating}
          aria-label={isScreenShareUpdating ? "Updating screen share" : "Stop sharing"}
        >
          <MonitorX className="h-4 w-4" />
        </button>
      )}

      <div className="pointer-events-none absolute bottom-2 left-2 max-w-[calc(100%-1rem)] rounded-full bg-black/55 px-2 py-1">
        <p className="truncate text-[11px] leading-none text-white" data-testid="participant-screen-name">
          {name}
        </p>
      </div>
    </div>
  );
}
