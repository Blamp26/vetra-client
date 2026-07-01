import { useEffect, useRef } from "react";
import { Mic, MicOff, MonitorUp, MonitorX, PhoneOff } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { formatCallTime } from "@/utils/formatDate";
import type { CallDiagnostics, CallIssue } from "@/features/calling/hooks/useCall.types";
import { debugCall } from "@/features/calling/utils/callDebug";

interface ActiveCallDockProps {
  remoteUsername: string;
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

function detachVideo(video: HTMLVideoElement): void {
  video.pause();
  video.srcObject = null;
  video.removeAttribute("src");
  video.load();
}

async function safelyPlayVideo(video: HTMLVideoElement, reason: string): Promise<void> {
  try {
    await video.play();
    debugCall("[ActiveCallDock] video play success", { reason });
  } catch (error) {
    debugCall("[ActiveCallDock] video play failed", {
      reason,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function ActiveCallDock({
  remoteUsername,
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
  const remoteScreenRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const shouldShowDiagnostics =
    import.meta.env.DEV && import.meta.env.VITE_WEBRTC_SHOW_DIAGNOSTICS === "true";
  const callStateLabel = isScreenShareUpdating
    ? "Updating screen share..."
    : isScreenSharing
      ? "Screen sharing"
      : diagnostics.connectionState === "connected" ||
          diagnostics.iceConnectionState === "connected"
        ? "Connected"
        : "Connecting...";
  const hasScreenStage = isRemoteScreenLoading || remoteScreenStream || localScreenStream;

  useEffect(() => {
    const remoteScreen = remoteScreenRef.current;
    if (!remoteScreen) return;

    if (!remoteScreenStream) {
      detachVideo(remoteScreen);
      return;
    }

    remoteScreen.srcObject = remoteScreenStream;
    void safelyPlayVideo(remoteScreen, "remote_screen_stream");

    return () => {
      detachVideo(remoteScreen);
    };
  }, [remoteScreenStream]);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;

    if (!localScreenStream) {
      detachVideo(preview);
      return;
    }

    preview.srcObject = localScreenStream;
    void safelyPlayVideo(preview, "local_screen_preview");

    return () => {
      detachVideo(preview);
    };
  }, [localScreenStream]);

  return (
    <section
      className={cn(
        "relative shrink-0 overflow-hidden border-b border-border bg-muted text-foreground",
        hasScreenStage ? "h-[clamp(340px,55vh,620px)]" : "h-[300px]",
      )}
      data-testid="active-call-dock"
      aria-label="Active call dock"
    >
      <div className="absolute left-4 right-4 top-3 z-10 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Voice call
          </p>
          <h2 className="truncate text-sm font-normal text-foreground">
            {remoteUsername}
          </h2>
        </div>
        <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
          <span data-testid="active-call-dock-status">{callStateLabel}</span>
          <span>{formatCallTime(seconds)}</span>
        </div>
      </div>

      {callIssue && (
        <div
          className={cn(
            "absolute left-4 right-4 top-14 z-20 rounded-md border px-3 py-2 text-sm",
            callIssue.tone === "error"
              ? "border-destructive/50 bg-destructive/10 text-foreground"
              : "border-border bg-card text-foreground",
          )}
          data-testid="call-issue-banner"
        >
          {callIssue.message}
        </div>
      )}

      <div
        className={cn(
          "flex h-full min-h-0 items-center justify-center px-4 pb-20 pt-16",
          callIssue && "pt-24",
        )}
        data-testid="active-call-dock-stage"
      >
        {hasScreenStage ? (
          <div className="grid h-full w-full max-w-6xl grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
            <div className="flex min-h-0 items-center justify-center rounded-md border border-border bg-card p-2">
              {remoteScreenStream ? (
                <video
                  ref={remoteScreenRef}
                  autoPlay
                  playsInline
                  className="max-h-full w-full rounded bg-black object-contain"
                  data-testid="remote-screen-view"
                />
              ) : isRemoteScreenLoading ? (
                <div
                  className="flex h-full min-h-48 w-full items-center justify-center rounded bg-background text-sm text-muted-foreground"
                  data-testid="remote-screen-loading"
                >
                  Waiting for shared screen
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Screen sharing from this device
                </div>
              )}
            </div>

            <div className="flex min-h-0 flex-col gap-3">
              <ParticipantTile name={remoteUsername} label={callStateLabel} compact />
              {localScreenStream && (
                <div className="min-h-0 rounded-md border border-border bg-card p-2">
                  <div className="mb-2 text-[10px] uppercase text-muted-foreground">
                    Local Preview
                  </div>
                  <video
                    ref={previewRef}
                    autoPlay
                    muted
                    playsInline
                    className="max-h-36 w-full rounded border border-border bg-black object-contain"
                    data-testid="local-screen-preview"
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
            <ParticipantTile name="You" label={isMuted ? "Muted" : "Connected"} />
            <ParticipantTile name={remoteUsername} label={callStateLabel} />
          </div>
        )}
      </div>

      {shouldShowDiagnostics && (
        <div
          className="absolute bottom-3 left-4 z-20 hidden max-w-[calc(100%-2rem)] rounded-md border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground lg:block"
          data-testid="webrtc-diagnostics"
        >
          <span className="mr-3 text-foreground">WebRTC Debug</span>
          <span>connection {diagnostics.connectionState}</span>
          <span className="ml-3">ice {diagnostics.iceConnectionState}</span>
          <span className="ml-3">candidate {diagnostics.selectedLocalCandidateType}</span>
        </div>
      )}

      <div
        className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2"
        data-testid="active-call-dock-controls"
      >
        <button
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-md border border-border transition-colors",
            isMuted
              ? "bg-destructive text-destructive-foreground"
              : "bg-background text-foreground hover:bg-accent",
          )}
          onClick={onMuteToggle}
          aria-label={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>

        <button
          className={cn(
            "inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm transition-colors disabled:pointer-events-none disabled:opacity-60",
            isScreenSharing
              ? "bg-accent text-foreground"
              : "bg-background text-foreground hover:bg-accent",
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
          <span>
            {isScreenShareUpdating
              ? "Updating..."
              : isScreenSharing
                ? "Stop sharing"
                : "Share screen"}
          </span>
        </button>

        <button
          className="flex h-10 w-10 items-center justify-center rounded-md border border-destructive/40 bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90"
          onClick={onHangUp}
          aria-label="Hang Up"
        >
          <PhoneOff className="h-5 w-5" />
        </button>
      </div>
    </section>
  );
}

function ParticipantTile({
  name,
  label,
  compact = false,
}: {
  name: string;
  label: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-md border border-border bg-card p-4",
        compact ? "min-h-28" : "min-h-36",
      )}
      data-testid="active-call-participant-tile"
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-full border border-border bg-background text-foreground",
          compact ? "h-14 w-14 text-xl" : "h-16 w-16 text-2xl",
        )}
      >
        {name.charAt(0).toUpperCase()}
      </div>
      <p className="mt-3 max-w-full truncate text-base font-normal text-foreground">
        {name}
      </p>
      <p className="mt-1 text-xs uppercase text-muted-foreground">{label}</p>
    </div>
  );
}
