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
      className="focus-stream-view flex h-full w-full min-w-0 flex-col gap-[clamp(12px,2vh,20px)] text-foreground"
      data-testid="focus-stream-view"
    >
      <div className="focus-header flex shrink-0 items-center gap-2">
        <Monitor className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <h2 className="title truncate text-sm font-semibold text-foreground">
          {sharerName}'s screen
        </h2>
        <span className="badge-live rounded-full bg-destructive px-2 py-1 text-[9px] font-bold uppercase leading-none text-destructive-foreground">
          LIVE
        </span>
        <span className="vt-call-badge meta border-0 px-2 py-1 text-[10px]">720p</span>
        <div className="spacer flex-1" />
        <button
          type="button"
          className="vt-call-control focus-close h-[34px] w-[34px] shrink-0 p-0 text-muted-foreground"
          onClick={onExitFocus}
          aria-label="Exit focus view"
        >
          <X className="h-[13px] w-[13px]" />
        </button>
      </div>

      <div
        className="vt-call-video-shell focus-stage relative flex min-h-[180px] flex-1 items-center justify-center bg-[#0b0c0d]"
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
        className="focus-strip watch-stage-ui flex shrink-0 justify-center gap-[clamp(12px,2vw,24px)] overflow-x-auto"
        data-testid="focus-participant-strip"
      >
        {stripParticipants.map((participant) => (
          <div
            key={participant.id}
            className="vt-call-tile focus-strip-tile relative flex h-[clamp(76px,12vh,120px)] w-[clamp(120px,18vw,220px)] shrink-0 items-center justify-center"
          >
            <div className="vt-call-avatar avatar-circle flex h-[clamp(34px,6vh,56px)] w-[clamp(34px,6vh,56px)] shrink-0 items-center justify-center rounded-full text-[clamp(13px,2vh,20px)]">
              {participant.name.charAt(0).toUpperCase()}
            </div>
            <div className="vt-call-overlay-label strip-label absolute bottom-2 left-2 max-w-[calc(100%-16px)] truncate px-1.5 py-1 text-[10px] leading-none text-white">
              {participant.name}
            </div>
          </div>
        ))}
      </div>

      <div
        className="vt-call-floating focus-controls watch-stage-ui flex h-[58px] shrink-0 items-center justify-center gap-[clamp(12px,2vw,20px)] self-center px-3"
        data-testid="focus-control-bar"
      >
        <div className="cluster flex items-center gap-2.5">
          <button
            className={cn(
              "vt-call-control ctrl-btn h-12 w-12 p-0",
              isMuted && "bg-destructive/12 text-destructive hover:bg-destructive/16",
            )}
            onClick={onMuteToggle}
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>

          <button
            className={cn(
              "vt-call-control vt-call-control--active ctrl-btn ctrl-btn--active h-12 w-12 p-0 disabled:pointer-events-none disabled:opacity-60",
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
            className="vt-call-control vt-call-control--danger ctrl-btn ctrl-btn--danger h-12 w-12 p-0"
            onClick={onHangUp}
            aria-label="Hang Up"
          >
            <PhoneOff className="h-5 w-5" />
          </button>
        </div>

        <div className="cluster flex items-center gap-2.5">
          <button
            type="button"
            className="vt-call-control icon-only h-10 w-10 p-0 text-muted-foreground"
            aria-label="Stream volume"
          >
            <Volume2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="vt-call-control icon-only h-10 w-10 p-0 text-muted-foreground"
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
  onExitTrueFullscreen: () => void;
}

export function FullscreenStreamView({
  stream,
  sharerName,
  isLocalSharer,
  participants,
  isMuted,
  isScreenSharing,
  isScreenShareUpdating,
  onExitTrueFullscreen,
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
        onExitTrueFullscreen();
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    if (root?.requestFullscreen) {
      root
        .requestFullscreen()
        .catch(() => {
          browserFullscreenActiveRef.current = false;
          restoreDocumentOverflow();
          onExitTrueFullscreen();
        });
    }

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [onExitTrueFullscreen]);

  const handleExitFullscreen = () => {
    if (document.fullscreenElement && document.exitFullscreen) {
      void document.exitFullscreen().catch(() => {
        restoreDocumentOverflow();
        onExitTrueFullscreen();
      });
      return;
    }

    restoreDocumentOverflow();
    onExitTrueFullscreen();
  };

  return (
    <div
      ref={rootRef}
      className="fullscreen-stream-view fixed inset-0 z-50 h-[100dvh] max-h-[100dvh] overflow-hidden bg-[#070a09] px-8 text-white"
      data-testid="fullscreen-stream-view"
    >
      <button
        type="button"
        className="vt-call-overlay-label absolute right-5 top-5 z-10 flex h-10 w-10 items-center justify-center p-0 text-white hover:bg-black/80"
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
          className="vt-call-video-shell relative aspect-video max-h-[calc(100dvh-264px)] w-[min(1420px,calc(100vw-500px),calc((100dvh-264px)*16/9))] max-w-[1420px] bg-black"
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
          className="vt-call-floating fullscreen-ui mt-3 flex min-h-[108px] max-w-[calc(100vw-96px)] flex-wrap items-center justify-center gap-[15px] overflow-x-auto px-3 py-3"
          data-testid="fullscreen-participant-strip"
        >
          <div
            className="vt-call-video-shell relative flex h-[108px] w-[188px] shrink-0 items-center justify-center bg-[#15171a]"
            data-testid="fullscreen-screen-share-tile"
          >
            <ScreenShare className="h-6 w-6 text-white/90" />
            <div className="vt-call-overlay-label absolute bottom-1.5 left-1.5 max-w-[calc(100%-12px)] truncate px-1.5 py-1 text-[10px] leading-none text-white">
              {sharerName}
            </div>
          </div>
          {stripParticipants.map((participant) => (
            <div
              key={participant.id}
              className="vt-call-tile relative flex h-[108px] w-[188px] shrink-0 items-center justify-center bg-zinc-900"
              data-testid="fullscreen-participant-avatar-tile"
            >
              <div className="vt-call-avatar flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white">
                {participant.name.charAt(0).toUpperCase()}
              </div>
              <div className="vt-call-overlay-label absolute bottom-1.5 left-1.5 max-w-[calc(100%-12px)] truncate px-1.5 py-1 text-[10px] leading-none text-white">
                {participant.name}
              </div>
            </div>
          ))}
        </div>

        <div
          className="vt-call-floating fullscreen-ui mt-3 flex h-[58px] w-[445px] max-w-[calc(100vw-96px)] items-center justify-center gap-3 px-4"
          data-testid="fullscreen-control-bar"
        >
          <button
            className={cn(
              "vt-call-control ctrl-btn h-10 w-10 p-0 text-white",
              isMuted ? "bg-destructive/20 text-destructive-foreground hover:bg-destructive/30" : "bg-white/8 border-white/10 hover:bg-white/12",
            )}
            onClick={onMuteToggle}
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
          <button
            className="vt-call-control vt-call-control--active ctrl-btn h-10 w-10 p-0 disabled:pointer-events-none disabled:opacity-60"
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
            className="vt-call-control vt-call-control--danger ctrl-btn ctrl-btn--danger h-10 w-10 p-0"
            onClick={onHangUp}
            aria-label="Hang Up"
          >
            <PhoneOff className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="vt-call-control ctrl-btn h-10 w-10 p-0 text-white bg-white/8 border-white/10 hover:bg-white/12"
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
