import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  bubbleRect?: Rect;
  contentRect?: Rect;
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
  canForward: boolean;
  onClose: () => void;
}

const EMOJIS = ["👍","❤️","😂","🎉","😮","😢","🔥"];
const VIEWPORT_MARGIN = 8;

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

function intersects(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function intersectionArea(a: Rect, b: Rect): number {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
}

export function calculateContextMenuPosition({
  x,
  y,
  menuWidth,
  menuHeight,
  viewportWidth,
  viewportHeight,
  bubbleRect,
  contentRect,
  isOwn,
}: {
  x: number;
  y: number;
  menuWidth: number;
  menuHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  bubbleRect?: Rect;
  contentRect?: Rect;
  isOwn: boolean;
}) {
  if (!bubbleRect && !contentRect) {
    let left = x;
    let top = y;

    if (left + menuWidth > viewportWidth - VIEWPORT_MARGIN) {
      left = x - menuWidth;
    }

    if (top + menuHeight > viewportHeight - VIEWPORT_MARGIN) {
      top = y - menuHeight;
    }

    left = Math.min(Math.max(VIEWPORT_MARGIN, left), Math.max(VIEWPORT_MARGIN, viewportWidth - menuWidth - VIEWPORT_MARGIN));
    top = Math.min(Math.max(VIEWPORT_MARGIN, top), Math.max(VIEWPORT_MARGIN, viewportHeight - menuHeight - VIEWPORT_MARGIN));

    return { left, top };
  }

  const anchorRect = contentRect ?? bubbleRect ?? {
    left: x,
    top: y,
    right: x,
    bottom: y,
    width: 0,
    height: 0,
  };
  const contentAreaRect = contentRect ?? anchorRect;
  const minLeft = VIEWPORT_MARGIN;
  const maxLeft = Math.max(VIEWPORT_MARGIN, viewportWidth - menuWidth - VIEWPORT_MARGIN);
  const minTop = VIEWPORT_MARGIN;
  const maxTop = Math.max(VIEWPORT_MARGIN, viewportHeight - menuHeight - VIEWPORT_MARGIN);
  const preferredTop = anchorRect.top + menuHeight <= viewportHeight - VIEWPORT_MARGIN
    ? anchorRect.top
    : anchorRect.bottom - menuHeight;
  const top = Math.min(Math.max(minTop, preferredTop), maxTop);
  const preferredSide = isOwn ? "left" : "right";
  const sideOrder = preferredSide === "left" ? ["left", "right"] : ["right", "left"];

  const candidates = sideOrder.map((side) => {
    const baseLeft = side === "left" ? anchorRect.left - menuWidth : anchorRect.right;
    const left = Math.min(Math.max(minLeft, baseLeft), maxLeft);
    const rect = {
      left,
      top,
      right: left + menuWidth,
      bottom: top + menuHeight,
      width: menuWidth,
      height: menuHeight,
    };

    return {
      side,
      left,
      top,
      intersectsText: intersects(rect, contentAreaRect),
      overlapArea: intersectionArea(rect, contentAreaRect),
      clampDelta: Math.abs(left - baseLeft),
    };
  });

  candidates.sort((a, b) => {
    if (a.intersectsText !== b.intersectsText) {
      return Number(a.intersectsText) - Number(b.intersectsText);
    }
    if (a.overlapArea !== b.overlapArea) {
      return a.overlapArea - b.overlapArea;
    }
    if (a.side !== b.side) {
      return a.side === preferredSide ? -1 : 1;
    }
    return a.clampDelta - b.clampDelta;
  });

  return { left: candidates[0].left, top: candidates[0].top };
}

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
  canForward,
  onClose
}: MessageContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: data.x, top: data.y });

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    const { width, height } = menu.getBoundingClientRect();
    setPosition(
      calculateContextMenuPosition({
        x: data.x,
        y: data.y,
        menuWidth: width,
        menuHeight: height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        bubbleRect: data.bubbleRect,
        contentRect: data.contentRect,
        isOwn: data.isOwn,
      }),
    );
  }, [data.x, data.y, data.bubbleRect, data.contentRect, isPickerExpanded, data.isOwn, data.hasText, canEdit, canForward]);

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
      ref={menuRef}
      data-testid="message-context-menu"
      className="fixed z-floating bg-popover border border-border flex flex-col w-64"
      style={{ top: position.top, left: position.left }}
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
              onClick={() => {
                if (!canForward) return;
                onForward();
                onClose();
              }}
              disabled={!canForward}
              title={!canForward ? "Messages with attachments cannot be forwarded yet." : undefined}
              className="flex items-center w-full px-3 py-2 text-left text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Forward className="h-4 w-4 mr-3 text-muted-foreground" />
              {canForward ? "Forward" : "Forward unavailable for attachments"}
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
