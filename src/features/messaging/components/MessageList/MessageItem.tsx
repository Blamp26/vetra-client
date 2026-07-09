import React from "react";
import { Message, MessageReactionGroup } from "@/shared/types";
import { cn } from "@/shared/utils/cn";
import { Emoji, EmojiText } from "@/shared/components/Emoji/Emoji";
import {
  AuthenticatedImage,
} from "@/shared/components/AuthenticatedImage";
import { AuthenticatedVideo } from "@/shared/components/AuthenticatedVideo";
import { useAppStore } from "@/store";
import { Download, ExternalLink, Film, Play } from "lucide-react";
import { StatusIcon } from "./StatusIcon";
import {
  type Attachment,
  getAttachmentDisplaySrc,
  formatAttachmentSize,
  getAttachmentDisplayName,
  getAttachmentKindLabel,
  getAttachmentOriginalSrc,
  getAttachmentTypeLabel,
  getMessageAttachment,
  getMessageAttachments,
} from "../../utils/attachments";
import {
  logAttachmentDebug,
  summarizeAttachmentLike,
  summarizeMessageMedia,
} from "../../utils/attachmentDebug";
import {
  downloadAttachmentWithAuth,
  openAttachmentWithAuth,
} from "../../utils/attachmentDownloads";
import {
  computeMediaAlbumLayout,
  getMediaAlbumPackingRatio,
  type MediaAlbumTile,
} from "../../utils/mediaAlbumLayout";

interface MessageItemProps {
  msg: Message;
  isOwn: boolean;
  isConsecutive: boolean;
  isGroupedWithNext: boolean;
  isSelected: boolean;
  selectionMode: boolean;
  isRoom: boolean;
  messageReactions: MessageReactionGroup[];
  currentUserId: number;
  onContextMenu: (e: React.MouseEvent<HTMLDivElement>, msg: Message) => void;
  onToggleSelection: (id: number) => void;
  onToggleReaction: (msgId: number, emoji: string) => void;
  onLightbox: (data:
    | { kind: "image"; src: string; authorName: string; createdAt: string; avatarSrc?: string | null; messageId: number }
    | { kind: "video"; src: string; authorName: string; createdAt: string; avatarSrc?: string | null; messageId: number }
  ) => void;
  renderReplyPreview: (msg: Message, isOwn: boolean) => React.ReactNode;
  formatTime: (iso: string) => string;
}

type PhotoAttachment = Attachment & { kind: "photo" };
type VideoAttachment = Attachment & { kind: "video" };
type VisualAttachment = PhotoAttachment | VideoAttachment;
type AttachmentWithVisualMetadata = Attachment & {
  width?: number | null;
  height?: number | null;
  media_width?: number | null;
  media_height?: number | null;
  original_width?: number | null;
  original_height?: number | null;
};
type ResolvedVisualAttachment = {
  attachment: VisualAttachment;
  displaySrc: string | null;
  lightboxSrc: string | null;
  serverWidth?: number;
  serverHeight?: number;
  width?: number;
  height?: number;
  dimensionSource: "server" | "decoded" | "fallback";
};
type MediaRuntimeDiagnostics = {
  naturalWidth: number;
  naturalHeight: number;
  renderedWidth: number;
  renderedHeight: number;
  devicePixelRatio: number;
  duration: number | null;
};

type VisualRuntimeMetrics = MediaRuntimeDiagnostics & {
  chosenImageSource: string | null;
};

const MESSAGE_ALBUM_MAX_WIDTH = 480;
const MESSAGE_ALBUM_LAYOUT_OPTIONS = {
  maxWidth: MESSAGE_ALBUM_MAX_WIDTH,
  spacing: 2,
  minTileSize: 88,
  fallbackRatio: 1,
  narrowRatio: 0.8,
  wideRatio: 1.25,
} as const;

function isVisualAttachment(attachment: Attachment): attachment is VisualAttachment {
  return attachment.kind === "photo" || attachment.kind === "video";
}

function readPositiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function getAttachmentIntrinsicSize(attachment: Attachment) {
  const source = attachment as AttachmentWithVisualMetadata;

  return {
    width:
      readPositiveNumber(source.width) ??
      readPositiveNumber(source.media_width) ??
      readPositiveNumber(source.original_width),
    height:
      readPositiveNumber(source.height) ??
      readPositiveNumber(source.media_height) ??
      readPositiveNumber(source.original_height),
  };
}

function getResolvedPhotoRatio(
  width?: number,
  height?: number,
  fallbackRatio = MESSAGE_ALBUM_LAYOUT_OPTIONS.fallbackRatio,
) {
  if (!width || !height) return fallbackRatio;
  const rawRatio = width / height;
  return Number.isFinite(rawRatio) && rawRatio > 0 ? rawRatio : fallbackRatio;
}

function getResolvedPhotoPackingRatio(width?: number, height?: number) {
  return getMediaAlbumPackingRatio({
    width,
    height,
  }, MESSAGE_ALBUM_LAYOUT_OPTIONS);
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

function getAttachmentExtensionBadge(attachment: Attachment | null) {
  if (!attachment) return "FILE";

  const rawName = attachment.original_name ?? "";
  const extensionMatch = rawName.match(/\.([a-z0-9]{1,5})$/i);
  if (extensionMatch) {
    return extensionMatch[1].toUpperCase();
  }

  const typeLabel = getAttachmentTypeLabel(attachment);
  if (typeLabel) return typeLabel.toUpperCase();

  return getAttachmentKindLabel(attachment.kind).slice(0, 4).toUpperCase();
}

function getAttachmentExtensionTone(attachment: Attachment | null) {
  const mimeType = attachment?.mime_type ?? "";
  const extension = getAttachmentExtensionBadge(attachment);

  if (mimeType === "application/pdf" || extension === "PDF") {
    return "bg-[#e53935] text-white";
  }

  if (mimeType.includes("zip") || extension === "ZIP") {
    return "bg-[#f2994a] text-white";
  }

  if (attachment?.kind === "video") {
    return "bg-[#4c6fff] text-white";
  }

  return "bg-[#5d6a62] text-white";
}

function toPercent(value: number, total: number) {
  if (total <= 0) return "0%";
  return `${((value / total) * 100).toFixed(4)}%`;
}

function getTileCornerRadius(
  tile: MediaAlbumTile,
  radius: { top: number; bottom: number },
) {
  return [
    tile.outerCorners.topLeft ? `${radius.top}px` : "0px",
    tile.outerCorners.topRight ? `${radius.top}px` : "0px",
    tile.outerCorners.bottomRight ? `${radius.bottom}px` : "0px",
    tile.outerCorners.bottomLeft ? `${radius.bottom}px` : "0px",
  ].join(" ");
}

function hasCompleteAlbumLayout(
  layout: ReturnType<typeof computeMediaAlbumLayout>,
  expectedTileCount: number,
) {
  return (
    layout.width > 0 &&
    layout.height > 0 &&
    layout.tiles.length === expectedTileCount &&
    layout.tiles.every((tile) =>
      Number.isFinite(tile.x) &&
      Number.isFinite(tile.y) &&
      Number.isFinite(tile.width) &&
      Number.isFinite(tile.height) &&
      tile.width > 0 &&
      tile.height > 0,
    )
  );
}

export const MessageItem = React.forwardRef<HTMLDivElement, MessageItemProps>(({
  msg,
  isOwn,
  isConsecutive,
  isGroupedWithNext,
  isSelected,
  selectionMode,
  isRoom,
  messageReactions,
  currentUserId,
  onContextMenu,
  onToggleSelection,
  onToggleReaction,
  onLightbox,
  renderReplyPreview,
  formatTime,
}, ref) => {
  const authToken = useAppStore((s) => s.authToken);
  const [isAttachmentActionPending, setIsAttachmentActionPending] = React.useState(false);
  const [attachmentActionError, setAttachmentActionError] = React.useState<string | null>(null);
  const [decodedVisualDimensions, setDecodedVisualDimensions] = React.useState<
    Record<string, { width: number; height: number }>
  >({});
  const [visualRuntimeMetrics, setVisualRuntimeMetrics] = React.useState<
    Record<string, VisualRuntimeMetrics>
  >({});
  const [isMediaDebugEnabled, setIsMediaDebugEnabled] = React.useState(false);
  const warnedMissingDimensionKeysRef = React.useRef(new Set<string>());
  const warnedSmallSourceKeysRef = React.useRef(new Set<string>());
  const attachments = getMessageAttachments(msg);
  const attachment = getMessageAttachment(msg);
  const hasMedia = attachments.length > 0;
  const hasText = !!(msg.content && msg.content.trim().length > 0);
  const isVisualMediaGroup = attachments.length > 1 && attachments.every(isVisualAttachment);
  const isSingleVisualMessage = attachments.length === 1 && attachments.every(isVisualAttachment);
  const visualAttachments = isVisualMediaGroup
    ? attachments
    : isSingleVisualMessage
      ? attachments
      : [];
  const isVisualMediaMessage = visualAttachments.length > 0;
  const isVisualAlbum = visualAttachments.length > 1;
  const isDocumentAttachment = attachments.length > 0 && !isVisualMediaMessage;
  const isMediaOnly =
    isVisualMediaMessage &&
    (!msg.content || msg.content.trim().length === 0) &&
    !msg.reply_to_id;
  const isTextOnly = hasText && !hasMedia;
  const authorName = msg.sender_display_name || msg.sender_username || "Unknown";
  const resolvedVisualAttachments = React.useMemo<ResolvedVisualAttachment[]>(() => (
    visualAttachments.map((currentAttachment) => {
      const serverDimensions = getAttachmentIntrinsicSize(currentAttachment);
      const decodedDimensions = decodedVisualDimensions[currentAttachment.id];
      const hasServerDimensions = Boolean(serverDimensions.width && serverDimensions.height);
      const hasDecodedDimensions = Boolean(decodedDimensions?.width && decodedDimensions?.height);

      return {
        attachment: currentAttachment,
        displaySrc: getAttachmentDisplaySrc(currentAttachment),
        lightboxSrc: getAttachmentOriginalSrc(currentAttachment),
        serverWidth: serverDimensions.width,
        serverHeight: serverDimensions.height,
        width: serverDimensions.width ?? decodedDimensions?.width,
        height: serverDimensions.height ?? decodedDimensions?.height,
        dimensionSource: hasServerDimensions
          ? "server"
          : hasDecodedDimensions
            ? "decoded"
            : "fallback",
      };
    })
  ), [decodedVisualDimensions, visualAttachments]);
  const photoLayout = React.useMemo(() => computeMediaAlbumLayout(
    resolvedVisualAttachments.map((currentAttachment) => ({
      id: currentAttachment.attachment.id,
      width: currentAttachment.width,
      height: currentAttachment.height,
      kind: currentAttachment.attachment.kind === "video" ? "video" as const : "image" as const,
    })),
    MESSAGE_ALBUM_LAYOUT_OPTIONS,
  ), [resolvedVisualAttachments]);
  const hasPendingDecodedVisualDimensions = resolvedVisualAttachments.some(
    (currentAttachment) => currentAttachment.dimensionSource === "fallback",
  );
  const isTemporaryVisualLayout =
    hasPendingDecodedVisualDimensions ||
    !hasCompleteAlbumLayout(photoLayout, resolvedVisualAttachments.length);
  const showSenderName = isRoom && !isOwn && !isConsecutive;
  const metadataClassName = isOwn
    ? "text-white/60"
    : "text-[color:var(--bubble-incoming-meta)]";
  const overlayMetadataClassName = "h-[18px] rounded-[10px] bg-black/[0.20] py-0 pl-[6px] pr-[5px] text-white";
  const textGroupRadiusClassName = isOwn
    ? cn(
        "rounded-[15px]",
        isConsecutive && "rounded-tr-[8px]",
        isGroupedWithNext ? "rounded-br-[8px]" : "rounded-br-[4px]",
      )
    : cn(
        "rounded-[15px]",
        isConsecutive && "rounded-tl-[8px]",
        isGroupedWithNext ? "rounded-bl-[8px]" : "rounded-bl-[4px]",
      );

  React.useEffect(() => {
    if (!import.meta.env.DEV) return;

    const readDebugFlag = () => {
      try {
        setIsMediaDebugEnabled(window.localStorage.getItem("vetra.mediaDebug") === "1");
      } catch {
        setIsMediaDebugEnabled(false);
      }
    };

    readDebugFlag();
    window.addEventListener("storage", readDebugFlag);
    return () => window.removeEventListener("storage", readDebugFlag);
  }, []);

  React.useEffect(() => {
    if (!hasMedia) return;

    logAttachmentDebug("message.render", {
      ...summarizeMessageMedia(msg as Record<string, unknown>),
      renderAttachmentCount: attachments.length,
      treatedAsAlbum: isVisualAlbum,
      isPhotoAttachment: isVisualMediaMessage,
      isDocumentAttachment,
    }, {
      table: attachments.map((currentAttachment) => summarizeAttachmentLike(currentAttachment)),
    });
  }, [attachments, hasMedia, isDocumentAttachment, isVisualAlbum, isVisualMediaMessage, msg]);

  React.useEffect(() => {
    if (!import.meta.env.DEV) return;

    resolvedVisualAttachments.forEach((currentAttachment) => {
      if (currentAttachment.dimensionSource !== "fallback") return;

      const warningKey = `${msg.id}:${currentAttachment.attachment.id}`;
      if (warnedMissingDimensionKeysRef.current.has(warningKey)) return;
      warnedMissingDimensionKeysRef.current.add(warningKey);

      console.warn("[VETRA album-layout] Missing attachment dimensions at render boundary.", {
        messageId: msg.id,
        attachmentId: currentAttachment.attachment.id,
        chosenImageSource: currentAttachment.displaySrc,
        width: currentAttachment.width ?? null,
        height: currentAttachment.height ?? null,
        dimensionSource: currentAttachment.dimensionSource,
      });
    });
  }, [msg.id, resolvedVisualAttachments]);

  React.useEffect(() => {
    if (!import.meta.env.DEV || !isVisualMediaMessage) return;

    logAttachmentDebug("message.album-layout", {
      messageId: msg.id,
      attachmentCount: resolvedVisualAttachments.length,
      isAlbum: resolvedVisualAttachments.length > 1,
      pendingDimensionCount: resolvedVisualAttachments.filter((attachment) => attachment.dimensionSource === "fallback").length,
      layoutWidth: photoLayout.width,
      layoutHeight: photoLayout.height,
      layoutState: isTemporaryVisualLayout ? "pending" : "resolved",
    }, {
      table: resolvedVisualAttachments.map((currentAttachment, index) => {
        const tile = photoLayout.tiles[index];
        return {
          attachmentId: currentAttachment.attachment.id,
          kind: currentAttachment.attachment.kind,
          chosenImageSource: currentAttachment.displaySrc,
          width: currentAttachment.width ?? null,
          height: currentAttachment.height ?? null,
          dimensionSource: currentAttachment.dimensionSource,
          sourceRatio: getResolvedPhotoRatio(currentAttachment.width, currentAttachment.height),
          packingRatio: getResolvedPhotoPackingRatio(currentAttachment.width, currentAttachment.height),
          naturalWidth: visualRuntimeMetrics[currentAttachment.attachment.id]?.naturalWidth ?? null,
          naturalHeight: visualRuntimeMetrics[currentAttachment.attachment.id]?.naturalHeight ?? null,
          renderedWidth: visualRuntimeMetrics[currentAttachment.attachment.id]?.renderedWidth ?? null,
          renderedHeight: visualRuntimeMetrics[currentAttachment.attachment.id]?.renderedHeight ?? null,
          tileX: tile?.x ?? null,
          tileY: tile?.y ?? null,
          tileWidth: tile?.width ?? null,
          tileHeight: tile?.height ?? null,
        };
      }),
    });
  }, [isVisualMediaMessage, isTemporaryVisualLayout, msg.id, photoLayout, resolvedVisualAttachments, visualRuntimeMetrics]);

  React.useEffect(() => {
    if (!import.meta.env.DEV) return;

    resolvedVisualAttachments.forEach((currentAttachment) => {
      const runtimeMetrics = visualRuntimeMetrics[currentAttachment.attachment.id];
      if (!runtimeMetrics) return;

      const requiredWidth = runtimeMetrics.renderedWidth * runtimeMetrics.devicePixelRatio;
      const requiredHeight = runtimeMetrics.renderedHeight * runtimeMetrics.devicePixelRatio;
      if (
        runtimeMetrics.naturalWidth >= requiredWidth &&
        runtimeMetrics.naturalHeight >= requiredHeight
      ) {
        return;
      }

      const warningKey = `${msg.id}:${currentAttachment.attachment.id}:${runtimeMetrics.renderedWidth}x${runtimeMetrics.renderedHeight}`;
      if (warnedSmallSourceKeysRef.current.has(warningKey)) return;
      warnedSmallSourceKeysRef.current.add(warningKey);

      console.warn("[VETRA media-quality] Rendered image source is smaller than the visible tile.", {
        messageId: msg.id,
        attachmentId: currentAttachment.attachment.id,
        chosenImageSource: runtimeMetrics.chosenImageSource,
        serverWidth: currentAttachment.serverWidth ?? null,
        serverHeight: currentAttachment.serverHeight ?? null,
        naturalWidth: runtimeMetrics.naturalWidth,
        naturalHeight: runtimeMetrics.naturalHeight,
        renderedWidth: runtimeMetrics.renderedWidth,
        renderedHeight: runtimeMetrics.renderedHeight,
        devicePixelRatio: runtimeMetrics.devicePixelRatio,
        duration: runtimeMetrics.duration,
      });
    });
  }, [msg.id, resolvedVisualAttachments, visualRuntimeMetrics]);

  const handleDecodedVisualDimensions = React.useCallback(
    (attachmentId: string, naturalWidth: number, naturalHeight: number) => {
      if (!Number.isFinite(naturalWidth) || !Number.isFinite(naturalHeight)) return;
      if (naturalWidth <= 0 || naturalHeight <= 0) return;

      setDecodedVisualDimensions((current) => {
        const existing = current[attachmentId];
        if (existing?.width === naturalWidth && existing.height === naturalHeight) {
          return current;
        }

        return {
          ...current,
          [attachmentId]: {
            width: naturalWidth,
            height: naturalHeight,
          },
        };
      });
    },
    [],
  );

  const handleVisualDiagnostics = React.useCallback(
    (attachmentId: string, chosenImageSource: string | null, diagnostics: MediaRuntimeDiagnostics) => {
      setVisualRuntimeMetrics((current) => {
        const nextMetrics: VisualRuntimeMetrics = {
          ...diagnostics,
          chosenImageSource,
        };
        const existing = current[attachmentId];
        if (
          existing?.naturalWidth === nextMetrics.naturalWidth &&
          existing.naturalHeight === nextMetrics.naturalHeight &&
          existing.renderedWidth === nextMetrics.renderedWidth &&
          existing.renderedHeight === nextMetrics.renderedHeight &&
          existing.devicePixelRatio === nextMetrics.devicePixelRatio &&
          existing.chosenImageSource === nextMetrics.chosenImageSource
        ) {
          return current;
        }

        return {
          ...current,
          [attachmentId]: nextMetrics,
        };
      });
    },
    [],
  );

  const handleAttachmentAction = async (action: "download" | "open") => {
    if (!attachment || isAttachmentActionPending) return;

    setIsAttachmentActionPending(true);
    setAttachmentActionError(null);

    try {
      if (action === "open") {
        if (attachment.kind === "video") {
          const videoSrc = getAttachmentOriginalSrc(attachment);
          if (!videoSrc) {
            setAttachmentActionError("Attachment unavailable");
            return;
          }

          onLightbox({
            kind: "video",
            src: videoSrc,
            authorName,
            createdAt: msg.inserted_at,
            avatarSrc: msg.sender?.avatar_url ?? null,
            messageId: msg.id,
          });
          return;
        }

        await openAttachmentWithAuth({ attachment, authToken });
      } else {
        await downloadAttachmentWithAuth({ attachment, authToken });
      }
    } catch (error) {
      console.error("Attachment action failed:", error);
      setAttachmentActionError("Attachment unavailable");
    } finally {
      setIsAttachmentActionPending(false);
    }
  };

  const renderMetadata = (variant: "inline" | "overlay" = "inline") => (
    <div
      className={cn(
        "inline-flex max-w-full items-center whitespace-nowrap",
        variant === "overlay"
          ? overlayMetadataClassName
          : cn("gap-0 text-[12px] leading-[16.2px]", metadataClassName),
      )}
      data-testid="message-metadata"
    >
      <span
        className={cn(
          variant === "overlay"
            ? "mr-[4px] text-[12px] leading-[12px] font-normal text-white"
            : "mr-[4px] text-[12px] leading-[16.2px] font-normal text-current",
        )}
      >
        {formatTime(msg.inserted_at)}
      </span>
      {msg.edited_at && (
        <span
          className={cn(
            variant === "overlay"
              ? "mr-[4px] text-[12px] leading-[12px] font-normal text-white"
              : "mr-[4px] text-[12px] leading-[16.2px] font-normal text-current",
          )}
        >
          (ed.)
        </span>
      )}
      {isOwn && !isRoom && (
        variant === "overlay" ? (
          <span
            className="ml-[-3px] flex h-[19px] w-[19px] items-center justify-center text-white"
            data-testid="message-media-only-status"
          >
            <StatusIcon status={msg.status} className="ml-0 h-[19px] w-[19px] text-current" />
          </span>
        ) : (
          <span
            className="ml-[-3px] flex h-[19px] w-[19px] items-center justify-center text-white"
            data-testid="message-inline-status"
          >
            <StatusIcon status={msg.status} className="ml-0 h-[19px] w-[19px] text-current" />
          </span>
        )
      )}
    </div>
  );

  const handleVisualAttachmentOpen = React.useCallback(async (currentAttachment: VisualAttachment) => {
    const viewerSrc = getAttachmentOriginalSrc(currentAttachment);
    if (!viewerSrc) {
      setAttachmentActionError("Attachment unavailable");
      return;
    }

    onLightbox({
      kind: currentAttachment.kind === "video" ? "video" : "image",
      src: viewerSrc,
      authorName,
      createdAt: msg.inserted_at,
      avatarSrc: msg.sender?.avatar_url ?? null,
      messageId: msg.id,
    });
  }, [authorName, msg.id, msg.inserted_at, msg.sender?.avatar_url, onLightbox]);

  const renderVisualMedia = React.useCallback(
    (currentAttachment: ResolvedVisualAttachment, attachmentName: string) => {
      if (currentAttachment.attachment.kind === "photo" && currentAttachment.displaySrc) {
        return (
          <AuthenticatedImage
            className="block h-full w-full object-cover object-center"
            src={currentAttachment.displaySrc}
            alt={attachmentName}
            crossOrigin="anonymous"
            onLoad={(event) => handleDecodedVisualDimensions(
              currentAttachment.attachment.id,
              event.currentTarget.naturalWidth,
              event.currentTarget.naturalHeight,
            )}
            onMediaDiagnostics={(diagnostics) => handleVisualDiagnostics(
              currentAttachment.attachment.id,
              currentAttachment.displaySrc,
              diagnostics,
            )}
          />
        );
      }

      if (currentAttachment.attachment.kind === "video" && currentAttachment.displaySrc) {
        const runtimeMetrics = visualRuntimeMetrics[currentAttachment.attachment.id];
        const durationLabel = formatVideoDuration(runtimeMetrics?.duration ?? null);

        return (
          <>
            <AuthenticatedVideo
              className="block h-full w-full object-cover object-center bg-black"
              src={currentAttachment.displaySrc}
              aria-label={attachmentName}
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
              data-testid={`message-video-tile-${currentAttachment.attachment.id}`}
              onMediaDiagnostics={(diagnostics) => {
                handleDecodedVisualDimensions(
                  currentAttachment.attachment.id,
                  diagnostics.naturalWidth,
                  diagnostics.naturalHeight,
                );
                handleVisualDiagnostics(
                  currentAttachment.attachment.id,
                  currentAttachment.displaySrc,
                  diagnostics,
                );
              }}
            />
            <div className="pointer-events-none absolute left-[3px] top-[3px] z-[1]">
              {durationLabel ? (
                <span
                  className="inline-flex h-[18px] items-center rounded-full bg-black/25 px-[6px] text-[12px] leading-[18px] font-medium text-white"
                  data-testid={`message-video-duration-${currentAttachment.attachment.id}`}
                >
                  {durationLabel}
                </span>
              ) : (
                <span
                  className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-black/25 text-white"
                  data-testid={`message-video-badge-${currentAttachment.attachment.id}`}
                >
                  <Play className="h-3 w-3 fill-current" />
                </span>
              )}
            </div>
          </>
        );
      }

      return (
        <div
          className="flex h-full w-full items-center justify-center bg-black/70 text-white/88"
          data-testid={`message-video-placeholder-${currentAttachment.attachment.id}`}
        >
          <div className="flex flex-col items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white">
              <Film className="h-5 w-5" />
            </span>
            <span className="text-[11px] font-medium">Video unavailable</span>
          </div>
        </div>
      );
    },
    [handleDecodedVisualDimensions, handleVisualDiagnostics, visualRuntimeMetrics],
  );

  const renderVisualTile = (
    currentAttachment: ResolvedVisualAttachment,
    tile: MediaAlbumTile,
    layout: ReturnType<typeof computeMediaAlbumLayout>,
    radius: { top: number; bottom: number },
  ) => {
    const tileStyle = {
      left: toPercent(tile.x, layout.width),
      top: toPercent(tile.y, layout.height),
      width: toPercent(tile.width, layout.width),
      height: toPercent(tile.height, layout.height),
      borderRadius: getTileCornerRadius(tile, radius),
    } as const;
    const attachmentName = getAttachmentDisplayName(currentAttachment.attachment);
    const runtimeMetrics = visualRuntimeMetrics[currentAttachment.attachment.id];
    const computedRatio = getResolvedPhotoPackingRatio(currentAttachment.width, currentAttachment.height);

    return (
      <div
        key={currentAttachment.attachment.id}
        className="absolute overflow-hidden"
        data-testid={`message-photo-collage-tile-${tile.index}`}
        style={tileStyle}
      >
        <button
          type="button"
          className="relative block h-full w-full overflow-hidden"
          data-testid="message-photo-collage-tile"
          aria-label={currentAttachment.attachment.kind === "video" ? `Open video ${attachmentName}` : `Open photo ${attachmentName}`}
          onClick={() => void handleVisualAttachmentOpen(currentAttachment.attachment)}
        >
          {renderVisualMedia(currentAttachment, attachmentName)}
          {isMediaDebugEnabled && (
            <div
              className="pointer-events-none absolute left-1 top-1 z-10 rounded-md bg-black/72 px-1.5 py-1 text-[10px] font-medium leading-tight text-white"
              data-testid={`message-media-debug-${currentAttachment.attachment.id}`}
            >
              <div>{shortenAttachmentId(currentAttachment.attachment.id)}</div>
              <div>
                s:{currentAttachment.serverWidth ?? "?"}x{currentAttachment.serverHeight ?? "?"}
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
      </div>
    );
  };

  const renderPhotoMedia = () => {
    const layout = photoLayout;
    const tileRadius = isMediaOnly
      ? { top: 15, bottom: 6 }
      : hasText
        ? { top: 15, bottom: 0 }
        : { top: 14, bottom: 8 };
    const mediaFrameClassName = hasText
      ? "mx-[-8px] mb-[6px] mt-[-5px] overflow-hidden rounded-t-[15px] rounded-b-none"
      : "";

    if (resolvedVisualAttachments.length > 1) {
      if (isTemporaryVisualLayout) {
        return (
          <div
            className={cn("grid max-w-full grid-cols-2 gap-[2px] overflow-hidden", mediaFrameClassName)}
            style={{
              width: `min(${MESSAGE_ALBUM_MAX_WIDTH}px, calc(100vw - 6rem))`,
              maxWidth: "100%",
            }}
            data-testid="message-photo-collage"
            data-photo-layout-state="pending"
          >
            {resolvedVisualAttachments.map((currentAttachment) => {
              const runtimeMetrics = visualRuntimeMetrics[currentAttachment.attachment.id];

              return (
                <button
                  key={currentAttachment.attachment.id}
                  type="button"
                  className="relative aspect-square overflow-hidden"
                  data-testid="message-photo-collage-tile"
                  aria-label={
                    currentAttachment.attachment.kind === "video"
                      ? `Open video ${getAttachmentDisplayName(currentAttachment.attachment)}`
                      : `Open photo ${getAttachmentDisplayName(currentAttachment.attachment)}`
                  }
                  onClick={() => void handleVisualAttachmentOpen(currentAttachment.attachment)}
                >
                  {renderVisualMedia(currentAttachment, getAttachmentDisplayName(currentAttachment.attachment))}
                  {isMediaDebugEnabled && (
                    <div
                      className="pointer-events-none absolute left-1 top-1 z-10 rounded-md bg-black/72 px-1.5 py-1 text-[10px] font-medium leading-tight text-white"
                      data-testid={`message-media-debug-${currentAttachment.attachment.id}`}
                    >
                      <div>{shortenAttachmentId(currentAttachment.attachment.id)}</div>
                      <div>
                        s:{currentAttachment.serverWidth ?? "?"}x{currentAttachment.serverHeight ?? "?"}
                      </div>
                      <div>
                        n:{runtimeMetrics?.naturalWidth ?? "?"}x{runtimeMetrics?.naturalHeight ?? "?"}
                      </div>
                      <div>
                        r:{runtimeMetrics?.renderedWidth ?? "?"}x{runtimeMetrics?.renderedHeight ?? "?"}
                      </div>
                      <div>ratio:{getResolvedPhotoPackingRatio(currentAttachment.width, currentAttachment.height).toFixed(2)}</div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        );
      }

      return (
        <div
          className={cn("relative max-w-full overflow-hidden", mediaFrameClassName)}
          style={{
            width: `${layout.width}px`,
            maxWidth: "100%",
            aspectRatio: `${layout.width} / ${layout.height}`,
          }}
          data-testid="message-photo-collage"
          data-photo-layout-state="resolved"
        >
          <div className="relative h-full w-full" data-testid="message-photo-collage-inner">
            {resolvedVisualAttachments.map((currentAttachment, index) =>
              renderVisualTile(currentAttachment, layout.tiles[index], layout, tileRadius),
            )}
          </div>
        </div>
      );
    }

    const currentAttachment = resolvedVisualAttachments[0];
    if (!currentAttachment) return null;
    const attachmentName = getAttachmentDisplayName(currentAttachment.attachment);
    if (!currentAttachment.lightboxSrc) return null;

    return (
      <button
        type="button"
        className={cn("relative block h-full w-full overflow-hidden", hasText && "mx-[-8px] mb-[6px] mt-[-5px] rounded-t-[15px] rounded-b-none")}
        data-testid="message-media-shell"
        onClick={() => onLightbox({
          kind: currentAttachment.attachment.kind === "video" ? "video" : "image",
          src: currentAttachment.lightboxSrc,
          authorName,
          createdAt: msg.inserted_at,
          avatarSrc: msg.sender?.avatar_url ?? null,
          messageId: msg.id,
        })}
        style={{
          width: `${layout.width}px`,
          maxWidth: "100%",
          aspectRatio: `${layout.width} / ${layout.height}`,
        }}
        data-photo-layout-state={currentAttachment.dimensionSource === "fallback" ? "pending" : "resolved"}
      >
        {renderVisualMedia(currentAttachment, attachmentName)}
        {isMediaDebugEnabled && (
          <div
            className="pointer-events-none absolute left-1 top-1 z-10 rounded-md bg-black/72 px-1.5 py-1 text-[10px] font-medium leading-tight text-white"
            data-testid={`message-media-debug-${currentAttachment.attachment.id}`}
          >
            <div>{shortenAttachmentId(currentAttachment.attachment.id)}</div>
            <div>
              s:{currentAttachment.serverWidth ?? "?"}x{currentAttachment.serverHeight ?? "?"}
            </div>
            <div>
              n:{visualRuntimeMetrics[currentAttachment.attachment.id]?.naturalWidth ?? "?"}x{visualRuntimeMetrics[currentAttachment.attachment.id]?.naturalHeight ?? "?"}
            </div>
            <div>
              r:{visualRuntimeMetrics[currentAttachment.attachment.id]?.renderedWidth ?? "?"}x{visualRuntimeMetrics[currentAttachment.attachment.id]?.renderedHeight ?? "?"}
            </div>
            <div>ratio:{getResolvedPhotoPackingRatio(currentAttachment.width, currentAttachment.height).toFixed(2)}</div>
          </div>
        )}
      </button>
    );
  };

  const renderDocumentAttachment = () => {
    const attachmentTypeLabel = getAttachmentTypeLabel(attachment);
    const attachmentName = getAttachmentDisplayName(attachment);
    const attachmentKindLabel = attachment
      ? getAttachmentKindLabel(attachment.kind)
      : "Attachment";
    const attachmentExtension = getAttachmentExtensionBadge(attachment);
    const canOpenInline = attachment?.mime_type === "application/pdf" || attachment?.kind === "video";
    const iconButtonClassName = cn(
      "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50",
      isOwn ? "bg-black/20 text-white hover:bg-black/30" : "bg-white text-[#1f2421] hover:bg-white/90",
    );
    const actionButtonClassName = cn(
      "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-current transition-colors disabled:opacity-50",
      isOwn ? "hover:bg-white/12" : "hover:bg-accent",
    );

    return (
      <>
        <div className="flex min-w-0 items-start gap-3" data-testid="message-file-row">
          <div
            className="relative h-[54px] w-[54px] shrink-0"
            data-testid="message-file-icon-container"
          >
            <div
              className={cn(
                "flex h-full w-full items-end justify-center rounded-[6px] px-2 pb-[7px] pt-[14px] text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]",
                getAttachmentExtensionTone(attachment),
              )}
              data-testid="message-file-icon"
            >
              <span className="text-[11px] font-semibold leading-none tracking-[0.08em]">
                {attachmentExtension}
              </span>
            </div>
            <button
              type="button"
              aria-label="Download"
              title="Download"
              onClick={() => handleAttachmentAction("download")}
              disabled={isAttachmentActionPending}
              className={cn(iconButtonClassName, "absolute bottom-[-2px] right-[-2px]")}
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="min-w-0 flex-1 pt-[2px]">
            <div
              className="truncate text-[14px] font-medium leading-[18px] text-current"
              data-testid="message-file-name"
            >
              {attachmentName}
            </div>
            <div
              className={cn(
                "mt-1 truncate text-[12px] leading-[16px]",
                isOwn ? "text-[color:var(--bubble-outgoing-meta)]" : "text-muted-foreground",
              )}
            >
              {[attachmentTypeLabel || attachmentKindLabel, formatAttachmentSize(attachment?.file_size)].join(" · ")}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 pt-[15px]" data-testid="message-file-actions">
            {canOpenInline && (
              <button
                type="button"
                aria-label="Open"
                title="Open"
                onClick={() => handleAttachmentAction("open")}
                disabled={isAttachmentActionPending}
                className={actionButtonClassName}
              >
                <ExternalLink className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {hasText && (
          <div className="mt-1.5 whitespace-pre-wrap break-words text-[0.9375rem] leading-[1.45] text-current">
            <EmojiText text={msg.content || ""} />
          </div>
        )}

        <div className="mt-1 flex justify-end">{renderMetadata()}</div>

        {attachmentActionError && (
          <div className="mt-1.5 text-[10px] text-destructive">
            {attachmentActionError}
          </div>
        )}
      </>
    );
  };

  const renderContent = () => {
    return (
      <>
        {hasMedia && (
          <>
            {isVisualMediaMessage ? renderPhotoMedia() : renderDocumentAttachment()}
          </>
        )}
        {hasText && !isDocumentAttachment && (
          isVisualMediaMessage ? (
            <div className="relative text-[15px] leading-[21px]" data-testid="message-text-content">
              <span
                className="pointer-events-none relative float-right mb-[-4px] ml-[7px] mr-[-4px] mt-[1px] inline-flex items-center px-[4px]"
                data-testid="message-text-inline-metadata"
              >
                {renderMetadata()}
              </span>
              <span className="relative whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                <EmojiText text={msg.content || ""} />
              </span>
            </div>
          ) : (
            <div
              className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[16px] leading-[21px]"
              data-testid="message-text-content"
            >
              <EmojiText text={msg.content || ""} />
            </div>
          )
        )}
      </>
    );
  };

  const renderReactions = () => {
    if (!messageReactions || messageReactions.length === 0) return null;
    return (
      <div className="mt-2 flex flex-wrap gap-1.5">
        {messageReactions.map((g) => {
          const mine = g.user_ids.includes(currentUserId);
          return (
            <button
              key={`${msg.id}:${g.emoji}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleReaction(msg.id, g.emoji);
              }}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-medium",
                mine
                  ? "border-primary/40 bg-primary/12 text-foreground"
                  : "border-border bg-background/70 text-foreground"
              )}
            >
              <Emoji emoji={g.emoji} size={12} />
              <span>{g.count}</span>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full items-end",
        isOwn ? "justify-end" : "justify-start",
      )}
      data-testid="message-bubble-row"
      data-own-message={isOwn ? "true" : "false"}
      onClick={() => selectionMode && onToggleSelection(msg.id)}
    >
      {selectionMode && (
        <div className="p-1">
          <input type="checkbox" checked={isSelected} readOnly />
        </div>
      )}
      <div 
        onContextMenu={(e) => !selectionMode && onContextMenu(e, msg)}
        className={cn(
          "relative w-fit text-sm",
          !isVisualMediaMessage && "shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]",
          isMediaOnly
            ? cn(
                "min-w-0 overflow-hidden p-0",
                isVisualAlbum
                  ? "bg-[#111]"
                  : "bg-transparent",
                isVisualAlbum
                  ? "rounded-t-[15px] rounded-bl-[6px] rounded-br-[6px]"
                  : "rounded-[18px]",
                isVisualAlbum
                  ? "max-w-[min(480px,calc(100vw-6rem))]"
                  : "max-w-[min(28rem,calc(100vw-6rem))]",
              )
            : isVisualMediaMessage
              ? cn(
                  "min-w-[11rem] overflow-hidden rounded-[15px] px-2 pb-[6px] pt-[5px] shadow-[0px_1px_2px_0px_rgba(16,16,16,0.61)]",
                  isVisualAlbum
                    ? "max-w-[min(480px,calc(100vw-6rem))]"
                    : "max-w-[min(28rem,calc(100vw-6rem))]",
                )
              : isDocumentAttachment
                ? "min-w-[13rem] max-w-[min(22rem,calc(100vw-6rem))] rounded-[18px] border px-3 py-2.5"
                : "min-w-[3.75rem] max-w-[min(30rem,calc(100vw-6rem))] border border-border/85 px-2 pt-[5px] pb-[6px]",
          isSelected && "ring-1 ring-primary",
          isTextOnly
            ? textGroupRadiusClassName
            : isOwn
              ? cn(
                  isConsecutive && "rounded-tr-[12px]",
                  isGroupedWithNext && "rounded-br-[12px]",
                )
              : cn(
                  isConsecutive && "rounded-tl-[12px]",
                  isGroupedWithNext && "rounded-bl-[12px]",
                ),
          isMediaOnly
            ? "text-white"
            : isVisualMediaMessage
              ? (isOwn ? "bg-bubble-outgoing text-bubble-outgoing-text" : "bg-bubble-incoming text-bubble-incoming-text")
              : isDocumentAttachment
                ? (
                    isOwn
                      ? "border-transparent bg-bubble-outgoing text-bubble-outgoing-text"
                      : "border-border bg-bubble-incoming text-bubble-incoming-text"
                  )
                : (isOwn ? "bg-bubble-outgoing text-bubble-outgoing-text" : "bg-bubble-incoming text-bubble-incoming-text"),
        )}
        data-testid="message-bubble"
      >
        {showSenderName && (
          <div className="mb-1.5 text-[11px] font-semibold tracking-[0.01em] text-primary">
            {authorName}
          </div>
        )}
        {isTextOnly ? (
          <>
            {renderReplyPreview(msg, isOwn)}
            <div className="relative text-[16px] leading-[21px]" data-testid="message-text-flow">
              <span
                data-message-content-rect
                className="relative whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[16px] leading-[21px]"
              >
                <EmojiText text={msg.content || ""} />
              </span>
              <span
                className="pointer-events-none relative float-right mb-[-6px] ml-[7px] mr-[-6px] mt-0 inline-flex items-center px-[4px] pt-0 top-[6px]"
                data-testid="message-text-inline-metadata"
              >
                {renderMetadata()}
              </span>
            </div>
          </>
        ) : (
          <div data-message-content-rect className="relative">
            {renderReplyPreview(msg, isOwn)}
            {renderContent()}
          </div>
        )}

        {isMediaOnly && (
          <div
            className="pointer-events-none absolute bottom-[4px] right-[4px]"
            data-testid="message-media-only-overlay"
          >
            {renderMetadata("overlay")}
          </div>
        )}

        {!isTextOnly && !isMediaOnly && !isVisualMediaMessage && !isDocumentAttachment && (
          <div className="mt-1.5 flex justify-end">
            {renderMetadata()}
          </div>
        )}
        
        {renderReactions()}
      </div>
    </div>
  );
});

MessageItem.displayName = "MessageItem";
