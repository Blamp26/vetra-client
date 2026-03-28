import { ChevronDown, ChevronUp, Reply, Copy, Forward, CheckSquare, Edit2, Trash2 } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { Emoji } from "@/shared/components/Emoji/Emoji";
import EmojiPicker, { Theme, EmojiStyle } from 'emoji-picker-react';

interface ContextMenuData {
  msgId:    number;
  content:  string | null;
  x:        number;
  y:        number;
  isOwn:    boolean;
  hasText:  boolean;
  author:   string;
}

interface MessageContextMenuProps {
  data: ContextMenuData;
  isPickerExpanded: boolean;
  setIsPickerExpanded: (expanded: boolean) => void;
  onToggleReaction: (msgId: number, emoji: string) => void;
  onReply: () => void;
  onCopy: () => void;
  onForward: () => void;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  canEdit: boolean;
  onClose: () => void;
}

const EMOJIS = ["👍","❤️","😂","🎉","😮","😢","🔥"];

export function MessageContextMenu({
  data,
  isPickerExpanded,
  setIsPickerExpanded,
  onToggleReaction,
  onReply,
  onCopy,
  onForward,
  onSelect,
  onEdit,
  onDelete,
  canEdit,
  onClose
}: MessageContextMenuProps) {
  return (
    <div
      className="fixed z-[1000] bg-popover/95 backdrop-blur-md border border-border/50 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] animate-in fade-in zoom-in-95 duration-150 flex flex-col overflow-hidden w-[260px] h-[320px]"
      style={{
        top: data.y,
        left: data.x,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Панель реакций */}
      <div className="flex flex-col border-b border-border/40 shrink-0">
        <div className="flex items-center px-2 py-1 min-h-[46px]">
          <div className="flex flex-1 items-center justify-start gap-0.5">
            {EMOJIS.slice(0, 6).map((e) => (
              <button
                key={e}
                onClick={() => {
                  onToggleReaction(data.msgId, e);
                  onClose();
                }}
                className="bg-transparent border-none cursor-pointer p-0 rounded-lg transition-all duration-150 hover:bg-accent hover:scale-125 active:scale-90 flex items-center justify-center w-8 h-8"
              >
                <Emoji emoji={e} size={20} />
              </button>
            ))}
          </div>
          <div className="w-[1px] h-5 bg-border/40 mx-1" />
          <button 
            onClick={() => setIsPickerExpanded(!isPickerExpanded)}
            className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors flex items-center justify-center w-8 h-8 shrink-0"
          >
            {isPickerExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {/* Список пунктов меню */}
        <div className={cn(
          "absolute inset-0 flex flex-col p-1.5 transition-all duration-200 bg-popover/95",
          isPickerExpanded ? "opacity-0 pointer-events-none translate-x-[-10px]" : "opacity-100 translate-x-0"
        )}>
          <button
            onClick={onReply}
            className="group flex items-center w-full px-3 py-2 text-left bg-transparent border-none text-popover-foreground text-[0.9rem] rounded-lg cursor-pointer hover:bg-accent transition-all duration-120"
          >
            <Reply className="h-[18px] w-[18px] mr-3 text-muted-foreground group-hover:text-foreground transition-colors" />
            <span>Reply</span>
          </button>
          
          {data.hasText && (
            <button
              onClick={onCopy}
              className="group flex items-center w-full px-3 py-2 text-left bg-transparent border-none text-popover-foreground text-[0.9rem] rounded-lg cursor-pointer hover:bg-accent transition-all duration-120"
            >
              <Copy className="h-[18px] w-[18px] mr-3 text-muted-foreground group-hover:text-foreground transition-colors" />
              <span>Copy</span>
            </button>
          )}

          <button
            onClick={onForward}
            className="group flex items-center w-full px-3 py-2 text-left bg-transparent border-none text-popover-foreground text-[0.9rem] rounded-lg cursor-pointer hover:bg-accent transition-all duration-120"
          >
            <Forward className="h-[18px] w-[18px] mr-3 text-muted-foreground group-hover:text-foreground transition-colors" />
            <span>Forward</span>
          </button>

          <button
            onClick={onSelect}
            className="group flex items-center w-full px-3 py-2 text-left bg-transparent border-none text-popover-foreground text-[0.9rem] rounded-lg cursor-pointer hover:bg-accent transition-all duration-120"
          >
            <CheckSquare className="h-[18px] w-[18px] mr-3 text-muted-foreground group-hover:text-foreground transition-colors" />
            <span>Select</span>
          </button>

          {data.isOwn && (
            <>
              {canEdit && (
                <button
                  onClick={onEdit}
                  className="group flex items-center w-full px-3 py-2 text-left bg-transparent border-none text-popover-foreground text-[0.9rem] rounded-lg cursor-pointer hover:bg-accent transition-all duration-120"
                >
                  <Edit2 className="h-[18px] w-[18px] mr-3 text-muted-foreground group-hover:text-foreground transition-colors" />
                  <span>Edit</span>
                </button>
              )}
              
              <div className="h-[1px] bg-border/40 my-1 mx-2" />
              
              <button
                onClick={onDelete}
                className="group flex items-center w-full px-3 py-2 text-left bg-transparent border-none text-destructive text-[0.9rem] rounded-lg cursor-pointer hover:bg-destructive/10 transition-all duration-120"
              >
                <Trash2 className="h-[18px] w-[18px] mr-3 text-destructive transition-colors" />
                <span>Delete</span>
              </button>
            </>
          )}
        </div>

        {/* Эмодзи пикер */}
        <div className={cn(
          "absolute inset-0 transition-all duration-200 bg-popover",
          isPickerExpanded ? "opacity-100 translate-x-0" : "opacity-0 pointer-events-none translate-x-[10px]"
        )}>
          <style>{`
            .epr-category-nav { display: none !important; }
            .epr-skin-tone-picker { display: none !important; }
            .EmojiPickerReact { border: none !important; box-shadow: none !important; }
            .epr-body::-webkit-scrollbar { display: none !important; }
            .epr-body { -ms-overflow-style: none !important; scrollbar-width: none !important; }
          `}</style>
          <EmojiPicker
            width="100%"
            height="100%"
            onEmojiClick={(emojiData) => {
              onToggleReaction(data.msgId, emojiData.emoji);
              onClose();
            }}
            theme={Theme.AUTO}
            emojiStyle={EmojiStyle.APPLE}
            lazyLoadEmojis={true}
            searchPlaceHolder="Поиск..."
            previewConfig={{ showPreview: false }}
            skinTonesDisabled={true}
            searchDisabled={false}
            skinTonePickerLocation={'NONE' as any}
            suggestedEmojisMode={'none' as any}
          />
        </div>
      </div>
    </div>
  );
}
