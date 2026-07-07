import { useEffect, useRef } from 'react';
import { cn } from '@/shared/utils/cn';
import { formatCallTime } from '@/utils/formatDate';
import { Mic, MicOff, MonitorUp, MonitorX, PhoneOff } from 'lucide-react';
import type { CallDiagnostics, CallIssue } from '../../hooks/useCall.types';
import { debugCall } from '../../utils/callDebug';

interface ActiveCallWindowProps {
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
  const hadAttachedMedia = Boolean(video.srcObject || video.currentSrc || video.hasAttribute('src'));
  if (hadAttachedMedia) {
    video.pause();
  }
  video.srcObject = null;
  video.removeAttribute('src');
  if (hadAttachedMedia) {
    video.load();
  }
}

async function safelyPlayVideo(video: HTMLVideoElement, reason: string): Promise<void> {
  try {
    await video.play();
    debugCall('[ActiveCallWindow] video play success', { reason });
  } catch (error) {
    debugCall('[ActiveCallWindow] video play failed', {
      reason,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export const ActiveCallWindow = ({
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
}: ActiveCallWindowProps) => {
  const remoteScreenRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const shouldShowDiagnostics =
    import.meta.env.DEV && import.meta.env.VITE_WEBRTC_SHOW_DIAGNOSTICS === 'true';
  const callStateLabel = isScreenShareUpdating
    ? 'Updating screen share...'
    : isScreenSharing
      ? 'Screen sharing'
      : diagnostics.connectionState === 'connected' || diagnostics.iceConnectionState === 'connected'
        ? 'Connected'
        : 'Connecting...';

  useEffect(() => {
    const remoteScreen = remoteScreenRef.current;
    if (!remoteScreen) return;

    if (!remoteScreenStream) {
      detachVideo(remoteScreen);
      return;
    }

    remoteScreen.srcObject = remoteScreenStream;
    void safelyPlayVideo(remoteScreen, 'remote_screen_stream');

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
    void safelyPlayVideo(preview, 'local_screen_preview');

    return () => {
      detachVideo(preview);
    };
  }, [localScreenStream]);

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-background/50 p-4">
      <div className="vt-modal-panel flex w-full max-w-3xl flex-col items-center gap-5 p-6">
        <div className="vt-call-avatar h-20 w-20">
          <span className="select-none text-2xl font-semibold text-primary-foreground">
            {remoteUsername.charAt(0).toUpperCase()}
          </span>
        </div>

        <div className="space-y-1 text-center">
          <span className="vt-kicker">Call in progress</span>
          <p className="m-0 text-2xl font-semibold tracking-tight text-foreground">{remoteUsername}</p>
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <span>{callStateLabel}</span>
            <span aria-hidden="true">•</span>
            <span>{formatCallTime(seconds)}</span>
          </div>
        </div>

        {callIssue && (
          <div
            className={cn(
              "w-full max-w-[720px] rounded-[14px] border px-3 py-2.5 text-sm leading-6",
              callIssue.tone === 'error'
                ? "border-destructive/35 bg-destructive/10 text-foreground"
                : "border-border bg-card text-foreground",
            )}
            data-testid="call-issue-banner"
          >
            {callIssue.message}
          </div>
        )}

        {shouldShowDiagnostics && (
          <div
            className="w-full max-w-[320px] rounded-[12px] border border-border bg-card/90 px-3 py-2 text-[11px] text-muted-foreground"
            data-testid="webrtc-diagnostics"
          >
            <div className="mb-1 font-medium uppercase tracking-wide text-foreground">WebRTC Debug</div>
            <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
              <span>connection</span>
              <span>{diagnostics.connectionState}</span>
              <span>ice</span>
              <span>{diagnostics.iceConnectionState}</span>
              <span>gathering</span>
              <span>{diagnostics.iceGatheringState}</span>
              <span>signaling</span>
              <span>{diagnostics.signalingState}</span>
              <span>candidate</span>
              <span className={cn(
                diagnostics.selectedLocalCandidateType === 'relay' && 'text-foreground font-medium',
              )}>
                {diagnostics.selectedLocalCandidateType}
              </span>
            </div>
          </div>
        )}

        {(isRemoteScreenLoading || remoteScreenStream || localScreenStream) && (
          <div className="grid w-full max-w-[720px] gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
            {(isRemoteScreenLoading || remoteScreenStream) && (
              <div className="vt-call-stage p-3">
                <div className="mb-2 flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  <span>
                    {remoteScreenStream ? 'Remote Screen' : 'Connecting Screen'}
                  </span>
                  <span>{remoteUsername}</span>
                </div>
                {remoteScreenStream ? (
                  <div className="vt-call-video-shell">
                    <video
                      ref={remoteScreenRef}
                      autoPlay
                      playsInline
                      className="w-full bg-muted/20"
                      data-testid="remote-screen-view"
                    />
                  </div>
                ) : (
                  <div
                    className="vt-call-video-shell flex min-h-48 items-center justify-center text-sm text-muted-foreground"
                    data-testid="remote-screen-loading"
                  >
                    Waiting for shared screen
                  </div>
                )}
              </div>
            )}

            {localScreenStream && (
              <div className="vt-call-stage p-3">
                <div className="mb-2 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  Local Preview Only
                </div>
                <div className="vt-call-video-shell">
                  <video
                    ref={previewRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full bg-muted/20"
                    data-testid="local-screen-preview"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="vt-call-floating mt-1 flex h-[58px] items-center gap-3 px-3">
          <button
            className={cn(
              "vt-call-control h-12 w-12 p-0",
              isMuted ? "bg-destructive/12 text-destructive hover:bg-destructive/16" : "",
            )}
            onClick={onMuteToggle}
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>

          <button
            className={cn(
              "vt-call-control min-w-[148px] px-4 text-sm disabled:pointer-events-none disabled:opacity-60",
              isScreenSharing && "vt-call-control--active"
            )}
            onClick={isScreenSharing ? onStopScreenShare : () => { void onStartScreenShare(); }}
            aria-label={isScreenShareUpdating ? 'Updating screen share' : isScreenSharing ? 'Stop sharing' : 'Share screen'}
            disabled={isScreenShareUpdating}
          >
            <span className="inline-flex items-center gap-2">
              {isScreenSharing ? <MonitorX className="h-4 w-4" /> : <MonitorUp className="h-4 w-4" />}
              <span>{isScreenShareUpdating ? 'Updating...' : isScreenSharing ? 'Stop sharing' : 'Share screen'}</span>
            </span>
          </button>

          <button
            className="vt-call-control vt-call-control--danger h-12 w-12 p-0"
            onClick={onHangUp}
            aria-label="Hang Up"
          >
            <PhoneOff className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
