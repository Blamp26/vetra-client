import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, Forward, Trash2, X, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { useAppStore } from "@/store";
import { AuthenticatedImage } from "./AuthenticatedImage";
import { Avatar } from "./Avatar";
import { formatVideoLightboxTimestamp } from "./videoLightboxDate";

interface ImageLightboxProps {
  src: string;
  authorName: string;
  avatarSrc?: string | null;
  createdAt: string;
  onDelete?: (() => void) | undefined;
  onForward?: (() => void) | undefined;
  onClose: () => void;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  src,
  authorName,
  avatarSrc,
  createdAt,
  onDelete,
  onForward,
  onClose,
}) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isZoomed, setIsZoomed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();

      const delta = event.deltaY > 0 ? -0.2 : 0.2;
      const rect = container.getBoundingClientRect();
      const mouseX = event.clientX - (rect.left + rect.width / 2);
      const mouseY = event.clientY - (rect.top + rect.height / 2);

      setScale((currentScale) => {
        const nextScale = Math.max(1, Math.min(currentScale + delta, 5));
        setIsZoomed(nextScale > 1);

        if (nextScale === 1) {
          setPosition({ x: 0, y: 0 });
          return 1;
        }

        const ratio = nextScale / currentScale;
        setPosition((currentPosition) => {
          const nextX = mouseX - (mouseX - currentPosition.x) * ratio;
          const nextY = mouseY - (mouseY - currentPosition.y) * ratio;
          const limitX = Math.max(0, (rect.width * nextScale - rect.width) / 2);
          const limitY = Math.max(0, (rect.height * nextScale - rect.height) / 2);

          return {
            x: Math.max(-limitX, Math.min(nextX, limitX)),
            y: Math.max(-limitY, Math.min(nextY, limitY)),
          };
        });

        return nextScale;
      });
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, []);

  const formattedTimestamp = useMemo(
    () => formatVideoLightboxTimestamp(createdAt),
    [createdAt],
  );

  const actionButtonClassName = "inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-transparent text-white/82 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70";

  const toggleZoom = () => {
    setIsZoomed((current) => {
      const next = !current;
      setScale(next ? 2 : 1);
      if (!next) {
        setPosition({ x: 0, y: 0 });
      }
      return next;
    });
  };

  const handleMouseDown = (event: React.MouseEvent) => {
    if (scale <= 1) return;
    event.preventDefault();
    setIsDragging(true);
    setDragStart({ x: event.clientX - position.x, y: event.clientY - position.y });
  };

  const handleMouseMove = (event: React.MouseEvent) => {
    if (!isDragging || scale <= 1 || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const limitX = Math.max(0, (rect.width * scale - rect.width) / 2);
    const limitY = Math.max(0, (rect.height * scale - rect.height) / 2);

    setPosition({
      x: Math.max(-limitX, Math.min(event.clientX - dragStart.x, limitX)),
      y: Math.max(-limitY, Math.min(event.clientY - dragStart.y, limitY)),
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

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
      link.download = `vetra_${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/92 px-4 py-4"
      data-testid="image-lightbox"
      onClick={onClose}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div
        className="pointer-events-none absolute left-4 top-4 z-[2002] flex max-w-[min(64vw,22rem)] items-center gap-3 text-left text-white/88"
        data-testid="image-lightbox-meta"
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
            aria-label="Forward image"
            className={actionButtonClassName}
            data-testid="image-lightbox-forward"
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
          aria-label={isZoomed ? "Fit image to screen" : "Zoom image"}
          className={actionButtonClassName}
          data-testid="image-lightbox-zoom"
          onClick={(event) => {
            event.stopPropagation();
            toggleZoom();
          }}
        >
          {isZoomed ? <ZoomOut className="h-5 w-5" /> : <ZoomIn className="h-5 w-5" />}
        </button>
        <button
          type="button"
          aria-label="Download image"
          className={actionButtonClassName}
          data-testid="image-lightbox-download"
          onClick={handleDownload}
        >
          <Download className="h-5 w-5" />
        </button>
        {onDelete && (
          <button
            type="button"
            aria-label="Delete message"
            className={actionButtonClassName}
            data-testid="image-lightbox-delete"
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
          aria-label="Close image viewer"
          className={actionButtonClassName}
          data-testid="image-lightbox-close"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div
        ref={containerRef}
        className="relative flex h-full w-full items-center justify-center overflow-hidden"
        data-testid="image-lightbox-stage"
        onClick={(event) => event.stopPropagation()}
      >
        <AuthenticatedImage
          src={src}
          alt="Lightbox"
          className={cn(
            "max-h-[calc(100dvh-48px)] max-w-[min(96vw,1400px)] rounded-[14px] object-contain select-none",
            scale > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-default",
          )}
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          }}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={handleMouseDown}
          data-testid="image-lightbox-image"
        />
      </div>
    </div>
  );
};
