import { useEffect, useRef } from 'react';

interface CallAudioRendererProps {
  remoteStream: MediaStream | null;
}

export function CallAudioRenderer({ remoteStream }: CallAudioRendererProps) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.srcObject = remoteStream;

    return () => {
      audio.srcObject = null;
    };
  }, [remoteStream]);

  return <audio ref={audioRef} autoPlay hidden data-testid="call-audio-renderer" />;
}
