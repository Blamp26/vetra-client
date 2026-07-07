import React from "react";
import { Message, MessageReactionGroup } from "@/shared/types";
import { cn } from "@/shared/utils/cn";
import { Emoji, EmojiText } from "@/shared/components/Emoji/Emoji";
import { AuthenticatedImage } from "@/shared/components/AuthenticatedImage";
import { useAppStore } from "@/store";
import { Download, ExternalLink, FileText, Film } from "lucide-react";
import { StatusIcon } from "./StatusIcon";
import {
  formatAttachmentSize,
  getAttachmentDisplayName,
  getAttachmentKindLabel,
  getAttachmentTypeLabel,
  getMessageAttachment,
} from "../../utils/attachments";
import {
  downloadAttachmentWithAuth,
  openAttachmentWithAuth,
} from "../../utils/attachmentDownloads";

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
  const attachment = getMessageAttachment(msg);
  const hasMedia = !!attachment;
  const hasText = !!(msg.content && msg.content.trim().length > 0);
  const isPhotoAttachment = attachment?.kind === "photo";
  const isDocumentAttachment = Boolean(attachment && attachment.kind !== "photo");
  const isPhotoOnly =
    isPhotoAttachment &&
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

  const renderPhotoMedia = () => {
    const attachmentName = getAttachmentDisplayName(attachment);

    return (
      <div
        className="relative inline-block max-w-[min(28rem,calc(100vw-6rem))] overflow-hidden rounded-[16px] bg-[#111]"
        data-testid="message-media-shell"
        onClick={() => onLightbox({
          src: attachment!.url,
          author: authorName,
          time: msg.inserted_at,
        })}
      >
        <AuthenticatedImage
          className="block h-auto max-h-[32rem] w-auto max-w-full object-contain"
          src={attachment!.url}
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
            {isPhotoAttachment ? renderPhotoMedia() : renderDocumentAttachment()}
          </>
        )}
        {hasText && !isDocumentAttachment && (
          <div
            className={cn(
              "whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[16px] leading-[21px]",
              isPhotoAttachment && "px-2.5 pt-2",
              isPhotoAttachment &&
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
            ? "min-w-0 max-w-[min(28rem,calc(100vw-6rem))] overflow-hidden rounded-[18px] border border-black/10 bg-transparent p-0"
            : isPhotoAttachment
              ? "min-w-[11rem] max-w-[min(28rem,calc(100vw-6rem))] overflow-hidden rounded-[18px] border border-border/85 px-1.5 pb-2.5 pt-1.5"
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
            : isPhotoAttachment
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

        {isPhotoAttachment && hasText && (
          <div className="pointer-events-none absolute bottom-2.5 right-3.5">
            {renderMetadata()}
          </div>
        )}

        {!isTextOnly && !isPhotoOnly && !isPhotoAttachment && !isDocumentAttachment && (
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
