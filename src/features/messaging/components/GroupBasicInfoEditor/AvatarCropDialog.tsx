import { useEffect, useId, useRef, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { Dialog } from "@/shared/components/Dialog";
import { Button } from "@/shared/components/Button";
import { IconButton } from "@/shared/components/IconButton";

export const GROUP_AVATAR_SIZE = 512;
export const GROUP_AVATAR_MAX_UPLOAD_SIZE = 15_000_000;
export const GROUP_AVATAR_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

export function isSupportedGroupAvatar(file: Pick<File, "type" | "size">) {
  return GROUP_AVATAR_TYPES.includes(file.type as (typeof GROUP_AVATAR_TYPES)[number]) &&
    file.size <= GROUP_AVATAR_MAX_UPLOAD_SIZE;
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

export function AvatarCropDialog({ source, onCancel, onSetPhoto }: AvatarCropDialogProps) {
  const titleId = useId();
  const maskId = `avatar-crop-mask-${useId().replace(/:/g, "")}`;
  const imageRef = useRef<HTMLImageElement>(null);
  const sourceUrlRef = useRef<string | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [imageStatus, setImageStatus] = useState<ImageStatus>("loading");
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const viewportSize = 288;

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

  const baseScale = imageSize.width && imageSize.height
    ? Math.max(viewportSize / imageSize.width, viewportSize / imageSize.height)
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
  }, [imageSize.width, imageSize.height]);

  useEffect(() => {
    setPosition((current) => ({
      left: clamp(current.left, bounds.minLeft, bounds.maxLeft),
      top: clamp(current.top, bounds.minTop, bounds.maxTop),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, imageSize.width, imageSize.height]);

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
      left: clamp(drag.left + event.clientX - drag.x, bounds.minLeft, bounds.maxLeft),
      top: clamp(drag.top + event.clientY - drag.y, bounds.minTop, bounds.maxTop),
    });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const setPhoto = async () => {
    const image = imageRef.current;
    if (imageStatus !== "ready" || !image || !imageSize.width || !imageSize.height) return;
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
      context.arc(GROUP_AVATAR_SIZE / 2, GROUP_AVATAR_SIZE / 2, GROUP_AVATAR_SIZE / 2, 0, Math.PI * 2);
      context.clip();
      context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, GROUP_AVATAR_SIZE, GROUP_AVATAR_SIZE);
      context.restore();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Could not create the cropped avatar.");
      onSetPhoto(blob);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create the cropped avatar.");
    } finally {
      setBusy(false);
    }
  };

  const changeZoom = (delta: number) => setZoom((current) => clamp(Number((current + delta).toFixed(2)), 1, 3));

  return (
    <Dialog open onClose={onCancel} labelledBy={titleId} className="w-[min(366px,calc(100vw-48px))] overflow-hidden rounded-xl p-0">
      <div className="flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 id={titleId} className="text-base font-semibold">Crop photo</h2>
          <IconButton label="Cancel crop" size="compact" onClick={onCancel}><X className="h-4 w-4" aria-hidden="true" /></IconButton>
        </div>
        <div className="space-y-3 px-4 py-4">
          <div
            className="relative mx-auto h-72 w-72 touch-none cursor-grab overflow-hidden rounded-lg border border-border bg-muted active:cursor-grabbing"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            aria-label="Avatar crop preview. Drag to reposition."
            role="application"
            data-testid="avatar-crop-viewport"
          >
            {sourceUrl && <img
              ref={imageRef}
              src={sourceUrl}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none select-none"
              style={{ width: renderedWidth, height: renderedHeight, left: position.left, top: position.top, visibility: imageStatus === "ready" ? "visible" : "hidden" }}
              onLoad={handleImageLoad}
              onError={handleImageError}
            />}
            {imageStatus === "loading" && <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground" role="status"><span className="animate-pulse">Loading image…</span></div>}
            {imageStatus === "error" && <div className="absolute inset-0 grid place-items-center p-6 text-center text-xs text-destructive" role="alert">{error}</div>}
            {imageStatus === "ready" && <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${viewportSize} ${viewportSize}`} aria-hidden="true" data-testid="avatar-crop-mask">
              <defs><mask id={maskId}><rect width={viewportSize} height={viewportSize} fill="white" /><circle cx={viewportSize / 2} cy={viewportSize / 2} r={viewportSize / 2 - 2} fill="black" /></mask></defs>
              <rect width={viewportSize} height={viewportSize} fill="black" fillOpacity="0.52" mask={`url(#${maskId})`} />
              <circle cx={viewportSize / 2} cy={viewportSize / 2} r={viewportSize / 2 - 2} fill="none" stroke="white" strokeOpacity="0.9" strokeWidth="2" />
            </svg>}
          </div>
          <div className="flex items-center gap-2" aria-label="Zoom">
            <button type="button" aria-label="Zoom out" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" disabled={zoom <= 1 || imageStatus !== "ready"} onClick={() => changeZoom(-0.1)}><Minus className="h-4 w-4" aria-hidden="true" /></button>
            <input aria-label="Zoom avatar" type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} disabled={imageStatus !== "ready"} className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border accent-primary" />
            <button type="button" aria-label="Zoom in" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" disabled={zoom >= 3 || imageStatus !== "ready"} onClick={() => changeZoom(0.1)}><Plus className="h-4 w-4" aria-hidden="true" /></button>
          </div>
          {error && imageStatus === "ready" && <p role="alert" className="text-xs text-destructive">{error}</p>}
        </div>
        <div className="flex justify-end gap-1 border-t border-border px-4 py-2">
          <Button type="button" variant="ghost" size="compact" className="!min-h-8 !rounded-md !border-0 !bg-transparent px-2 text-sm" disabled={busy} onClick={onCancel}>Cancel</Button>
          <Button type="button" variant="ghost" size="compact" className="!min-h-8 !rounded-md !border-0 !bg-transparent px-2 text-sm text-primary" loading={busy} disabled={busy || imageStatus !== "ready"} onClick={() => void setPhoto()}>Set photo</Button>
        </div>
      </div>
    </Dialog>
  );
}
