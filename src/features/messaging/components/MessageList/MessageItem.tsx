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
  const authorName = msg.sender_display_name || msg.sender_username || "Unknown";
  const showSenderName = isRoom && !isOwn && !isConsecutive;
  const renderInlineMetadata = hasText && !hasMedia;
  const metadataClassName = isOwn
    ? "text-[color:var(--bubble-outgoing-meta)]"
    : "text-[color:var(--bubble-incoming-meta)]";
  const overlayMetadataClassName = "bg-black/60 text-white shadow-[0_2px_10px_rgba(0,0,0,0.24)] backdrop-blur-[2px]";
  const inlineMetadataSpacingClass = isOwn
    ? msg.edited_at
      ? "min-h-6 pr-[7.7rem]"
      : "min-h-6 pr-[5.9rem]"
    : msg.edited_at
      ? "min-h-6 pr-[6.25rem]"
      : "min-h-6 pr-[3.85rem]";

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
        "inline-flex max-w-full items-center gap-1 whitespace-nowrap text-[11px] leading-none",
        variant === "overlay"
          ? overlayMetadataClassName
          : metadataClassName,
      )}
      data-testid="message-metadata"
    >
      <span>{formatTime(msg.inserted_at)}</span>
      {msg.edited_at && <span>(ed.)</span>}
      {isOwn && !isRoom && (
        <StatusIcon status={msg.status} className="ml-0 translate-y-[0.5px] text-current" />
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

    return (
      <>
        <div className="flex min-w-0 items-start gap-3" data-testid="message-file-row">
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border",
              isOwn
                ? "border-primary/20 bg-bubble-outgoing/18 text-[color:var(--primary)]"
                : "border-border bg-card/60 text-muted-foreground",
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
              className="truncate text-sm font-medium text-current"
              data-testid="message-file-name"
            >
              {attachmentName}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {[attachmentTypeLabel || attachmentKindLabel, formatAttachmentSize(attachment?.file_size)].join(" · ")}
            </div>
          </div>
        </div>

        {hasText && (
          <div className="mt-2 whitespace-pre-wrap break-words text-[0.9375rem] leading-[1.45] text-current">
            <EmojiText text={msg.content || ""} />
          </div>
        )}

        <div className="mt-2 flex items-end justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {attachment?.mime_type === "application/pdf" && (
              <button
                type="button"
                onClick={() => handleAttachmentAction("open")}
                disabled={isAttachmentActionPending}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border/70 bg-card/60 px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-card disabled:opacity-60"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open
              </button>
            )}
            <button
              type="button"
              onClick={() => handleAttachmentAction("download")}
              disabled={isAttachmentActionPending}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border/70 bg-card/60 px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-card disabled:opacity-60"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </button>
          </div>
          <div className="shrink-0">{renderMetadata()}</div>
        </div>

        {attachmentActionError && (
          <div className="mt-2 text-[10px] text-destructive">
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
              "whitespace-pre-wrap break-words text-[0.9375rem] leading-[1.45]",
              isPhotoAttachment && "px-2.5 pt-2",
              renderInlineMetadata && inlineMetadataSpacingClass,
              isPhotoAttachment &&
                !renderInlineMetadata &&
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
        "flex w-full",
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
                ? "min-w-[16rem] max-w-[min(24rem,calc(100vw-6rem))] rounded-[18px] border px-3 py-3"
                : "min-w-[4.75rem] max-w-[min(66%,42rem)] rounded-[18px] border border-border/85 px-3.5 py-2.5",
          isSelected && "ring-1 ring-primary",
          isOwn
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
                      ? "border-primary/15 bg-bubble-outgoing/12 text-foreground"
                      : "border-border bg-bubble-incoming text-foreground"
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
        <div data-message-content-rect className="relative">
          {renderReplyPreview(msg, isOwn)}
          {renderContent()}
        </div>

        {isPhotoOnly && (
          <div className="pointer-events-none absolute bottom-2 right-2">
            <div className="rounded-full px-2 py-1">
              {renderMetadata("overlay")}
            </div>
          </div>
        )}

        {renderInlineMetadata && (
          <div className="pointer-events-none absolute bottom-2.5 right-3.5">
            {renderMetadata()}
          </div>
        )}

        {isPhotoAttachment && hasText && (
          <div className="pointer-events-none absolute bottom-2.5 right-3.5">
            {renderMetadata()}
          </div>
        )}

        {!renderInlineMetadata && !isPhotoOnly && !isPhotoAttachment && !isDocumentAttachment && (
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
