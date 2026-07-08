import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  CheckSquare,
  Copy,
  Download,
  Edit2,
  Ellipsis,
  Forward,
  Reply,
  Trash2,
} from "lucide-react";
import { Emoji } from "@/shared/components/Emoji/Emoji";
import { cn } from "@/shared/utils/cn";

interface ContextMenuData {
  msgId: number;
  content: string | null;
  x: number;
  y: number;
  isOwn: boolean;
  hasText: boolean;
  hasAttachment: boolean;
  author: string;
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
  onDownload: () => void;
  onForward: () => void;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  canReply: boolean;
  canEdit: boolean;
  canForward: boolean;
  canDownload: boolean;
  onClose: () => void;
}

const EMOJIS = ["👍", "❤️", "😂", "🎉", "😮", "😢", "🔥"];
const VIEWPORT_MARGIN = 8;
const POPUP_REACTION_OFFSET_LEFT = 82;
const POPUP_REACTION_OFFSET_TOP = 48;

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
  const minLeft = VIEWPORT_MARGIN + POPUP_REACTION_OFFSET_LEFT;
  const maxLeft = Math.max(
    minLeft,
    viewportWidth - menuWidth - VIEWPORT_MARGIN,
  );
  const minTop = VIEWPORT_MARGIN + POPUP_REACTION_OFFSET_TOP;
  const maxTop = Math.max(VIEWPORT_MARGIN, viewportHeight - menuHeight - VIEWPORT_MARGIN);

  if (!bubbleRect && !contentRect) {
    let left = x;
    let top = y;

    if (left + menuWidth > viewportWidth - VIEWPORT_MARGIN) {
      left = x - menuWidth;
    }

    if (top + menuHeight > viewportHeight - VIEWPORT_MARGIN) {
      top = y - menuHeight;
    }

    return {
      left: Math.min(Math.max(minLeft, left), maxLeft),
      top: Math.min(Math.max(minTop, top), maxTop),
    };
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

type ActionRow = {
  key: string;
  label: string;
  icon: typeof Reply;
  onSelect?: () => void;
  disabled?: boolean;
  hidden?: boolean;
  destructive?: boolean;
  title?: string;
  ariaLabel?: string;
};

export function MessageContextMenu({
  data,
  isPickerExpanded,
  setIsPickerExpanded,
  onToggleReaction,
  onReply,
  onCopy,
  onDownload,
  onForward,
  onSelect,
  onEdit,
  onDelete,
  canReply,
  canEdit,
  canForward,
  canDownload,
  onClose,
}: MessageContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
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
  }, [data, isPickerExpanded, canReply, canEdit, canForward, canDownload]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    const handleScroll = () => onClose();

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [onClose]);

  const actions = useMemo<ActionRow[]>(() => {
    const rows: ActionRow[] = [
      {
        key: "reply",
        label: "Reply",
        icon: Reply,
        onSelect: canReply ? onReply : undefined,
        hidden: !canReply,
      },
      {
        key: "copy",
        label: "Copy Text",
        icon: Copy,
        onSelect: data.hasText ? onCopy : undefined,
        hidden: !data.hasText,
      },
      {
        key: "download",
        label: "Download",
        icon: Download,
        onSelect: canDownload ? onDownload : undefined,
        hidden: !data.hasAttachment,
      },
      {
        key: "forward",
        label: canForward ? "Forward" : "Forward unavailable",
        icon: Forward,
        onSelect: canForward ? onForward : undefined,
        disabled: !canForward,
        title: !canForward ? "Messages with attachments cannot be forwarded yet." : undefined,
        ariaLabel: canForward ? "Forward" : "Forward unavailable for attachments",
      },
      {
        key: "select",
        label: "Select",
        icon: CheckSquare,
        onSelect,
      },
      {
        key: "edit",
        label: "Edit",
        icon: Edit2,
        onSelect: canEdit ? onEdit : undefined,
        hidden: !canEdit,
      },
      {
        key: "delete",
        label: "Delete",
        icon: Trash2,
        onSelect: data.isOwn ? onDelete : undefined,
        hidden: !data.isOwn,
        destructive: true,
      },
    ];

    return rows.filter((row) => !row.hidden);
  }, [canDownload, canEdit, canForward, canReply, data.hasAttachment, data.hasText, data.isOwn, onCopy, onDelete, onDownload, onEdit, onForward, onReply, onSelect]);

  return (
    <div
      ref={menuRef}
      data-testid="message-context-menu"
      role="presentation"
      aria-label={`Message actions for ${data.author}`}
      className="fixed z-floating flex min-h-[248px] w-[216px] min-w-[216px] flex-col overflow-visible rounded-[16px] bg-transparent opacity-100 transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.2,0,0.2,1)]"
      style={{ top: position.top, left: position.left }}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        className="absolute left-[-82px] top-0 z-[1] h-10 w-[298px] overflow-visible bg-transparent"
        style={{ transform: "translateY(-48px)" }}
        data-testid="message-context-reactions"
      >
        <div
          className="relative flex h-10 w-[298px] items-center overflow-visible rounded-[20px] bg-[rgba(33,33,33,0.867)] shadow-[0px_4px_2px_0px_rgba(16,16,16,0.61)] supports-[backdrop-filter]:backdrop-blur-[25px]"
          data-testid="message-context-reactions-surface"
        >
          <div
            className="absolute bottom-[-8px] right-[18px] h-2 w-4 rounded-b-[16px] bg-[rgba(33,33,33,0.867)] shadow-[0px_4px_2px_0px_rgba(16,16,16,0.61)] supports-[backdrop-filter]:backdrop-blur-[25px]"
            data-testid="message-context-reaction-tail-large"
          />
          <div
            className="absolute bottom-[-20px] right-[18px] h-2 w-2 rounded-full bg-[rgba(33,33,33,0.867)] shadow-[0px_4px_2px_0px_rgba(16,16,16,0.61)] supports-[backdrop-filter]:backdrop-blur-[25px]"
            data-testid="message-context-reaction-tail-small"
          />
          <div className="flex h-full w-full items-center px-2" data-testid="message-context-reaction-items">
            {EMOJIS.map((emoji, index) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onToggleReaction(data.msgId, emoji);
                  onClose();
                }}
                className={cn(
                  "relative inline-flex h-8 min-h-8 w-8 min-w-8 items-center justify-center rounded-full text-[18px] transition-colors duration-150 hover:bg-white/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                  index === 0 ? "ml-0" : "ml-1",
                )}
                aria-label={`React with ${emoji}`}
                data-testid="message-context-reaction-button"
              >
                <Emoji emoji={emoji} size={18} />
              </button>
            ))}
            <button
              type="button"
              onClick={() => setIsPickerExpanded(!isPickerExpanded)}
              className="ml-1 mr-[-2px] inline-flex h-8 w-8 items-center justify-center rounded-full bg-transparent p-0 text-[#aaaaaa] transition-colors duration-150 hover:bg-white/8 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              aria-label={isPickerExpanded ? "Hide more reactions" : "Show more reactions"}
              data-testid="message-context-reaction-more"
            >
              <Ellipsis className="h-6 w-6" />
            </button>
          </div>
        </div>
      </div>

      <div
        className="mr-[44px] flex min-h-[248px] w-[172px] overflow-y-auto rounded-[16px] bg-[rgba(33,33,33,0.867)] py-1 shadow-[0px_4px_8px_2px_rgba(16,16,16,0.61)] supports-[backdrop-filter]:backdrop-blur-[10px]"
        role="menu"
        aria-label={`Message actions for ${data.author}`}
        data-testid="message-context-surface"
      >
        <div className="flex w-full flex-col" data-testid="message-context-actions">
          {actions.map((action) => {
            const Icon = action.icon;
            const isDestructive = Boolean(action.destructive);
            const isDisabled = Boolean(action.disabled);

            return (
              <div key={action.key}>
                <button
                  type="button"
                  role="menuitem"
                  disabled={isDisabled}
                  title={action.title}
                  aria-label={action.ariaLabel ?? action.label}
                  onClick={() => {
                    if (isDisabled || !action.onSelect) return;
                    action.onSelect();
                    onClose();
                  }}
                  className={cn(
                    "mx-1 my-[2px] flex h-8 w-[164px] items-center overflow-hidden rounded-[6px] px-[12px] py-1 pl-1 text-left text-[14px] font-medium leading-6 transition-[transform,background-color,color,opacity] duration-150 ease-in-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                    isDestructive
                      ? "text-[#e53935] hover:bg-[#e53935]/10"
                      : isDisabled
                        ? "cursor-not-allowed text-white/45"
                        : "text-white hover:bg-white/8",
                  )}
                  data-testid={`message-context-action-${action.key}`}
                >
                  <Icon
                    className={cn(
                      "mr-5 ml-2 h-5 w-5 shrink-0",
                      isDestructive
                        ? "text-[#e53935]"
                        : isDisabled
                          ? "text-white/35"
                          : "text-[#aaaaaa]",
                    )}
                  />
                  <span className="truncate">{action.label}</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
