import React from "react";
import type { Attachment, Message, MessageReactionGroup } from "@/shared/types";
import { cn } from "@/shared/utils/cn";
import { Emoji, EmojiText } from "@/shared/components/Emoji/Emoji";
import { useAppStore } from "@/store";
import { StatusIcon } from "./StatusIcon";
import { MessageTail } from "./MessageTail";
import { DocumentAttachmentRow } from "./DocumentAttachmentRow";
import { VoiceMessagePlayer } from "./VoiceMessagePlayer";
import { AudioFilePlayer } from "./AudioFilePlayer";
import { VisualAttachmentGroup, type ResolvedVisualAttachment } from "./VisualAttachmentGroup";
import {
  getAttachmentDisplaySrc,
  getAttachmentOriginalSrc,
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
  type AttachmentDownloadProgress,
} from "../../utils/attachmentDownloads";
import {
  computeMediaAlbumLayout,
  getMediaAlbumPackingRatio,
} from "../../utils/mediaAlbumLayout";

interface MessageItemProps {
  msg: Message;
  isOwn: boolean;
  alignmentMode?: "split" | "left-column";
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
const SINGLE_MEDIA_MAX_HEIGHT = 432;
export const SINGLE_DOCUMENT_MIN_WIDTH = 268;
export const SINGLE_DOCUMENT_MAX_WIDTH = 430;
const MESSAGE_ALBUM_LAYOUT_OPTIONS = {
  maxWidth: MESSAGE_ALBUM_MAX_WIDTH,
  spacing: 2,
  minTileSize: 88,
  fallbackRatio: 1,
  narrowRatio: 0.8,
  wideRatio: 1.25,
} as const;

function getBubbleCornerClassName(
  isOwn: boolean,
  alignmentMode: "split" | "left-column",
  isConsecutive: boolean,
  isGroupedWithNext: boolean,
  hasTail: boolean,
) {
  const isLeftFacing = !isOwn || alignmentMode === "left-column";
  const topTailRadius = isConsecutive ? "rounded-tl-[6px]" : "rounded-tl-[15px]";
  const bottomTailRadius = hasTail ? "rounded-bl-[0px]" : isGroupedWithNext ? "rounded-bl-[6px]" : "rounded-bl-[15px]";
  const rightTopTailRadius = isConsecutive ? "rounded-tr-[6px]" : "rounded-tr-[15px]";
  const rightBottomTailRadius = hasTail ? "rounded-br-[0px]" : isGroupedWithNext ? "rounded-br-[6px]" : "rounded-br-[15px]";

  return cn(
    "rounded-[15px]",
    isLeftFacing
      ? [topTailRadius, bottomTailRadius]
      : [rightTopTailRadius, rightBottomTailRadius],
  );
}

function isVisualAttachment(attachment: Attachment): attachment is VisualAttachment {
  return attachment.kind === "photo" || attachment.kind === "video";
}

function isFileLikeAttachment(attachment: Attachment) {
  return attachment.kind === "file" || attachment.kind === "audio";
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
  alignmentMode = "split",
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
  const isVoiceMessage = attachments.length === 1 && attachments[0].kind === "voice";
  const isSingleAudioMessage = attachments.length === 1 && attachments[0].kind === "audio";
  const isAudioGroup = attachments.length >= 2 && attachments.every((currentAttachment) => currentAttachment.kind === "audio");
  const isDocumentAttachment = attachments.length > 0 && !isVisualMediaMessage && !isVoiceMessage && !isSingleAudioMessage && attachments.some((currentAttachment) => currentAttachment.kind === "file");
  const isSingleDocumentAttachment = attachments.length === 1 && isDocumentAttachment;
  const isDocumentGroup = attachments.length >= 2 && attachments.every(isFileLikeAttachment) && !isAudioGroup;
  const isMediaOnly =
    isVisualMediaMessage &&
    (!msg.content || msg.content.trim().length === 0) &&
    !msg.reply_to_id;
  const isTextOnly = hasText && !hasMedia;
  const authorName = msg.sender_display_name || msg.sender_username || "Unknown";
  const shouldRenderTail =
    !isGroupedWithNext && (isTextOnly || isDocumentAttachment || isVisualMediaMessage || isVoiceMessage || isSingleAudioMessage);
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
    isVisualAlbum
      ? MESSAGE_ALBUM_LAYOUT_OPTIONS
      : { ...MESSAGE_ALBUM_LAYOUT_OPTIONS, maxHeight: SINGLE_MEDIA_MAX_HEIGHT },
  ), [isVisualAlbum, resolvedVisualAttachments]);
  const hasPendingDecodedVisualDimensions = resolvedVisualAttachments.some(
    (currentAttachment) => currentAttachment.dimensionSource === "fallback",
  );
  const isTemporaryVisualLayout =
    hasPendingDecodedVisualDimensions ||
    !hasCompleteAlbumLayout(photoLayout, resolvedVisualAttachments.length);
  const isOwnLeftColumn = isOwn && alignmentMode === "left-column";
  const showSenderName = isRoom && !isOwn && !isConsecutive;
  const metadataClassName = isOwn
    ? "text-white/60"
    : "text-[color:var(--bubble-incoming-meta)]";
  const overlayMetadataClassName = "h-[18px] rounded-[10px] bg-black/[0.20] py-0 pl-[6px] pr-[5px] text-white";
  const textGroupRadiusClassName = getBubbleCornerClassName(
    isOwn,
    alignmentMode,
    isConsecutive,
    isGroupedWithNext,
    shouldRenderTail,
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

  const handleAttachmentAction = async (
    action: "download" | "open",
    currentAttachment: Attachment | null = attachment,
    downloadOptions?: { signal?: AbortSignal; onProgress?: (progress: AttachmentDownloadProgress) => void },
  ): Promise<boolean> => {
    if (!currentAttachment) return false;

    setAttachmentActionError(null);

    try {
      if (action === "open") {
        if (currentAttachment.kind === "video") {
          const videoSrc = getAttachmentOriginalSrc(currentAttachment);
          if (!videoSrc) {
            setAttachmentActionError("Attachment unavailable");
            return false;
          }

          onLightbox({
            kind: "video",
            src: videoSrc,
            authorName,
            createdAt: msg.inserted_at,
            avatarSrc: msg.sender?.avatar_url ?? null,
            messageId: msg.id,
          });
          return true;
        }

        await openAttachmentWithAuth({ attachment: currentAttachment, authToken });
      } else {
        await downloadAttachmentWithAuth({ attachment: currentAttachment, authToken, ...downloadOptions });
      }
      return true;
    } catch (error) {
      if (downloadOptions?.signal?.aborted) return false;
      console.error("Attachment action failed:", error);
      setAttachmentActionError("Attachment unavailable");
      return false;
    }
  };

  const renderMetadata = (variant: "inline" | "overlay" = "inline") => (
    <span
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
              className="ml-[-3px] flex h-[19px] w-[19px] shrink-0 items-center justify-center leading-[19px] text-current"
              data-testid="message-media-only-status"
            >
              <StatusIcon status={msg.status} className="ml-0 h-[19px] w-[19px] text-current" />
            </span>
          ) : (
            <span
              className="ml-[-3px] flex h-[19px] w-[19px] shrink-0 items-center justify-center leading-[19px] text-current"
              data-testid="message-inline-status"
            >
              <StatusIcon status={msg.status} className="ml-0 h-[19px] w-[19px] text-current" />
            </span>
          )
      )}
    </span>
  );

  const renderInlineMetadata = () => (
    <span
      className="pointer-events-none relative top-[6px] float-right ml-[7px] mr-[-6px] inline-flex h-[20px] shrink-0 items-center whitespace-nowrap rounded-[10px] bg-transparent px-[4px]"
      data-testid="message-text-inline-metadata"
    >
      {renderMetadata()}
    </span>
  );

  const renderBubbleTail = (testId: string) => {
    if (isGroupedWithNext) return null;

    const isLeftFacing = !isOwn || alignmentMode === "left-column";

    return <MessageTail side={isLeftFacing ? "left" : "right"} testId={testId} />;
  };

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

  const renderPhotoMedia = () => (
    <VisualAttachmentGroup
      attachments={resolvedVisualAttachments}
      layout={photoLayout}
      albumMaxWidth={MESSAGE_ALBUM_MAX_WIDTH}
      hasCaption={hasText}
      isTemporaryLayout={isTemporaryVisualLayout}
      isDebugEnabled={isMediaDebugEnabled}
      runtimeMetricsByAttachmentId={visualRuntimeMetrics}
      getPackingRatio={getResolvedPhotoPackingRatio}
      onOpen={(openedAttachment) => void handleVisualAttachmentOpen(openedAttachment)}
      onDecodedDimensions={handleDecodedVisualDimensions}
      onDiagnostics={handleVisualDiagnostics}
      singleMediaCornerClassName={
        isVisualAlbum
          ? undefined
          : hasText
            ? cn(textGroupRadiusClassName, "rounded-bl-[0px] rounded-br-[0px]")
            : textGroupRadiusClassName
      }
      albumShellCornerClassName={
        isVisualAlbum
          ? hasText
            ? cn(textGroupRadiusClassName, "rounded-bl-[0px] rounded-br-[0px]")
            : textGroupRadiusClassName
          : undefined
      }
    />
  );

  const renderDocumentAttachment = () => {
    if (isDocumentGroup) {
      return (
        <div
          className="m-0 flex w-[275px] max-w-full flex-col gap-0 row-gap-0 bg-transparent p-0"
          data-testid="message-document-group"
        >
          {attachments.map((currentAttachment, index) => {
            const role = index === 0
              ? "first"
              : index === attachments.length - 1
                ? "last"
                : "middle";
            const isLast = role === "last";
            const hasTail = isLast && !isGroupedWithNext;
            const isLeftFacing = !isOwn || alignmentMode === "left-column";
            const bottomRadiusClassName = isLeftFacing
              ? hasTail
                ? "rounded-bl-[0px] rounded-br-[15px]"
                : isGroupedWithNext
                  ? "rounded-bl-[6px] rounded-br-[15px]"
                  : "rounded-bl-[15px] rounded-br-[15px]"
              : hasTail
                ? "rounded-bl-[15px] rounded-br-[0px]"
                : isGroupedWithNext
                  ? "rounded-bl-[15px] rounded-br-[6px]"
                  : "rounded-bl-[15px] rounded-br-[15px]";

            return (
              <div
                key={currentAttachment.id}
                className={cn(
                  "relative box-border w-[275px] max-w-full bg-[var(--message-surface-color)]",
                  role === "first" && "h-[70px] rounded-tl-[15px] rounded-tr-[15px] rounded-bl-[0px] rounded-br-[0px] px-2 pt-[6px] pb-[4px]",
                  role === "middle" && "rounded-none px-2 py-[4px]",
                  role === "last" && cn("h-[72px] rounded-tl-[0px] rounded-tr-[0px] px-2 pt-[4px] pb-[8px]", bottomRadiusClassName),
                )}
                data-testid={`message-document-segment-${role}`}
                data-document-role={role}
                style={{
                  "--message-surface-color": isOwn ? "var(--bubble-outgoing)" : "var(--bubble-incoming)",
                } as React.CSSProperties}
              >
                {currentAttachment.kind === "audio" ? (
                  <AudioFilePlayer attachment={currentAttachment} isOwn={isOwn} />
                ) : (
                  <DocumentAttachmentRow
                    attachment={currentAttachment}
                    isOwn={isOwn}
                    isCompact
                    isGrouped
                    onDownload={(options) => handleAttachmentAction(currentAttachment.kind === "video" ? "open" : "download", currentAttachment, options)}
                  />
                )}
                {isLast && hasText && (
                  <div className="mt-1.5 whitespace-pre-wrap break-words text-[0.9375rem] leading-[1.45] text-current">
                    <EmojiText text={msg.content || ""} />
                  </div>
                )}
                {isLast && (
                  <span
                    className="relative float-right top-[8px] mt-[-20px] mr-[-6px] mb-0 ml-[7px] flex h-[20px] shrink-0 items-center whitespace-nowrap bg-transparent px-[4px]"
                    data-testid="message-document-inline-metadata"
                  >
                    {renderMetadata()}
                  </span>
                )}
                {isLast && hasTail && renderBubbleTail("message-text-tail")}
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <>
        <DocumentAttachmentRow
          attachment={attachment}
          isOwn={isOwn}
          isCompact={isSingleDocumentAttachment}
          isGrouped={false}
          onDownload={(options) => handleAttachmentAction(attachment?.kind === "video" ? "open" : "download", attachment, options)}
        />

        {hasText && (
          <div className="mt-1.5 whitespace-pre-wrap break-words text-[0.9375rem] leading-[1.45] text-current">
            <EmojiText text={msg.content || ""} />
          </div>
        )}

        {isSingleDocumentAttachment && !hasText && (
          <span
            className="relative float-right top-[8px] mt-[-20px] mr-[-6px] mb-0 ml-[7px] flex h-[20px] shrink-0 items-center whitespace-nowrap bg-transparent px-[4px]"
            data-testid="message-document-inline-metadata"
          >
            {renderMetadata()}
          </span>
        )}

        {(!isSingleDocumentAttachment || hasText) && <div className="mt-1 flex justify-end">{renderMetadata()}</div>}

        {attachmentActionError && (
          <div className="mt-1.5 text-[10px] text-destructive">
            {attachmentActionError}
          </div>
        )}
      </>
    );
  };

  const renderVoiceAttachment = () => {
    const voiceAttachment = attachments[0];
    if (!voiceAttachment || voiceAttachment.kind !== "voice") return null;

    return (
      <div className="relative h-[58px] w-full" data-testid="message-voice-attachment">
        <VoiceMessagePlayer
          attachment={voiceAttachment}
          isOwn={isOwn}
          showUnreadDot={isOwn && Boolean(msg.status) && msg.status !== "read"}
        />
        {hasText && (
          <div className="mt-1.5 whitespace-pre-wrap break-words text-[0.9375rem] leading-[1.45] text-current">
            <EmojiText text={msg.content || ""} />
          </div>
        )}
        <span
          className="absolute right-0 bottom-0 flex h-[20px] items-center whitespace-nowrap bg-transparent px-[4px]"
          data-testid="message-voice-inline-metadata"
        >
          {renderMetadata()}
        </span>
      </div>
    );
  };

  const renderAudioAttachment = () => {
    const audioAttachment = attachments[0];
    if (!audioAttachment || audioAttachment.kind !== "audio") return null;

    return (
      <div className="relative w-full" data-testid="message-audio-attachment">
        <AudioFilePlayer attachment={audioAttachment} isOwn={isOwn} messageMeta={renderMetadata()} />
        {hasText && (
          <div className="mt-1.5 whitespace-pre-wrap break-words text-[0.9375rem] leading-[1.45] text-current">
            <EmojiText text={msg.content || ""} />
          </div>
        )}
      </div>
    );
  };

  const renderAudioGroup = () => (
    <div className="relative m-0 flex w-[320px] max-w-full flex-col gap-0 bg-transparent p-0" data-testid="message-audio-group">
      {attachments.map((currentAttachment, index) => {
        const role = index === 0
          ? "first"
          : index === attachments.length - 1
            ? "last"
            : "middle";
        const isLast = role === "last";
        const hasTail = isLast && !isGroupedWithNext;
        const isLeftFacing = !isOwn || alignmentMode === "left-column";
        const topRadiusClassName = isConsecutive
          ? "rounded-tl-[6px] rounded-tr-[6px]"
          : "rounded-tl-[15px] rounded-tr-[15px]";
        const bottomRadiusClassName = isLeftFacing
          ? hasTail
            ? "rounded-bl-[0px] rounded-br-[15px]"
            : isGroupedWithNext
              ? "rounded-bl-[6px] rounded-br-[15px]"
              : "rounded-bl-[15px] rounded-br-[15px]"
          : hasTail
            ? "rounded-bl-[15px] rounded-br-[0px]"
            : isGroupedWithNext
              ? "rounded-bl-[15px] rounded-br-[6px]"
              : "rounded-bl-[15px] rounded-br-[15px]";

        return (
          <div
            key={currentAttachment.id}
            className={cn(
              "relative box-border w-[320px] max-w-full bg-[var(--message-surface-color)]",
              "flex min-h-[69px] items-center py-0",
              role === "first" && cn("rounded-bl-[0px] rounded-br-[0px] px-2", topRadiusClassName),
              role === "middle" && "rounded-none px-2",
              role === "last" && cn("rounded-tl-[0px] rounded-tr-[0px] px-2", bottomRadiusClassName),
            )}
            data-testid={`message-audio-segment-${role}`}
            data-audio-role={role}
            style={{
              "--message-surface-color": isOwn ? "var(--bubble-outgoing)" : "var(--bubble-incoming)",
            } as React.CSSProperties}
          >
            <AudioFilePlayer
              attachment={currentAttachment}
              isOwn={isOwn}
              messageMeta={isLast ? renderMetadata() : undefined}
            />
            {isLast && hasText && (
              <div className="mt-1.5 whitespace-pre-wrap break-words text-[0.9375rem] leading-[1.45] text-current" data-testid="message-audio-group-caption">
                <EmojiText text={msg.content || ""} />
              </div>
            )}
            {isLast && hasTail && renderBubbleTail("message-audio-group-tail")}
          </div>
        );
      })}
    </div>
  );

  const renderVisualCaption = () => {
    return (
      <div className="relative text-[16px] font-normal leading-[21px] tracking-normal" data-testid="message-text-content">
        <span
          className="relative whitespace-pre-wrap [overflow-wrap:anywhere] [word-break:normal]"
          data-message-content-rect
        >
          <EmojiText text={msg.content || ""} />
        </span>
        {renderInlineMetadata()}
      </div>
    );
  };

  const renderContent = () => {
    return (
      <>
        {hasMedia && (
          <>
            {isVoiceMessage
              ? renderVoiceAttachment()
              : isSingleAudioMessage
                ? renderAudioAttachment()
              : isAudioGroup
                ? renderAudioGroup()
              : isVisualMediaMessage
                ? renderPhotoMedia()
                : renderDocumentAttachment()}
          </>
        )}
        {hasText && !isDocumentAttachment && !isSingleAudioMessage && !isAudioGroup && !isVoiceMessage && (
          isVisualMediaMessage
            ? renderVisualCaption()
            : (
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
        isOwn && alignmentMode === "split" ? "justify-end" : "justify-start",
      )}
      data-testid="message-bubble-row"
      data-own-message={isOwn ? "true" : "false"}
      data-alignment-mode={alignmentMode}
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
          "relative box-border w-fit overflow-visible text-[16px] font-normal leading-[21px] tracking-normal",
          isAudioGroup
            ? "min-w-0 w-[320px] max-w-[min(320px,calc(100vw-6rem))] rounded-none p-0"
            : isDocumentGroup
              ? "min-w-0 w-[275px] max-w-[min(480px,calc(100vw-6rem))] rounded-none p-0"
            : isMediaOnly
            ? cn(
                "min-w-0 p-0",
                isVisualAlbum
                  ? "rounded-[15px]"
                  : "rounded-[18px]",
                isVisualAlbum
                  ? "max-w-[min(480px,calc(100vw-6rem))]"
                  : "max-w-[min(480px,calc(100vw-6rem))]",
              )
            : isVisualMediaMessage
              ? cn(
                  isVisualAlbum
                    ? "min-w-[11rem]"
                    : "min-w-0",
                  "rounded-[15px] px-2 pb-[6px] pt-[5px]",
                  isVisualAlbum
                    ? "max-w-[min(480px,calc(100vw-6rem))]"
                    : "max-w-[min(480px,calc(100vw-6rem))]",
                )
            : isSingleDocumentAttachment || isVoiceMessage || isSingleAudioMessage || isAudioGroup
                ? isSingleDocumentAttachment
                  ? "w-fit min-w-[268px] max-w-[min(430px,calc(100vw-6rem))] px-2 pt-[5px] pb-[6px]"
                  : isVoiceMessage
                  ? "h-[69px] w-[337px] max-w-[min(337px,calc(100vw-6rem))] px-2 pt-[5px] pb-[6px]"
                  : isSingleAudioMessage
                    ? "min-h-[69px] min-w-0 w-[320px] max-w-[min(320px,calc(100vw-6rem))] px-2 py-0 flex items-center"
                    : isAudioGroup
                      ? "min-w-0 w-[320px] max-w-[min(320px,calc(100vw-6rem))] px-2 py-0 flex items-center"
                  : "min-w-0 max-w-[min(480px,calc(100vw-6rem))] px-2 pt-[5px] pb-[6px]"
                : "min-w-0 max-w-[min(480px,calc(100vw-6rem))] px-2 pt-[5px] pb-[6px]",
          isSelected && "ring-1 ring-primary",
          isDocumentGroup || isAudioGroup
            ? "rounded-none"
            : isTextOnly || isVisualMediaMessage || isSingleDocumentAttachment || isVoiceMessage || isSingleAudioMessage || isAudioGroup
            ? textGroupRadiusClassName
            : isOwnLeftColumn
              ? cn(
                  isConsecutive && "rounded-tl-[12px]",
                  isGroupedWithNext && "rounded-bl-[12px]",
                )
              : isOwn
              ? cn(
                  isConsecutive && "rounded-tr-[12px]",
                  isGroupedWithNext && "rounded-br-[12px]",
                )
              : cn(
                  isConsecutive && "rounded-tl-[12px]",
                  isGroupedWithNext && "rounded-bl-[12px]",
                ),
          isDocumentGroup || isAudioGroup
            ? (isOwn ? "bg-transparent text-bubble-outgoing-text" : "bg-transparent text-bubble-incoming-text")
            : isMediaOnly
            ? isVisualAlbum
              ? (isOwn ? "bg-bubble-outgoing text-bubble-outgoing-text" : "bg-bubble-incoming text-bubble-incoming-text")
              : isVisualMediaMessage
                ? (isOwn ? "bg-bubble-outgoing text-bubble-outgoing-text" : "bg-bubble-incoming text-bubble-incoming-text")
                : "bg-transparent text-white"
            : isVisualMediaMessage
              ? (isOwn ? "bg-bubble-outgoing text-bubble-outgoing-text" : "bg-bubble-incoming text-bubble-incoming-text")
              : isDocumentAttachment
                ? (
                    isOwn
                      ? "bg-bubble-outgoing text-bubble-outgoing-text"
                      : "bg-bubble-incoming text-bubble-incoming-text"
                  )
                : (isOwn ? "bg-bubble-outgoing text-bubble-outgoing-text" : "bg-bubble-incoming text-bubble-incoming-text"),
        )}
        data-testid="message-bubble"
        style={{
          "--message-surface-color": isOwn ? "var(--bubble-outgoing)" : "var(--bubble-incoming)",
          backgroundColor: isDocumentGroup || isAudioGroup ? "transparent" : "var(--message-surface-color)",
          ...(isSingleVisualMessage ? { width: `${photoLayout.width}px` } : {}),
          ...(isSingleDocumentAttachment
            ? {
                minWidth: `${SINGLE_DOCUMENT_MIN_WIDTH}px`,
                maxWidth: `min(${SINGLE_DOCUMENT_MAX_WIDTH}px, calc(100vw - 6rem))`,
              }
            : {}),
        } as React.CSSProperties}
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
                className="relative whitespace-pre-wrap [overflow-wrap:anywhere] [word-break:normal] text-[16px] leading-[21px]"
              >
                <EmojiText text={msg.content || ""} />
              </span>
              {renderInlineMetadata()}
            </div>
          </>
        ) : (
          <div data-message-content-rect className="relative">
            {renderReplyPreview(msg, isOwn)}
            {renderContent()}
          </div>
        )}

        {isVoiceMessage && renderBubbleTail("message-voice-tail")}
        {isSingleAudioMessage && renderBubbleTail("message-audio-tail")}

        {isMediaOnly && (
          <div
            className="pointer-events-none absolute bottom-[4px] right-[4px]"
            data-testid="message-media-only-overlay"
          >
            {renderMetadata("overlay")}
          </div>
        )}

        {(isTextOnly || isDocumentAttachment) && !isDocumentGroup && renderBubbleTail("message-text-tail")}

        {isVisualMediaMessage && renderBubbleTail("message-media-tail")}

        {!isTextOnly && !isMediaOnly && !isVisualMediaMessage && !isDocumentAttachment && !isSingleAudioMessage && !isAudioGroup && !isVoiceMessage && (
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
