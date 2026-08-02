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

export function AvatarCropDialog({ source, onCancel, onSetPhoto }: AvatarCropDialogProps) {
  const titleId = useId();
  const imageRef = useRef<HTMLImageElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);
  const [sourceUrl] = useState(() => URL.createObjectURL(source));
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => URL.revokeObjectURL(sourceUrl), [sourceUrl]);

  const viewportSize = 256;
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

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
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
    if (!image || !imageSize.width || !imageSize.height) return;
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

  return (
    <Dialog open onClose={onCancel} labelledBy={titleId} className="w-[min(366px,calc(100vw-32px))] overflow-hidden rounded-xl p-0">
      <div className="flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-[22px] py-4">
          <h2 id={titleId} className="text-base font-semibold">Crop photo</h2>
          <IconButton label="Cancel crop" size="compact" onClick={onCancel}><X className="h-4 w-4" aria-hidden="true" /></IconButton>
        </div>
        <div className="space-y-4 px-[22px] py-5">
          <div
            ref={viewportRef}
            className="relative mx-auto h-64 w-64 touch-none cursor-grab overflow-hidden rounded-full bg-muted active:cursor-grabbing"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            aria-label="Avatar crop preview. Drag to reposition."
            role="application"
          >
            <img
              ref={imageRef}
              src={sourceUrl}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none select-none"
              style={{ width: renderedWidth, height: renderedHeight, left: position.left, top: position.top }}
              onLoad={(event) => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
            />
          </div>
          <div className="flex items-center gap-3" aria-label="Zoom">
            <Minus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <input aria-label="Zoom avatar" type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} className="w-full" />
            <Plus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-[22px] py-3">
          <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button type="button" variant="primary" loading={busy} onClick={() => void setPhoto()}>Set photo</Button>
        </div>
      </div>
    </Dialog>
  );
}
