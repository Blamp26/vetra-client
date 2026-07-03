import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Mic, MicOff, MonitorUp, MonitorX, PhoneOff } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { formatCallTime } from "@/utils/formatDate";
import type { CallDiagnostics, CallIssue, CallStatus } from "@/features/calling/hooks/useCall.types";
import { getCallStatusLabel, normalizeCallIssue } from "@/features/calling/utils/callUxText";
import { CallGridView, type CallGridParticipant, type CallGridScreenShare } from "./CallGridView";
import { FocusStreamView } from "./FocusStreamView";

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
  const [watchingInlineIds, setWatchingInlineIds] = useState<Set<string>>(() => new Set());
  const [focusedStreamId, setFocusedStreamId] = useState<string | null>(null);
  const shouldShowDiagnostics =
    import.meta.env.DEV && import.meta.env.VITE_WEBRTC_SHOW_DIAGNOSTICS === "true";
  const displayIssue = normalizeCallIssue(callIssue);
  const callStateLabel = getCallStatusLabel({
    status: callStatus,
    diagnostics,
    isScreenSharing,
    isScreenShareUpdating,
  });
  const hasScreenSharePresence = isRemoteScreenLoading || Boolean(remoteScreenStream) || Boolean(localScreenStream) || isScreenSharing;
  const compactParticipantCards = Boolean(displayIssue);

  useEffect(() => {
    const activeIds = new Set<string>();
    if (remoteScreenStream || isRemoteScreenLoading) activeIds.add("remote-screen");
    if (localScreenStream || isScreenSharing) activeIds.add("local-screen");

    setWatchingInlineIds((current) => {
      const next = new Set([...current].filter((id) => activeIds.has(id)));
      if (next.size === current.size && [...next].every((id) => current.has(id))) {
        return current;
      }
      return next;
    });

    if (!focusedStreamId || activeIds.has(focusedStreamId)) {
      return;
    }
    setFocusedStreamId(null);
  }, [
    focusedStreamId,
    isRemoteScreenLoading,
    isScreenSharing,
    localScreenStream,
    remoteScreenStream,
  ]);

  useEffect(() => {
    if (callStatus !== "active") {
      setFocusedStreamId(null);
      setWatchingInlineIds(new Set());
    }
  }, [callStatus]);

  const participants: CallGridParticipant[] = useMemo(
    () => [
      {
        id: "local-audio",
        name: "You",
        label: isScreenSharing ? "Sharing" : "Connected",
        isMuted,
      },
      {
        id: "remote-audio",
        name: remoteUsername,
        label: callStateLabel,
      },
    ],
    [callStateLabel, isMuted, isScreenSharing, remoteUsername],
  );

  const screenShares: CallGridScreenShare[] = useMemo(() => {
    const shares: CallGridScreenShare[] = [];
    if (remoteScreenStream || isRemoteScreenLoading) {
      shares.push({
        id: "remote-screen",
        sharerName: remoteUsername,
        stream: remoteScreenStream,
        state: watchingInlineIds.has("remote-screen") ? "watchingInline" : "idle",
        isLocalSharer: false,
      });
    }
    if (localScreenStream || isScreenSharing) {
      shares.push({
        id: "local-screen",
        sharerName: "You",
        stream: localScreenStream,
        state: watchingInlineIds.has("local-screen") ? "watchingInline" : "idle",
        isLocalSharer: true,
      });
    }
    return shares;
  }, [
    isRemoteScreenLoading,
    isScreenSharing,
    localScreenStream,
    remoteScreenStream,
    remoteUsername,
    watchingInlineIds,
  ]);

  const focusedShare = screenShares.find((share) => share.id === focusedStreamId && share.stream);
  const dockHeight = focusedShare ? "h-[min(56vh,520px)]" : "min-h-[208px]";
  const callSurfaceStyle = {
    "--call-surface-0": "var(--surface-0, var(--background))",
    "--call-surface-1": "var(--surface-1, var(--muted))",
    "--call-surface-2": "var(--surface-2, var(--card))",
    "--call-border": "var(--border)",
    "--call-text-primary": "var(--text-primary, var(--foreground))",
    "--call-text-secondary": "var(--text-secondary, var(--muted-foreground))",
    "--call-fill-control": "var(--fill-control, var(--background))",
    "--call-fill-danger": "var(--fill-danger, var(--destructive))",
    "--call-on-danger": "var(--on-danger, var(--destructive-foreground))",
    "--call-bg-danger": "var(--bg-danger, var(--error-bg, var(--destructive)))",
    "--call-text-danger": "var(--text-danger, var(--error-text, var(--destructive)))",
  } as CSSProperties;

  const handleWatchStream = (id: string) => {
    setWatchingInlineIds((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
  };

  const handleExpandStream = (id: string) => {
    if (!watchingInlineIds.has(id)) return;
    setFocusedStreamId(id);
  };

  return (
    <section
      className={cn(
        "active-call-dock flex shrink-0 flex-col border-b border-[var(--call-border)] bg-[var(--call-surface-0)] text-[var(--call-text-primary)]",
        focusedShare ? "overflow-hidden" : "overflow-visible",
        dockHeight,
      )}
      style={callSurfaceStyle}
      data-testid="active-call-dock"
      aria-label="Active call dock"
    >
      {focusedShare?.stream ? (
        <FocusStreamView
          stream={focusedShare.stream}
          sharerName={focusedShare.sharerName}
          isLocalSharer={focusedShare.isLocalSharer}
          participants={participants}
          isMuted={isMuted}
          isScreenSharing={isScreenSharing}
          isScreenShareUpdating={isScreenShareUpdating}
          onExitFocus={() => setFocusedStreamId(null)}
          onMuteToggle={onMuteToggle}
          onStartScreenShare={onStartScreenShare}
          onStopScreenShare={onStopScreenShare}
          onHangUp={onHangUp}
        />
      ) : (
        <>
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-2">
          <div className="min-w-0">
            <p className="text-[10px] uppercase text-[var(--call-text-secondary)]">
              Voice call
            </p>
            <h2 className="truncate text-sm font-normal text-[var(--call-text-primary)]">
              {remoteUsername}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-xs uppercase text-[var(--call-text-secondary)]">
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
          className="call-surface mx-4 mb-3 flex min-h-[150px] shrink-0 flex-col overflow-hidden rounded-md border border-[var(--call-border)] bg-[var(--call-surface-1)]"
          data-testid="active-call-dock-surface"
        >
          <div
            className="flex min-h-[112px] flex-1 items-center justify-center px-3 py-3"
            data-testid="active-call-dock-stage"
          >
            <CallGridView
              participants={participants}
              screenShares={screenShares}
              compactParticipants={compactParticipantCards || hasScreenSharePresence}
              isScreenShareUpdating={isScreenShareUpdating}
              onWatchStream={handleWatchStream}
              onExpandStream={handleExpandStream}
              onStopScreenShare={onStopScreenShare}
            />
          </div>

          {shouldShowDiagnostics && (
            <div
              className="mx-3 mb-2 hidden shrink-0 rounded-md border border-[var(--call-border)] bg-[var(--call-surface-2)] px-3 py-2 text-[11px] text-[var(--call-text-secondary)] lg:block"
              data-testid="webrtc-diagnostics"
            >
              <span className="mr-3 text-[var(--call-text-primary)]">WebRTC Debug</span>
              <span>connection {diagnostics.connectionState}</span>
              <span className="ml-3">ice {diagnostics.iceConnectionState}</span>
              <span className="ml-3">candidate {diagnostics.selectedLocalCandidateType}</span>
            </div>
          )}

          <div
            className="call-controls flex shrink-0 items-center justify-center gap-2 border-t border-[var(--call-border)] bg-[var(--call-surface-2)] px-3 py-2"
            data-testid="active-call-dock-controls"
          >
            <button
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full border border-[var(--call-border)] p-0 transition-colors",
                isMuted
                  ? "bg-[var(--call-bg-danger)] text-[var(--call-text-danger)]"
                  : "bg-[var(--call-fill-control)] text-[var(--call-text-primary)] hover:bg-accent",
              )}
              onClick={onMuteToggle}
              aria-label={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>

            <button
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full border border-[var(--call-border)] bg-[var(--call-fill-control)] p-0 text-[var(--call-text-primary)] transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-60",
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
              className="flex h-9 w-9 items-center justify-center rounded-full border border-transparent bg-[var(--call-fill-danger)] p-0 text-[var(--call-on-danger)] transition-colors hover:opacity-90"
              onClick={onHangUp}
              aria-label="Hang Up"
            >
              <PhoneOff className="h-4 w-4" />
            </button>
          </div>
        </div>
        </>
      )}
    </section>
  );
}
