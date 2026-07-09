import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  CheckSquare,
  ChevronDown,
  Copy,
  Download,
  Edit2,
  Forward,
  Reply,
  Search,
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
const EXPANDED_REACTIONS = [
  { emoji: "❤️", keywords: ["heart", "love", "red heart"] },
  { emoji: "👍", keywords: ["thumbs up", "like", "approve"] },
  { emoji: "👎", keywords: ["thumbs down", "dislike"] },
  { emoji: "🔥", keywords: ["fire", "lit"] },
  { emoji: "🥰", keywords: ["smiling face with hearts", "love"] },
  { emoji: "👏", keywords: ["clap", "applause"] },
  { emoji: "😁", keywords: ["grin", "happy"] },
  { emoji: "🤔", keywords: ["thinking", "hmm"] },
  { emoji: "🤯", keywords: ["mind blown", "shocked"] },
  { emoji: "😱", keywords: ["scream", "surprised"] },
  { emoji: "🤬", keywords: ["swearing", "angry"] },
  { emoji: "😢", keywords: ["cry", "sad"] },
  { emoji: "🎉", keywords: ["party", "celebration"] },
  { emoji: "🤩", keywords: ["star struck", "wow"] },
  { emoji: "🤮", keywords: ["vomit", "sick"] },
  { emoji: "💩", keywords: ["poop"] },
  { emoji: "🙏", keywords: ["pray", "thanks"] },
  { emoji: "👌", keywords: ["ok", "perfect"] },
  { emoji: "🕊️", keywords: ["dove", "peace"] },
  { emoji: "🤡", keywords: ["clown"] },
  { emoji: "🥱", keywords: ["yawn", "tired"] },
  { emoji: "🥴", keywords: ["woozy", "dizzy"] },
  { emoji: "😍", keywords: ["heart eyes", "love"] },
  { emoji: "🐳", keywords: ["whale"] },
  { emoji: "❤️‍🔥", keywords: ["heart on fire", "passion"] },
  { emoji: "🌚", keywords: ["moon face"] },
  { emoji: "🌭", keywords: ["hot dog"] },
  { emoji: "💯", keywords: ["hundred", "perfect"] },
  { emoji: "🤣", keywords: ["rofl", "laugh"] },
  { emoji: "⚡", keywords: ["lightning", "zap"] },
  { emoji: "🍌", keywords: ["banana"] },
  { emoji: "🏆", keywords: ["trophy", "winner"] },
  { emoji: "💔", keywords: ["broken heart", "sad"] },
  { emoji: "🧐", keywords: ["monocle", "inspect"] },
  { emoji: "😐", keywords: ["neutral"] },
  { emoji: "🍓", keywords: ["strawberry"] },
  { emoji: "🍾", keywords: ["champagne", "celebrate"] },
  { emoji: "💋", keywords: ["kiss"] },
  { emoji: "🖕", keywords: ["middle finger"] },
  { emoji: "😈", keywords: ["devil", "smirk"] },
  { emoji: "😴", keywords: ["sleep"] },
  { emoji: "😭", keywords: ["sob", "crying"] },
  { emoji: "🤓", keywords: ["nerd"] },
  { emoji: "👻", keywords: ["ghost"] },
  { emoji: "👀", keywords: ["eyes", "look"] },
  { emoji: "🎃", keywords: ["pumpkin", "halloween"] },
  { emoji: "🙈", keywords: ["see no evil", "monkey"] },
  { emoji: "😇", keywords: ["angel"] },
  { emoji: "😨", keywords: ["fearful"] },
  { emoji: "🤝", keywords: ["handshake", "deal"] },
  { emoji: "✍️", keywords: ["writing", "note"] },
  { emoji: "🤗", keywords: ["hug"] },
  { emoji: "🫡", keywords: ["salute"] },
  { emoji: "🎅", keywords: ["santa"] },
  { emoji: "🎄", keywords: ["christmas tree"] },
  { emoji: "⛄", keywords: ["snowman"] },
  { emoji: "💅", keywords: ["nails", "sass"] },
  { emoji: "🤪", keywords: ["zany", "crazy"] },
  { emoji: "🗿", keywords: ["moai", "stone"] },
  { emoji: "🦄", keywords: ["unicorn"] },
  { emoji: "😘", keywords: ["kiss face"] },
  { emoji: "💊", keywords: ["pill", "medicine"] },
  { emoji: "🙊", keywords: ["speak no evil", "monkey"] },
  { emoji: "😎", keywords: ["cool", "sunglasses"] },
  { emoji: "👾", keywords: ["alien monster", "game"] },
  { emoji: "🤷‍♂️", keywords: ["man shrug"] },
  { emoji: "🤷", keywords: ["shrug"] },
  { emoji: "🤷‍♀️", keywords: ["woman shrug"] },
  { emoji: "😡", keywords: ["pouting", "angry"] },
];
const VIEWPORT_MARGIN = 8;
const POPUP_REACTION_OFFSET_LEFT = 82;
const POPUP_REACTION_OFFSET_TOP = 48;
const POPUP_AVOIDANCE_GAP = 8;
const REACTION_STRIP_WIDTH = 298;

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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
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
  const popupWidth = Math.max(menuWidth + POPUP_REACTION_OFFSET_LEFT, REACTION_STRIP_WIDTH);
  const popupHeight = menuHeight + POPUP_REACTION_OFFSET_TOP;

  const buildPopupRect = (left: number, top: number): Rect => ({
    left: left - POPUP_REACTION_OFFSET_LEFT,
    top: top - POPUP_REACTION_OFFSET_TOP,
    right: left - POPUP_REACTION_OFFSET_LEFT + popupWidth,
    bottom: top - POPUP_REACTION_OFFSET_TOP + popupHeight,
    width: popupWidth,
    height: popupHeight,
  });

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

  const avoidRect = bubbleRect ?? contentRect ?? {
    left: x,
    top: y,
    right: x,
    bottom: y,
    width: 0,
    height: 0,
  };
  const contentAreaRect = contentRect ?? avoidRect;
  const preferredSide = isOwn ? "left" : "right";
  const preferredTop = clamp(y - 24, minTop, maxTop);
  const sideOrder = preferredSide === "left" ? ["left", "right"] : ["right", "left"];
  const candidatePositions = [
    ...sideOrder.map((side) => ({
      side,
      left: clamp(
        side === "left"
          ? avoidRect.left - menuWidth - POPUP_AVOIDANCE_GAP
          : avoidRect.right + POPUP_AVOIDANCE_GAP + POPUP_REACTION_OFFSET_LEFT,
        minLeft,
        maxLeft,
      ),
      top: preferredTop,
      clampDelta: Math.abs(
        (
          side === "left"
            ? avoidRect.left - menuWidth - POPUP_AVOIDANCE_GAP
            : avoidRect.right + POPUP_AVOIDANCE_GAP + POPUP_REACTION_OFFSET_LEFT
        ) - clamp(
          side === "left"
            ? avoidRect.left - menuWidth - POPUP_AVOIDANCE_GAP
            : avoidRect.right + POPUP_AVOIDANCE_GAP + POPUP_REACTION_OFFSET_LEFT,
          minLeft,
          maxLeft,
        ),
      ),
    })),
    {
      side: "below",
      left: clamp(isOwn ? avoidRect.right - menuWidth : avoidRect.left, minLeft, maxLeft),
      top: clamp(avoidRect.bottom + POPUP_AVOIDANCE_GAP, minTop, maxTop),
      clampDelta: Math.abs(
        (avoidRect.bottom + POPUP_AVOIDANCE_GAP) - clamp(avoidRect.bottom + POPUP_AVOIDANCE_GAP, minTop, maxTop),
      ),
    },
    {
      side: "above",
      left: clamp(isOwn ? avoidRect.right - menuWidth : avoidRect.left, minLeft, maxLeft),
      top: clamp(avoidRect.top - menuHeight - POPUP_AVOIDANCE_GAP, minTop, maxTop),
      clampDelta: Math.abs(
        (avoidRect.top - menuHeight - POPUP_AVOIDANCE_GAP) - clamp(avoidRect.top - menuHeight - POPUP_AVOIDANCE_GAP, minTop, maxTop),
      ),
    },
    {
      side: "fallback",
      left: clamp(x, minLeft, maxLeft),
      top: clamp(y, minTop, maxTop),
      clampDelta: 0,
    },
  ];

  const candidates = candidatePositions.map(({ side, left, top, clampDelta }) => {
    const rect = buildPopupRect(left, top);

    return {
      side,
      left,
      top,
      intersectsText: intersects(rect, contentAreaRect),
      overlapArea: intersectionArea(rect, contentAreaRect),
      bubbleOverlapArea: intersectionArea(rect, avoidRect),
      distanceToClick: Math.abs(left - x) + Math.abs(top - y),
      clampDelta,
    };
  });

  candidates.sort((a, b) => {
    if (a.bubbleOverlapArea !== b.bubbleOverlapArea) {
      return a.bubbleOverlapArea - b.bubbleOverlapArea;
    }
    if (a.intersectsText !== b.intersectsText) {
      return Number(a.intersectsText) - Number(b.intersectsText);
    }
    if (a.overlapArea !== b.overlapArea) {
      return a.overlapArea - b.overlapArea;
    }
    if (a.distanceToClick !== b.distanceToClick) {
      return a.distanceToClick - b.distanceToClick;
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
  const [searchQuery, setSearchQuery] = useState("");

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
    const handleScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) {
        return;
      }
      onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [onClose]);

  useEffect(() => {
    setSearchQuery("");
  }, [data.msgId, isPickerExpanded]);

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

  const filteredReactions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return EXPANDED_REACTIONS;

    return EXPANDED_REACTIONS.filter((reaction) =>
      reaction.emoji.includes(query) ||
      reaction.keywords.some((keyword) => keyword.includes(query)),
    );
  }, [searchQuery]);

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
        className={cn(
          "absolute left-[-82px] top-[-48px] z-[2] w-[298px] overflow-visible bg-transparent transition-[height] duration-150 ease-[cubic-bezier(0.2,0,0.2,1)] motion-reduce:transition-none",
          isPickerExpanded ? "h-[358px]" : "h-10",
        )}
        style={{ transformOrigin: "top center" }}
        data-testid="message-context-reactions"
      >
        {isPickerExpanded ? (
          <div
            className="h-[358px] min-w-[216px] w-[298px] overflow-visible rounded-[20px] border-0 bg-transparent opacity-100 shadow-[0px_12px_24px_-14px_rgba(0,0,0,0.72)] outline-none transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.2,0,0.2,1)] motion-reduce:transition-none"
            style={{ transform: "translateY(0)" }}
            data-testid="message-context-expanded-picker"
          >
            <div className="h-full w-full overflow-hidden rounded-[20px] bg-[rgba(33,33,33,0.867)] supports-[backdrop-filter]:backdrop-blur-[25px]">
              <div
                className="px-2 pb-2 pt-2"
                data-testid="message-context-expanded-picker-search-wrap"
              >
                <label className="flex h-9 w-full items-center gap-2 rounded-[18px] border-0 bg-black/20 px-3 text-[#aaaaaa] shadow-none outline-none ring-0 transition-colors duration-150 focus-within:bg-black/28 focus-within:shadow-none focus-within:outline-none focus-within:ring-0">
                  <Search className="h-4 w-4 shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      if (event.key !== "Escape") {
                        event.stopPropagation();
                      }
                    }}
                    placeholder="Search"
                    className="h-full w-full appearance-none border-0 bg-transparent px-0 text-sm text-white shadow-none outline-none ring-0 placeholder:text-[#aaaaaa] focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                    data-testid="message-context-expanded-picker-search"
                  />
                </label>
              </div>
              <div
                className="grid h-[calc(358px-52px)] grid-cols-[repeat(auto-fit,minmax(36px,1fr))] content-start gap-2 overflow-y-auto px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                data-testid="message-context-expanded-picker-grid"
              >
                {filteredReactions.length > 0 ? (
                  filteredReactions.map((reaction, index) => (
                    <button
                      key={`${reaction.emoji}-${index}`}
                      type="button"
                      onClick={() => {
                        onToggleReaction(data.msgId, reaction.emoji);
                        onClose();
                      }}
                      className="inline-grid h-9 w-9 place-items-center rounded-[8px] text-[20px] text-white transition-colors duration-150 hover:bg-white/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      aria-label={`React with ${reaction.emoji}`}
                      data-testid="message-context-expanded-picker-button"
                    >
                      <Emoji emoji={reaction.emoji} size={20} />
                    </button>
                  ))
                ) : (
                  <div
                    className="col-span-full px-2 py-4 text-center text-sm text-white/55"
                    data-testid="message-context-expanded-picker-empty"
                  >
                    No reactions found
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div
            className="relative flex h-10 w-[298px] items-center overflow-visible rounded-[20px] bg-[rgba(33,33,33,0.867)] opacity-100 shadow-[0px_4px_2px_0px_rgba(16,16,16,0.61)] transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.2,0,0.2,1)] motion-reduce:transition-none supports-[backdrop-filter]:backdrop-blur-[25px]"
            style={{ transform: "translateY(0)" }}
            data-testid="message-context-reactions-surface"
          >
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
                onClick={() => setIsPickerExpanded(true)}
                className="ml-1 mr-[-2px] inline-flex h-8 w-8 items-center justify-center rounded-full bg-transparent p-0 text-[#aaaaaa] transition-colors duration-150 hover:bg-white/8 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                aria-label="Show more reactions"
                data-testid="message-context-reaction-more"
              >
                <ChevronDown className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}
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
