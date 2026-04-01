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
      style={{ top: data.y, left: data.x }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Reactions bar */}
      <div className="flex items-center border-b border-border px-1 py-1">
        <div className="flex flex-1 items-center gap-1">
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => { onToggleReaction(data.msgId, e); onClose(); }}
              className="p-1 flex items-center justify-center hover:bg-accent"
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

      <div className="relative min-h-[200px]">
        {!isPickerExpanded && (
          <div className="flex flex-col p-1">
            <button
              onClick={() => { onReply(); onClose(); }}
              className="flex items-center w-full px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <Reply className="h-4 w-4 mr-3 text-muted-foreground" />
              Reply
            </button>

            {data.hasText && (
              <button
                onClick={() => { onCopy(); onClose(); }}
                className="flex items-center w-full px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <Copy className="h-4 w-4 mr-3 text-muted-foreground" />
                Copy
              </button>
            )}

            <button
              onClick={() => { onForward(); onClose(); }}
              className="flex items-center w-full px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <Forward className="h-4 w-4 mr-3 text-muted-foreground" />
              Forward
            </button>

            <button
              onClick={() => { onSelect(); onClose(); }}
              className="flex items-center w-full px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <CheckSquare className="h-4 w-4 mr-3 text-muted-foreground" />
              Select
            </button>

            {data.isOwn && (
              <>
                {canEdit && (
                  <button
                    onClick={() => { onEdit(); onClose(); }}
                    className="flex items-center w-full px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <Edit2 className="h-4 w-4 mr-3 text-muted-foreground" />
                    Edit
                  </button>
                )}

                <div className="border-t border-border my-1" />

                <button
                  onClick={() => { onDelete(); onClose(); }}
                  className="flex items-center w-full px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4 mr-3" />
                  Delete
                </button>
              </>
            )}
          </div>
        )}

        {isPickerExpanded && (
          <div ref={pickerRef} className="h-[300px]">
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