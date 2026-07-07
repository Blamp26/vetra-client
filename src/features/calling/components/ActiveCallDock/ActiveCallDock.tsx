import { useCallback, useEffect, useMemo, useState } from "react";
import { Mic, MicOff, MonitorUp, MonitorX, PhoneOff } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { formatCallTime } from "@/utils/formatDate";
import type { CallDiagnostics, CallIssue, CallStatus } from "@/features/calling/hooks/useCall.types";
import { getCallStatusLabel, normalizeCallIssue } from "@/features/calling/utils/callUxText";
import { CallGridView, type CallGridParticipant, type CallGridScreenShare } from "./CallGridView";
import { FocusStreamView, FullscreenStreamView } from "./FocusStreamView";

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
  const [fullscreenStreamId, setFullscreenStreamId] = useState<string | null>(null);
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
      if (fullscreenStreamId && !activeIds.has(fullscreenStreamId)) {
        setFullscreenStreamId(null);
      }
      return;
    }
    setFocusedStreamId(null);
    if (fullscreenStreamId && !activeIds.has(fullscreenStreamId)) {
      setFullscreenStreamId(null);
    }
  }, [
    fullscreenStreamId,
    focusedStreamId,
    isRemoteScreenLoading,
    isScreenSharing,
    localScreenStream,
    remoteScreenStream,
  ]);

  useEffect(() => {
    if (callStatus !== "active") {
      setFocusedStreamId(null);
      setFullscreenStreamId(null);
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
        state: localScreenStream || watchingInlineIds.has("local-screen") ? "watchingInline" : "idle",
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
  const fullscreenShare = screenShares.find((share) => share.id === fullscreenStreamId && share.stream);
  const callKindLabel = hasScreenSharePresence ? "Screen sharing" : "Voice call";
  const callStatusRight =
    hasScreenSharePresence && !isScreenShareUpdating
      ? formatCallTime(seconds)
      : `${callStateLabel} · ${formatCallTime(seconds)}`;

  const handleWatchStream = useCallback((id: string) => {
    setWatchingInlineIds((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
  }, []);

  const handleExpandStream = useCallback((id: string) => {
    const share = screenShares.find((item) => item.id === id);
    if (!share?.stream || share.state !== "watchingInline") return;
    setFocusedStreamId(id);
  }, [screenShares]);

  const handleExitFocus = useCallback(() => {
    setFullscreenStreamId(null);
    setFocusedStreamId(null);
  }, []);

  const handleEnterTrueFullscreen = useCallback((id: string) => {
    setFocusedStreamId(id);
    setFullscreenStreamId(id);
  }, []);

  const handleExitTrueFullscreen = useCallback(() => {
    setFullscreenStreamId(null);
  }, []);

  return (
    <section
      className="vt-call-shell active-call-dock flex h-[clamp(300px,48vh,523px)] shrink-0 flex-col border-b border-border px-[clamp(16px,3.2vw,50px)] py-[clamp(12px,2.8vh,31px)] text-foreground"
      data-testid="active-call-dock"
      aria-label="Active call dock"
    >
      {focusedShare?.stream ? (
        <FocusStreamView
          stream={focusedShare.stream}
          streamId={focusedShare.id}
          sharerName={focusedShare.sharerName}
          isLocalSharer={focusedShare.isLocalSharer}
          participants={participants}
          isMuted={isMuted}
          isScreenSharing={isScreenSharing}
          isScreenShareUpdating={isScreenShareUpdating}
          onExitFocus={handleExitFocus}
          onMuteToggle={onMuteToggle}
          onStartScreenShare={onStartScreenShare}
          onStopScreenShare={onStopScreenShare}
          onHangUp={onHangUp}
          onEnterFullscreen={handleEnterTrueFullscreen}
        />
      ) : (
        <div className="call-dock-inner flex h-full w-full min-w-0 flex-col" data-testid="call-dock-inner">
          <div className="call-status-row mb-3 flex shrink-0 items-start justify-between gap-3">
            <div className="call-status-left flex min-w-0 flex-col gap-1.5">
              <span className="vt-kicker call-status-kind shrink-0">
                {callKindLabel}
              </span>
              <h2 className="call-status-name truncate text-base font-semibold tracking-tight text-foreground">
                {remoteUsername}
              </h2>
            </div>
            <div className="vt-call-badge call-status-right shrink-0">
              <span data-testid="active-call-dock-status">{callStatusRight}</span>
            </div>
          </div>

          {displayIssue && (
            <div
              className={cn(
                "mb-3 shrink-0 rounded-[14px] border px-3 py-2.5 text-sm leading-6",
                displayIssue.tone === "error"
                  ? "border-destructive/35 bg-destructive/10 text-foreground"
                  : "border-border bg-card/90 text-foreground",
              )}
              data-testid="call-issue-banner"
            >
              {displayIssue.message}
            </div>
          )}

          <div
            className="vt-call-stage call-surface flex min-h-0 flex-1 flex-col justify-between gap-[clamp(14px,2.8vh,31px)] px-[clamp(14px,2vw,22px)] py-[clamp(14px,2.2vh,22px)]"
            data-testid="active-call-dock-surface"
          >
            <div
              className="active-call-stage flex min-h-0 flex-1 items-center justify-center"
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
                className="mx-1 hidden shrink-0 rounded-[12px] border border-border bg-card/90 px-3 py-2 text-[11px] text-muted-foreground lg:block"
                data-testid="webrtc-diagnostics"
              >
                <span className="mr-3 font-medium text-foreground">WebRTC Debug</span>
                <span>connection {diagnostics.connectionState}</span>
                <span className="ml-3">ice {diagnostics.iceConnectionState}</span>
                <span className="ml-3">candidate {diagnostics.selectedLocalCandidateType}</span>
              </div>
            )}

            <div
              className="vt-call-floating call-controls flex h-[58px] shrink-0 items-center justify-center gap-[clamp(12px,2vw,20px)] self-center px-3"
              data-testid="active-call-dock-controls"
            >
              <button
                className={cn(
                  "vt-call-control ctrl-btn h-12 w-12 p-0",
                  isMuted && "bg-destructive/12 text-destructive hover:bg-destructive/16",
                )}
                onClick={onMuteToggle}
                aria-label={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>

              <button
                className={cn(
                  "vt-call-control ctrl-btn h-12 w-12 p-0 disabled:pointer-events-none disabled:opacity-60",
                  hasScreenSharePresence && "vt-call-control--active ctrl-btn--active",
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
                <PhoneOff className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
      {fullscreenShare?.stream && (
        <FullscreenStreamView
          stream={fullscreenShare.stream}
          streamId={fullscreenShare.id}
          sharerName={fullscreenShare.sharerName}
          isLocalSharer={fullscreenShare.isLocalSharer}
          participants={participants}
          isMuted={isMuted}
          isScreenSharing={isScreenSharing}
          isScreenShareUpdating={isScreenShareUpdating}
          onExitFocus={handleExitFocus}
          onExitTrueFullscreen={handleExitTrueFullscreen}
          onMuteToggle={onMuteToggle}
          onStartScreenShare={onStartScreenShare}
          onStopScreenShare={onStopScreenShare}
          onHangUp={onHangUp}
        />
      )}
    </section>
  );
}
