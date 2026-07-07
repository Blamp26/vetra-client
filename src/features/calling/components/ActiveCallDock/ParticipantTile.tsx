import { useEffect, useRef, useState } from "react";
import {
  Maximize2,
  MonitorX,
  Play,
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
        "vt-call-tile participant-tile participant-tile--avatar relative flex shrink-0 items-center justify-center overflow-hidden",
        className,
      )}
      data-testid={testId}
      data-variant={variant}
    >
      <div
        className={cn(
          "vt-call-avatar avatar-circle flex items-center justify-center rounded-full",
          compact
            ? "h-[clamp(42px,7vh,72px)] w-[clamp(42px,7vh,72px)] text-[clamp(15px,2.3vh,24px)] font-semibold"
            : "h-[clamp(64px,10vh,112px)] w-[clamp(64px,10vh,112px)] text-[clamp(24px,4vh,40px)] font-semibold",
        )}
      >
        {name.charAt(0).toUpperCase()}
      </div>
      <p
        className="vt-call-overlay-label tile-label absolute bottom-3 left-3 max-w-[calc(100%-24px)] truncate px-2.5 py-1.5 text-[12px] leading-none"
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
        "vt-call-video-shell participant-tile participant-tile--screen relative flex shrink-0 items-center justify-center text-white",
        isWatchingInline && "participant-tile--watching bg-[#0d0e10]",
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
            className="badge-live absolute left-3 top-3 rounded-full bg-destructive px-2.5 py-1 text-[10px] font-bold leading-none text-destructive-foreground shadow-sm"
            data-testid="participant-screen-live-badge"
          >
            720p · LIVE
          </span>
          <Volume2
            className="tile-speaker absolute bottom-3 right-3 h-4 w-4 text-white opacity-90"
            aria-label="Stream volume"
          />
          <button
            type="button"
            className="vt-call-overlay-label tile-expand absolute right-3 top-3 flex h-8 w-8 items-center justify-center border-0 p-0 hover:bg-black/75"
            onClick={onExpand}
            aria-label={`Expand ${name}'s screen`}
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[#111214] text-white">
          {stream && !isLocalSharer ? (
            <button
              type="button"
              className="vt-call-floating watch-btn flex items-center gap-2 px-4 py-2 text-sm font-medium text-foreground hover:bg-card"
              onClick={onWatch}
            >
              <Play className="h-4 w-4 fill-current text-primary" />
              Watch stream
            </button>
          ) : stream && isLocalSharer ? (
            <div className="vt-call-floating flex items-center gap-2 px-4 py-2 text-sm font-medium text-foreground">
              <ScreenShare className="h-4 w-4" />
              Sharing screen
            </div>
          ) : (
            <span className="px-4 text-center text-sm text-zinc-500">Waiting for shared screen...</span>
          )}
        </div>
      )}

      {isWatchingInline && isLocalSharer && onStopScreenShare && (
        <button
          type="button"
          className={cn(
            "vt-call-overlay-label absolute right-3 top-3 flex h-8 w-8 items-center justify-center border-0 p-0 text-white hover:bg-black/75 disabled:opacity-60",
            isWatchingInline && "right-12",
          )}
          onClick={onStopScreenShare}
          disabled={isScreenShareUpdating}
          aria-label={isScreenShareUpdating ? "Updating screen share" : "Stop sharing"}
        >
          <MonitorX className="h-4 w-4" />
        </button>
      )}

      <div className="vt-call-overlay-label tile-label pointer-events-none absolute bottom-3 left-3 flex max-w-[calc(100%-24px)] items-center gap-1.5 px-2.5 py-1.5">
        <ScreenShare className="h-3.5 w-3.5 shrink-0 text-white" />
        <p className="truncate text-[12px] leading-none text-white" data-testid="participant-screen-name">
          {name}
        </p>
      </div>
    </div>
  );
}
