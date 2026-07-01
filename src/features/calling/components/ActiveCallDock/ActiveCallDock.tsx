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
        "relative isolate shrink-0 overflow-hidden border-b border-border bg-[#0f1117] text-foreground shadow-[inset_0_-1px_0_rgba(255,255,255,0.03)]",
        "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:bg-[radial-gradient(circle_at_18%_18%,rgba(72,115,255,0.16),transparent_32%),radial-gradient(circle_at_82%_12%,rgba(54,211,153,0.10),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.05),transparent_42%)]",
        hasScreenStage ? "h-[clamp(340px,55vh,620px)]" : "h-[300px]",
      )}
      data-testid="active-call-dock"
      aria-label="Active call dock"
    >
      <div className="absolute left-4 right-4 top-3 z-10 flex items-start justify-between gap-3">
        <div className="min-w-0 rounded-full border border-white/10 bg-black/20 px-3 py-1.5 shadow-lg shadow-black/20 backdrop-blur">
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/45">
            Voice call
          </p>
          <h2 className="truncate text-sm font-normal text-white/90">
            {remoteUsername}
          </h2>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-2 text-xs uppercase text-white/55 shadow-lg shadow-black/20 backdrop-blur">
          <span data-testid="active-call-dock-status">{callStateLabel}</span>
          <span>{formatCallTime(seconds)}</span>
        </div>
      </div>

      {callIssue && (
        <div
          className={cn(
            "absolute left-4 right-4 top-16 z-20 border px-3 py-2 text-sm shadow-lg shadow-black/20 backdrop-blur",
            callIssue.tone === "error"
              ? "border-destructive/50 bg-destructive/20 text-foreground"
              : "border-white/10 bg-black/35 text-foreground",
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
            <div className="flex min-h-0 items-center justify-center rounded-2xl border border-white/10 bg-black/30 p-3 shadow-2xl shadow-black/25">
              {remoteScreenStream ? (
                <video
                  ref={remoteScreenRef}
                  autoPlay
                  playsInline
                  className="max-h-full w-full rounded-xl bg-black/30 object-contain"
                  data-testid="remote-screen-view"
                />
              ) : isRemoteScreenLoading ? (
                <div
                  className="flex h-full min-h-48 w-full items-center justify-center rounded-xl bg-black/20 text-sm text-white/55"
                  data-testid="remote-screen-loading"
                >
                  Waiting for shared screen
                </div>
              ) : (
                <div className="text-sm text-white/55">
                  Screen sharing from this device
                </div>
              )}
            </div>

            <div className="flex min-h-0 flex-col gap-3">
              <ParticipantTile name={remoteUsername} label={callStateLabel} compact />
              {localScreenStream && (
                <div className="min-h-0 rounded-2xl border border-white/10 bg-black/30 p-2 shadow-xl shadow-black/20">
                  <div className="mb-2 text-[10px] uppercase text-white/45">
                    Local Preview
                  </div>
                  <video
                    ref={previewRef}
                    autoPlay
                    muted
                    playsInline
                    className="max-h-36 w-full rounded-xl border border-white/10 bg-black/30 object-contain"
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
          className="absolute bottom-3 left-4 z-20 hidden max-w-[calc(100%-2rem)] border border-white/10 bg-black/45 px-3 py-2 text-[11px] text-white/50 backdrop-blur lg:block"
          data-testid="webrtc-diagnostics"
        >
          <span className="mr-3 text-white/80">WebRTC Debug</span>
          <span>connection {diagnostics.connectionState}</span>
          <span className="ml-3">ice {diagnostics.iceConnectionState}</span>
          <span className="ml-3">candidate {diagnostics.selectedLocalCandidateType}</span>
        </div>
      )}

      <div
        className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center justify-center gap-3 rounded-full border border-white/10 bg-black/45 px-3 py-2 shadow-2xl shadow-black/40 backdrop-blur"
        data-testid="active-call-dock-controls"
      >
        <button
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-full border border-white/10 shadow-lg transition-colors",
            isMuted
              ? "bg-destructive text-destructive-foreground"
              : "bg-white/10 text-white hover:bg-white/18",
          )}
          onClick={onMuteToggle}
          aria-label={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>

        <button
          className={cn(
            "inline-flex h-11 items-center gap-2 rounded-full border border-white/10 px-4 text-sm shadow-lg transition-colors disabled:pointer-events-none disabled:opacity-60",
            isScreenSharing
              ? "bg-white/20 text-white"
              : "bg-white/10 text-white hover:bg-white/18",
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
          className="flex h-11 w-11 items-center justify-center rounded-full border border-destructive/40 bg-destructive text-destructive-foreground shadow-lg shadow-destructive/20 transition-colors hover:bg-destructive/90"
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
        "flex flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/[0.07] p-4 shadow-2xl shadow-black/20 backdrop-blur",
        compact ? "min-h-32" : "min-h-40",
      )}
      data-testid="active-call-participant-tile"
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-3xl border border-white/10 bg-gradient-to-br from-primary/90 to-primary/55 text-primary-foreground shadow-xl shadow-primary/10",
          compact ? "h-16 w-16 text-xl" : "h-20 w-20 text-2xl",
        )}
      >
        {name.charAt(0).toUpperCase()}
      </div>
      <p className="mt-3 max-w-full truncate text-base font-normal text-white">
        {name}
      </p>
      <p className="mt-1 text-xs uppercase text-white/50">{label}</p>
    </div>
  );
}
