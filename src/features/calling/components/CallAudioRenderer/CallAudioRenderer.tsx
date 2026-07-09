import { useEffect, useRef } from 'react';
import { debugCall } from '../../utils/callDebug';

interface CallAudioRendererProps {
  remoteStream: MediaStream | null;
  selectedOutputDeviceId: string;
  soundEnabled: boolean;
  outputVolume: number;
  onOutputDeviceFallback?: (missingDeviceId: string) => void;
}

function isMissingOutputDeviceError(error: unknown): boolean {
  if (!(error instanceof DOMException) && !(error instanceof Error)) {
    return false;
  }

  const name = 'name' in error ? String(error.name) : '';
  const message = 'message' in error ? String(error.message).toLowerCase() : '';

  return (
    name === 'NotFoundError' ||
    name === 'NotSupportedError' ||
    message.includes('can not be found here') ||
    message.includes('cannot be found here') ||
    message.includes('object can not be found') ||
    message.includes('object cannot be found') ||
    message.includes('not found')
  );
}

function isOutputDeviceSecurityError(error: unknown): boolean {
  if (!(error instanceof DOMException) && !(error instanceof Error)) {
    return false;
  }

  const name = 'name' in error ? String(error.name) : '';
  const message = 'message' in error ? String(error.message).toLowerCase() : '';

  return (
    name === 'SecurityError' ||
    name === 'NotAllowedError' ||
    message.includes('insecure') ||
    message.includes('permission denied') ||
    message.includes('not allowed')
  );
}

export function CallAudioRenderer({
  remoteStream,
  selectedOutputDeviceId,
  soundEnabled,
  outputVolume,
  onOutputDeviceFallback,
}: CallAudioRendererProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastSinkWarningKeyRef = useRef<string | null>(null);
  const lastFallbackDeviceIdRef = useRef<string | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.srcObject = remoteStream;

    return () => {
      audio.srcObject = null;
    };
  }, [remoteStream]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const normalizedVolume = Math.min(
      1,
      Math.max(0, Number.isFinite(outputVolume) ? outputVolume : 1),
    );
    audio.volume = normalizedVolume;
    audio.muted = !soundEnabled || normalizedVolume === 0;
  }, [outputVolume, soundEnabled]);

  useEffect(() => {
    const audio = audioRef.current as (HTMLAudioElement & {
      setSinkId?: (sinkId: string) => Promise<void>;
    }) | null;

    if (!audio || typeof audio.setSinkId !== 'function') return;

    let cancelled = false;
    const sinkId = selectedOutputDeviceId?.trim() || 'default';

    void audio.setSinkId(sinkId).then(() => {
      if (cancelled) return;
      lastSinkWarningKeyRef.current = null;
      lastFallbackDeviceIdRef.current = null;
    }).catch(async (error) => {
      if (cancelled) return;

      if (isMissingOutputDeviceError(error)) {
        debugCall('[CallAudioRenderer] Output device missing, falling back to default', {
          sinkId,
          errorName: error instanceof Error ? error.name : undefined,
        });

        if (sinkId !== 'default' && lastFallbackDeviceIdRef.current !== sinkId) {
          lastFallbackDeviceIdRef.current = sinkId;
          onOutputDeviceFallback?.(sinkId);
        }

        if (sinkId !== 'default') {
          try {
            await audio.setSinkId('default');
            if (!cancelled) {
              lastSinkWarningKeyRef.current = null;
            }
          } catch (fallbackError) {
            if (!isMissingOutputDeviceError(fallbackError) && !isOutputDeviceSecurityError(fallbackError)) {
              const warningKey = `default:${fallbackError instanceof Error ? fallbackError.name : 'unknown'}`;
              if (lastSinkWarningKeyRef.current !== warningKey) {
                lastSinkWarningKeyRef.current = warningKey;
                console.warn('[CallAudioRenderer] Failed to apply default output device', fallbackError);
              }
            } else {
              debugCall('[CallAudioRenderer] Default output device routing unavailable', {
                errorName: fallbackError instanceof Error ? fallbackError.name : undefined,
              });
            }
          }
        } else {
          lastSinkWarningKeyRef.current = null;
        }
        return;
      }

      if (isOutputDeviceSecurityError(error)) {
        debugCall('[CallAudioRenderer] Output device routing unavailable', {
          sinkId,
          errorName: error instanceof Error ? error.name : undefined,
        });
        return;
      }

      const warningKey = `${sinkId}:${error instanceof Error ? error.name : 'unknown'}`;
      if (lastSinkWarningKeyRef.current !== warningKey) {
        lastSinkWarningKeyRef.current = warningKey;
        console.warn('[CallAudioRenderer] Failed to apply output device', error);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [onOutputDeviceFallback, selectedOutputDeviceId]);

  return <audio ref={audioRef} autoPlay hidden data-testid="call-audio-renderer" />;
}
