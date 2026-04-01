import { useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, Reply, Copy, Forward, CheckSquare, Edit2, Trash2 } from "lucide-react";
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
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPickerExpanded || !pickerRef.current) return;

    const addAttributes = () => {
      const input = pickerRef.current?.querySelector('input[aria-label*="search"], input[type="text"]');
      if (input) {
        if (!input.getAttribute('id')) input.setAttribute('id', 'emoji-search-input-ctx');
        if (!input.getAttribute('name')) input.setAttribute('name', 'emoji-search-ctx');
      }
    };

    addAttributes();
    const observer = new MutationObserver(addAttributes);
    observer.observe(pickerRef.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [isPickerExpanded]);

  return (
    <div
      className="fixed z-floating bg-popover border border-border flex flex-col w-64"
      style={{
        top: data.y,
        left: data.x,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Reactions panel */}
      <div className="flex flex-col border-b border-border">
        <div className="flex items-center px-1 py-1">
          <div className="flex flex-1 items-center justify-start gap-1">
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => {
                  onToggleReaction(data.msgId, e);
                  onClose();
                }}
                className="bg-transparent border border-transparent p-1 flex items-center justify-center hover:border-border"
              >
                <Emoji emoji={e} size={18} />
              </button>
            ))}
          </div>
          <div className="border-l border-border h-4 mx-1" />
          <button 
            onClick={() => setIsPickerExpanded(!isPickerExpanded)}
            className="p-1 text-muted-foreground hover:text-foreground"
          >
            {isPickerExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="relative min-h-[200px]">
        {/* Menu items list */}
        {!isPickerExpanded && (
          <div className="flex flex-col p-1">
            <button
              onClick={() => { onReply(); onClose(); }}
              className="flex items-center w-full px-3 py-2 text-left bg-transparent border-none text-popover-foreground text-sm hover:bg-accent"
            >
              <Reply className="h-4 w-4 mr-3 text-muted-foreground" />
              <span>Reply</span>
            </button>
            
            {data.hasText && (
              <button
                onClick={() => { onCopy(); onClose(); }}
                className="flex items-center w-full px-3 py-2 text-left bg-transparent border-none text-popover-foreground text-sm hover:bg-accent"
              >
                <Copy className="h-4 w-4 mr-3 text-muted-foreground" />
                <span>Copy</span>
              </button>
            )}

            <button
              onClick={() => { onForward(); onClose(); }}
              className="flex items-center w-full px-3 py-2 text-left bg-transparent border-none text-popover-foreground text-sm hover:bg-accent"
            >
              <Forward className="h-4 w-4 mr-3 text-muted-foreground" />
              <span>Forward</span>
            </button>

            <button
              onClick={() => { onSelect(); onClose(); }}
              className="flex items-center w-full px-3 py-2 text-left bg-transparent border-none text-popover-foreground text-sm hover:bg-accent"
            >
              <CheckSquare className="h-4 w-4 mr-3 text-muted-foreground" />
              <span>Select</span>
            </button>

            {data.isOwn && (
              <>
                {canEdit && (
                  <button
                    onClick={() => { onEdit(); onClose(); }}
                    className="flex items-center w-full px-3 py-2 text-left bg-transparent border-none text-popover-foreground text-sm hover:bg-accent"
                  >
                    <Edit2 className="h-4 w-4 mr-3 text-muted-foreground" />
                    <span>Edit</span>
                  </button>
                )}
                
                <div className="border-t border-border my-1" />
                
                <button
                  onClick={() => { onDelete(); onClose(); }}
                  className="flex items-center w-full px-3 py-2 text-left bg-transparent border-none text-destructive text-sm hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4 mr-3 text-destructive" />
                  <span>Delete</span>
                </button>
              </>
            )}
          </div>
        )}

        {/* Emoji picker */}
        {isPickerExpanded && (
          <div 
            ref={pickerRef}
            className="h-[300px] bg-popover"
          >
            <style>{`
              .EmojiPickerReact { 
                border: none !important; 
                box-shadow: none !important; 
                display: block !important;
                height: 100% !important;
                background: transparent !important;
              }
              .epr-main { display: block !important; }
              .epr-header { padding: 8px !important; background: var(--card) !important; }
              .epr-search-container { background-color: var(--card) !important; }
              .EmojiPickerReact {
                --epr-bg-color: var(--card) !important;
                --epr-category-label-bg-color: var(--card) !important;
                --epr-text-color: var(--foreground) !important;
                --epr-search-input-bg-color: var(--muted) !important;
                --epr-search-input-text-color: var(--foreground) !important;
              }
              .epr-body { padding: 0 8px !important; }
              .epr-header-overlay, .epr-category-nav, .epr-skin-tone-picker { display: none !important; }
              .epr-emoji-category-label { position: static !important; font-size: 10px !important; font-weight: bold !important; text-transform: uppercase !important; }
              .EmojiPickerReact input { border: 1px solid var(--border) !important; }
              .EmojiPickerReact::-webkit-scrollbar { display: none !important; }
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
              searchPlaceholder="Search..."
              previewConfig={{ showPreview: false }}
              skinTonesDisabled={true}
            />
          </div>
        )}
      </div>
    </div>
  );
}
