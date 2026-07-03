import { useEffect, useRef, useState } from "react";
import {
  Maximize2,
  Mic,
  MicOff,
  Monitor,
  MonitorUp,
  MonitorX,
  PhoneOff,
  Volume2,
  X,
} from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { detachVideo, safelyPlayVideo } from "./mediaVideo";
import type { CallGridParticipant } from "./CallGridView";

interface FocusStreamViewProps {
  stream: MediaStream;
  sharerName: string;
  isLocalSharer: boolean;
  participants: CallGridParticipant[];
  isMuted: boolean;
  isScreenSharing: boolean;
  isScreenShareUpdating: boolean;
  onExitFocus: () => void;
  onMuteToggle: () => void;
  onStartScreenShare: () => Promise<void>;
  onStopScreenShare: () => void;
  onHangUp: () => void;
}

export function FocusStreamView({
  stream,
  sharerName,
  isLocalSharer,
  participants,
  isMuted,
  isScreenSharing,
  isScreenShareUpdating,
  onExitFocus,
  onMuteToggle,
  onStartScreenShare,
  onStopScreenShare,
  onHangUp,
}: FocusStreamViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    setIsVideoReady(false);
    if (!video) return;

    video.srcObject = stream;
    void safelyPlayVideo(video, "focused_screen_share");

    return () => {
      detachVideo(video);
    };
  }, [stream]);

  const stripParticipants = participants.filter((participant) => participant.name !== sharerName);

  return (
    <div
      className="focus-stream-view flex h-full w-full min-w-0 flex-col gap-[clamp(10px,2vh,20px)] bg-[var(--call-surface-1)] text-[var(--call-text-primary)]"
      data-testid="focus-stream-view"
    >
      <div className="focus-header flex shrink-0 items-center gap-2">
        <Monitor className="h-3.5 w-3.5 shrink-0 text-[var(--call-text-secondary)]" />
        <h2 className="title truncate text-[13px] font-semibold text-[var(--call-text-primary)]">
          {sharerName}'s screen
        </h2>
        <span className="badge-live rounded bg-[var(--call-fill-danger)] px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none text-[var(--call-on-danger)]">
          LIVE
        </span>
        <span className="meta text-[11px] text-[var(--call-text-secondary)]">720p</span>
        <div className="spacer flex-1" />
        <button
          type="button"
          className="focus-close flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md border border-[var(--call-border)] bg-[var(--call-surface-1)] p-0 text-[var(--call-text-secondary)] hover:opacity-90"
          onClick={onExitFocus}
          aria-label="Exit focus view"
        >
          <X className="h-[13px] w-[13px]" />
        </button>
      </div>

      <div
        className="focus-stage relative flex min-h-[180px] flex-1 items-center justify-center overflow-hidden rounded-[10px] bg-[#0b0c0d]"
        data-testid="focus-stream-stage"
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocalSharer}
          onLoadedData={() => setIsVideoReady(true)}
          onCanPlay={() => setIsVideoReady(true)}
          className="h-full w-full bg-[#0b0c0d] object-contain"
          data-testid="focus-stream-video"
        />
        {!isVideoReady && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-zinc-400"
            data-testid="focus-stream-loading"
          >
            Loading shared screen...
          </div>
        )}
      </div>

      <div
        className="focus-strip flex shrink-0 justify-center gap-[clamp(12px,2vw,24px)] overflow-x-auto"
        data-testid="focus-participant-strip"
      >
        {stripParticipants.map((participant) => (
          <div
            key={participant.id}
            className="focus-strip-tile relative flex h-[clamp(76px,12vh,120px)] w-[clamp(120px,18vw,220px)] shrink-0 items-center justify-center rounded-md bg-[var(--call-surface-2)]"
          >
            <div className="avatar-circle flex h-[clamp(34px,6vh,56px)] w-[clamp(34px,6vh,56px)] shrink-0 items-center justify-center rounded-full bg-[var(--call-fill-control)] text-[clamp(13px,2vh,20px)] text-[var(--call-text-primary)]">
              {participant.name.charAt(0).toUpperCase()}
            </div>
            <div className="strip-label absolute bottom-2 left-2 max-w-[calc(100%-16px)] truncate rounded-[3px] bg-black/50 px-1.5 py-1 text-[10px] leading-none text-white">
              {participant.name}
            </div>
          </div>
        ))}
        <div className="focus-strip-tile sharing relative flex h-[clamp(76px,12vh,120px)] w-[clamp(120px,18vw,220px)] shrink-0 items-center justify-center rounded-md border-[1.5px] border-[#d4785a] bg-[#111214]">
          <div className="strip-label absolute bottom-2 left-2 max-w-[calc(100%-16px)] truncate rounded-[3px] bg-black/50 px-1.5 py-1 text-[10px] leading-none text-white">
            {sharerName}
          </div>
        </div>
      </div>

      <div
        className="focus-controls flex h-[50px] shrink-0 items-center justify-center gap-[clamp(16px,2.2vw,42px)]"
        data-testid="focus-control-bar"
      >
        <div className="cluster flex items-center gap-2.5">
          <button
            className={cn(
              "ctrl-btn flex h-9 w-9 items-center justify-center rounded-full border-0 bg-[var(--call-fill-control)] p-0 text-[var(--call-text-primary)] transition-colors",
              isMuted
                ? "bg-[var(--call-bg-danger)] text-[var(--call-text-danger)]"
                : "hover:opacity-90",
            )}
            onClick={onMuteToggle}
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>

          <button
            className={cn(
              "ctrl-btn ctrl-btn--active flex h-9 w-9 items-center justify-center rounded-full border-0 bg-[var(--call-text-accent)] p-0 text-white transition-colors hover:opacity-90 disabled:pointer-events-none disabled:opacity-60",
              !isScreenSharing && "bg-[var(--call-text-accent)]",
            )}
            onClick={isScreenSharing ? onStopScreenShare : () => { void onStartScreenShare(); }}
            aria-label={
              isScreenShareUpdating
                ? "Updating screen share"
                : isScreenSharing
                  ? "Stop sharing"
                  : "Share screen"
            }
            disabled={isScreenShareUpdating}
          >
            {isScreenSharing ? <MonitorX className="h-4 w-4" /> : <MonitorUp className="h-4 w-4" />}
          </button>

          <button
            className="ctrl-btn ctrl-btn--danger flex h-9 w-9 items-center justify-center rounded-full border-0 bg-[var(--call-fill-danger)] p-0 text-[var(--call-on-danger)] hover:opacity-90"
            onClick={onHangUp}
            aria-label="Hang Up"
          >
            <PhoneOff className="h-5 w-5" />
          </button>
        </div>

        <div className="cluster flex items-center gap-2.5">
          <button
            type="button"
            className="icon-only flex h-[30px] w-[30px] items-center justify-center rounded-lg border-0 bg-transparent p-0 text-[var(--call-text-secondary)] hover:bg-transparent hover:opacity-90"
            aria-label="Stream volume"
          >
            <Volume2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="icon-only flex h-[30px] w-[30px] items-center justify-center rounded-lg border-0 bg-transparent p-0 text-[var(--call-text-secondary)] hover:bg-transparent hover:opacity-90"
            aria-label="Pop out stream"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
