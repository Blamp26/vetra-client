import React, { useEffect, useMemo, useState } from "react";
import { Download, X } from "lucide-react";
import { useAppStore } from "@/store";
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
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window === "undefined" ? 1280 : window.innerWidth,
    height: typeof window === "undefined" ? 720 : window.innerHeight,
  }));
  const [mediaSize, setMediaSize] = useState({ width: 1, height: 1 });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const handleResize = () => {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
      document.body.style.overflow = "auto";
    };
  }, [onClose]);

  const lightboxFrame = useMemo(() => {
    const availableWidth = Math.min(viewportSize.width * 0.96, 1152);
    const availableHeight = Math.max(240, viewportSize.height - 80);
    const ratio = mediaSize.width > 0 && mediaSize.height > 0
      ? mediaSize.width / mediaSize.height
      : 1;

    let width = availableWidth;
    let height = width / ratio;

    if (height > availableHeight) {
      height = availableHeight;
      width = height * ratio;
    }

    return {
      width: Math.round(width),
      height: Math.round(height),
      ratio,
    };
  }, [mediaSize.height, mediaSize.width, viewportSize.height, viewportSize.width]);

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
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/92 px-4 py-4"
      data-testid="video-lightbox"
      onClick={onClose}
    >
      <div
        className="pointer-events-none absolute left-4 top-4 z-[2002] max-w-[min(60vw,22rem)] text-left text-white/88"
        data-testid="video-lightbox-meta"
        style={{ textShadow: "0 1px 2px rgba(0, 0, 0, 0.42)" }}
      >
        <div className="truncate text-[15px] font-medium leading-[1.2] text-white">{author}</div>
        <div className="truncate pt-0.5 text-[12px] leading-[1.25] text-white/70">{time}</div>
      </div>

      <div className="absolute right-3 top-3 z-[2002] flex items-center gap-1">
        <button
          type="button"
          aria-label="Download video"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-transparent text-white/82 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
          data-testid="video-lightbox-download"
          onClick={handleDownload}
        >
          <Download className="h-5 w-5" />
        </button>

        <button
          aria-label="Close video viewer"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-transparent text-white/82 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
          data-testid="video-lightbox-close"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div
        className="relative flex items-center justify-center"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="relative overflow-hidden rounded-[14px]"
          data-testid="video-lightbox-stage"
          style={{
            width: `${lightboxFrame.width}px`,
            height: `${lightboxFrame.height}px`,
          }}
        >
          <AuthenticatedVideo
            src={src}
            controls
            autoPlay
            muted={false}
            loop={false}
            playsInline
            preload="metadata"
            className="block h-full w-full bg-black object-contain"
            data-testid="video-lightbox-player"
            onMediaDiagnostics={(diagnostics) => {
              if (diagnostics.naturalWidth > 0 && diagnostics.naturalHeight > 0) {
                setMediaSize({
                  width: diagnostics.naturalWidth,
                  height: diagnostics.naturalHeight,
                });
              }
            }}
          />
        </div>
      </div>
    </div>
  );
};
