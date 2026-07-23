import { useEffect, useRef } from "react";
import { useAppStore, type RootState } from "@/store";
import { recordDirectedCallDiagnostic } from "../../services/directedCallDiagnostics";

export type PersistentAudioPlaybackState = "playing" | "autoplay_unavailable";

export function PersistentRemoteAudioRenderer({
  stream,
  playbackRequest = 0,
  onPlaybackStateChange,
}: {
  stream: MediaStream | null;
  playbackRequest?: number;
  onPlaybackStateChange?: (state: PersistentAudioPlaybackState) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastPlaybackRef = useRef<{ stream: MediaStream | null; request: number } | null>(null);
  const selectedOutputDeviceId = useAppStore((state: RootState) => state.selectedOutputDeviceId);

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

  return <audio ref={audioRef} autoPlay playsInline aria-label="Persistent call audio" data-testid="persistent-remote-audio" />;
}
