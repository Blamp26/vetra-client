import { useEffect, useRef } from "react";
import { recordDirectedCallDiagnostic } from "../../services/directedCallDiagnostics";

export function PersistentRemoteAudioRenderer({ stream }: { stream: MediaStream | null }) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.srcObject = stream;
    if (stream) {
      void audio.play().catch(() => {
        // Autoplay policy is local playback state, not canonical call failure.
        recordDirectedCallDiagnostic("failure", { failureKind: "audio_autoplay_unavailable" });
      });
    }
    return () => {
      audio.pause();
      audio.srcObject = null;
    };
  }, [stream]);

  return <audio ref={audioRef} autoPlay playsInline aria-label="Persistent call audio" data-testid="persistent-remote-audio" />;
}
