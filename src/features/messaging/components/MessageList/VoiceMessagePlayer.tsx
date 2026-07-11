import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import type { Attachment } from "@/shared/types";
import { useAppStore } from "@/store";
import { cn } from "@/shared/utils/cn";
import { fetchAttachmentBlob } from "../../utils/attachmentDownloads";
import { formatVoiceDuration } from "../../utils/voiceRecording";

let activeVoiceAudio: HTMLAudioElement | null = null;

interface Props {
  attachment: Attachment;
}

export function VoiceMessagePlayer({ attachment }: Props) {
  const authToken = useAppStore((state) => state.authToken);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState((attachment.duration_ms ?? attachment.durationMs ?? 0) / 1_000);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setIsLoading(true);
    setError(null);
    setIsPlaying(false);
    setCurrentTime(0);

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
  }, [attachment.id, attachment.url, authToken]);

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

  const seek = (value: string) => {
    const audio = audioRef.current;
    const nextTime = Number(value);
    if (!audio || !Number.isFinite(nextTime)) return;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  return (
    <div className="flex min-w-[220px] items-center gap-2" data-testid="voice-message-player">
      <audio ref={audioRef} preload="metadata" aria-hidden="true" />
      <button
        type="button"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
        onClick={(event) => {
          event.stopPropagation();
          togglePlayback();
        }}
        disabled={isLoading || Boolean(error)}
        aria-label={isPlaying ? "Pause voice message" : "Play voice message"}
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
      </button>
      <div className="min-w-0 flex-1">
        <input
          type="range"
          min={0}
          max={Math.max(duration, 0.1)}
          step={0.01}
          value={Math.min(currentTime, duration || 0)}
          onChange={(event) => seek(event.target.value)}
          disabled={isLoading || Boolean(error)}
          className="w-full accent-primary"
          aria-label="Voice message progress"
          data-testid="voice-message-progress"
        />
        <div className={cn("text-[11px] text-muted-foreground", error && "text-destructive")}>
          {error ?? `${formatVoiceDuration(currentTime * 1_000)} / ${formatVoiceDuration(duration * 1_000)}`}
        </div>
      </div>
    </div>
  );
}
