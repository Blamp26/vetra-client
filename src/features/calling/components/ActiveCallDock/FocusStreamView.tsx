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

  return (
    <div
      className="focus-stream-view mx-4 mb-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-[var(--call-border)] bg-[var(--call-surface-1)] text-[var(--call-text-primary)]"
      data-testid="focus-stream-view"
    >
      <div className="focus-header flex h-10 shrink-0 items-center justify-between gap-3 border-b border-[var(--call-border)] bg-[var(--call-surface-2)] px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Monitor className="h-4 w-4 shrink-0 text-[var(--call-text-secondary)]" />
          <h2 className="truncate text-sm text-[var(--call-text-primary)]">{sharerName}'s screen</h2>
          <span className="rounded-full bg-red-600 px-2 py-1 text-[10px] uppercase text-white">LIVE</span>
          <span className="text-xs text-[var(--call-text-secondary)]">720p</span>
        </div>
        <button
          type="button"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--call-border)] bg-[var(--call-fill-control)] p-0 text-[var(--call-text-primary)] hover:bg-accent"
          onClick={onExitFocus}
          aria-label="Exit focus view"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div
        className="focus-stage min-h-0 flex-1 max-h-[min(40vh,300px)] bg-black p-2"
        data-testid="focus-stream-stage"
      >
        <div className="relative h-full overflow-hidden rounded-md bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isLocalSharer}
            onLoadedData={() => setIsVideoReady(true)}
            onCanPlay={() => setIsVideoReady(true)}
            className="h-full w-full bg-black object-contain"
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
      </div>

      <div
        className="focus-strip flex h-12 shrink-0 gap-2 overflow-x-auto border-t border-[var(--call-border)] bg-[var(--call-surface-2)] px-3 py-1.5"
        data-testid="focus-participant-strip"
      >
        {participants.map((participant) => (
          <div
            key={participant.id}
            className="flex min-w-32 items-center gap-2 rounded-md bg-[var(--call-surface-1)] px-2"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
              {participant.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs text-[var(--call-text-primary)]">{participant.name}</p>
              <p className="truncate text-[10px] uppercase text-[var(--call-text-secondary)]">
                {participant.isMuted ? "Muted" : participant.label}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div
        className="focus-controls grid h-11 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-t border-[var(--call-border)] bg-[var(--call-surface-2)] px-3"
        data-testid="focus-control-bar"
      >
        <div />
        <div className="flex items-center justify-center gap-2">
          <button
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full border border-[var(--call-border)] p-0 transition-colors",
              isMuted
                ? "bg-[var(--call-bg-danger)] text-[var(--call-text-danger)]"
                : "bg-[var(--call-fill-control)] text-[var(--call-text-primary)] hover:bg-accent",
            )}
            onClick={onMuteToggle}
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>

          <button
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full border border-[var(--call-border)] bg-[var(--call-fill-control)] p-0 text-[var(--call-text-primary)] transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-60",
              isScreenSharing && "bg-accent",
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
            className="flex h-8 w-8 items-center justify-center rounded-full border border-transparent bg-[var(--call-fill-danger)] p-0 text-[var(--call-on-danger)] hover:opacity-90"
            onClick={onHangUp}
            aria-label="Hang Up"
          >
            <PhoneOff className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--call-border)] bg-[var(--call-fill-control)] p-0 text-[var(--call-text-primary)] hover:bg-accent"
            aria-label="Stream volume"
          >
            <Volume2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--call-border)] bg-[var(--call-fill-control)] p-0 text-[var(--call-text-primary)] hover:bg-accent"
            aria-label="Pop out stream"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--call-border)] bg-[var(--call-fill-control)] p-0 text-[var(--call-text-primary)] hover:bg-accent"
            aria-label="Fullscreen stream"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
