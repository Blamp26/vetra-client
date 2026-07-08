import React, { useEffect, useMemo, useState } from "react";
import { Download, Forward, Trash2, X, ZoomIn, ZoomOut } from "lucide-react";
import { useAppStore } from "@/store";
import { Avatar } from "./Avatar";
import { AuthenticatedVideo } from "./AuthenticatedVideo";
import { formatVideoLightboxTimestamp } from "./videoLightboxDate";

interface VideoLightboxProps {
  src: string;
  authorName: string;
  avatarSrc?: string | null;
  createdAt: string;
  onDelete?: (() => void) | undefined;
  onForward?: (() => void) | undefined;
  onClose: () => void;
}

export const VideoLightbox: React.FC<VideoLightboxProps> = ({
  src,
  authorName,
  avatarSrc,
  createdAt,
  onDelete,
  onForward,
  onClose,
}) => {
  const authToken = useAppStore((s) => s.authToken);
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window === "undefined" ? 1280 : window.innerWidth,
    height: typeof window === "undefined" ? 720 : window.innerHeight,
  }));
  const [mediaSize, setMediaSize] = useState({ width: 1, height: 1 });
  const [isZoomed, setIsZoomed] = useState(false);

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
    const availableWidth = Math.min(
      viewportSize.width * (isZoomed ? 0.985 : 0.96),
      isZoomed ? 1400 : 1152,
    );
    const availableHeight = Math.max(240, viewportSize.height - (isZoomed ? 32 : 80));
    const ratio = mediaSize.width > 0 && mediaSize.height > 0
      ? mediaSize.width / mediaSize.height
      : 1;

    const naturalWidth = mediaSize.width > 1 ? mediaSize.width : availableWidth;
    const naturalHeight = mediaSize.height > 1 ? mediaSize.height : naturalWidth / ratio;

    let width = isZoomed ? Math.min(naturalWidth, availableWidth) : availableWidth;
    let height = isZoomed ? Math.min(naturalHeight, availableHeight) : width / ratio;

    if (isZoomed) {
      width = Math.max(width, Math.min(availableWidth, naturalWidth * 1.08));
      height = width / ratio;
    }

    if (height > availableHeight) {
      height = availableHeight;
      width = height * ratio;
    }

    return {
      width: Math.round(width),
      height: Math.round(height),
      ratio,
    };
  }, [isZoomed, mediaSize.height, mediaSize.width, viewportSize.height, viewportSize.width]);

  const formattedTimestamp = useMemo(
    () => formatVideoLightboxTimestamp(createdAt),
    [createdAt],
  );

  const actionButtonClassName = "inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-transparent text-white/82 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70";

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
        className="pointer-events-none absolute left-4 top-4 z-[2002] flex max-w-[min(64vw,22rem)] items-center gap-3 text-left text-white/88"
        data-testid="video-lightbox-meta"
        style={{ textShadow: "0 1px 2px rgba(0, 0, 0, 0.42)" }}
      >
        <Avatar
          name={authorName}
          src={avatarSrc}
          size="medium"
          className="border-white/20 bg-white/10 text-white"
        />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold leading-[1.2] text-white">{authorName}</div>
          <div className="truncate pt-0.5 text-[12px] leading-[1.25] text-white/70">
            {formattedTimestamp}
          </div>
        </div>
      </div>

      <div className="absolute right-3 top-3 z-[2002] flex items-center gap-0.5">
        {onForward && (
          <button
            type="button"
            aria-label="Forward video"
            className={actionButtonClassName}
            data-testid="video-lightbox-forward"
            onClick={(event) => {
              event.stopPropagation();
              onForward();
            }}
          >
            <Forward className="h-5 w-5" />
          </button>
        )}
        <button
          type="button"
          aria-label={isZoomed ? "Fit video to screen" : "Zoom video"}
          className={actionButtonClassName}
          data-testid="video-lightbox-zoom"
          onClick={(event) => {
            event.stopPropagation();
            setIsZoomed((current) => !current);
          }}
        >
          {isZoomed ? <ZoomOut className="h-5 w-5" /> : <ZoomIn className="h-5 w-5" />}
        </button>
        <button
          type="button"
          aria-label="Download video"
          className={actionButtonClassName}
          data-testid="video-lightbox-download"
          onClick={handleDownload}
        >
          <Download className="h-5 w-5" />
        </button>
        {onDelete && (
          <button
            type="button"
            aria-label="Delete message"
            className={actionButtonClassName}
            data-testid="video-lightbox-delete"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="h-5 w-5" />
          </button>
        )}
        <button
          type="button"
          aria-label="Close video viewer"
          className={actionButtonClassName}
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
