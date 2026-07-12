import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { LoaderCircle, Pause, Play, RotateCcw } from "lucide-react";
import type { Attachment } from "@/shared/types";
import { useAppStore } from "@/store";
import { cn } from "@/shared/utils/cn";
import { fetchAttachmentBlob } from "../../utils/attachmentDownloads";
import { formatVoiceDuration } from "../../utils/voiceRecording";

export const WAVEFORM_BAR_COUNT = 65;
export const WAVEFORM_MIN_HEIGHT = 2;
export const WAVEFORM_MAX_HEIGHT = 23;

let activeVoiceAudio: HTMLAudioElement | null = null;
const waveformCache = new Map<string, Promise<number[]>>();

interface Props {
  attachment: Attachment;
  isOwn?: boolean;
}

export function createFallbackWaveform(barCount = WAVEFORM_BAR_COUNT): number[] {
  return Array.from({ length: barCount }, () => WAVEFORM_MIN_HEIGHT);
}

function getAudioContextConstructor() {
  if (typeof window === "undefined") return null;
  return window.AudioContext
    ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    ?? null;
}

export function buildWaveformFromAudioBuffer(
  audioBuffer: Pick<AudioBuffer, "length" | "numberOfChannels" | "getChannelData">,
  barCount = WAVEFORM_BAR_COUNT,
): number[] {
  if (!audioBuffer.length || !audioBuffer.numberOfChannels) return createFallbackWaveform(barCount);

  const values = Array.from({ length: barCount }, (_, bucketIndex) => {
    const start = Math.floor((bucketIndex * audioBuffer.length) / barCount);
    const end = Math.max(start + 1, Math.floor(((bucketIndex + 1) * audioBuffer.length) / barCount));
    let sumSquares = 0;
    let peak = 0;
    let samples = 0;

    for (let frame = start; frame < end; frame += 1) {
      let mono = 0;
      for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
        mono += Math.abs(audioBuffer.getChannelData(channel)[frame] ?? 0);
      }
      mono /= audioBuffer.numberOfChannels;
      sumSquares += mono * mono;
      peak = Math.max(peak, mono);
      samples += 1;
    }

    const rms = samples ? Math.sqrt(sumSquares / samples) : 0;
    return peak * 0.7 + rms * 0.3;
  });

  const max = Math.max(...values, 0);
  if (max <= 0) return createFallbackWaveform(barCount);

  return values.map((value) => {
    const normalized = Math.min(1, value / max);
    return Math.round(WAVEFORM_MIN_HEIGHT + (WAVEFORM_MAX_HEIGHT - WAVEFORM_MIN_HEIGHT) * normalized ** 0.75);
  });
}

export async function extractWaveformFromAudioBlob(
  blob: Blob,
  barCount = WAVEFORM_BAR_COUNT,
): Promise<number[]> {
  const AudioContextConstructor = getAudioContextConstructor();
  if (!AudioContextConstructor) return createFallbackWaveform(barCount);

  const context = new AudioContextConstructor();
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    return buildWaveformFromAudioBuffer(buffer, barCount);
  } catch {
    return createFallbackWaveform(barCount);
  } finally {
    await context.close().catch(() => undefined);
  }
}

function getCachedWaveform(attachmentId: string, blob: Blob): Promise<number[]> {
  const cached = waveformCache.get(attachmentId);
  if (cached) return cached;

  const waveform = extractWaveformFromAudioBlob(blob);
  waveformCache.set(attachmentId, waveform);
  return waveform;
}

function drawRoundedBar(
  context: CanvasRenderingContext2D,
  x: number,
  center: number,
  width: number,
  height: number,
) {
  const top = center - height / 2;
  const bottom = center + height / 2;
  const radius = Math.min(1, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + radius, top);
  context.lineTo(x + width - radius, top);
  context.quadraticCurveTo(x + width, top, x + width, top + radius);
  context.lineTo(x + width, bottom - radius);
  context.quadraticCurveTo(x + width, bottom, x + width - radius, bottom);
  context.lineTo(x + radius, bottom);
  context.quadraticCurveTo(x, bottom, x, bottom - radius);
  context.lineTo(x, top + radius);
  context.quadraticCurveTo(x, top, x + radius, top);
  context.closePath();
  context.fill();
}

function drawWaveform(
  canvas: HTMLCanvasElement,
  waveform: number[],
  progress: number,
) {
  let context: CanvasRenderingContext2D | null = null;
  try {
    context = canvas.getContext("2d");
  } catch {
    return;
  }
  if (!context) return;

  const cssWidth = canvas.clientWidth || 260;
  const cssHeight = 23;
  const scale = 2;
  canvas.width = 520;
  canvas.height = 46;
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.clearRect(0, 0, cssWidth, cssHeight);

  const computedStyle = getComputedStyle(canvas);
  const playedColor = computedStyle.color || "rgb(255, 255, 255)";
  const baseColor = withAlpha(playedColor, 0.5);
  const step = cssWidth / waveform.length;
  const barWidth = Math.min(2, Math.max(1, step / 2));

  const drawBars = (color: string, clipRight?: number) => {
    context!.save();
    if (clipRight !== undefined) {
      context!.beginPath();
      context!.rect(0, 0, clipRight, cssHeight);
      context!.clip();
    }
    context!.fillStyle = color;
    waveform.forEach((barHeight, index) => {
      const x = index * step;
      drawRoundedBar(context!, x, cssHeight / 2, barWidth, Math.min(WAVEFORM_MAX_HEIGHT, Math.max(WAVEFORM_MIN_HEIGHT, barHeight)));
    });
    context!.restore();
  };

  drawBars(baseColor);
  if (progress > 0) drawBars(playedColor, cssWidth * Math.min(1, Math.max(0, progress)));
}

function withAlpha(color: string, alpha: number): string {
  const rgb = color.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (!rgb) return color;
  return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;
}

function formatDuration(seconds: number): string {
  return formatVoiceDuration(Math.max(0, Math.round(seconds * 1_000)));
}

export function VoiceMessagePlayer({ attachment, isOwn = false }: Props) {
  const authToken = useAppStore((state) => state.authToken);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [waveform, setWaveform] = useState(() => createFallbackWaveform());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState((attachment.duration_ms ?? attachment.durationMs ?? 0) / 1_000);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setIsLoading(true);
    setError(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration((attachment.duration_ms ?? attachment.durationMs ?? 0) / 1_000);
    setWaveform(createFallbackWaveform());
    setAudioUrl(null);

    void fetchAttachmentBlob(attachment, authToken)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setAudioUrl(objectUrl);
        setIsLoading(false);
        void getCachedWaveform(attachment.id, blob).then((nextWaveform) => {
          if (!cancelled) setWaveform(nextWaveform);
        });
      })
      .catch(() => {
        if (!cancelled) {
          setIsLoading(false);
          setError("Voice message unavailable");
        }
      });

    return () => {
      cancelled = true;
      const audio = audioRef.current;
      audio?.pause();
      if (activeVoiceAudio === audio) activeVoiceAudio = null;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setAudioUrl(null);
    };
  }, [attachment.id, attachment.url, authToken, loadAttempt]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;

    audio.src = audioUrl;
    const handleLoadedMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
      setIsLoading(false);
    };
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      if (activeVoiceAudio === audio) activeVoiceAudio = null;
    };
    const handleError = () => {
      setIsLoading(false);
      setError("Voice message playback failed");
      setIsPlaying(false);
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    if (audio.readyState >= 1) handleLoadedMetadata();

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, [audioUrl]);

  useEffect(() => {
    if (waveformRef.current) drawWaveform(waveformRef.current, waveform, duration > 0 ? currentTime / duration : 0);
  }, [currentTime, duration, waveform]);

  const seek = (nextTime: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(nextTime)) return;
    const clamped = Math.min(Math.max(nextTime, 0), duration || 0);
    audio.currentTime = clamped;
    setCurrentTime(clamped);
  };

  const seekFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = bounds.width ? (event.clientX - bounds.left) / bounds.width : 0;
    seek(ratio * duration);
  };

  const handleWaveformKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    if (event.key === "Home") return seek(0);
    if (event.key === "End") return seek(duration);
    seek(currentTime + (event.key === "ArrowRight" ? 1 : -1));
  };

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio || !audioUrl || error) return;

    if (!audio.paused) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    if (activeVoiceAudio && activeVoiceAudio !== audio) activeVoiceAudio.pause();
    activeVoiceAudio = audio;
    void audio.play()
      .then(() => setIsPlaying(true))
      .catch(() => {
        setIsPlaying(false);
        setError("Voice message playback failed");
      });
  };

  const buttonLabel = error
    ? "Retry voice message"
    : isPlaying
      ? "Pause voice message"
      : "Play voice message";
  const shownDuration = currentTime > 0 || isPlaying ? currentTime : duration;
  const voiceStyle = {
    "--voice-button-background": isOwn ? "var(--bubble-outgoing-text)" : "var(--bubble-incoming)",
    "--voice-button-foreground": isOwn ? "var(--bubble-outgoing)" : "var(--bubble-incoming-text)",
    "--voice-waveform-base": "color-mix(in srgb, var(--voice-button-foreground) 50%, transparent)",
    "--voice-waveform-played": "var(--voice-button-foreground)",
    color: "var(--voice-button-foreground)",
  } as CSSProperties;

  return (
    <div
      className="relative mt-[3px] mb-[7px] flex h-[48px] w-full min-w-0 items-start"
      data-testid="voice-message-player"
      style={voiceStyle}
    >
      <audio ref={audioRef} preload="metadata" aria-hidden="true" />
      <div className="relative h-[48px] w-[60px] shrink-0">
        <button
          type="button"
          className="relative flex h-[48px] w-[48px] shrink-0 items-center justify-center overflow-hidden rounded-full border-0 p-[5px] text-[color:var(--voice-button-foreground)] transition-colors"
          style={{ backgroundColor: "var(--voice-button-background)" }}
          onClick={(event) => {
            event.stopPropagation();
            if (error) setLoadAttempt((attempt) => attempt + 1);
            else togglePlayback();
          }}
          disabled={isLoading}
          aria-label={buttonLabel}
        >
          {isLoading ? (
            <LoaderCircle className="h-6 w-6 animate-spin" aria-hidden="true" />
          ) : error ? (
            <RotateCcw className="h-6 w-6" aria-hidden="true" />
          ) : (
            <>
              <Play
                className={cn(
                  "absolute ml-[3px] h-[26px] w-[26px] transform transition-[opacity,transform] duration-[400ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]",
                  isPlaying ? "scale-50 opacity-0" : "scale-100 opacity-100",
                )}
                style={{ transitionDuration: "400ms, 600ms" }}
                aria-hidden="true"
              />
              <Pause
                className={cn(
                  "absolute h-[25px] w-[25px] transform transition-[opacity,transform] duration-[400ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]",
                  isPlaying ? "scale-100 opacity-100" : "scale-50 opacity-0",
                )}
                style={{ transitionDuration: "400ms, 600ms" }}
                aria-hidden="true"
              />
            </>
          )}
        </button>
      </div>
      <div className="flex h-[48px] min-w-0 flex-1 flex-col p-0" data-testid="voice-message-content">
        <div className="flex h-[23px] w-full max-w-[261px] overflow-visible p-0" data-testid="voice-message-waveform-wrapper">
          <div
            className="h-[23px] w-full max-w-[260px] cursor-pointer touch-none"
            role="slider"
            tabIndex={0}
            aria-label="Voice message progress"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={Math.min(currentTime, duration)}
            aria-valuetext={formatDuration(shownDuration)}
            data-testid="voice-message-waveform"
            data-bar-count={WAVEFORM_BAR_COUNT}
            data-bar-width="2"
            data-bar-gap="2"
            onKeyDown={handleWaveformKeyDown}
            onPointerDown={(event) => {
              dragRef.current = true;
              event.currentTarget.setPointerCapture?.(event.pointerId);
              seekFromPointer(event);
            }}
            onPointerMove={(event) => {
              if (dragRef.current) seekFromPointer(event);
            }}
            onPointerUp={(event) => {
              dragRef.current = false;
              event.currentTarget.releasePointerCapture?.(event.pointerId);
            }}
            onPointerCancel={() => { dragRef.current = false; }}
          >
            <canvas
              ref={waveformRef}
              className="ml-[1px] h-[23px] w-[260px] max-w-full"
              width={520}
              height={46}
              aria-hidden="true"
            />
          </div>
        </div>
        <div
          className={cn(
            "mt-[4px] flex h-[21px] w-full max-w-[261px] items-center overflow-hidden pr-[58px] text-[14px] font-normal leading-[21px] text-[color:var(--voice-button-foreground)]",
            error && "text-destructive",
          )}
          data-testid="voice-message-duration"
        >
          {error ?? formatDuration(shownDuration)}
        </div>
      </div>
    </div>
  );
}
