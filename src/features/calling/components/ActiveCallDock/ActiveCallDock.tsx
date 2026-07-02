import { useEffect, useMemo, useState } from "react";
import { Mic, MicOff, MonitorUp, MonitorX, PhoneOff } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { formatCallTime } from "@/utils/formatDate";
import type { CallDiagnostics, CallIssue, CallStatus } from "@/features/calling/hooks/useCall.types";
import { getCallStatusLabel, normalizeCallIssue } from "@/features/calling/utils/callUxText";
import { WatchStreamModal } from "@/features/calling/components/WatchStreamModal";

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
  const [isWatchOpen, setIsWatchOpen] = useState(false);
  const shouldShowDiagnostics =
    import.meta.env.DEV && import.meta.env.VITE_WEBRTC_SHOW_DIAGNOSTICS === "true";
  const displayIssue = normalizeCallIssue(callIssue);
  const callStateLabel = getCallStatusLabel({
    status: callStatus,
    diagnostics,
    isScreenSharing,
    isScreenShareUpdating,
  });
  const watchStream = remoteScreenStream ?? localScreenStream;
  const isWatchingLocalStream = Boolean(watchStream && watchStream === localScreenStream);
  const hasScreenSharePresence = isRemoteScreenLoading || Boolean(remoteScreenStream) || Boolean(localScreenStream) || isScreenSharing;
  const screenShareText = localScreenStream || isScreenSharing
    ? "You are sharing your screen"
    : `${remoteUsername} is sharing their screen`;
  const compactParticipantCards = hasScreenSharePresence || Boolean(displayIssue);

  useEffect(() => {
    if (!watchStream || callStatus !== "active") {
      setIsWatchOpen(false);
    }
  }, [callStatus, watchStream]);

  const modalSharerName = useMemo(() => {
    if (isWatchingLocalStream) return "You";
    return remoteUsername;
  }, [isWatchingLocalStream, remoteUsername]);

  return (
    <>
      <section
        className="flex h-[240px] shrink-0 flex-col overflow-hidden border-b border-border bg-muted text-foreground"
        data-testid="active-call-dock"
        aria-label="Active call dock"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-4 py-3">
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

        {displayIssue && (
          <div
            className={cn(
              "mx-4 mb-2 shrink-0 rounded-md border px-3 py-2 text-sm",
              displayIssue.tone === "error"
                ? "border-destructive/50 bg-destructive/10 text-foreground"
                : "border-border bg-card text-foreground",
            )}
            data-testid="call-issue-banner"
          >
            {displayIssue.message}
          </div>
        )}

        <div
          className="flex min-h-0 flex-1 items-center justify-center px-4"
          data-testid="active-call-dock-stage"
        >
          <div className="grid w-full max-w-3xl grid-cols-2 gap-3">
            <ParticipantTile name="You" label={isMuted ? "Muted" : isScreenSharing ? "Sharing" : "Connected"} compact={compactParticipantCards} />
            <ParticipantTile name={remoteUsername} label={callStateLabel} compact={compactParticipantCards} />
          </div>
        </div>

        {hasScreenSharePresence && (
          <div
            className="mx-4 mb-2 flex shrink-0 items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2"
            data-testid="screen-share-indicator"
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-foreground">{screenShareText}</p>
              {isScreenShareUpdating && (
                <p className="text-[10px] uppercase text-muted-foreground">Updating screen share...</p>
              )}
              {isRemoteScreenLoading && !watchStream && (
                <p className="text-[10px] uppercase text-muted-foreground">Waiting for stream...</p>
              )}
            </div>
            {watchStream && (
              <button
                type="button"
                className="h-8 shrink-0 rounded-md border border-border bg-background px-3 text-sm text-foreground hover:bg-accent"
                onClick={() => setIsWatchOpen(true)}
              >
                Watch
              </button>
            )}
          </div>
        )}

        {shouldShowDiagnostics && (
          <div
            className="mx-4 mb-2 hidden shrink-0 rounded-md border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground lg:block"
            data-testid="webrtc-diagnostics"
          >
            <span className="mr-3 text-foreground">WebRTC Debug</span>
            <span>connection {diagnostics.connectionState}</span>
            <span className="ml-3">ice {diagnostics.iceConnectionState}</span>
            <span className="ml-3">candidate {diagnostics.selectedLocalCandidateType}</span>
          </div>
        )}

        <div
          className="flex shrink-0 items-center justify-center gap-2 border-t border-border bg-card px-3 py-2"
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

      {isWatchOpen && watchStream && (
        <WatchStreamModal
          stream={watchStream}
          sharerName={modalSharerName}
          isLocalSharer={isWatchingLocalStream}
          remoteUsername={remoteUsername}
          isMuted={isMuted}
          isScreenShareUpdating={isScreenShareUpdating}
          onClose={() => setIsWatchOpen(false)}
          onStopScreenShare={onStopScreenShare}
        />
      )}
    </>
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
        "flex flex-col items-center justify-center rounded-md border border-border bg-card p-3",
        compact ? "min-h-14" : "min-h-24",
      )}
      data-testid="active-call-participant-tile"
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-full border border-border bg-background text-foreground",
          compact ? "h-9 w-9 text-base" : "h-14 w-14 text-xl",
        )}
      >
        {name.charAt(0).toUpperCase()}
      </div>
      <p
        className={cn(
          "max-w-full truncate font-normal text-foreground",
          compact ? "mt-1 text-sm" : "mt-2 text-base",
        )}
      >
        {name}
      </p>
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
    </div>
  );
}
