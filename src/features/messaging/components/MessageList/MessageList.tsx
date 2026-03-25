import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { Message, MessageStatus, MessageReactionGroup } from "@/shared/types";
import { useAppStore, type RootState } from "@/store";
import { API_BASE_URL } from "@/api/base";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import { cn } from "@/shared/utils/cn";

interface Props {
  messages:      Message[];
  currentUserId: number;
  isLoading:     boolean;
  hasMore:       boolean;
  onLoadMore:    () => void;
  chatContext:
    | { type: "direct"; partnerId: number }
    | { type: "room";   roomId: number };
  onReply?: (target: { id: number; content: string; author: string }) => void;
}

function StatusIcon({ status }: { status?: MessageStatus }) {
  if (status === "error") {
    return (
      <svg className="ml-1" width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Error sending">
        <circle cx="7" cy="7" r="7" fill="#FF3B30" />
        <text x="7" y="11" textAnchor="middle" fontSize="9" fontWeight="700" fill="white" fontFamily="Inter, sans-serif">!</text>
      </svg>
    );
  }
  if (status === "sent" || status === "delivered") {
    return (
      <svg className={cn("ml-1", status === "sent" ? "text-[#7A7A7A]" : "text-[#5865F2]")} width="20" height="12" viewBox="-1 5 34 20" xmlns="http://www.w3.org/2000/svg" aria-label={status === "sent" ? "Sent" : "Delivered"}>
        <path fill="currentColor" d="M3 13 L8 18 L20 6 L23 9 L8 24 L0 16 Z" />
      </svg>
    );
  }
  return (
    <svg className="ml-1 text-[#5865F2]" width="20" height="12" viewBox="-1 5 34 20" xmlns="http://www.w3.org/2000/svg" aria-label="Read">
      <path fill="currentColor" d="M3 13 L8 18 L20 6 L23 9 L8 24 L0 16 Z" />
      <path fill="currentColor" d="M16 17 L17 18 L29 6 L32 9 L17 24 L13 20 Z" />
    </svg>
  );
}

interface ContextMenu {
  msgId:    number;
  content:  string | null;
  x:        number;
  y:        number;
  isOwn:    boolean;
  hasText:  boolean;
  author:   string;
}

export function MessageList({
  messages,
  currentUserId,
  isLoading,
  hasMore,
  onLoadMore,
  chatContext,
  onReply,
}: Props) {
  const bottomRef    = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isFirstLoad  = useRef(true);

  const socketManager = useAppStore((s: RootState) => s.socketManager);
  const deleteMessage = useAppStore((s: RootState) => s.deleteMessage);
  const deleteRoomMsg = useAppStore((s: RootState) => s.deleteRoomMessage);
  const setMessageReactions = useAppStore((s: RootState) => s.setMessageReactions);
  const messageReactions    = useAppStore((s: RootState) => s.messageReactions);
  const startEditing = useAppStore((s: RootState) => s.startEditing); 
  const activeChat = useAppStore((s: RootState) => s.activeChat);

  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [hoverMsgId,  setHoverMsgId]  = useState<number | null>(null);
  const [msgToDelete, setMsgToDelete] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const messageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const EMOJIS = ["👍","❤️","😂","🎉","😮"];

  const messagesById = useMemo(() => {
    const map = new Map<number, Message>();
    for (const m of messages) {
      map.set(m.id, m);
    }
    return map;
  }, [messages]);

  const toggleReaction = useCallback(async (msgId: number, emoji: string) => {
    if (!socketManager) return;
    try {
      if (chatContext.type === "room") {
        await socketManager.toggleReaction(chatContext.roomId, msgId, emoji);
      } else {
        await socketManager.toggleDirectReaction(chatContext.partnerId, msgId, emoji);
      }
    } catch (err) {
      console.error("Toggle reaction failed:", err);
    } finally {
      setContextMenu(null);
    }
  }, [socketManager, chatContext]);

  useEffect(() => {
    if (isFirstLoad.current && messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
      isFirstLoad.current = false;
    } else if (!isFirstLoad.current) {
      const el = containerRef.current;
      if (!el) return;
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      if (isNearBottom) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [contextMenu]);

  useEffect(() => {
    if (!socketManager) return;
    let unsub: (() => void) | undefined;
    
    if (chatContext.type === "room") {
      unsub = socketManager.onRoomReactionUpdated(chatContext.roomId, (p: { message_id: number; reactions: MessageReactionGroup[] }) => {
        setMessageReactions(p.message_id, p.reactions);
      });
    } else {
      unsub = socketManager.onDirectReactionUpdated((p: { message_id: number; reactions: MessageReactionGroup[] }) => {
        setMessageReactions(p.message_id, p.reactions);
      });
    }
    
    return () => { unsub?.(); };
  }, [socketManager, chatContext, setMessageReactions]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, msg: Message) => {
      e.preventDefault();

      const isOwn   = msg.sender_id === currentUserId;
      const hasText = (msg.content ?? "").trim().length > 0;
      const author  =
        msg.sender_display_name ||
        msg.sender_username ||
        `User #${msg.sender_id}`;

      // Подбери эти значения под свою реальную ширину/высоту меню
      const MENU_WIDTH  = 210; // ширина меню (с реакциями + пунктами)
      const MENU_HEIGHT = 188; // высота (с учётом всех элементов)

      let x = e.clientX;
      let y = e.clientY;

      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // ── Горизонталь: строго по требованию ─────────────────────────────
      if (x + MENU_WIDTH + 16 <= vw) {
        x += 8; // небольшой отступ справа от курсора
      } else {
        x -= MENU_WIDTH + 8; // строго слева от курсора
      }

      // ── Вертикаль (обычное поведение, можно оставить как есть) ───────
      if (y + MENU_HEIGHT + 16 <= vh) {
        y += 6;
      } else {
        y -= MENU_HEIGHT + 6;
      }

      // Финальная защита от вылезания за границы
      x = Math.max(12, Math.min(x, vw - MENU_WIDTH - 12));
      y = Math.max(12, Math.min(y, vh - MENU_HEIGHT - 12));

      setContextMenu({
        msgId:   msg.id,
        content: msg.content,
        x,
        y,
        isOwn,
        hasText,
        author,
      });
    },
    [currentUserId],
  );

  const handleEdit = useCallback(() => {
    if (!contextMenu || !contextMenu.isOwn) return;
    const msg = messages.find((m) => m.id === contextMenu.msgId);
    if (!msg || !activeChat) return;
    if (msg.media_file_id) return;

    const chatType = chatContext.type;
    const targetId =
      chatType === "direct" ? chatContext.partnerId : chatContext.roomId;

    startEditing(msg, chatType, targetId);
    setContextMenu(null);
  }, [contextMenu, messages, activeChat, chatContext, startEditing]);

  const handleDelete = useCallback(() => {
    if (!contextMenu || !contextMenu.isOwn) return;
    setMsgToDelete(contextMenu.msgId);
    setContextMenu(null);
  }, [contextMenu]);

  const performDelete = useCallback(async () => {
    if (!msgToDelete || !socketManager) return;
    setIsDeleting(true);
    try {
      if (chatContext.type === "direct") {
        await socketManager.deleteMessage(chatContext.partnerId, msgToDelete);
        deleteMessage({ id: msgToDelete, recipient_id: chatContext.partnerId });
      } else {
        await socketManager.deleteRoomMessage(chatContext.roomId, msgToDelete);
        deleteRoomMsg({ id: msgToDelete, room_id: chatContext.roomId });
      }
      setMsgToDelete(null);
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Не удалось удалить сообщение");
    } finally {
      setIsDeleting(false);
    }
  }, [msgToDelete, socketManager, chatContext, deleteMessage, deleteRoomMsg]);

  const handleCopy = useCallback(async () => {
    if (!contextMenu || !contextMenu.hasText || !contextMenu.content) return;
    try {
      await navigator.clipboard.writeText(contextMenu.content);
    } catch (err) {
      console.error("Copy failed:", err);
    } finally {
      setContextMenu(null);
    }
  }, [contextMenu]);

  const handleReplyClick = useCallback(() => {
    if (!contextMenu || !onReply) return;
    const msg = messages.find((m) => m.id === contextMenu.msgId);
    if (!msg) return;

    const content =
      (msg.content ?? "").trim().length > 0
        ? msg.content!
        : msg.media_file_id
        ? "[attachment]"
        : "";

    onReply({
      id: msg.id,
      content,
      author:
        msg.sender_display_name ||
        msg.sender_username ||
        `User #${msg.sender_id}`,
    });
    setContextMenu(null);
  }, [contextMenu, messages, onReply]);
  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const formatDate = (iso: string) => {
    const date      = new Date(iso);
    const today     = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  };

  const renderContent = (msg: Message) => {
    if (msg.media_file_id) {
      const mediaUrl = `${API_BASE_URL}/media/${msg.media_file_id}`;
      const isVideo = msg.media_mime_type?.startsWith("video/") ?? false;
      return (
        <div className="mt-1">
          {isVideo ? (
            <video className="max-w-full rounded-lg max-h-[300px]" controls src={mediaUrl} />
          ) : (
            <img className="max-w-full rounded-lg max-h-[400px] object-contain" src={mediaUrl} alt="attachment" />
          )}
        </div>
      );
    }

    return <span className="text-[0.92rem] leading-[1.45] whitespace-pre-wrap">{msg.content}</span>;
  };

  const renderReactions = (msgId: number, groups?: MessageReactionGroup[]) => {
    const list = messageReactions[msgId] ?? groups ?? [];
    if (!list || list.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1 mt-1.5">
        {list.map((g: MessageReactionGroup) => {
          const mine = g.user_ids.includes(currentUserId);
          return (
            <button
              key={`${msgId}:${g.emoji}`}
              className={cn(
                "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[14px] border border-[#E1E1E1] text-[#0A0A0A] text-[0.85rem] cursor-default",
                mine ? "bg-[#F8F8F8]" : "bg-white"
              )}
              aria-pressed={mine}
            >
              <span>{g.emoji}</span>
              <span className="opacity-80">{g.count}</span>
            </button>
          );
        })}
      </div>
    );
  };

  const renderReplyPreview = (msg: Message) => {
    if (!msg.reply_to_id) return null;

    const target = messagesById.get(msg.reply_to_id);

    const author =
      target?.sender_display_name ||
      target?.sender_username ||
      (target ? `User #${target.sender_id}` : "Message");

    let previewText = "";
    if (target) {
      if (target.media_file_id && !target.content) {
        previewText = "[Attachment]";
      } else {
        const base = (target.content ?? "").trim();
        if (base.length > 0) {
          previewText = base.length > 80 ? `${base.slice(0, 77)}…` : base;
        }
      }
    }

    const handleClick = () => {
      const el = messageRefs.current[msg.reply_to_id!];
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    return (
      <button
        type="button"
        className="block w-full text-left px-2.5 py-1.5 mb-1.5 rounded-lg border border-[#E1E1E1] bg-[#F8F8F8] text-[0.8rem] cursor-pointer"
        onClick={handleClick}
      >
        <div className="font-medium mb-0.5 text-[#0A0A0A]">
          Replying to {author}
        </div>
        {previewText && (
          <div className="text-[#7A7A7A] whitespace-nowrap overflow-hidden text-ellipsis">
            {previewText}
          </div>
        )}
      </button>
    );
  };

  const groupedMessages: Array<{ date: string; messages: Message[] }> = [];
  for (const msg of messages) {
    const date = formatDate(msg.inserted_at);
    const last = groupedMessages[groupedMessages.length - 1];
    if (last?.date === date) {
      last.messages.push(msg);
    } else {
      groupedMessages.push({ date, messages: [msg] });
    }
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-0.5 min-w-0">
      {hasMore && (
        <div className="flex justify-center py-2 pb-3">
          <button className="bg-white border border-[#E1E1E1] rounded-[20px] text-[#4A4A4A] cursor-pointer px-4 py-1.25 text-[0.82rem] font-inherit transition-colors duration-150 hover:bg-[#EDEDED]" onClick={onLoadMore} disabled={isLoading}>
            {isLoading ? "Loading…" : "Load older messages"}
          </button>
        </div>
      )}
      {messages.length === 0 && !isLoading && (
        <div className="flex-1 flex items-center justify-center text-[#7A7A7A] text-[0.9rem]">No messages yet. Say hello! 👋</div>
      )}
      {groupedMessages.map(({ date, messages: dayMessages }) => (
        <div key={date}>
          <div className="flex items-center my-4 mb-2 gap-3 text-[#7A7A7A] text-[0.72rem] font-semibold tracking-[0.04em] before:content-[''] before:flex-1 before:h-[1px] before:bg-[#E1E1E1] after:content-[''] after:flex-1 after:h-[1px] after:bg-[#E1E1E1]">
            <span>{date}</span>
          </div>
          {dayMessages.map((msg, idx) => {
            const isOwn        = msg.sender_id === currentUserId;
            const prevMsg      = dayMessages[idx - 1];
            const isConsecutive = prevMsg && prevMsg.sender_id === msg.sender_id;

            return (
              <div
                key={msg.id}
                className={cn(
                  "flex flex-col max-w-[70%] mb-0.5 self-start items-start",
                  isOwn && "self-start items-start", // Follow Telegram Desktop (all left)
                  isOwn && "max-[1100px]:self-stretch max-[1100px]:max-w-full max-[1100px]:items-end",
                  !isConsecutive && "mt-2"
                )}
                ref={(el) => {
                  if (el) {
                    messageRefs.current[msg.id] = el;
                  }
                }}
                onContextMenu={(e) => handleContextMenu(e, msg)}
                onMouseEnter={() => setHoverMsgId(msg.id)}
                onMouseLeave={() => { if (hoverMsgId === msg.id) setHoverMsgId(null); }}
              >
                {!isOwn && !isConsecutive && (
                  <span className="text-[0.72rem] text-[#5865F2] mb-0.5 pl-1 font-medium">{msg.sender_display_name || msg.sender_username}</span>
                )}
                <div className={cn(
                  "flex items-end gap-1.5 px-3 py-1.5 rounded-2xl break-words",
                  isOwn ? "bg-[#5865F2] text-white rounded-bl-[4px]" : "bg-[#F0F0F0] text-[#0A0A0A] rounded-bl-[4px]",
                  isConsecutive && "rounded-tl-[4px]",
                  isOwn && "max-[1100px]:max-w-[70%] max-[1100px]:rounded-bl-2xl max-[1100px]:rounded-br-[4px]",
                  isOwn && isConsecutive && "max-[1100px]:rounded-tl-2xl max-[1100px]:rounded-tr-[4px]",
                  !isOwn && "max-[1100px]:rounded-bl-[4px] max-[1100px]:rounded-br-2xl",
                  !isOwn && isConsecutive && "max-[1100px]:rounded-tl-[4px] max-[1100px]:rounded-tr-2xl"
                )}>
                  <div className="flex flex-col min-w-0">
                    {renderReplyPreview(msg)}
                    {renderContent(msg)}
                    {msg.edited_at && msg.content && (
                      <span className="text-[0.68rem] opacity-45 ml-1">(edited)</span>
                    )}
                  </div>
                  <span className="flex items-center ml-auto gap-1 text-[0.65rem] opacity-60 flex-shrink-0">
                    <span>{formatTime(msg.inserted_at)}</span>
                    {isOwn && chatContext.type !== "room" && <StatusIcon status={msg.status} />}
                  </span>
                  {renderReactions(msg.id, msg.reactions)}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      <div ref={bottomRef} />

      {contextMenu && (
        <div
          className="fixed z-[1000] bg-white border border-[#E1E1E1] rounded-lg py-1 min-w-[180px] shadow-[0_4px_16px_rgba(0,0,0,0.4)]"
          style={{
            top: contextMenu.y,
            left: contextMenu.x,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu && (
            <div className="px-4 py-2 border-b border-[#E1E1E1] mb-1">
              <span className="text-[0.75rem] text-[#7A7A7A] block mb-1.5">
                Reactions
              </span>
              <div className="flex gap-2">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    onClick={() => toggleReaction(contextMenu.msgId, e)}
                    className="text-[1.1rem] bg-none border-none cursor-pointer p-1 rounded transition-colors duration-150 hover:bg-[#EDEDED]"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            onClick={handleReplyClick}
            className="px-4 py-2 w-full text-left bg-none border-none cursor-pointer text-[#0A0A0A] text-[0.88rem] hover:bg-[#EDEDED]"
          >
            Reply
          </button>

          {contextMenu.hasText && (
            <button
              onClick={handleCopy}
              className="px-4 py-2 w-full text-left bg-none border-none cursor-pointer text-[#0A0A0A] text-[0.88rem] hover:bg-[#EDEDED]"
            >
              Copy text
            </button>
          )}

          {contextMenu.isOwn && (
            <>
              <button
                onClick={handleEdit}
                className="px-4 py-2 w-full text-left bg-none border-none cursor-pointer text-[#0A0A0A] text-[0.88rem] hover:bg-[#EDEDED]"
              >
                Edit
              </button>

              <button
                className="block w-full px-4 py-2 bg-none border-none text-[#E74C3C] cursor-pointer text-left text-[0.88rem] hover:bg-[#EDEDED]"
                onClick={handleDelete}
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}

      {msgToDelete && (
        <ConfirmModal
          title="Delete message"
          message="Are you sure you want to delete this message? This action cannot be undone."
          confirmLabel="Delete"
          onConfirm={performDelete}
          onCancel={() => setMsgToDelete(null)}
          isLoading={isDeleting}
          isDanger
        />
      )}
    </div>
  );
}
