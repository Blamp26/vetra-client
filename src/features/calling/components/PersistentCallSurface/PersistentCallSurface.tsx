import { Mic, MicOff, Phone, PhoneOff, RotateCw } from "lucide-react";
import { type ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/shared/components/Button";
import { IncomingCallModal } from "../IncomingCallModal";
import { PersistentRemoteAudioRenderer } from "./PersistentRemoteAudioRenderer";
import { useOptionalPersistentCall, usePersistentCall } from "../../context/PersistentCallContext";
import type { PersistentCallAffordance } from "../../context/CallRuntimeBoundary";
import { isUuid } from "../../protocol/directedCallProtocol";

export function PersistentCallSurface({ children }: { children: ReactNode }) {
  const call = usePersistentCall();
  const [audioPlaybackRequest, setAudioPlaybackRequest] = useState(0);
  const [audioPlaybackUnavailable, setAudioPlaybackUnavailable] = useState(false);
  const mediaStream = call.media.remoteAudioStream as MediaStream | null;
  const showAudio = Boolean(mediaStream);
  const onAudioPlaybackStateChange = useCallback((state: "playing" | "autoplay_unavailable") => {
    setAudioPlaybackUnavailable(state === "autoplay_unavailable");
  }, []);
  useEffect(() => {
    setAudioPlaybackUnavailable(false);
    setAudioPlaybackRequest(0);
  }, [mediaStream]);
  const showIssue = call.presentation.callIssue ?? (call.media.localIssue ? {
    kind: "transport" as const,
    message: call.media.localIssue === "transport_recovery"
      ? "The call setup was interrupted. Try again."
      : call.media.localIssue === "audio_input_switch_failed"
        ? "Couldn’t switch microphone. The previous microphone is still active."
        : "Call audio setup needs attention.",
    callId: call.presentation.callId,
  } : null);
  const canRetry = Boolean(call.presentation.recoverableError);
  const mutePhaseAvailable = call.presentation.phase === "connecting" || call.presentation.phase === "active";
  const showMute = mutePhaseAvailable;
  const displayStatusLabel = call.presentation.phase === "terminal" && call.presentation.terminalLabel
    ? call.presentation.terminalLabel
    : call.presentation.statusLabel;

  return (
    <>
      {children}
      {showAudio && (
        <PersistentRemoteAudioRenderer
          stream={mediaStream}
          playbackRequest={audioPlaybackRequest}
          onPlaybackStateChange={onAudioPlaybackStateChange}
        />
      )}
      {call.presentation.incomingModal.visible && (
        <IncomingCallModal
          callerName={call.presentation.incomingModal.callerDisplayName}
          isPending={call.presentation.incomingModal.isPending}
          presentationKey={call.presentation.incomingModal.presentationKey ?? undefined}
          onPresented={call.presentation.incomingModal.onPresented}
          onAccept={call.presentation.incomingModal.onAccept}
          onReject={call.presentation.incomingModal.onDecline}
        />
      )}
      {call.presentation.phase !== "idle" && !call.presentation.incomingModal.visible && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center" data-testid="persistent-call-surface">
          <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-lg">
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">{call.presentation.peerUsername ?? "Directed call"}</div>
              <div className="text-xs text-muted-foreground">{displayStatusLabel}</div>
              {showIssue && <div className="text-xs text-destructive">{showIssue.message}</div>}
            </div>
            {audioPlaybackUnavailable && showAudio && (
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  setAudioPlaybackUnavailable(false);
                  setAudioPlaybackRequest((request) => request + 1);
                }}
                aria-label="Enable audio"
              >
                Enable audio
              </Button>
            )}
            {canRetry && (
              <Button variant="secondary" type="button" onClick={() => void call.retry()} aria-label="Retry call action">
                <RotateCw className="h-4 w-4" />
                <span>Retry</span>
              </Button>
            )}
            {call.presentation.canCancel && (
              <Button variant="danger" type="button" onClick={() => void call.cancel()} aria-label="Cancel call">
                <PhoneOff className="h-4 w-4" />
                <span>Cancel</span>
              </Button>
            )}
            {call.presentation.canHangup && (
              <Button variant="danger" type="button" onClick={() => void call.hangup()} aria-label="Hang up call">
                <PhoneOff className="h-4 w-4" />
                <span>Hang up</span>
              </Button>
            )}
            {showMute && (
              <Button
                variant="secondary"
                type="button"
                onClick={() => { call.toggleMute(); }}
                disabled={!call.canToggleMute}
                aria-label={call.isMuted ? "Unmute microphone" : "Mute microphone"}
                title={call.isMuted ? "Unmute microphone" : "Mute microphone"}
              >
                {call.isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                <span>{call.isMuted ? "Unmute" : "Mute"}</span>
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function PersistentCallButton({
  targetUserId,
  targetUsername,
  affordance,
}: {
  targetUserId: string | null | undefined;
  targetUsername: string;
  affordance: PersistentCallAffordance;
}) {
  const call = useOptionalPersistentCall();
  const validTarget = typeof targetUserId === "string" && isUuid(targetUserId);
  const canStart = affordance.state === "owner" && Boolean(call) && validTarget &&
    (call?.presentation.phase === "idle" || call?.presentation.phase === "terminal");
  const unavailableLabel = affordance.state === "non_owner"
    ? "Звонками управляет другое окно"
    : "Звонки временно недоступны";
  return (
    <button
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
      onClick={() => { if (canStart && call) void call.startCall(targetUserId as string, targetUsername); }}
      disabled={!canStart}
      title={canStart ? `Call ${targetUsername}` : unavailableLabel}
      aria-label={canStart ? `Call ${targetUsername}` : unavailableLabel}
      data-testid="persistent-call-button"
    >
      <Phone className="h-4 w-4" />
    </button>
  );
}
