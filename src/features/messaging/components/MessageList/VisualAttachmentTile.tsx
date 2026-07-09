import type { CSSProperties } from "react";
import { Film, Play } from "lucide-react";
import type { Attachment } from "@/shared/types";
import { AuthenticatedImage } from "@/shared/components/AuthenticatedImage";
import { AuthenticatedVideo } from "@/shared/components/AuthenticatedVideo";

export type VisualTileAttachment = Attachment & { kind: "photo" | "video" };

export interface VisualTileRuntimeMetrics {
  naturalWidth: number;
  naturalHeight: number;
  renderedWidth: number;
  renderedHeight: number;
  devicePixelRatio: number;
  duration: number | null;
}

interface VisualAttachmentTileProps {
  attachment: VisualTileAttachment;
  attachmentName: string;
  displaySrc: string | null;
  index: number;
  buttonClassName: string;
  buttonTestId: string;
  buttonStyle?: CSSProperties;
  wrapperClassName?: string;
  wrapperTestId?: string;
  wrapperStyle?: CSSProperties;
  photoLayoutState?: "pending" | "resolved";
  isDebugEnabled: boolean;
  serverWidth?: number;
  serverHeight?: number;
  runtimeMetrics?: VisualTileRuntimeMetrics;
  computedRatio: number;
  onOpen: (attachment: VisualTileAttachment, index: number) => void;
  onDecodedDimensions: (attachmentId: string, naturalWidth: number, naturalHeight: number) => void;
  onDiagnostics: (
    attachmentId: string,
    chosenImageSource: string | null,
    diagnostics: VisualTileRuntimeMetrics,
  ) => void;
}

function shortenAttachmentId(attachmentId: string) {
  if (attachmentId.length <= 8) return attachmentId;
  return `${attachmentId.slice(0, 4)}…${attachmentId.slice(-3)}`;
}

function formatVideoDuration(durationSeconds: number | null) {
  if (!durationSeconds || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return null;
  }

  const totalSeconds = Math.max(0, Math.round(durationSeconds));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const displayMinutes = minutes % 60;
    return `${hours}:${displayMinutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function VisualAttachmentTile({
  attachment,
  attachmentName,
  displaySrc,
  index,
  buttonClassName,
  buttonTestId,
  buttonStyle,
  wrapperClassName,
  wrapperTestId,
  wrapperStyle,
  photoLayoutState,
  isDebugEnabled,
  serverWidth,
  serverHeight,
  runtimeMetrics,
  computedRatio,
  onOpen,
  onDecodedDimensions,
  onDiagnostics,
}: VisualAttachmentTileProps) {
  const durationLabel =
    attachment.kind === "video" ? formatVideoDuration(runtimeMetrics?.duration ?? null) : null;

  const tile = (
    <button
      type="button"
      className={buttonClassName}
      data-testid={buttonTestId}
      aria-label={attachment.kind === "video" ? `Open video ${attachmentName}` : `Open photo ${attachmentName}`}
      onClick={() => onOpen(attachment, index)}
      style={buttonStyle}
      data-photo-layout-state={photoLayoutState}
    >
      {attachment.kind === "photo" && displaySrc ? (
        <AuthenticatedImage
          className="block h-full w-full object-cover object-center"
          src={displaySrc}
          alt={attachmentName}
          crossOrigin="anonymous"
          onLoad={(event) => onDecodedDimensions(
            attachment.id,
            event.currentTarget.naturalWidth,
            event.currentTarget.naturalHeight,
          )}
          onMediaDiagnostics={(diagnostics) => onDiagnostics(
            attachment.id,
            displaySrc,
            { ...diagnostics, duration: null },
          )}
        />
      ) : attachment.kind === "video" && displaySrc ? (
        <>
          <AuthenticatedVideo
            className="block h-full w-full object-cover object-center bg-black"
            src={displaySrc}
            aria-label={attachmentName}
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            data-testid={`message-video-tile-${attachment.id}`}
            onMediaDiagnostics={(diagnostics) => {
              onDecodedDimensions(
                attachment.id,
                diagnostics.naturalWidth,
                diagnostics.naturalHeight,
              );
              onDiagnostics(
                attachment.id,
                displaySrc,
                diagnostics,
              );
            }}
          />
          <div className="pointer-events-none absolute left-[3px] top-[3px] z-[1]">
            {durationLabel ? (
              <span
                className="inline-flex h-[18px] items-center rounded-full bg-black/25 px-[6px] text-[12px] leading-[18px] font-medium text-white"
                data-testid={`message-video-duration-${attachment.id}`}
              >
                {durationLabel}
              </span>
            ) : (
              <span
                className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-black/25 text-white"
                data-testid={`message-video-badge-${attachment.id}`}
              >
                <Play className="h-3 w-3 fill-current" />
              </span>
            )}
          </div>
        </>
      ) : (
        <div
          className="flex h-full w-full items-center justify-center bg-black/70 text-white/88"
          data-testid={`message-video-placeholder-${attachment.id}`}
        >
          <div className="flex flex-col items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white">
              <Film className="h-5 w-5" />
            </span>
            <span className="text-[11px] font-medium">Video unavailable</span>
          </div>
        </div>
      )}
      {isDebugEnabled && (
        <div
          className="pointer-events-none absolute left-1 top-1 z-10 rounded-md bg-black/72 px-1.5 py-1 text-[10px] font-medium leading-tight text-white"
          data-testid={`message-media-debug-${attachment.id}`}
        >
          <div>{shortenAttachmentId(attachment.id)}</div>
          <div>
            s:{serverWidth ?? "?"}x{serverHeight ?? "?"}
          </div>
          <div>
            n:{runtimeMetrics?.naturalWidth ?? "?"}x{runtimeMetrics?.naturalHeight ?? "?"}
          </div>
          <div>
            r:{runtimeMetrics?.renderedWidth ?? "?"}x{runtimeMetrics?.renderedHeight ?? "?"}
          </div>
          <div>ratio:{computedRatio.toFixed(2)}</div>
        </div>
      )}
    </button>
  );

  if (!wrapperClassName && !wrapperStyle && !wrapperTestId) return tile;

  return (
    <div
      className={wrapperClassName}
      data-testid={wrapperTestId}
      style={wrapperStyle}
    >
      {tile}
    </div>
  );
}
