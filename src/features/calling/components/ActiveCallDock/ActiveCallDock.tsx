import { useEffect, useRef, useState } from "react";
import { Maximize, Mic, MicOff, Minimize, MonitorUp, MonitorX, PhoneOff } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { formatCallTime } from "@/utils/formatDate";
import type { CallDiagnostics, CallIssue, CallStatus } from "@/features/calling/hooks/useCall.types";
import { getCallStatusLabel, normalizeCallIssue } from "@/features/calling/utils/callUxText";
import { detachVideo, safelyPlayVideo } from "./mediaVideo";

interface ActiveCallDockProps {
  remoteUsername: string;
  callStatus?: CallStatus;
  seconds: number;
  isMuted: boolean;
  isScreenSharing: boolean;
  isScreenShareUpdating: boolean;
  isRemoteScreenLoading: boolean;
  callIssue: CallIssue | null;
  remoteScreenStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  diagnostics: CallDiagnostics;
  onMuteToggle: () => void;
  onStartScreenShare: () => Promise<void>;
  onStopScreenShare: () => void;
  onHangUp: () => void;
}

function StreamVideo({
  stream,
  label,
  className,
  muted = true,
  testId,
}: {
  stream: MediaStream | null;
  label: string;
  className: string;
  muted?: boolean;
  testId: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void safelyPlayVideo(video, label);
    else detachVideo(video);
    return () => detachVideo(video);
  }, [label, stream]);

  return (
    <video
      ref={videoRef}
      className={className}
      autoPlay
      playsInline
      muted={muted}
      aria-label={label}
      data-testid={testId}
    />
  );
}

export function ActiveCallDock({
  remoteUsername,
  callStatus = "active",
  seconds,
  isMuted,
  isScreenSharing,
  isScreenShareUpdating,
  isRemoteScreenLoading,
  callIssue,
  remoteScreenStream,
  localScreenStream,
  diagnostics,
  onMuteToggle,
  onStartScreenShare,
  onStopScreenShare,
  onHangUp,
}: ActiveCallDockProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(false);
  const displayIssue = normalizeCallIssue(callIssue);
  const hasScreenShare = isRemoteScreenLoading || Boolean(remoteScreenStream) || Boolean(localScreenStream) || isScreenSharing;
  const statusLabel = getCallStatusLabel({
    status: callStatus,
    diagnostics,
    isScreenSharing,
    isScreenShareUpdating,
  });

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(document.fullscreenElement === stageRef.current);
    const handleFullscreenError = () => setIsFullscreen(false);
    document.addEventListener("fullscreenchange", syncFullscreen);
    document.addEventListener("fullscreenerror", handleFullscreenError);
    syncFullscreen();
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      document.removeEventListener("fullscreenerror", handleFullscreenError);
    };
  }, []);

  useEffect(() => {
    if (callStatus !== "active" || !hasScreenShare) {
      setIsFullscreen(false);
      setControlsVisible(false);
      if (document.fullscreenElement === stageRef.current) void document.exitFullscreen?.();
    }
  }, [callStatus, hasScreenShare]);

  const toggleFullscreen = async () => {
    if (!stageRef.current) return;
    if (document.fullscreenElement === stageRef.current) {
      await document.exitFullscreen?.();
      return;
    }
    if (stageRef.current.requestFullscreen) {
      try {
        await stageRef.current.requestFullscreen();
      } catch {
        setIsFullscreen(false);
      }
    }
  };

  const controlProps = {
    onMouseEnter: () => setControlsVisible(true),
    onMouseLeave: () => setControlsVisible(false),
  };

  if (!hasScreenShare) {
    return (
      <section className="active-call-dock active-call-dock--voice flex h-[88px] shrink-0 items-center border-b border-border px-4 text-foreground" data-testid="active-call-dock" aria-label="Active call dock">
        {displayIssue && <div className="mr-3 rounded-md border border-destructive/35 bg-destructive/10 px-2 py-1 text-xs" data-testid="call-issue-banner">{displayIssue.message}</div>}
        <div className="flex min-w-0 flex-1 items-center gap-3" data-testid="active-call-voice-surface">
          <div className="vt-call-avatar h-10 w-10 shrink-0 text-sm font-semibold" aria-hidden="true">{remoteUsername.slice(0, 1).toUpperCase()}</div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-foreground" data-testid="active-call-remote-name">{remoteUsername}</h2>
            <p className="truncate text-xs text-muted-foreground" data-testid="active-call-dock-status">{statusLabel} · {formatCallTime(seconds)}</p>
          </div>
        </div>
        <CallControls
          {...controlProps}
          isMuted={isMuted}
          isScreenSharing={false}
          isScreenShareUpdating={isScreenShareUpdating}
          isFullscreen={false}
          onMuteToggle={onMuteToggle}
          onStartScreenShare={onStartScreenShare}
          onStopScreenShare={onStopScreenShare}
          onHangUp={onHangUp}
          onToggleFullscreen={undefined}
        />
      </section>
    );
  }

  return (
    <section className="active-call-dock active-call-dock--screen flex min-h-[300px] min-w-0 flex-1 flex-col border-b border-border text-foreground" data-testid="active-call-dock" aria-label="Active call dock">
      {displayIssue && <div className="m-3 rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm" data-testid="call-issue-banner">{displayIssue.message}</div>}
      <div
        ref={stageRef}
        className={cn("screen-share-stage group relative min-h-0 flex-1 overflow-hidden bg-black", isFullscreen && "screen-share-stage--fullscreen")}
        data-testid="screen-share-stage"
        data-controls-visible={controlsVisible ? "true" : "false"}
        onMouseEnter={() => setControlsVisible(true)}
        onMouseLeave={() => setControlsVisible(false)}
        onFocus={() => setControlsVisible(true)}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setControlsVisible(false); }}
        onKeyDown={(event) => { if (event.key === "Escape" && document.fullscreenElement === stageRef.current) void document.exitFullscreen?.(); }}
        tabIndex={-1}
      >
        {remoteScreenStream ? (
          <StreamVideo stream={remoteScreenStream} label={`${remoteUsername} screen share`} className="absolute inset-0 h-full w-full object-contain" muted testId="remote-screen-share-video" />
        ) : localScreenStream ? (
          <StreamVideo stream={localScreenStream} label="Your screen share" className="absolute inset-0 h-full w-full object-contain" muted testId="local-screen-share-video" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70" data-testid="screen-share-loading">{isRemoteScreenLoading ? "Connecting to screen share…" : "Screen share is starting…"}</div>
        )}

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4 text-white" data-testid="screen-share-info">
          <div className="min-w-0"><p className="truncate text-sm font-semibold">{remoteUsername}</p><p className="text-xs text-white/70">Screen sharing · {formatCallTime(seconds)}</p></div>
          <span className="rounded-full bg-black/45 px-2.5 py-1 text-xs text-white/80">{statusLabel}</span>
        </div>

        {localScreenStream && remoteScreenStream && <div className="absolute bottom-4 right-4 h-[90px] w-[160px] overflow-hidden rounded-md bg-zinc-900 shadow-lg" data-testid="local-screen-share-pip"><StreamVideo stream={localScreenStream} label="Your screen share preview" className="h-full w-full object-cover" testId="local-screen-share-pip-video" /></div>}

        <div className="screen-share-stage__controls stage-controls absolute inset-x-0 bottom-4 flex justify-center transition-[opacity,transform,visibility] duration-150 ease-out" data-testid="active-call-dock-controls" {...controlProps}>
          <CallControls
            isMuted={isMuted}
            isScreenSharing={isScreenSharing}
            isScreenShareUpdating={isScreenShareUpdating}
            isFullscreen={isFullscreen}
            onMuteToggle={onMuteToggle}
            onStartScreenShare={onStartScreenShare}
            onStopScreenShare={onStopScreenShare}
            onHangUp={onHangUp}
            onToggleFullscreen={toggleFullscreen}
          />
        </div>
      </div>
    </section>
  );
}

function CallControls({
  isMuted, isScreenSharing, isScreenShareUpdating, isFullscreen, onMuteToggle, onStartScreenShare, onStopScreenShare, onHangUp, onToggleFullscreen, onMouseEnter, onMouseLeave,
}: {
  isMuted: boolean; isScreenSharing: boolean; isScreenShareUpdating: boolean; isFullscreen: boolean; onMuteToggle: () => void; onStartScreenShare: () => Promise<void>; onStopScreenShare: () => void; onHangUp: () => void; onToggleFullscreen?: () => Promise<void>; onMouseEnter?: () => void; onMouseLeave?: () => void;
}) {
  return <div className="call-controls flex items-center justify-center gap-2 rounded-lg bg-black/60 p-2 text-white" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
    <button className={cn("vt-call-control h-10 w-10 p-0", isMuted && "bg-destructive/20 text-destructive")} onClick={onMuteToggle} aria-label={isMuted ? "Unmute" : "Mute"}>{isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}</button>
    <button className="vt-call-control h-10 w-10 p-0" onClick={isScreenSharing ? onStopScreenShare : () => { void onStartScreenShare(); }} aria-label={isScreenShareUpdating ? "Updating screen share" : isScreenSharing ? "Stop sharing" : "Share screen"} disabled={isScreenShareUpdating}>{isScreenSharing ? <MonitorX className="h-4 w-4" /> : <MonitorUp className="h-4 w-4" />}</button>
    {onToggleFullscreen && <button className="vt-call-control h-10 w-10 p-0" onClick={() => { void onToggleFullscreen(); }} aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}>{isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}</button>}
    <button className="vt-call-control vt-call-control--danger h-10 w-10 p-0" onClick={onHangUp} aria-label="Hang Up"><PhoneOff className="h-4 w-4" /></button>
  </div>;
}
