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
  isSelected: boolean;
  selectionMode: boolean;
  isRoom: boolean;
  messageReactions: MessageReactionGroup[];
  currentUserId: number;
  onContextMenu: (e: React.MouseEvent, msg: Message) => void;
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
  const isPhotoOnly =
    attachment?.kind === "photo" &&
    (!msg.content || msg.content.trim().length === 0) &&
    !msg.reply_to_id;
  const authorName = msg.sender_display_name || msg.sender_username || "Unknown";

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

  const renderContent = () => {
    const hasMedia = !!attachment;
    const hasText = !!(msg.content && msg.content.trim().length > 0);
    const attachmentTypeLabel = getAttachmentTypeLabel(attachment);
    const attachmentName = getAttachmentDisplayName(attachment);
    const attachmentKindLabel = attachment
      ? getAttachmentKindLabel(attachment.kind)
      : "Attachment";

    return (
      <>
        {hasMedia && (
            <div className={cn(!isPhotoOnly && "mb-1")}>
              {attachment?.kind === "photo" ? (
                <div 
                  onClick={() => onLightbox({
                    src: attachment.url,
                    author: authorName,
                    time: msg.inserted_at
                  })}
                >
                  <AuthenticatedImage 
                    className="max-w-full border border-border"
                    src={attachment.url} 
                    alt={attachmentName} 
                    crossOrigin="anonymous"
                  />
                </div>
              ) : (
                <div className="border border-border bg-background/60 p-3 text-foreground">
                  <div className="flex items-start gap-3">
                    <div className="bg-muted p-2 shrink-0">
                      {attachment?.kind === "video" ? (
                        <Film className="h-5 w-5" />
                      ) : (
                        <FileText className="h-5 w-5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{attachmentName}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {[attachmentTypeLabel || attachmentKindLabel, formatAttachmentSize(attachment?.file_size)].join(" · ")}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    {attachment?.mime_type === "application/pdf" && (
                      <button
                        type="button"
                        onClick={() => handleAttachmentAction("open")}
                        disabled={isAttachmentActionPending}
                        className="inline-flex items-center gap-1 border border-border px-2 py-1 text-xs"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleAttachmentAction("download")}
                      disabled={isAttachmentActionPending}
                      className="inline-flex items-center gap-1 border border-border px-2 py-1 text-xs"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </button>
                  </div>
                  {attachmentActionError && (
                    <div className="mt-2 text-[10px] text-destructive">
                      {attachmentActionError}
                    </div>
                  )}
                </div>
              )}
            </div>
        )}
        {hasText && (
          <div className="text-sm">
            <EmojiText text={msg.content || ""} />
          </div>
        )}
      </>
    );
  };

  const renderReactions = () => {
    if (!messageReactions || messageReactions.length === 0) return null;
    return (
      <div className="mt-1.5 flex flex-wrap gap-1">
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
                "inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px]",
                mine ? "bg-primary text-primary-foreground" : "bg-background text-foreground"
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
          "max-w-[80%] rounded-xl border border-border px-3 py-2 text-sm leading-relaxed",
          isSelected && "ring-1 ring-primary",
          isOwn ? "bg-bubble-outgoing text-bubble-outgoing-text" : "bg-bubble-incoming text-bubble-incoming-text",
        )}
        data-testid="message-bubble"
      >
        {!isOwn && !isConsecutive && (
          <div className="mb-1 text-[10px] font-medium text-primary">
            {authorName}
          </div>
        )}
        {renderReplyPreview(msg, isOwn)}
        {renderContent()}

        <div className="mt-1.5 flex items-center justify-end gap-1 text-[10px] leading-none opacity-70">
          <span>{formatTime(msg.inserted_at)}</span>
          {msg.edited_at && <span>(ed.)</span>}
          {isOwn && !isRoom && <StatusIcon status={msg.status} />}
        </div>
        
        {renderReactions()}
      </div>
    </div>
  );
});

MessageItem.displayName = "MessageItem";
