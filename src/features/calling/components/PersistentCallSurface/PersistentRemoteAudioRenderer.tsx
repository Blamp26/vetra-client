import { useEffect, useRef } from "react";
import { useAppStore, type RootState } from "@/store";
import { useMediaSettings } from "@/shared/utils/mediaSettings";
import { recordDirectedCallDiagnostic } from "../../services/directedCallDiagnostics";
import { isMissingOutputDeviceError } from "../../utils/outputDeviceErrors";

export type PersistentAudioPlaybackState = "playing" | "autoplay_unavailable";

export function PersistentRemoteAudioRenderer({
  stream,
  deafened,
  peerAudioPreferenceKey,
  playbackRequest = 0,
  onPlaybackStateChange,
  onOutputDeviceFallback,
}: {
  stream: MediaStream | null;
  deafened?: boolean;
  peerAudioPreferenceKey?: string;
  playbackRequest?: number;
  onPlaybackStateChange?: (state: PersistentAudioPlaybackState) => void;
  onOutputDeviceFallback?: (missingDeviceId: string) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastPlaybackRef = useRef<{ stream: MediaStream | null; request: number } | null>(null);
  const lastFallbackRef = useRef<{ deviceId: string; stream: MediaStream | null; request: number } | null>(null);
  const suppressedDefaultRef = useRef<{ deviceId: string; stream: MediaStream | null; request: number } | null>(null);
  const routingIdentityRef = useRef<{
    deviceId: string;
    stream: MediaStream | null;
    request: number;
    token: symbol;
  } | null>(null);
  const mountedRef = useRef(true);
  const routingAttemptRef = useRef<{
    deviceId: string;
    stream: MediaStream | null;
    request: number;
    token: symbol;
    promise: Promise<boolean>;
  } | null>(null);
  const { preferences } = useMediaSettings();
  const selectedOutputDeviceId = preferences.outputDeviceId;
  const outputVolume = useAppStore((state: RootState) => state.outputVolume);
  const callUserVolume = useAppStore((state: RootState) => peerAudioPreferenceKey ? state.callUserVolumes?.[peerAudioPreferenceKey] : undefined);
  const callUserMuted = useAppStore((state: RootState) => peerAudioPreferenceKey ? Boolean(state.mutedCallUserIds?.[peerAudioPreferenceKey]) : false);

  const beginRouting = (
    deviceId: string,
    context: { stream: MediaStream | null; request: number },
  ): symbol => {
    const existing = routingIdentityRef.current;
    if (
      existing?.deviceId === deviceId
      && existing.stream === context.stream
      && existing.request === context.request
    ) {
      return existing.token;
    }

    if (deviceId !== "default") {
      lastFallbackRef.current = null;
      suppressedDefaultRef.current = null;
    }
    const next = { deviceId, ...context, token: Symbol("persistent-output-route") };
    routingIdentityRef.current = next;
    routingAttemptRef.current = null;
    return next.token;
  };

  const isCurrentRouting = (
    token: symbol,
    deviceId: string,
    context: { stream: MediaStream | null; request: number },
  ): boolean => {
    const current = routingIdentityRef.current;
    return mountedRef.current
      && current?.token === token
      && current.deviceId === deviceId
      && current.stream === context.stream
      && current.request === context.request;
  };

  const invalidateRouting = () => {
    routingIdentityRef.current = null;
    routingAttemptRef.current = null;
  };

  const applyOutputDevice = (
    audio: HTMLAudioElement,
    deviceId: string,
    context: { stream: MediaStream | null; request: number },
    token: symbol,
  ): Promise<boolean> => {
    const existingAttempt = routingAttemptRef.current;
    if (
      existingAttempt?.deviceId === deviceId &&
      existingAttempt.stream === context.stream &&
      existingAttempt.request === context.request &&
      existingAttempt.token === token
    ) {
      return existingAttempt.promise;
    }

    const attempt = (async () => {
      const setSinkId = (audio as HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> }).setSinkId;
      if (typeof setSinkId !== "function") return true;
      if (
        deviceId === "default" &&
        suppressedDefaultRef.current?.stream === context.stream &&
        suppressedDefaultRef.current.request === context.request
      ) {
        suppressedDefaultRef.current = null;
        return true;
      }
      try {
        await setSinkId.call(audio, deviceId === "default" ? "default" : deviceId);
        return isCurrentRouting(token, deviceId, context);
      } catch (error) {
        if (!isCurrentRouting(token, deviceId, context)) return false;
        recordDirectedCallDiagnostic("failure", { failureKind: "audio_output_unavailable" });
        if (deviceId === "default" || !isMissingOutputDeviceError(error)) return true;

        const alreadyReported = lastFallbackRef.current?.deviceId === deviceId
          && lastFallbackRef.current.stream === context.stream
          && lastFallbackRef.current.request === context.request;
        if (alreadyReported) return true;

        lastFallbackRef.current = { deviceId, ...context };
        suppressedDefaultRef.current = { deviceId, ...context };
        onOutputDeviceFallback?.(deviceId);

        try {
          await setSinkId.call(audio, "default");
          return isCurrentRouting(token, deviceId, context);
        } catch {
          if (isCurrentRouting(token, deviceId, context)) {
            recordDirectedCallDiagnostic("failure", { failureKind: "audio_output_unavailable" });
          }
          return false;
        }
      }
    })();
    routingAttemptRef.current = { deviceId, ...context, token, promise: attempt };
    return attempt;
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (lastPlaybackRef.current?.stream === stream && lastPlaybackRef.current.request === playbackRequest) return;
    lastPlaybackRef.current = { stream, request: playbackRequest };
    audio.srcObject = stream;
    if (stream) {
      const context = { stream, request: playbackRequest };
      const token = beginRouting(selectedOutputDeviceId, context);
      void (async () => {
        const routed = await applyOutputDevice(audio, selectedOutputDeviceId, context, token);
        if (!routed || !isCurrentRouting(token, selectedOutputDeviceId, context)) return;
        try {
          await audio.play();
          if (!isCurrentRouting(token, selectedOutputDeviceId, context)) return;
          onPlaybackStateChange?.("playing");
        } catch {
          if (!isCurrentRouting(token, selectedOutputDeviceId, context)) return;
          // Autoplay policy is local playback state, not canonical call failure.
          recordDirectedCallDiagnostic("failure", { failureKind: "audio_autoplay_unavailable" });
          onPlaybackStateChange?.("autoplay_unavailable");
        }
      })();
    }
    return () => {
      invalidateRouting();
      audio.pause();
      audio.srcObject = null;
    };
  }, [playbackRequest, stream]);

  useEffect(() => () => {
    mountedRef.current = false;
    invalidateRouting();
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !stream) return;
    const context = { stream, request: playbackRequest };
    const token = beginRouting(selectedOutputDeviceId, context);
    void applyOutputDevice(audio, selectedOutputDeviceId, context, token);
  }, [onOutputDeviceFallback, playbackRequest, selectedOutputDeviceId, stream]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const safeGlobalVolume = Math.min(1, Math.max(0, Number.isFinite(outputVolume) ? outputVolume : 1));
    const safePeerVolume = Math.min(100, Math.max(0, typeof callUserVolume === "number" && Number.isFinite(callUserVolume) ? callUserVolume : 100));
    const effectiveVolume = Math.min(1, Math.max(0, safeGlobalVolume * (callUserMuted ? 0 : safePeerVolume / 100)));
    audio.volume = effectiveVolume;
    audio.muted = Boolean(deafened) || callUserMuted || effectiveVolume === 0;
  }, [callUserMuted, callUserVolume, deafened, outputVolume]);

  return <audio ref={audioRef} autoPlay playsInline aria-label="Persistent call audio" data-testid="persistent-remote-audio" />;
}
