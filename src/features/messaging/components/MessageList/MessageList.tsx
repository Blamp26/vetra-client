import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { Message, MessageStatus, MessageReactionGroup } from "@/shared/types";
import { useAppStore, type RootState } from "@/store";
import { API_BASE_URL } from "@/api/base";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import { cn } from "@/shared/utils/cn";
import { ArrowDown } from "lucide-react";
import { Emoji, EmojiText } from "@/shared/components/Emoji/Emoji";

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
        <circle cx="7" cy="7" r="7" fill="currentColor" className="text-destructive" />
        <text x="7" y="11" textAnchor="middle" fontSize="9" fontWeight="700" fill="white" fontFamily="Inter, sans-serif">!</text>
      </svg>
    );
  }
  if (status === "sent" || status === "delivered") {
    return (
      <svg className={cn("ml-1", status === "sent" ? "opacity-40" : "opacity-70")} width="18" height="11" viewBox="-1 5 34 20" xmlns="http://www.w3.org/2000/svg" aria-label={status === "sent" ? "Sent" : "Delivered"}>
        <path fill="currentColor" d="M3 13 L8 18 L20 6 L23 9 L8 24 L0 16 Z" />
      </svg>
    );
  }
  return (
    <svg className="ml-1 opacity-90" width="18" height="11" viewBox="-1 5 34 20" xmlns="http://www.w3.org/2000/svg" aria-label="Read">
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
  const [msgToDelete, setMsgToDelete] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const messageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const EMOJIS = ["👍","❤️","😂","🎉","😮","😢","🔥"];

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    setShowScrollBottom(el.scrollHeight - el.scrollTop - el.clientHeight > 200);
  };

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

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
    new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

  const formatDate = (iso: string) => {
    const date      = new Date(iso);
    const today     = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return "Сегодня";
    if (date.toDateString() === yesterday.toDateString()) return "Вчера";
    return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  };

  const renderContent = (msg: Message) => {
    const hasMedia = !!msg.media_file_id;
    const hasText = !!(msg.content && msg.content.trim().length > 0);

    return (
      <div className="flex flex-col gap-2">
        {hasMedia && (
          <div className="mt-1">
            {msg.media_mime_type?.startsWith("video/") ? (
              <video className="max-w-full rounded-lg max-h-[300px]" controls src={`${API_BASE_URL}/media/${msg.media_file_id}`} />
            ) : (
              <img 
                className="max-w-full rounded-lg max-h-[400px] object-contain bg-muted/20" 
                src={`${API_BASE_URL}/media/${msg.media_file_id}`} 
                alt="attachment" 
              />
            )}
          </div>
        )}
        {hasText && (
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
            <EmojiText text={msg.content || ""} />
          </p>
        )}
      </div>
    );
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
              onClick={(e) => {
                e.stopPropagation();
                toggleReaction(msgId, g.emoji);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[14px] border transition-all duration-150 text-[0.85rem] cursor-pointer hover:scale-105 active:scale-95",
                mine 
                  ? "bg-primary/20 border-primary text-primary font-medium shadow-sm" 
                  : "bg-muted/50 border-border text-foreground hover:bg-muted hover:border-muted-foreground/30"
              )}
              aria-pressed={mine}
              title={mine ? "Remove reaction" : "Add reaction"}
            >
              <Emoji emoji={g.emoji} size={16} />
              <span className={cn("text-[0.75rem]", mine ? "text-primary" : "text-muted-foreground")}>{g.count}</span>
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
        previewText = "[Вложение]";
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
        className="block w-full text-left px-2.5 py-1.5 mb-1.5 rounded-lg border border-border bg-background/50 text-[0.8rem] cursor-pointer"
        onClick={handleClick}
      >
        <div className="font-medium mb-0.5 text-foreground">
          Replying to {author}
        </div>
        {previewText && (
          <div className="text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">
            <EmojiText text={previewText} size={14} />
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
    <div className="flex-1 relative flex flex-col min-w-0 h-full">
      <div 
        ref={containerRef} 
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto space-y-4 flex flex-col min-w-0 h-full scrollbar-hide"
      >
        {hasMore && (
          <div className="flex justify-center py-2 pb-3">
            <button className="bg-muted hover:bg-accent border border-border rounded-full text-foreground cursor-pointer px-4 py-1.5 text-[0.82rem] transition-colors" onClick={onLoadMore} disabled={isLoading}>
              {isLoading ? "Загрузка…" : "Загрузить старые сообщения"}
            </button>
          </div>
        )}
        {messages.length === 0 && !isLoading && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-[0.9rem]">Сообщений пока нет. Скажите привет! 👋</div>
        )}
        {groupedMessages.map(({ date, messages: dayMessages }) => (
          <div key={date} className="space-y-4">
            <div className="flex items-center my-6 gap-3 text-muted-foreground text-[0.72rem] font-semibold tracking-[0.04em] before:content-[''] before:flex-1 before:h-[1px] before:bg-border after:content-[''] after:flex-1 after:h-[1px] after:bg-border">
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
                       "flex w-full",
                       isOwn ? "justify-start max-[1300px]:justify-end" : "justify-start"
                     )}
                     ref={(el) => {
                       if (el) {
                         messageRefs.current[msg.id] = el;
                       }
                     }}
                     onContextMenu={(e) => handleContextMenu(e, msg)}
                   >
                     <div className={cn(
                       "max-w-[70%] rounded-2xl px-4 py-2.5 flex flex-col relative group",
                       isOwn ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                       isOwn ? "rounded-bl-[4px] max-[1300px]:rounded-bl-2xl max-[1300px]:rounded-br-[4px]" : "rounded-bl-[4px]"
                     )}>
                    {!isOwn && !isConsecutive && (
                      <span className="text-[0.72rem] text-primary mb-1 font-semibold">{msg.sender_display_name || msg.sender_username}</span>
                    )}
                    {renderReplyPreview(msg)}
                    {renderContent(msg)}
                    
                    <div className="flex items-center mt-1 gap-1.5 self-end">
                      <p className={cn(
                        "text-[10px]",
                        isOwn ? "text-primary-foreground/70" : "text-muted-foreground"
                      )}>
                        {formatTime(msg.inserted_at)}
                      </p>
                      {msg.edited_at && msg.content && (
                        <span className="text-[10px] opacity-60">(ред.)</span>
                      )}
                      {isOwn && chatContext.type !== "room" && <StatusIcon status={msg.status} />}
                    </div>
                    {renderReactions(msg.id, msg.reactions)}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {showScrollBottom && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 h-9 w-9 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-all z-10 animate-in fade-in slide-in-from-bottom-2 duration-200"
          aria-label="К последним сообщениям"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      )}

      {contextMenu && (
        <div
          className="fixed z-[1000] bg-popover border border-border rounded-lg py-1 min-w-[180px] shadow-[0_4px_16px_rgba(0,0,0,0.4)]"
          style={{
            top: contextMenu.y,
            left: contextMenu.x,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu && (
            <div className="px-4 py-2 border-b border-border mb-1">
              <span className="text-[0.75rem] text-muted-foreground/70 block mb-1.5">
                Reactions
              </span>
              <div className="flex gap-2">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    onClick={() => toggleReaction(contextMenu.msgId, e)}
                    className="bg-none border-none cursor-pointer p-1 rounded transition-colors duration-150 hover:bg-accent"
                  >
                    <Emoji emoji={e} size={22} />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col">
            <button
              onClick={handleReplyClick}
              className="flex items-center w-full px-4 py-2 text-left bg-none border-none text-popover-foreground text-[0.88rem] cursor-pointer hover:bg-accent transition-colors duration-120"
            >
              Reply
            </button>
            
            {contextMenu.hasText && (
              <button
                onClick={handleCopy}
                className="flex items-center w-full px-4 py-2 text-left bg-none border-none text-popover-foreground text-[0.88rem] cursor-pointer hover:bg-accent transition-colors duration-120"
              >
                Copy Text
              </button>
            )}

            {contextMenu.isOwn && (
              <>
                <div className="h-[1px] bg-border my-1 mx-1" />
                {!messagesById.get(contextMenu.msgId)?.media_file_id && (
                  <button
                    onClick={handleEdit}
                    className="flex items-center w-full px-4 py-2 text-left bg-none border-none text-popover-foreground text-[0.88rem] cursor-pointer hover:bg-accent transition-colors duration-120"
                  >
                    Edit Message
                  </button>
                )}
                <button
                  onClick={handleDelete}
                  className="flex items-center w-full px-4 py-2 text-left bg-none border-none text-destructive text-[0.88rem] cursor-pointer hover:bg-accent transition-colors duration-120"
                >
                  Delete Message
                </button>
              </>
            )}
          </div>
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
