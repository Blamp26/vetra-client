import { useEffect, useRef } from "react";
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

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (lastPlaybackRef.current?.stream === stream && lastPlaybackRef.current.request === playbackRequest) return;
    lastPlaybackRef.current = { stream, request: playbackRequest };
    audio.srcObject = stream;
    if (stream) {
      void audio.play().then(() => {
        onPlaybackStateChange?.("playing");
      }).catch(() => {
        // Autoplay policy is local playback state, not canonical call failure.
        recordDirectedCallDiagnostic("failure", { failureKind: "audio_autoplay_unavailable" });
        onPlaybackStateChange?.("autoplay_unavailable");
      });
    }
    return () => {
      audio.pause();
      audio.srcObject = null;
    };
  }, [onPlaybackStateChange, playbackRequest, stream]);

  return <audio ref={audioRef} autoPlay playsInline aria-label="Persistent call audio" data-testid="persistent-remote-audio" />;
}
