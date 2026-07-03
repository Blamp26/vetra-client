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
        "participant-tile participant-tile--avatar relative flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-[var(--call-surface-1)]",
        className,
      )}
      data-testid={testId}
      data-variant={variant}
    >
      <div
        className={cn(
          "avatar-circle flex items-center justify-center rounded-full bg-[var(--call-fill-control)] text-[var(--call-text-primary)]",
          compact ? "h-[42px] w-[42px] text-[15px] font-semibold" : "h-[42px] w-[42px] text-[15px] font-semibold",
        )}
      >
        {name.charAt(0).toUpperCase()}
      </div>
      <p
        className="tile-label absolute bottom-1.5 left-1.5 max-w-[calc(100%-12px)] truncate rounded bg-black/55 px-1.5 py-0.5 text-[10px] leading-none text-white"
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
        "participant-tile participant-tile--screen relative flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-[#111214] text-white",
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
            className="badge-live absolute left-1.5 top-1.5 rounded bg-[var(--call-fill-danger)] px-1.5 py-0.5 text-[9px] font-bold leading-none text-[var(--call-on-danger)]"
            data-testid="participant-screen-live-badge"
          >
            720p · LIVE
          </span>
          <Volume2
            className="tile-speaker absolute bottom-1.5 right-1.5 h-[13px] w-[13px] text-white opacity-90"
            aria-label="Stream volume"
          />
          <button
            type="button"
            className="tile-expand absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-[5px] border-0 bg-black/50 p-0 text-white hover:bg-black/70"
            onClick={onExpand}
            aria-label={`Expand ${name}'s screen`}
          >
            <Maximize2 className="h-3 w-3" />
          </button>
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[#111214] text-white">
          {stream ? (
            <button
              type="button"
              className="watch-btn flex items-center gap-1.5 rounded-2xl border border-white/35 bg-black/55 px-3.5 py-1.5 text-[11px] text-white hover:bg-black/70"
              onClick={onWatch}
            >
              <Play className="h-[13px] w-[13px] fill-current" />
              Watch stream
            </button>
          ) : (
            <span className="px-3 text-center text-xs text-zinc-500">Waiting for shared screen...</span>
          )}
        </div>
      )}

      {isWatchingInline && isLocalSharer && onStopScreenShare && (
        <button
          type="button"
          className={cn(
            "absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-[5px] border-0 bg-black/50 p-0 text-white hover:bg-black/70 disabled:opacity-60",
            isWatchingInline && "right-8",
          )}
          onClick={onStopScreenShare}
          disabled={isScreenShareUpdating}
          aria-label={isScreenShareUpdating ? "Updating screen share" : "Stop sharing"}
        >
          <MonitorX className="h-4 w-4" />
        </button>
      )}

      <div className="tile-label pointer-events-none absolute bottom-1.5 left-1.5 flex max-w-[calc(100%-12px)] items-center gap-1 rounded bg-black/55 px-1.5 py-0.5">
        <ScreenShare className="h-2.5 w-2.5 shrink-0 text-white" />
        <p className="truncate text-[10px] leading-none text-white" data-testid="participant-screen-name">
          {name}
        </p>
      </div>
    </div>
  );
}
