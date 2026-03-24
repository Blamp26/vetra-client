import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { Message, MessageStatus, MessageReactionGroup } from "@/shared/types";
import { useAppStore, type RootState } from "@/store";
import { API_BASE_URL } from "@/api/base";
import { ConfirmModal } from "@/shared/components/ConfirmModal";

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
      <svg className="msg-status msg-status--error" width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Ошибка отправки">
        <circle cx="7" cy="7" r="7" fill="#FF3B30" />
        <text x="7" y="11" textAnchor="middle" fontSize="9" fontWeight="700" fill="white" fontFamily="Inter, sans-serif">!</text>
      </svg>
    );
  }
  if (status === "sent" || status === "delivered") {
    return (
      <svg className={`msg-status ${status === "sent" ? "msg-status--sent" : "msg-status--delivered"}`} width="20" height="12" viewBox="-1 5 34 20" xmlns="http://www.w3.org/2000/svg" aria-label={status === "sent" ? "Отправлено" : "Доставлено"}>
        <path fill="currentColor" d="M3 13 L8 18 L20 6 L23 9 L8 24 L0 16 Z" />
      </svg>
    );
  }
  return (
    <svg className="msg-status msg-status--read" width="20" height="12" viewBox="-1 5 34 20" xmlns="http://www.w3.org/2000/svg" aria-label="Прочитано">
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
        <div className="msg-media">
          {isVideo ? (
            <video className="msg-media-video" controls src={mediaUrl} />
          ) : (
            <img className="msg-media-image" src={mediaUrl} alt="attachment" />
          )}
        </div>
      );
    }

    return <span className="msg-content">{msg.content}</span>;
  };

  const renderReactions = (msgId: number, groups?: MessageReactionGroup[]) => {
    const list = messageReactions[msgId] ?? groups ?? [];
    if (!list || list.length === 0) return null;
    return (
      <div className="reaction-chips" style={{ display: "flex", gap: 6, marginTop: 6 }}>
        {list.map((g: MessageReactionGroup) => {
          const mine = g.user_ids.includes(currentUserId);
          return (
            <button
              key={`${msgId}:${g.emoji}`}
              className="reaction-chip"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "2px 8px",
                borderRadius: 14,
                border: "1px solid var(--border)",
                background: mine ? "var(--bg-secondary)" : "var(--bg-tertiary)",
                color: "var(--text-primary)",
                fontSize: "0.85rem",
                cursor: "default",
              }}
              aria-pressed={mine}
            >
              <span>{g.emoji}</span>
              <span style={{ opacity: 0.8 }}>{g.count}</span>
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
      (target ? `User #${target.sender_id}` : "Сообщение");

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
        className="reply-preview"
        onClick={handleClick}
        style={{
          display: "block",
          width: "100%",
          textAlign: "left",
          padding: "6px 10px",
          marginBottom: 6,
          borderRadius: 8,
          border: "1px solid var(--border-muted, var(--border))",
          background: "var(--bg-secondary)",
          fontSize: "0.8rem",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            fontWeight: 500,
            marginBottom: 2,
            color: "var(--text-primary)",
          }}
        >
          ↩️ Ответ для {author}
        </div>
        {previewText && (
          <div
            style={{
              color: "var(--text-muted)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
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
    <div ref={containerRef} className="message-list">
      {hasMore && (
        <div className="load-more-wrapper">
          <button className="load-more-btn" onClick={onLoadMore} disabled={isLoading}>
            {isLoading ? "Loading…" : "Load older messages"}
          </button>
        </div>
      )}
      {messages.length === 0 && !isLoading && (
        <div className="empty-conversation">No messages yet. Say hello! 👋</div>
      )}
      {groupedMessages.map(({ date, messages: dayMessages }) => (
        <div key={date}>
          <div className="date-separator">
            <span>{date}</span>
          </div>
          {dayMessages.map((msg, idx) => {
            const isOwn        = msg.sender_id === currentUserId;
            const prevMsg      = dayMessages[idx - 1];
            const isConsecutive = prevMsg && prevMsg.sender_id === msg.sender_id;

            return (
              <div
                key={msg.id}
                className={`message-row ${isOwn ? "own" : "other"} ${isConsecutive ? "consecutive" : ""}`}
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
                  <span className="msg-sender">{msg.sender_display_name || msg.sender_username}</span>
                )}
                <div className="message-bubble">
                  <>
                    {renderReplyPreview(msg)}
                    {renderContent(msg)}
                    {msg.edited_at && msg.content && (
                      <span style={{ fontSize: "0.68rem", opacity: 0.45, marginLeft: 4 }}>(edited)</span>
                    )}
                  </>
                  <span className="msg-meta">
                    <span className="msg-time">{formatTime(msg.inserted_at)}</span>
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
          style={{
            position:    "fixed",
            top:         contextMenu.y,
            left:        contextMenu.x,
            zIndex:      1000,
            background:  "var(--bg-tertiary)",
            border:      "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding:     "4px 0",
            minWidth:    180,
            boxShadow:   "0 4px 16px rgba(0,0,0,0.4)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu && (
            <div style={{ padding: "8px 16px", borderBottom: "1px solid var(--border)", marginBottom: 4 }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
                Реакции
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    onClick={() => toggleReaction(contextMenu.msgId, e)}
                    style={{
                      fontSize: "1.1rem",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "4px",
                      borderRadius: "4px",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(el) => (el.currentTarget.style.background = "var(--bg-hover)")}
                    onMouseLeave={(el) => (el.currentTarget.style.background = "none")}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            onClick={handleReplyClick}
            style={{
              padding: "8px 16px",
              width: "100%",
              textAlign: "left",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-primary)",
              fontSize: "0.88rem",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            ↩️ Ответить
          </button>

          {contextMenu.hasText && (
            <button
              onClick={handleCopy}
              style={{
                padding: "8px 16px",
                width: "100%",
                textAlign: "left",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-primary)",
                fontSize: "0.88rem",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              📋 Скопировать текст
            </button>
          )}

          {contextMenu.isOwn && (
            <>
              <button
                onClick={handleEdit}
                style={{
                  padding: "8px 16px",
                  width: "100%",
                  textAlign: "left",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-primary)",
                  fontSize: "0.88rem",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                ✏️ Edit
              </button>

              <button
                style={{
                  display: "block",
                  width: "100%",
                  padding: "8px 16px",
                  background: "none",
                  border: "none",
                  color: "var(--error)",
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: "0.88rem",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                onClick={handleDelete}
              >
                🗑️ Удалить
              </button>
            </>
          )}
        </div>
      )}

      {msgToDelete && (
        <ConfirmModal
          title="Удалить сообщение"
          message="Вы уверены, что хотите удалить это сообщение? Это действие нельзя отменить."
          confirmLabel="Удалить"
          onConfirm={performDelete}
          onCancel={() => setMsgToDelete(null)}
          isLoading={isDeleting}
          isDanger
        />
      )}
    </div>
  );
}
