import React from "react";
import { Message, MessageReactionGroup } from "@/shared/types";
import { cn } from "@/shared/utils/cn";
import { CheckSquare } from "lucide-react";
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
  formatDate,
}, ref) => {
  const isPhotoOnly = !!msg.media_file_id && (!msg.content || msg.content.trim().length === 0) && !msg.reply_to_id;
  const authorName = msg.sender_display_name || msg.sender_username || "Unknown";
  const timestamp = formatDate(msg.inserted_at) + " в " + formatTime(msg.inserted_at);

  const renderContent = () => {
    const hasMedia = !!msg.media_file_id;
    const hasText = !!(msg.content && msg.content.trim().length > 0);

    return (
      <>
        {hasMedia && (
            <div className={cn(!isPhotoOnly && "mb-1.5")}>
              {msg.media_mime_type?.startsWith("video/") ? (
                <video className="max-w-full rounded-2xl max-h-[300px] w-full object-cover shadow-sm ring-1 ring-inset ring-black/5 dark:ring-white/5" controls src={`${API_BASE_URL}/media/${msg.media_file_id}`} />
              ) : (
                <div 
                  className="cursor-zoom-in active:scale-[0.98] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
                  onClick={() => onLightbox({
                    src: `${API_BASE_URL}/media/${msg.media_file_id}`,
                    author: authorName,
                    time: timestamp
                  })}
                >
                  <AuthenticatedImage 
                    className={cn(
                      "max-w-full w-full object-cover bg-muted/20 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.1)] hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.15)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ring-1 ring-inset ring-black/5 dark:ring-white/5",
                      isPhotoOnly ? "rounded-[4px] max-h-[500px]" : "rounded-2xl max-h-[400px]"
                    )}
                    src={`${API_BASE_URL}/media/${msg.media_file_id}`} 
                    alt="attachment" 
                    crossOrigin="anonymous"
                  />
                </div>
              )}
            </div>
        )}
        {hasText && (
          <p className="text-sm leading-[1.3125] whitespace-pre-wrap break-words relative max-w-[65ch] [word-break:normal]">
            <EmojiText text={msg.content || ""} />
            <span className="inline-block w-[85px] h-[1px]" aria-hidden="true" />
          </p>
        )}
      </>
    );
  };

  const renderReactions = () => {
    if (!messageReactions || messageReactions.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1 mt-1.5">
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
                "inline-flex items-center gap-1.5 px-2.5 py-[0.1875rem] rounded-full transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] text-xs cursor-pointer hover:scale-[1.08] active:scale-95",
                mine 
                  ? "bg-primary/10 text-primary font-semibold shadow-sm ring-1 ring-inset ring-primary/20" 
                  : "bg-background/40 backdrop-blur-md text-foreground hover:bg-muted/80 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-border/50 hover:ring-border"
              )}
              aria-pressed={mine}
              title={mine ? "Remove reaction" : "Add reaction"}
            >
              <Emoji emoji={g.emoji} size={16} />
              <span className={cn("text-xs", mine ? "text-primary" : "text-muted-foreground")}>{g.count}</span>
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
        "flex w-full group/msg",
        isOwn ? "justify-start max-[1300px]:justify-end max-[1300px]:pr-4" : "justify-start",
        selectionMode && "cursor-pointer"
      )}
      onClick={() => selectionMode && onToggleSelection(msg.id)}
    >
      {selectionMode && (
        <div className="flex items-center justify-center w-12 shrink-0 animate-in fade-in slide-in-from-left-2 duration-200">
          <div className={cn(
            "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
            isSelected 
              ? "bg-primary border-primary text-primary-foreground" 
              : "border-muted-foreground/30 bg-transparent"
          )}>
            {isSelected && <CheckSquare className="h-3.5 w-3.5" />}
          </div>
        </div>
      )}
      <div 
        onContextMenu={(e) => !selectionMode && onContextMenu(e, msg)}
        className={cn(
          "max-w-[85%] max-[1300px]:max-w-[90%] rounded-[1.25rem] flex flex-col justify-center relative group min-w-[110px] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          isPhotoOnly 
            ? "bg-transparent shadow-none p-0 overflow-hidden" 
            : cn("px-[1.125rem] py-[0.625rem] shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08)] ring-1 ring-inset", isOwn ? "bg-bubble-outgoing text-bubble-outgoing-text pr-[2.5rem] ring-black/5 dark:ring-white/[0.08]" : "bg-bubble-incoming text-bubble-incoming-text pr-[3rem] ring-border/40"),
          isOwn ? "rounded-bl-[4px] max-[1300px]:rounded-bl-[1.25rem] max-[1300px]:rounded-br-[4px]" : "rounded-bl-[4px]",
          selectionMode && isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
        )}
      >
        {!isOwn && !isConsecutive && (
          <span className={cn(
            "text-xs text-primary mb-1 font-semibold truncate",
            isPhotoOnly && "px-4 pt-2"
          )}>
            {msg.sender_display_name || msg.sender_username}
          </span>
        )}
        {renderReplyPreview(msg, isOwn)}
        {renderContent()}

        <div className={cn(
          "absolute flex items-center gap-1.5 leading-none select-none transition-colors",
          isPhotoOnly 
            ? "bottom-3 right-3.5 px-1.5 py-0.5 rounded-full bg-black/30 backdrop-blur-md text-white shadow-sm" 
            : "bottom-1.5 right-3.5"
        )}>
          <p className={cn(
            "text-2xs",
            isPhotoOnly 
              ? "text-white/90" 
              : (isOwn ? "text-primary-foreground/70" : "text-muted-foreground")
          )}>
            {formatTime(msg.inserted_at)}
          </p>
          {msg.edited_at && msg.content && (
            <span className={cn(
              "text-2xs opacity-60 leading-none",
              isPhotoOnly && "text-white/70"
            )}>(ред.)</span>
          )}
          {isOwn && !isRoom && (
            <div className={cn(
              "shrink-0 ml-0.5",
              isPhotoOnly && "[&_svg]:text-white"
            )}>
              <StatusIcon status={msg.status} />
            </div>
          )}
        </div>
        
        <div className={cn(isPhotoOnly && messageReactions.length > 0 && "px-2 pb-2")}>
          {renderReactions()}
        </div>
      </div>
    </div>
  );
});

MessageItem.displayName = "MessageItem";
