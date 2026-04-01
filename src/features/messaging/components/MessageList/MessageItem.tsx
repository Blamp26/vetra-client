import React from "react";
import { Message, MessageReactionGroup } from "@/shared/types";
import { cn } from "@/shared/utils/cn";
import { Emoji, EmojiText } from "@/shared/components/Emoji/Emoji";
import { AuthenticatedImage } from "@/shared/components/AuthenticatedImage";
import { API_BASE_URL } from "@/api/base";
import { StatusIcon } from "./StatusIcon";

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
  onReplyClick: (id: number) => void;
  renderReplyPreview: (msg: Message, isOwn: boolean) => React.ReactNode;
  formatTime: (iso: string) => string;
  formatDate: (iso: string) => string;
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
  const isPhotoOnly = !!msg.media_file_id && (!msg.content || msg.content.trim().length === 0) && !msg.reply_to_id;
  const authorName = msg.sender_display_name || msg.sender_username || "Unknown";

  const renderContent = () => {
    const hasMedia = !!msg.media_file_id;
    const hasText = !!(msg.content && msg.content.trim().length > 0);

    return (
      <>
        {hasMedia && (
            <div className={cn(!isPhotoOnly && "mb-1")}>
              {msg.media_mime_type?.startsWith("video/") ? (
                <video className="max-w-full border border-border" controls src={`${API_BASE_URL}/media/${msg.media_file_id}`} />
              ) : (
                <div 
                  onClick={() => onLightbox({
                    src: `${API_BASE_URL}/media/${msg.media_file_id}`,
                    author: authorName,
                    time: msg.inserted_at
                  })}
                >
                  <AuthenticatedImage 
                    className="max-w-full border border-border"
                    src={`${API_BASE_URL}/media/${msg.media_file_id}`} 
                    alt="attachment" 
                    crossOrigin="anonymous"
                  />
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
      <div className="flex flex-wrap gap-1 mt-1">
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
                "inline-flex items-center gap-1 px-1 border border-border text-[10px]",
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
      className={cn("flex w-full", isOwn ? "justify-end" : "justify-start")}
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
          "max-w-[80%] border border-border p-2",
          isOwn ? "bg-bubble-outgoing text-bubble-outgoing-text" : "bg-bubble-incoming text-bubble-incoming-text"
        )}
      >
        {!isOwn && !isConsecutive && (
          <div className="text-[10px] text-primary mb-1">
            {msg.sender_display_name || msg.sender_username}
          </div>
        )}
        {renderReplyPreview(msg, isOwn)}
        {renderContent()}

        <div className="mt-1 flex items-center gap-1 text-[10px] opacity-70">
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
