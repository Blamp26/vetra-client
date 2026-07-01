import { useEffect, useRef } from 'react';

const CALL_DEBUG_KEY = 'vetra.debug.calls';

interface CallAudioRendererProps {
  remoteStream: MediaStream | null;
  selectedOutputDeviceId: string;
  onOutputDeviceFallback?: () => void;
}

function isCallDebugEnabled(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) {
    return false;
  }

  return window.localStorage.getItem(CALL_DEBUG_KEY) === '1';
}

function debugCall(message: string, details?: Record<string, unknown>): void {
  if (isCallDebugEnabled()) {
    console.log(message, details ?? {});
  }
}

function isMissingOutputDeviceError(error: unknown): boolean {
  if (!(error instanceof DOMException) && !(error instanceof Error)) {
    return false;
  }

  const name = 'name' in error ? String(error.name) : '';
  const message = 'message' in error ? String(error.message).toLowerCase() : '';

  return (
    name === 'NotFoundError' ||
    message.includes('can not be found here') ||
    message.includes('cannot be found here') ||
    message.includes('not found')
  );
}

export function CallAudioRenderer({
  remoteStream,
  selectedOutputDeviceId,
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

      if (sinkId !== 'default' && isMissingOutputDeviceError(error)) {
        debugCall('[CallAudioRenderer] Output device missing, falling back to default', {
          sinkId,
          errorName: error instanceof Error ? error.name : undefined,
        });

        if (lastFallbackDeviceIdRef.current !== sinkId) {
          lastFallbackDeviceIdRef.current = sinkId;
          onOutputDeviceFallback?.();
        }

        try {
          await audio.setSinkId('default');
          if (!cancelled) {
            lastSinkWarningKeyRef.current = null;
          }
        } catch (fallbackError) {
          const warningKey = `default:${fallbackError instanceof Error ? fallbackError.name : 'unknown'}`;
          if (lastSinkWarningKeyRef.current !== warningKey) {
            lastSinkWarningKeyRef.current = warningKey;
            console.warn('[CallAudioRenderer] Failed to apply default output device', fallbackError);
          }
        }
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
