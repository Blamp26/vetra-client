import { useEffect, useId, useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { Dialog } from "@/shared/components/Dialog";
import { Button } from "@/shared/components/Button";
import { APP_TITLE_BAR_HEIGHT } from "@/shared/components/DesktopTitleBar/DesktopTitleBar";

export const GROUP_AVATAR_SIZE = 512;
export const GROUP_AVATAR_MAX_UPLOAD_SIZE = 15_000_000;
export const GROUP_AVATAR_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const;

export function isSupportedGroupAvatar(file: Pick<File, "type" | "size">) {
  return (
    GROUP_AVATAR_TYPES.includes(
      file.type as (typeof GROUP_AVATAR_TYPES)[number],
    ) && file.size <= GROUP_AVATAR_MAX_UPLOAD_SIZE
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

interface AvatarCropDialogProps {
  source: Blob;
  onCancel: () => void;
  onSetPhoto: (blob: Blob) => void;
}

type ImageStatus = "loading" | "ready" | "error";

export function AvatarCropDialog({
  source,
  onCancel,
  onSetPhoto,
}: AvatarCropDialogProps) {
  const titleId = useId();
  const imageRef = useRef<HTMLImageElement>(null);
  const sourceUrlRef = useRef<string | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [imageStatus, setImageStatus] = useState<ImageStatus>("loading");
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [windowSize, setWindowSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  const viewportSize = Math.min(768, Math.max(240, windowSize.height - 218));
  const cropTop = Math.max(
    24,
    Math.min(56, (windowSize.height - viewportSize - 160) / 2) - 3,
  );
  const cropLeft = Math.max(0, (windowSize.width - viewportSize) / 2);
  const cropCenterX = cropLeft + viewportSize / 2;
  const cropCenterY = cropTop + viewportSize / 2;

  useEffect(() => {
    const handleResize = () =>
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const nextUrl = URL.createObjectURL(source);
    sourceUrlRef.current = nextUrl;
    setSourceUrl(nextUrl);
    setImageSize({ width: 0, height: 0 });
    setImageStatus("loading");
    setZoom(1);
    setPosition({ left: 0, top: 0 });
    setError(null);

    return () => {
      if (sourceUrlRef.current === nextUrl) {
        URL.revokeObjectURL(nextUrl);
        sourceUrlRef.current = null;
      }
    };
  }, [source]);

  const baseScale =
    imageSize.width && imageSize.height
      ? Math.max(
          viewportSize / imageSize.width,
          viewportSize / imageSize.height,
        )
      : 1;
  const renderedWidth = imageSize.width * baseScale * zoom;
  const renderedHeight = imageSize.height * baseScale * zoom;
  const bounds = {
    minLeft: viewportSize - renderedWidth,
    maxLeft: 0,
    minTop: viewportSize - renderedHeight,
    maxTop: 0,
  };

  useEffect(() => {
    if (!imageSize.width || !imageSize.height) return;
    setPosition({
      left: (viewportSize - renderedWidth) / 2,
      top: (viewportSize - renderedHeight) / 2,
    });
    // Initial centering is tied to the decoded image, not subsequent dragging.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSize.width, imageSize.height, viewportSize]);

  useEffect(() => {
    setPosition((current) => ({
      left: clamp(current.left, bounds.minLeft, bounds.maxLeft),
      top: clamp(current.top, bounds.minTop, bounds.maxTop),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, imageSize.width, imageSize.height, viewportSize]);

  const releaseSourceUrl = () => {
    const currentUrl = sourceUrlRef.current;
    if (!currentUrl) return;
    URL.revokeObjectURL(currentUrl);
    sourceUrlRef.current = null;
    setSourceUrl(null);
  };

  const handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    if (!image.naturalWidth || !image.naturalHeight) {
      setImageStatus("error");
      setError("That image could not be decoded.");
      releaseSourceUrl();
      return;
    }
    setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
    setImageStatus("ready");
    setError(null);
  };

  const handleImageError = () => {
    setImageStatus("error");
    setImageSize({ width: 0, height: 0 });
    setError("That image could not be decoded.");
    releaseSourceUrl();
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (imageStatus !== "ready") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: position.left,
      top: position.top,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPosition({
      left: clamp(
        drag.left + event.clientX - drag.x,
        bounds.minLeft,
        bounds.maxLeft,
      ),
      top: clamp(
        drag.top + event.clientY - drag.y,
        bounds.minTop,
        bounds.maxTop,
      ),
    });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const setPhoto = async () => {
    const image = imageRef.current;
    if (
      imageStatus !== "ready" ||
      !image ||
      !imageSize.width ||
      !imageSize.height
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = GROUP_AVATAR_SIZE;
      canvas.height = GROUP_AVATAR_SIZE;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not prepare the avatar crop.");
      const sourceX = -position.left / (baseScale * zoom);
      const sourceY = -position.top / (baseScale * zoom);
      const sourceSize = viewportSize / (baseScale * zoom);
      context.clearRect(0, 0, GROUP_AVATAR_SIZE, GROUP_AVATAR_SIZE);
      context.save();
      context.beginPath();
      context.arc(
        GROUP_AVATAR_SIZE / 2,
        GROUP_AVATAR_SIZE / 2,
        GROUP_AVATAR_SIZE / 2,
        0,
        Math.PI * 2,
      );
      context.clip();
      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceSize,
        sourceSize,
        0,
        0,
        GROUP_AVATAR_SIZE,
        GROUP_AVATAR_SIZE,
      );
      context.restore();
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) throw new Error("Could not create the cropped avatar.");
      onSetPhoto(blob);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not create the cropped avatar.",
      );
    } finally {
      setBusy(false);
    }
  };

  const changeZoom = (delta: number) =>
    setZoom((current) => clamp(Number((current + delta).toFixed(2)), 1, 3));
  const resetFraming = () => {
    setZoom(1);
    if (imageSize.width && imageSize.height) {
      setPosition({
        left: (viewportSize - renderedWidth / zoom) / 2,
        top: (viewportSize - renderedHeight / zoom) / 2,
      });
    } else {
      setPosition({ left: 0, top: 0 });
    }
  };
  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (imageStatus !== "ready") return;
    event.preventDefault();
    changeZoom(event.deltaY > 0 ? -0.1 : 0.1);
  };
  const handleStageKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "+" || event.key === "=" || event.key === "ArrowUp") {
      event.preventDefault();
      changeZoom(0.1);
    } else if (
      event.key === "-" ||
      event.key === "_" ||
      event.key === "ArrowDown"
    ) {
      event.preventDefault();
      changeZoom(-0.1);
    } else if (event.key === "0") {
      event.preventDefault();
      resetFraming();
    }
  };

  return (
    <Dialog
      open
      onClose={onCancel}
      labelledBy={titleId}
      showBackdrop={false}
      overlayClassName="!z-[1200] !inset-x-0 !bottom-0 !p-0"
      overlayStyle={{ top: `${APP_TITLE_BAR_HEIGHT}px` }}
      className="!absolute !inset-0 !flex !h-full !w-full !max-w-none !items-stretch !justify-stretch !rounded-none !border-0 !bg-transparent !p-0 !shadow-none"
    >
      <h2 id={titleId} className="sr-only">
        Avatar crop editor
      </h2>
      <div
        className="absolute inset-0 overflow-hidden bg-neutral-950/85 text-white"
        data-testid="avatar-crop-fullscreen"
      >
        <div
          className="absolute inset-0 touch-none cursor-grab active:cursor-grabbing"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
          onKeyDown={handleStageKeyDown}
          tabIndex={0}
          aria-label="Avatar crop preview. Drag to reposition and use the mouse wheel to zoom."
          role="application"
          data-testid="avatar-crop-stage"
        >
          {sourceUrl && (
            <>
              <img
                src={sourceUrl}
                alt=""
                draggable={false}
                className="pointer-events-none absolute max-w-none select-none"
                style={{
                  width: renderedWidth,
                  height: renderedHeight,
                  left: cropLeft + position.left,
                  top: cropTop + position.top,
                  visibility: imageStatus === "ready" ? "visible" : "hidden",
                  filter: "brightness(0.3)",
                }}
                data-testid="avatar-crop-image-dim"
              />
              <img
                ref={imageRef}
                src={sourceUrl}
                alt=""
                draggable={false}
                className="pointer-events-none absolute max-w-none select-none"
                style={{
                  width: renderedWidth,
                  height: renderedHeight,
                  left: cropLeft + position.left,
                  top: cropTop + position.top,
                  visibility: imageStatus === "ready" ? "visible" : "hidden",
                  clipPath: `circle(${viewportSize / 2}px at ${cropCenterX}px ${cropCenterY}px)`,
                }}
                onLoad={handleImageLoad}
                onError={handleImageError}
                data-testid="avatar-crop-image-bright"
              />
            </>
          )}
          {imageStatus === "loading" && (
            <div
              className="absolute inset-0 grid place-items-center text-sm text-white/65"
              role="status"
            >
              <span className="animate-pulse">Loading image…</span>
            </div>
          )}
          {imageStatus === "error" && (
            <div
              className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-red-200"
              role="alert"
            >
              {error}
            </div>
          )}
          {imageStatus === "ready" && (
            <>
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full"
                aria-hidden="true"
                data-testid="avatar-crop-mask"
              >
                <circle
                  cx={cropCenterX}
                  cy={cropCenterY}
                  r={viewportSize / 2 - 1}
                  fill="none"
                  stroke="white"
                  strokeOpacity="0.38"
                  strokeWidth="1"
                />
              </svg>
              <div
                className="pointer-events-none absolute"
                style={{
                  left: cropLeft,
                  top: cropTop,
                  width: viewportSize,
                  height: viewportSize,
                }}
                data-testid="avatar-crop-corner-guides"
                aria-hidden="true"
              >
                <span className="absolute left-0 top-0 h-8 w-8 border-l-2 border-t-2 border-white/90" />
                <span className="absolute right-0 top-0 h-8 w-8 border-r-2 border-t-2 border-white/90" />
                <span className="absolute bottom-0 left-0 h-8 w-8 border-b-2 border-l-2 border-white/90" />
                <span className="absolute bottom-0 right-0 h-8 w-8 border-b-2 border-r-2 border-white/90" />
              </div>
            </>
          )}
        </div>
        <div
          className="absolute bottom-5 left-1/2 flex h-[52px] w-[min(418px,calc(100vw-40px))] -translate-x-1/2 items-center justify-between rounded-full bg-black/80 px-4 shadow-2xl"
          data-testid="avatar-crop-toolbar"
        >
          <Button
            type="button"
            variant="ghost"
            size="compact"
            className="!min-h-8 !rounded-full !border-0 !bg-transparent px-3 text-sm text-white/90 hover:!bg-white/10 hover:text-white"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <div className="flex items-center gap-1" aria-label="Crop controls">
            <button
              type="button"
              aria-label="Zoom out"
              className="grid h-8 w-8 place-items-center rounded-full text-white/80 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              disabled={zoom <= 1 || imageStatus !== "ready"}
              onClick={() => changeZoom(-0.1)}
            >
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Reset crop framing"
              className="grid h-8 w-8 place-items-center rounded-full text-white/80 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              disabled={imageStatus !== "ready"}
              onClick={resetFraming}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Zoom in"
              className="grid h-8 w-8 place-items-center rounded-full text-white/80 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              disabled={zoom >= 3 || imageStatus !== "ready"}
              onClick={() => changeZoom(0.1)}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="compact"
            className="!min-h-8 !rounded-full !border-0 !bg-transparent px-3 text-sm text-primary hover:!bg-white/10"
            loading={busy}
            disabled={busy || imageStatus !== "ready"}
            onClick={() => void setPhoto()}
          >
            Set photo
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
