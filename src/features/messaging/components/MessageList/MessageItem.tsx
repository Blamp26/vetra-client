import React from "react";
import { Message, MessageReactionGroup } from "@/shared/types";
import { cn } from "@/shared/utils/cn";
import { Emoji, EmojiText } from "@/shared/components/Emoji/Emoji";
import { AuthenticatedImage } from "@/shared/components/AuthenticatedImage";
import { useAppStore } from "@/store";
import { Download, ExternalLink, FileText, Film } from "lucide-react";
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
import { computeMediaAlbumLayout, type MediaAlbumTile } from "../../utils/mediaAlbumLayout";

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
  onLightbox: (data: { src: string; author: string; time: string }) => void;
  renderReplyPreview: (msg: Message, isOwn: boolean) => React.ReactNode;
  formatTime: (iso: string) => string;
}

type PhotoAttachment = Attachment & { kind: "photo" };
type AttachmentWithVisualMetadata = Attachment & {
  width?: number | null;
  height?: number | null;
  media_width?: number | null;
  media_height?: number | null;
  original_width?: number | null;
  original_height?: number | null;
};

function isPhotoAttachment(attachment: Attachment): attachment is PhotoAttachment {
  return attachment.kind === "photo";
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
  const attachments = getMessageAttachments(msg);
  const attachment = getMessageAttachment(msg);
  const hasMedia = attachments.length > 0;
  const hasText = !!(msg.content && msg.content.trim().length > 0);
  const isPhotoMessage = attachments.length > 0 && attachments.every(isPhotoAttachment);
  const photoAttachments = isPhotoMessage ? attachments : [];
  const isPhotoAlbum = photoAttachments.length > 1;
  const isDocumentAttachment = attachments.length > 0 && !isPhotoMessage;
  const isPhotoOnly =
    isPhotoMessage &&
    (!msg.content || msg.content.trim().length === 0) &&
    !msg.reply_to_id;
  const isTextOnly = hasText && !hasMedia;
  const authorName = msg.sender_display_name || msg.sender_username || "Unknown";
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
    if (!hasMedia) return;

    logAttachmentDebug("message.render", {
      ...summarizeMessageMedia(msg as Record<string, unknown>),
      renderAttachmentCount: attachments.length,
      treatedAsAlbum: isPhotoAlbum,
      isPhotoAttachment: isPhotoMessage,
      isDocumentAttachment,
    }, {
      table: attachments.map((currentAttachment) => summarizeAttachmentLike(currentAttachment)),
    });
  }, [attachments, hasMedia, isDocumentAttachment, isPhotoAlbum, isPhotoMessage, msg]);

  const handleAttachmentAction = async (action: "download" | "open") => {
    if (!attachment || isAttachmentActionPending) return;

    setIsAttachmentActionPending(true);
    setAttachmentActionError(null);

    try {
      if (action === "open") {
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

  const renderPhotoTile = (
    currentAttachment: PhotoAttachment,
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
    const attachmentName = getAttachmentDisplayName(currentAttachment);
    const displaySrc = getAttachmentDisplaySrc(currentAttachment);
    const lightboxSrc = getAttachmentOriginalSrc(currentAttachment);

    if (!displaySrc || !lightboxSrc) return null;

    return (
      <div
        key={currentAttachment.id}
        className="absolute overflow-hidden"
        data-testid={`message-photo-collage-tile-${tile.index}`}
        style={tileStyle}
      >
        <button
          type="button"
          className="relative flex h-full w-full overflow-hidden bg-[#111]"
          data-testid="message-photo-collage-tile"
          onClick={() => onLightbox({
            src: lightboxSrc,
            author: authorName,
            time: msg.inserted_at,
          })}
        >
          <AuthenticatedImage
            className="block h-full w-full object-cover object-center"
            src={displaySrc}
            alt={attachmentName}
            crossOrigin="anonymous"
          />
        </button>
      </div>
    );
  };

  const renderPhotoMedia = () => {
    const layout = computeMediaAlbumLayout(
      photoAttachments.map((currentAttachment) => {
        const { width, height } = getAttachmentIntrinsicSize(currentAttachment);
        return {
          id: currentAttachment.id,
          width,
          height,
          kind: "image",
        };
      }),
      {
        maxWidth: 480,
        maxHeight: 384,
        spacing: 2,
        minTileSize: 88,
        fallbackRatio: 1,
        narrowRatio: 0.8,
        wideRatio: 1.25,
      },
    );
    const tileRadius = isPhotoOnly
      ? { top: 15, bottom: 6 }
      : { top: 14, bottom: 8 };

    if (photoAttachments.length > 1) {
      if (!hasCompleteAlbumLayout(layout, photoAttachments.length)) {
        return (
          <div
            className="grid max-w-full grid-cols-2 gap-[2px] overflow-hidden bg-[#111] shadow-[0_1px_2px_rgba(16,16,16,0.61)]"
            style={{
              width: "min(480px, calc(100vw - 6rem))",
              maxWidth: "100%",
            }}
            data-testid="message-photo-collage"
          >
            {photoAttachments.map((currentAttachment) => {
              const displaySrc = getAttachmentDisplaySrc(currentAttachment);
              const lightboxSrc = getAttachmentOriginalSrc(currentAttachment);
              if (!displaySrc || !lightboxSrc) return null;

              return (
                <button
                  key={currentAttachment.id}
                  type="button"
                  className="relative aspect-square overflow-hidden bg-[#111]"
                  data-testid="message-photo-collage-tile"
                  onClick={() => onLightbox({
                    src: lightboxSrc,
                    author: authorName,
                    time: msg.inserted_at,
                  })}
                >
                  <AuthenticatedImage
                    className="block h-full w-full object-cover object-center"
                    src={displaySrc}
                    alt={getAttachmentDisplayName(currentAttachment)}
                    crossOrigin="anonymous"
                  />
                </button>
              );
            })}
          </div>
        );
      }

      return (
        <div
          className="relative max-w-full overflow-hidden bg-[#111] shadow-[0_1px_2px_rgba(16,16,16,0.61)]"
          style={{
            width: `${layout.width}px`,
            maxWidth: "100%",
            aspectRatio: `${layout.width} / ${layout.height}`,
          }}
          data-testid="message-photo-collage"
        >
          <div className="relative h-full w-full" data-testid="message-photo-collage-inner">
            {photoAttachments.map((currentAttachment, index) =>
              renderPhotoTile(currentAttachment, layout.tiles[index], layout, tileRadius),
            )}
          </div>
        </div>
      );
    }

    const currentAttachment = photoAttachments[0];
    if (!currentAttachment) return null;
    const attachmentName = getAttachmentDisplayName(currentAttachment);
    const displaySrc = getAttachmentDisplaySrc(currentAttachment);
    const lightboxSrc = getAttachmentOriginalSrc(currentAttachment);

    if (!displaySrc || !lightboxSrc) return null;

    return (
      <div
        className="relative inline-block max-w-full overflow-hidden rounded-[16px] bg-[#111]"
        data-testid="message-media-shell"
        onClick={() => onLightbox({
          src: lightboxSrc,
          author: authorName,
          time: msg.inserted_at,
        })}
        style={{
          width: `${layout.width}px`,
          maxWidth: "100%",
          aspectRatio: `${layout.width} / ${layout.height}`,
        }}
      >
        <AuthenticatedImage
          className="block h-full w-full object-cover"
          src={displaySrc}
          alt={attachmentName}
          crossOrigin="anonymous"
        />
      </div>
    );
  };

  const renderDocumentAttachment = () => {
    const attachmentTypeLabel = getAttachmentTypeLabel(attachment);
    const attachmentName = getAttachmentDisplayName(attachment);
    const attachmentKindLabel = attachment
      ? getAttachmentKindLabel(attachment.kind)
      : "Attachment";
    const canOpenInline = attachment?.mime_type === "application/pdf";
    const actionButtonClassName = cn(
      "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-current transition-colors disabled:opacity-50",
      isOwn ? "hover:bg-white/16" : "hover:bg-accent",
    );

    return (
      <>
        <div className="flex min-w-0 items-center gap-2.5" data-testid="message-file-row">
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px]",
              isOwn
                ? "bg-white/16 text-current"
                : "bg-foreground/8 text-muted-foreground",
            )}
          >
            {attachment?.kind === "video" ? (
              <Film className="h-5 w-5" />
            ) : (
              <FileText className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="truncate text-sm font-medium leading-[1.2] text-current"
              data-testid="message-file-name"
            >
              {attachmentName}
            </div>
            <div
              className={cn(
                "mt-0.5 truncate text-[11.5px] leading-tight",
                isOwn ? "text-[color:var(--bubble-outgoing-meta)]" : "text-muted-foreground",
              )}
            >
              {[attachmentTypeLabel || attachmentKindLabel, formatAttachmentSize(attachment?.file_size)].join(" · ")}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5" data-testid="message-file-actions">
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
            <button
              type="button"
              aria-label="Download"
              title="Download"
              onClick={() => handleAttachmentAction("download")}
              disabled={isAttachmentActionPending}
              className={actionButtonClassName}
            >
              <Download className="h-4 w-4" />
            </button>
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
            {isPhotoMessage ? renderPhotoMedia() : renderDocumentAttachment()}
          </>
        )}
        {hasText && !isDocumentAttachment && (
          <div
            className={cn(
              "whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[16px] leading-[21px]",
              isPhotoMessage && "px-2.5 pt-2",
              isPhotoMessage &&
                !isTextOnly &&
                (isOwn
                  ? msg.edited_at
                    ? "pr-[7.7rem]"
                    : "pr-[5.9rem]"
                  : msg.edited_at
                    ? "pr-[6.25rem]"
                    : "pr-[3.85rem]"),
            )}
            data-testid="message-text-content"
          >
            <EmojiText text={msg.content || ""} />
          </div>
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
          "relative w-fit text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]",
          isPhotoOnly
            ? cn(
                "min-w-0 overflow-hidden border border-black/10 bg-transparent p-0",
                isPhotoAlbum
                  ? "rounded-t-[15px] rounded-bl-[6px] rounded-br-[6px]"
                  : "rounded-[18px]",
                isPhotoAlbum
                  ? "max-w-[min(480px,calc(100vw-6rem))]"
                  : "max-w-[min(28rem,calc(100vw-6rem))]",
              )
            : isPhotoMessage
              ? cn(
                  "min-w-[11rem] overflow-hidden rounded-[18px] border border-border/85 px-1.5 pb-2.5 pt-1.5",
                  isPhotoAlbum
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
          isPhotoOnly
            ? "text-white"
            : isPhotoMessage
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

        {isPhotoOnly && (
          <div
            className="pointer-events-none absolute bottom-[4px] right-[4px]"
            data-testid="message-media-only-overlay"
          >
            {renderMetadata("overlay")}
          </div>
        )}

        {isPhotoMessage && hasText && (
          <div className="pointer-events-none absolute bottom-2.5 right-3.5">
            {renderMetadata()}
          </div>
        )}

        {!isTextOnly && !isPhotoOnly && !isPhotoMessage && !isDocumentAttachment && (
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
