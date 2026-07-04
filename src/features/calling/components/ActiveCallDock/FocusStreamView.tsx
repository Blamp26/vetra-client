import { useEffect, useRef, useState } from "react";
import {
  Maximize2,
  Mic,
  MicOff,
  Monitor,
  MonitorUp,
  MonitorX,
  PhoneOff,
  ScreenShare,
  Volume2,
  X,
} from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { detachVideo, safelyPlayVideo } from "./mediaVideo";
import type { CallGridParticipant } from "./CallGridView";

interface FocusStreamViewProps {
  stream: MediaStream;
  streamId: string;
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
  onEnterFullscreen: (id: string) => void;
}

export function FocusStreamView({
  stream,
  streamId,
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
  onEnterFullscreen,
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

  const stripParticipants = participants;

  return (
    <div
      className="focus-stream-view group flex h-full w-full min-w-0 flex-col gap-[clamp(10px,2vh,20px)] bg-[var(--call-surface-1)] text-[var(--call-text-primary)]"
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
          className="focus-close flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[4px] border border-[var(--call-border)] bg-[var(--call-surface-2)] p-0 text-[var(--call-text-secondary)] hover:opacity-90"
          onClick={onExitFocus}
          aria-label="Exit focus view"
        >
          <X className="h-[13px] w-[13px]" />
        </button>
      </div>

      <div
        className="focus-stage relative flex min-h-[180px] flex-1 items-center justify-center overflow-hidden rounded-[4px] border border-[var(--call-border)] bg-[#0b0c0d]"
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
        className="focus-strip watch-stage-ui flex shrink-0 justify-center gap-[clamp(12px,2vw,24px)] overflow-x-auto opacity-20 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
        data-testid="focus-participant-strip"
      >
        {stripParticipants.map((participant) => (
          <div
            key={participant.id}
            className="focus-strip-tile relative flex h-[clamp(76px,12vh,120px)] w-[clamp(120px,18vw,220px)] shrink-0 items-center justify-center rounded-[4px] border border-[var(--call-border)] bg-[var(--call-surface-2)]"
          >
            <div className="avatar-circle flex h-[clamp(34px,6vh,56px)] w-[clamp(34px,6vh,56px)] shrink-0 items-center justify-center rounded-full bg-[var(--call-fill-control)] text-[clamp(13px,2vh,20px)] text-[var(--call-text-primary)]">
              {participant.name.charAt(0).toUpperCase()}
            </div>
            <div className="strip-label absolute bottom-2 left-2 max-w-[calc(100%-16px)] truncate rounded-[3px] bg-black/50 px-1.5 py-1 text-[10px] leading-none text-white">
              {participant.name}
            </div>
          </div>
        ))}
      </div>

      <div
        className="focus-controls watch-stage-ui flex h-[50px] shrink-0 items-center justify-center gap-[clamp(16px,2.2vw,42px)] opacity-20 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
        data-testid="focus-control-bar"
      >
        <div className="cluster flex items-center gap-2.5">
          <button
            className={cn(
              "ctrl-btn flex h-12 w-12 items-center justify-center rounded-[4px] border border-[var(--call-border)] bg-[var(--call-fill-control)] p-0 text-[var(--call-text-primary)] transition-colors",
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
              "ctrl-btn ctrl-btn--active flex h-12 w-12 items-center justify-center rounded-[4px] border border-[var(--call-border)] bg-[var(--call-text-accent)] p-0 text-white transition-colors hover:opacity-90 disabled:pointer-events-none disabled:opacity-60",
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
            className="ctrl-btn ctrl-btn--danger flex h-12 w-12 items-center justify-center rounded-[4px] border border-[var(--call-fill-danger)] bg-[var(--call-fill-danger)] p-0 text-[var(--call-on-danger)] hover:opacity-90"
            onClick={onHangUp}
            aria-label="Hang Up"
          >
            <PhoneOff className="h-5 w-5" />
          </button>
        </div>

        <div className="cluster flex items-center gap-2.5">
          <button
            type="button"
            className="icon-only flex h-10 w-10 items-center justify-center rounded-[4px] border border-[var(--call-border)] bg-[var(--call-surface-2)] p-0 text-[var(--call-text-secondary)] hover:opacity-90"
            aria-label="Stream volume"
          >
            <Volume2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="icon-only flex h-10 w-10 items-center justify-center rounded-[4px] border border-[var(--call-border)] bg-[var(--call-surface-2)] p-0 text-[var(--call-text-secondary)] hover:opacity-90"
            aria-label="Pop out stream"
            onClick={() => onEnterFullscreen(streamId)}
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

interface FullscreenStreamViewProps extends Omit<FocusStreamViewProps, "onEnterFullscreen"> {
  onExitFullscreen: () => void;
}

export function FullscreenStreamView({
  stream,
  sharerName,
  isLocalSharer,
  participants,
  isMuted,
  isScreenSharing,
  isScreenShareUpdating,
  onExitFullscreen,
  onMuteToggle,
  onStartScreenShare,
  onStopScreenShare,
  onHangUp,
}: FullscreenStreamViewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const browserFullscreenActiveRef = useRef(false);
  const previousDocumentOverflowRef = useRef("");
  const previousBodyOverflowRef = useRef("");
  const [isVideoReady, setIsVideoReady] = useState(false);
  const stripParticipants = participants;

  const restoreDocumentOverflow = () => {
    document.documentElement.style.overflow =
      previousDocumentOverflowRef.current === "hidden" ? "" : previousDocumentOverflowRef.current;
    document.body.style.overflow =
      previousBodyOverflowRef.current === "hidden" ? "" : previousBodyOverflowRef.current;
    delete document.documentElement.dataset.vetraFullscreenOverflowLock;
  };

  useEffect(() => {
    const video = videoRef.current;
    setIsVideoReady(false);
    if (!video) return;

    video.srcObject = stream;
    void safelyPlayVideo(video, "fullscreen_screen_share");

    return () => {
      detachVideo(video);
    };
  }, [stream]);

  useEffect(() => {
    if (document.documentElement.dataset.vetraFullscreenOverflowLock !== "true") {
      previousDocumentOverflowRef.current = document.documentElement.style.overflow;
      previousBodyOverflowRef.current = document.body.style.overflow;
      document.documentElement.dataset.vetraFullscreenOverflowLock = "true";
    }

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    return () => {
      restoreDocumentOverflow();
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;

    const handleFullscreenChange = () => {
      if (document.fullscreenElement === root) {
        browserFullscreenActiveRef.current = true;
        return;
      }

      if (browserFullscreenActiveRef.current) {
        browserFullscreenActiveRef.current = false;
        restoreDocumentOverflow();
        onExitFullscreen();
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    if (root?.requestFullscreen) {
      root
        .requestFullscreen()
        .catch(() => {
          browserFullscreenActiveRef.current = false;
        });
    }

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [onExitFullscreen]);

  const handleExitFullscreen = () => {
    if (document.fullscreenElement && document.exitFullscreen) {
      void document.exitFullscreen().catch(() => {
        restoreDocumentOverflow();
        onExitFullscreen();
      });
      return;
    }

    restoreDocumentOverflow();
    onExitFullscreen();
  };

  return (
    <div
      ref={rootRef}
      className="fullscreen-stream-view group fixed inset-0 z-50 h-[100dvh] max-h-[100dvh] overflow-hidden bg-[#050506] px-8 text-white"
      data-testid="fullscreen-stream-view"
    >
      <button
        type="button"
        className="absolute right-5 top-5 z-10 flex h-10 w-10 items-center justify-center rounded-[4px] border border-white/20 bg-black/60 p-0 text-white hover:bg-black/80"
        onClick={handleExitFullscreen}
        aria-label="Exit fullscreen stream"
      >
        <X className="h-5 w-5" />
      </button>

      <div
        className="fullscreen-content flex h-[100dvh] max-h-[100dvh] w-full flex-col items-center justify-start pb-3 pt-[clamp(24px,6.7vh,72px)]"
        data-testid="fullscreen-content"
      >
        <div
          className="relative aspect-video max-h-[calc(100dvh-264px)] w-[min(1420px,calc(100vw-500px),calc((100dvh-264px)*16/9))] max-w-[1420px] overflow-hidden bg-black"
          data-testid="fullscreen-stream-stage"
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isLocalSharer}
            onLoadedData={() => setIsVideoReady(true)}
            onCanPlay={() => setIsVideoReady(true)}
            className="h-full w-full bg-black object-contain"
            data-testid="fullscreen-stream-video"
          />
          {!isVideoReady && (
            <div
              className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-zinc-400"
              data-testid="fullscreen-stream-loading"
            >
              Loading shared screen...
            </div>
          )}
        </div>

        <div
          className="fullscreen-ui mt-2.5 flex h-[108px] max-w-[calc(100vw-96px)] flex-wrap items-center justify-center gap-[15px] overflow-x-auto rounded-[4px] bg-black/55 px-3 py-0 opacity-0 transition-opacity duration-150 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
          data-testid="fullscreen-participant-strip"
        >
          <div
            className="relative flex h-[108px] w-[188px] shrink-0 items-center justify-center rounded-[4px] bg-[#15171a]"
            data-testid="fullscreen-screen-share-tile"
          >
            <ScreenShare className="h-6 w-6 text-white/90" />
            <div className="absolute bottom-1.5 left-1.5 max-w-[calc(100%-12px)] truncate rounded-[3px] bg-black/60 px-1.5 py-1 text-[10px] leading-none text-white">
              {sharerName}
            </div>
          </div>
          {stripParticipants.map((participant) => (
            <div
              key={participant.id}
              className="relative flex h-[108px] w-[188px] shrink-0 items-center justify-center rounded-[4px] bg-zinc-900"
              data-testid="fullscreen-participant-avatar-tile"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-700 text-sm font-semibold text-white">
                {participant.name.charAt(0).toUpperCase()}
              </div>
              <div className="absolute bottom-1.5 left-1.5 max-w-[calc(100%-12px)] truncate rounded-[3px] bg-black/60 px-1.5 py-1 text-[10px] leading-none text-white">
                {participant.name}
              </div>
            </div>
          ))}
        </div>

        <div
          className="fullscreen-ui mt-3 flex h-[50px] w-[445px] max-w-[calc(100vw-96px)] items-center justify-center gap-3 rounded-[4px] bg-black/60 px-4 opacity-0 transition-opacity duration-150 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
          data-testid="fullscreen-control-bar"
        >
          <button
            className={cn(
              "ctrl-btn flex h-10 w-10 items-center justify-center rounded-[4px] border border-white/15 bg-zinc-800 p-0 text-white transition-colors",
              isMuted ? "bg-red-950 text-red-200" : "hover:bg-zinc-700",
            )}
            onClick={onMuteToggle}
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
          <button
            className="ctrl-btn flex h-10 w-10 items-center justify-center rounded-[4px] border border-white/15 bg-blue-700 p-0 text-white transition-colors hover:bg-blue-600 disabled:pointer-events-none disabled:opacity-60"
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
            className="ctrl-btn ctrl-btn--danger flex h-10 w-10 items-center justify-center rounded-[4px] border border-red-500 bg-red-600 p-0 text-white hover:bg-red-500"
            onClick={onHangUp}
            aria-label="Hang Up"
          >
            <PhoneOff className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="ctrl-btn flex h-10 w-10 items-center justify-center rounded-[4px] border border-white/15 bg-zinc-800 p-0 text-white hover:bg-zinc-700"
            onClick={handleExitFullscreen}
            aria-label="Close stream"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
