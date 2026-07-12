import { useEffect, useRef, useState } from "react";
import { Download, LoaderCircle, Pause, Play, RotateCcw } from "lucide-react";
import type { Attachment } from "@/shared/types";
import { useAppStore } from "@/store";
import { cn } from "@/shared/utils/cn";
import { fetchAttachmentBlob, downloadAttachmentWithAuth } from "../../utils/attachmentDownloads";
import { claimMediaAudio, releaseMediaAudio } from "../../utils/mediaPlaybackCoordinator";

interface Props {
  attachment: Attachment;
  isOwn?: boolean;
}

function formatAudioDuration(seconds: number) {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

export function AudioFilePlayer({ attachment, isOwn = false }: Props) {
  const authToken = useAppStore((state) => state.authToken);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
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

  const maxDuration = duration > 0 ? duration : 0;
  const label = error
    ? "Retry audio file"
    : isPlaying
      ? "Pause audio file"
      : "Play audio file";

  return (
    <div
      className={cn("flex min-w-0 items-center gap-2 py-1", isOwn ? "text-bubble-outgoing-text" : "text-bubble-incoming-text")}
      data-testid="audio-file-player"
    >
      <audio ref={audioRef} preload="metadata" aria-hidden="true" />
      <button
        type="button"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-current/15"
        onClick={(event) => {
          event.stopPropagation();
          if (error) setLoadAttempt((attempt) => attempt + 1);
          else togglePlayback();
        }}
        disabled={isLoading}
        aria-label={label}
      >
        {isLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : error ? <RotateCcw className="h-4 w-4" /> : isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium" title={attachment.original_name ?? "Audio"}>
          {attachment.original_name || "Audio"}
        </div>
        <input
          type="range"
          min={0}
          max={maxDuration}
          step={0.01}
          value={Math.min(currentTime, maxDuration)}
          onChange={(event) => {
            const nextTime = Number(event.currentTarget.value);
            if (audioRef.current && Number.isFinite(nextTime)) audioRef.current.currentTime = nextTime;
            setCurrentTime(nextTime);
          }}
          disabled={!audioUrl || maxDuration <= 0}
          aria-label="Seek audio file"
          className="h-3 w-full accent-current"
        />
        <div className="flex justify-between text-[11px] opacity-70">
          <span>{formatAudioDuration(currentTime)}</span>
          <span>{formatAudioDuration(maxDuration)}</span>
        </div>
        {error && <div className="truncate text-[11px] text-destructive">{error}</div>}
      </div>
      <button
        type="button"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full opacity-75 hover:opacity-100"
        onClick={(event) => { event.stopPropagation(); void handleDownload(); }}
        disabled={isDownloading}
        aria-label="Download audio file"
      >
        {isDownloading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      </button>
    </div>
  );
}
