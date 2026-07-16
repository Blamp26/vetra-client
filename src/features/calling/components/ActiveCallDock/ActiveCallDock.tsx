import { useEffect, useRef, useState } from "react";
import { Maximize, Maximize2, Mic, MicOff, Minimize, Minimize2, MonitorUp, MonitorX, PhoneOff } from "lucide-react";
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
  const [isShareExpanded, setIsShareExpanded] = useState(false);
  const displayIssue = normalizeCallIssue(callIssue);
  const hasScreenShare = isRemoteScreenLoading || Boolean(remoteScreenStream) || Boolean(localScreenStream) || isScreenSharing;
  const statusLabel = getCallStatusLabel({
    status: callStatus,
    diagnostics,
    isScreenSharing,
    isScreenShareUpdating,
  });
  const shouldShowDiagnostics =
    import.meta.env.DEV && import.meta.env.VITE_WEBRTC_SHOW_DIAGNOSTICS === "true";

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(Boolean(stageRef.current) && document.fullscreenElement === stageRef.current);
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
      setIsShareExpanded(false);
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
      <section
        className="active-call-dock active-call-dock--voice relative flex h-[clamp(260px,38vh,420px)] min-h-[260px] shrink-0 flex-col border-b border-border text-foreground"
        data-testid="active-call-dock"
        aria-label="Active call dock"
      >
        <div className="voice-call-status absolute left-4 top-3 z-10 min-w-0" data-testid="active-call-voice-status">
          <p className="truncate text-xs font-medium text-muted-foreground" data-testid="active-call-dock-status">
            {statusLabel} · {formatCallTime(seconds)}
          </p>
        </div>

        {displayIssue && (
          <div className="voice-call-issue absolute left-4 right-4 top-9 z-10 rounded-md bg-destructive/10 px-3 py-1.5 text-xs text-foreground" data-testid="call-issue-banner">
            {displayIssue.message}
          </div>
        )}

        {shouldShowDiagnostics && (
          <div className="voice-call-diagnostics pointer-events-none absolute right-4 top-3 z-10 hidden text-[11px] text-muted-foreground lg:block" data-testid="webrtc-diagnostics">
            connection {diagnostics.connectionState} · ice {diagnostics.iceConnectionState} · candidate {diagnostics.selectedLocalCandidateType}
          </div>
        )}

        <div className="voice-call-participants flex min-h-0 flex-1 items-center gap-3 px-4 pb-4 pt-10" data-testid="active-call-voice-surface">
          <VoiceParticipantTile name="You" isMuted={isMuted} />
          <VoiceParticipantTile name={remoteUsername} />
        </div>

        <div className="voice-call-controls-wrap absolute inset-x-0 bottom-4 z-10 flex justify-center" data-testid="active-call-dock-controls">
          <CallControls
            className="voice-call-controls"
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
        </div>
      </section>
    );
  }

  if (!isShareExpanded) {
    return (
      <section
        className="active-call-dock active-call-dock--screen active-call-dock--framed flex h-[clamp(300px,42vh,480px)] min-h-[300px] shrink-0 flex-col border-b border-border text-foreground"
        data-testid="active-call-dock"
        aria-label="Active call dock"
      >
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="absolute left-4 top-3 z-10 text-xs font-medium text-muted-foreground" data-testid="active-call-screen-status">
            {statusLabel} · {formatCallTime(seconds)}
          </div>

          {displayIssue && (
            <div className="absolute left-4 right-4 top-9 z-10 rounded-md bg-destructive/10 px-3 py-1.5 text-xs text-foreground" data-testid="call-issue-banner">
              {displayIssue.message}
            </div>
          )}

          <div className="screen-share-framed-layout grid min-h-0 flex-1 grid-cols-2 grid-rows-[minmax(0,1.45fr)_minmax(0,1fr)] gap-3 px-4 pb-20 pt-10" data-testid="screen-share-framed-layout">
            <ScreenShareFrame
              stream={remoteScreenStream ?? localScreenStream}
              sharerName={remoteScreenStream ? remoteUsername : "You"}
              isLoading={isRemoteScreenLoading || isScreenSharing}
            />
            <FramedParticipantTile name="You" isMuted={isMuted} />
            <FramedParticipantTile name={remoteUsername} />
          </div>

          <div className="screen-share-framed-controls absolute inset-x-0 bottom-4 z-10 flex justify-center" data-testid="active-call-dock-controls">
            <CallControls
              className="screen-share-framed-controls__group"
              isMuted={isMuted}
              isScreenSharing={isScreenSharing}
              isScreenShareUpdating={isScreenShareUpdating}
              isFullscreen={false}
              onMuteToggle={onMuteToggle}
              onStartScreenShare={onStartScreenShare}
              onStopScreenShare={onStopScreenShare}
              onHangUp={onHangUp}
              onToggleExpanded={() => setIsShareExpanded(true)}
            />
          </div>
        </div>
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
            onToggleExpanded={isFullscreen ? undefined : () => setIsShareExpanded(false)}
            onToggleFullscreen={toggleFullscreen}
          />
        </div>
      </div>
    </section>
  );
}

function CallControls({
  className,
  isMuted, isScreenSharing, isScreenShareUpdating, isFullscreen, onMuteToggle, onStartScreenShare, onStopScreenShare, onHangUp, onToggleExpanded, onToggleFullscreen, onMouseEnter, onMouseLeave,
}: {
  className?: string;
  isMuted: boolean; isScreenSharing: boolean; isScreenShareUpdating: boolean; isFullscreen: boolean; onMuteToggle: () => void; onStartScreenShare: () => Promise<void>; onStopScreenShare: () => void; onHangUp: () => void; onToggleExpanded?: () => void; onToggleFullscreen?: () => Promise<void>; onMouseEnter?: () => void; onMouseLeave?: () => void;
}) {
  return <div className={cn("call-controls flex items-center justify-center gap-2 rounded-lg bg-black/60 p-2 text-white", className)} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
    <button className={cn("vt-call-control h-10 w-10 p-0", isMuted && "bg-destructive/20 text-destructive")} onClick={onMuteToggle} aria-label={isMuted ? "Unmute" : "Mute"}>{isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}</button>
    <button className="vt-call-control h-10 w-10 p-0" onClick={isScreenSharing ? onStopScreenShare : () => { void onStartScreenShare(); }} aria-label={isScreenShareUpdating ? "Updating screen share" : isScreenSharing ? "Stop sharing" : "Share screen"} disabled={isScreenShareUpdating}>{isScreenSharing ? <MonitorX className="h-4 w-4" /> : <MonitorUp className="h-4 w-4" />}</button>
    {onToggleExpanded && <button className="vt-call-control h-10 w-10 p-0" onClick={onToggleExpanded} aria-label={isFullscreen ? "Return to framed call" : "Expand share"}>{isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>}
    {onToggleFullscreen && <button className="vt-call-control h-10 w-10 p-0" onClick={() => { void onToggleFullscreen(); }} aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}>{isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}</button>}
    <button className="vt-call-control vt-call-control--danger h-10 w-10 p-0" onClick={onHangUp} aria-label="Hang Up"><PhoneOff className="h-4 w-4" /></button>
  </div>;
}

function ScreenShareFrame({ stream, sharerName, isLoading }: { stream: MediaStream | null; sharerName: string; isLoading: boolean }) {
  return (
    <div className="screen-share-framed-tile relative col-span-2 min-h-0 overflow-hidden" data-testid="screen-share-framed-tile">
      {stream ? (
        <StreamVideo stream={stream} label={`${sharerName} screen share`} className="absolute inset-0 h-full w-full object-contain" muted testId="screen-share-framed-video" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground" data-testid="screen-share-framed-loading">
          {isLoading ? "Connecting to screen share…" : "Screen share is starting…"}
        </div>
      )}
      <span className="screen-share-framed-label absolute bottom-2 left-2 max-w-[calc(100%-16px)] truncate px-2 py-1 text-xs text-white">{sharerName} · Screen share</span>
    </div>
  );
}

function FramedParticipantTile({ name, isMuted = false }: { name: string; isMuted?: boolean }) {
  return (
    <div className="screen-share-framed-tile relative flex min-w-0 items-center justify-center overflow-hidden" data-testid="screen-share-framed-participant-tile">
      <div className="voice-participant-avatar flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-semibold" aria-hidden="true">
        {name.slice(0, 1).toUpperCase()}
      </div>
      <div className="absolute bottom-2 left-2 flex min-w-0 max-w-[calc(100%-16px)] items-center gap-1.5 text-xs font-medium" data-testid="screen-share-framed-participant-label">
        <span className="truncate">{name}</span>
        {isMuted && <MicOff className="h-3.5 w-3.5 shrink-0 text-destructive" aria-label={`${name} muted`} />}
      </div>
    </div>
  );
}

function VoiceParticipantTile({ name, isMuted = false }: { name: string; isMuted?: boolean }) {
  return (
    <div className="voice-participant-tile relative flex min-w-0 flex-1 items-center justify-center overflow-hidden rounded-lg" data-testid="active-call-voice-participant-tile">
      <div className="voice-participant-avatar flex h-20 w-20 shrink-0 items-center justify-center rounded-full text-2xl font-semibold" aria-hidden="true" data-testid="voice-participant-avatar">
        {name.slice(0, 1).toUpperCase()}
      </div>
      <div className="absolute bottom-3 left-3 flex min-w-0 max-w-[calc(100%-24px)] items-center gap-1.5 text-sm font-medium" data-testid="voice-participant-label">
        <span className="truncate">{name}</span>
        {isMuted && <MicOff className="h-3.5 w-3.5 shrink-0 text-destructive" aria-label={`${name} muted`} />}
      </div>
    </div>
  );
}
