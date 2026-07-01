import { useEffect, useRef } from 'react';

interface CallAudioRendererProps {
  remoteStream: MediaStream | null;
  selectedOutputDeviceId: string;
}

export function CallAudioRenderer({ remoteStream, selectedOutputDeviceId }: CallAudioRendererProps) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.srcObject = remoteStream;

    return () => {
      audio.srcObject = null;
    };
  }, [remoteStream]);

  useEffect(() => {
    const audio = audioRef.current as (HTMLAudioElement & {
      setSinkId?: (sinkId: string) => Promise<void>;
    }) | null;

    if (!audio || typeof audio.setSinkId !== 'function') return;

    const sinkId = selectedOutputDeviceId?.trim() || 'default';
    audio.setSinkId(sinkId).catch((error) => {
      console.warn('[CallAudioRenderer] Failed to apply output device', error);
    });
  }, [selectedOutputDeviceId]);

  return <audio ref={audioRef} autoPlay hidden data-testid="call-audio-renderer" />;
}
