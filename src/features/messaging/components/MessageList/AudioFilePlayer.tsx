import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Download, LoaderCircle, RotateCcw } from "lucide-react";
import type { Attachment } from "@/shared/types";
import { useAppStore } from "@/store";
import { cn } from "@/shared/utils/cn";
import { fetchAttachmentBlob, downloadAttachmentWithAuth } from "../../utils/attachmentDownloads";
import { claimMediaAudio, releaseMediaAudio } from "../../utils/mediaPlaybackCoordinator";

interface Props {
  attachment: Attachment;
  isOwn?: boolean;
  messageMeta?: ReactNode;
}

function formatAudioDuration(seconds: number) {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function FilledPlayIcon({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 26 26"
      className={cn("absolute m-0 block h-[26px] w-[26px] transform-origin-[50%_50%]", className)}
      style={style}
      aria-hidden="true"
    >
      <path d="M6.5 5.5a1.5 1.5 0 0 1 2.28-1.28l10.7 6.5a1.5 1.5 0 0 1 0 2.56l-10.7 6.5A1.5 1.5 0 0 1 6.5 18.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FilledPauseIcon({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 26 26"
      className={cn("absolute m-0 block h-[26px] w-[26px] transform-origin-[50%_50%]", className)}
      style={style}
      aria-hidden="true"
    >
      <rect x="7" y="4.5" width="4.5" height="17" rx="1" fill="currentColor" stroke="none" />
      <rect x="14.5" y="4.5" width="4.5" height="17" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function AudioFilePlayer({ attachment, isOwn = false, messageMeta }: Props) {
  const authToken = useAppStore((state) => state.authToken);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState((attachment.duration_ms ?? attachment.durationMs ?? 0) / 1_000);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setIsLoading(true);
    setError(null);
    setIsPlaying(false);
    setHasStarted(false);
    setCurrentTime(0);
    setDuration((attachment.duration_ms ?? attachment.durationMs ?? 0) / 1_000);
    setAudioUrl(null);

    void fetchAttachmentBlob(attachment, authToken)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setAudioUrl(objectUrl);
        setIsLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setIsLoading(false);
          setError("Audio file unavailable");
        }
      });

    return () => {
      cancelled = true;
      const audio = audioRef.current;
      audio?.pause();
      if (audio) releaseMediaAudio(audio);
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
      releaseMediaAudio(audio);
    };
    const handleError = () => {
      setIsLoading(false);
      setIsPlaying(false);
      setError("Audio playback failed");
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

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio || !audioUrl || error) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }

    setHasStarted(true);
    claimMediaAudio(audio);
    void audio.play().then(() => setIsPlaying(true)).catch(() => {
      releaseMediaAudio(audio);
      setIsPlaying(false);
      setError("Audio playback failed");
    });
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    setError(null);
    try {
      await downloadAttachmentWithAuth({ attachment, authToken });
    } catch {
      setError("Audio download failed");
    } finally {
      setIsDownloading(false);
    }
  };

  const totalDuration = duration > 0 ? duration : 0;
  const shownDuration = hasStarted
    ? `${formatAudioDuration(currentTime)} / ${formatAudioDuration(totalDuration)}`
    : formatAudioDuration(totalDuration);
  const label = error
    ? "Retry audio file"
    : isPlaying
      ? "Pause audio file"
      : "Play audio file";
  const audioStyle = {
    "--audio-control-background": isOwn ? "var(--bubble-outgoing-text)" : "var(--primary)",
    "--audio-icon-color": isOwn ? "var(--bubble-outgoing)" : "var(--primary-foreground)",
    "--audio-strong-foreground": isOwn ? "var(--bubble-outgoing-text)" : "var(--bubble-incoming-text)",
  } as CSSProperties;

  return (
    <div
      className="relative flex h-[48px] w-full min-w-0 items-center"
      data-testid="audio-file-player"
      style={audioStyle}
    >
      <audio ref={audioRef} preload="metadata" aria-hidden="true" />
      <button
        type="button"
        className="relative mr-3 flex h-[48px] w-[48px] shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border-0 p-0 text-[color:var(--audio-icon-color)]"
        style={{ backgroundColor: "var(--audio-control-background)" }}
        onClick={(event) => {
          event.stopPropagation();
          if (error) setLoadAttempt((attempt) => attempt + 1);
          else togglePlayback();
        }}
        disabled={isLoading}
        aria-label={label}
      >
        {isLoading ? (
          <LoaderCircle className="h-6 w-6 animate-spin" aria-hidden="true" />
        ) : error ? (
          <RotateCcw className="h-6 w-6" aria-hidden="true" />
        ) : (
          <span className="pointer-events-none absolute inset-0 grid place-items-center leading-[0]" data-testid="audio-icon-stage">
            <FilledPlayIcon
              className={cn(
                "transition-[opacity,transform] duration-[400ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]",
                isPlaying ? "scale-50 opacity-0" : "scale-100 opacity-100",
              )}
              style={{ transitionDuration: "400ms, 600ms" }}
            />
            <FilledPauseIcon
              className={cn(
                "transition-[opacity,transform] duration-[400ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]",
                isPlaying ? "scale-100 opacity-100" : "scale-50 opacity-0",
              )}
              style={{ transitionDuration: "400ms, 600ms" }}
            />
          </span>
        )}
      </button>

      <div className="flex h-[43px] min-w-0 flex-1 flex-col justify-start text-[color:var(--audio-strong-foreground)]">
        <div className="flex h-[20px] min-w-0 items-center">
          <div className="min-w-0 flex-1 truncate whitespace-nowrap text-[16px] font-medium leading-[20px]" title={attachment.original_name ?? "Audio"}>
            {attachment.original_name || "Audio"}
          </div>
          <button
            type="button"
            className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full opacity-70 hover:opacity-100"
            onClick={(event) => { event.stopPropagation(); void handleDownload(); }}
            disabled={isDownloading}
            aria-label="Download audio file"
          >
            {isDownloading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          </button>
        </div>
        <div className="mt-[2px] flex h-[21px] min-w-0 items-center gap-1 text-[12px] leading-[21px]" data-testid="audio-meta">
          {hasStarted ? (
            <input
              type="range"
              min={0}
              max={totalDuration}
              step={0.01}
              value={Math.min(currentTime, totalDuration)}
              onChange={(event) => {
                const nextTime = Number(event.currentTarget.value);
                if (audioRef.current && Number.isFinite(nextTime)) audioRef.current.currentTime = nextTime;
                setCurrentTime(nextTime);
              }}
              disabled={!audioUrl || totalDuration <= 0}
              aria-label="Seek audio file"
              data-testid="audio-seekline"
              className="h-3 min-w-0 flex-1 accent-current"
            />
          ) : null}
          <span className="shrink-0 opacity-75" data-testid="audio-duration">{shownDuration}</span>
          {messageMeta ? <span className="ml-auto shrink-0">{messageMeta}</span> : null}
        </div>
        {error && <div className="truncate text-[11px] leading-[14px] text-destructive">{error}</div>}
      </div>
    </div>
  );
}
