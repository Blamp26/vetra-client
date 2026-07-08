import React, { useEffect } from "react";
import { Download, X } from "lucide-react";
import { useAppStore } from "@/store";
import { cn } from "@/shared/utils/cn";
import { AuthenticatedVideo } from "./AuthenticatedVideo";

interface VideoLightboxProps {
  src: string;
  author: string;
  time: string;
  onClose: () => void;
}

export const VideoLightbox: React.FC<VideoLightboxProps> = ({
  src,
  author,
  time,
  onClose,
}) => {
  const authToken = useAppStore((s) => s.authToken);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "auto";
    };
  }, [onClose]);

  const handleDownload = async (event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      const response = await fetch(src, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `vetra_${Date.now()}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Video download failed:", err);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/88 px-4 py-6"
      data-testid="video-lightbox"
      onClick={onClose}
    >
      <button
        className="absolute right-4 top-4 z-[2001] inline-flex h-10 w-10 items-center justify-center rounded-full bg-background/92 text-foreground shadow-sm ring-1 ring-border transition-colors hover:bg-background"
        onClick={onClose}
      >
        <X className="h-5 w-5" />
      </button>

      <div
        className="relative flex w-full max-w-[min(72rem,calc(100vw-2rem))] flex-col gap-3"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="overflow-hidden rounded-[18px] bg-black shadow-[0_18px_60px_rgba(0,0,0,0.42)] ring-1 ring-white/10">
          <AuthenticatedVideo
            src={src}
            controls
            autoPlay
            muted={false}
            loop={false}
            playsInline
            preload="metadata"
            className="block max-h-[min(80vh,48rem)] w-full bg-black object-contain"
            data-testid="video-lightbox-player"
          />
        </div>

        <div
          className={cn(
            "flex items-center justify-between gap-4 rounded-[16px] bg-background/94 px-4 py-3 ring-1 ring-border",
            "backdrop-blur-0",
          )}
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">{author}</div>
            <div className="truncate text-xs text-muted-foreground">{time}</div>
          </div>

          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90"
          >
            <Download className="h-4 w-4" />
            Download
          </button>
        </div>
      </div>
    </div>
  );
};
