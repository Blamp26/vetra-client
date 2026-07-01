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
        "flex shrink-0 flex-col overflow-hidden border-b border-border bg-[#101318] text-foreground",
        hasScreenStage ? "h-[clamp(340px,55vh,620px)]" : "h-[320px]",
      )}
      data-testid="active-call-dock"
      aria-label="Active call dock"
    >
      <div className="flex items-center justify-between border-b border-border/70 bg-card/40 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Voice call
          </p>
          <h2 className="truncate text-lg font-normal text-foreground">
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
            "mx-4 mt-3 border px-3 py-2 text-sm",
            callIssue.tone === "error"
              ? "border-destructive/50 bg-destructive/10 text-foreground"
              : "border-border bg-background/60 text-foreground",
          )}
          data-testid="call-issue-banner"
        >
          {callIssue.message}
        </div>
      )}

      <div className="flex min-h-0 flex-1 items-center justify-center p-4 pb-3">
        {hasScreenStage ? (
          <div className="grid h-full w-full max-w-6xl grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
            <div className="flex min-h-0 items-center justify-center border border-border bg-background/70 p-3">
              {remoteScreenStream ? (
                <video
                  ref={remoteScreenRef}
                  autoPlay
                  playsInline
                  className="max-h-full w-full bg-muted/20 object-contain"
                  data-testid="remote-screen-view"
                />
              ) : isRemoteScreenLoading ? (
                <div
                  className="flex h-full min-h-48 w-full items-center justify-center text-sm text-muted-foreground"
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
                <div className="min-h-0 border border-border bg-background/70 p-2">
                  <div className="mb-2 text-[10px] uppercase text-muted-foreground">
                    Local Preview
                  </div>
                  <video
                    ref={previewRef}
                    autoPlay
                    muted
                    playsInline
                    className="max-h-36 w-full border border-border bg-muted/20 object-contain"
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
          className="mx-4 mb-2 border border-border bg-background/80 px-3 py-2 text-[11px] text-muted-foreground"
          data-testid="webrtc-diagnostics"
        >
          <span className="mr-3 text-foreground">WebRTC Debug</span>
          <span>connection {diagnostics.connectionState}</span>
          <span className="ml-3">ice {diagnostics.iceConnectionState}</span>
          <span className="ml-3">candidate {diagnostics.selectedLocalCandidateType}</span>
        </div>
      )}

      <div
        className="flex items-center justify-center gap-3 bg-card/50 px-4 pb-4 pt-2"
        data-testid="active-call-dock-controls"
      >
        <button
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-full border border-border",
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
            "inline-flex h-11 items-center gap-2 rounded-full border border-border px-4 text-sm disabled:pointer-events-none disabled:opacity-60",
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
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-destructive text-destructive-foreground"
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
        "flex flex-col items-center justify-center border border-border bg-card/70 p-4",
        compact ? "min-h-32" : "min-h-40",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-3xl border border-border bg-primary text-primary-foreground",
          compact ? "h-16 w-16 text-xl" : "h-20 w-20 text-2xl",
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
