import { type ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { Phone } from "lucide-react";
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
      {audioPlaybackUnavailable && showAudio && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center" data-testid="persistent-audio-recovery">
          <Button
            variant="secondary"
            type="button"
            className="pointer-events-auto"
            onClick={() => {
              setAudioPlaybackUnavailable(false);
              setAudioPlaybackRequest((request) => request + 1);
            }}
            aria-label="Enable audio"
          >
            Enable audio
          </Button>
        </div>
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
