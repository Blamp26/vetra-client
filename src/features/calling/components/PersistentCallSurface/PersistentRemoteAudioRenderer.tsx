import { useEffect, useRef } from "react";
import { useAppStore, type RootState } from "@/store";
import { recordDirectedCallDiagnostic } from "../../services/directedCallDiagnostics";

export type PersistentAudioPlaybackState = "playing" | "autoplay_unavailable";

export function PersistentRemoteAudioRenderer({
  stream,
  peerAudioPreferenceKey,
  playbackRequest = 0,
  onPlaybackStateChange,
}: {
  stream: MediaStream | null;
  peerAudioPreferenceKey?: string;
  playbackRequest?: number;
  onPlaybackStateChange?: (state: PersistentAudioPlaybackState) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastPlaybackRef = useRef<{ stream: MediaStream | null; request: number } | null>(null);
  const selectedOutputDeviceId = useAppStore((state: RootState) => state.selectedOutputDeviceId);
  const soundEnabled = useAppStore((state: RootState) => state.soundEnabled);
  const outputVolume = useAppStore((state: RootState) => state.outputVolume);
  const callUserVolume = useAppStore((state: RootState) => peerAudioPreferenceKey ? state.callUserVolumes?.[peerAudioPreferenceKey] : undefined);
  const callUserMuted = useAppStore((state: RootState) => peerAudioPreferenceKey ? Boolean(state.mutedCallUserIds?.[peerAudioPreferenceKey]) : false);

  const applyOutputDevice = async (audio: HTMLAudioElement, deviceId: string) => {
    const setSinkId = (audio as HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> }).setSinkId;
    if (typeof setSinkId !== "function") return;
    try {
      await setSinkId.call(audio, deviceId === "default" ? "default" : deviceId);
    } catch {
      recordDirectedCallDiagnostic("failure", { failureKind: "audio_output_unavailable" });
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (lastPlaybackRef.current?.stream === stream && lastPlaybackRef.current.request === playbackRequest) return;
    lastPlaybackRef.current = { stream, request: playbackRequest };
    audio.srcObject = stream;
    if (stream) {
      void (async () => {
        await applyOutputDevice(audio, selectedOutputDeviceId);
        try {
          await audio.play();
          onPlaybackStateChange?.("playing");
        } catch {
          // Autoplay policy is local playback state, not canonical call failure.
          recordDirectedCallDiagnostic("failure", { failureKind: "audio_autoplay_unavailable" });
          onPlaybackStateChange?.("autoplay_unavailable");
        }
      })();
    }
    return () => {
      audio.pause();
      audio.srcObject = null;
    };
  }, [onPlaybackStateChange, playbackRequest, stream]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !stream) return;
    void applyOutputDevice(audio, selectedOutputDeviceId);
  }, [selectedOutputDeviceId, stream]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const safeGlobalVolume = Math.min(1, Math.max(0, Number.isFinite(outputVolume) ? outputVolume : 1));
    const safePeerVolume = Math.min(100, Math.max(0, typeof callUserVolume === "number" && Number.isFinite(callUserVolume) ? callUserVolume : 100));
    const effectiveVolume = Math.min(1, Math.max(0, safeGlobalVolume * (callUserMuted ? 0 : safePeerVolume / 100)));
    audio.volume = effectiveVolume;
    audio.muted = !soundEnabled || effectiveVolume === 0;
  }, [callUserMuted, callUserVolume, outputVolume, soundEnabled]);

  return <audio ref={audioRef} autoPlay playsInline aria-label="Persistent call audio" data-testid="persistent-remote-audio" />;
}
