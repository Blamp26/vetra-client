import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { Message } from "@/shared/types";
import { useAppStore, type RootState } from "@/store";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import { ForwardModal } from "../ForwardModal";
import { ArrowDown, X, Forward, Trash2 } from "lucide-react";
import { EmojiText } from "@/shared/components/Emoji/Emoji";
import { sendMessageViaChannel } from "@/services/socket";
import { ImageLightbox } from "@/shared/components/ImageLightbox";
import { cn } from "@/shared/utils/cn";

import { MessageItem } from "./MessageItem";
import { MessageContextMenu } from "./MessageContextMenu";

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
  const messageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // Store
  const {
    selectionMode,
    selectedMessageIds,
    setSelectionMode,
    toggleMessageSelection,
    clearSelection,
    forwardingMessageIds,
    setForwardingMessages,
    setActiveChat,
    socketManager,
    deleteMessage,
    deleteRoomMessage,
    messageReactions,
    startEditing,
    activeChat,
  } = useAppStore((s: RootState) => ({
    selectionMode: s.selectionMode,
    selectedMessageIds: s.selectedMessageIds,
    setSelectionMode: s.setSelectionMode,
    toggleMessageSelection: s.toggleMessageSelection,
    clearSelection: s.clearSelection,
    forwardingMessageIds: s.forwardingMessageIds,
    setForwardingMessages: s.setForwardingMessages,
    setActiveChat: s.setActiveChat,
    socketManager: s.socketManager,
    deleteMessage: s.deleteMessage,
    deleteRoomMessage: s.deleteRoomMessage,
    messageReactions: s.messageReactions,
    startEditing: s.startEditing,
    activeChat: s.activeChat,
  }), true);

  // Local state
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [msgToDelete, setMsgToDelete] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [isPickerExpanded, setIsPickerExpanded] = useState(false);
  const [lightboxData, setLightboxData] = useState<{ src: string; author: string; time: string } | null>(null);

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

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, msg: Message) => {
      e.preventDefault();

      const isOwn   = msg.sender_id === currentUserId;
      const hasText = (msg.content ?? "").trim().length > 0;
      const author  =
        msg.sender_display_name ||
        msg.sender_username ||
        `User #${msg.sender_id}`;

      const MENU_WIDTH  = 260;
      const MENU_HEIGHT = 320;

      let x = e.clientX;
      let y = e.clientY;

      const vw = window.innerWidth;
      const vh = window.innerHeight;

      if (x + MENU_WIDTH + 16 <= vw) {
        x += 8;
      } else {
        x -= MENU_WIDTH + 8;
      }

      if (y + MENU_HEIGHT + 16 <= vh) {
        y += 6;
      } else {
        y -= MENU_HEIGHT + 6;
      }

      x = Math.max(12, Math.min(x, vw - MENU_WIDTH - 12));
      y = Math.max(12, Math.min(y, vh - MENU_HEIGHT - 12));

      setIsPickerExpanded(false);
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
    const msg = messagesById.get(contextMenu.msgId);
    if (!msg || !activeChat) return;
    if (msg.media_file_id) return;

    const chatType = chatContext.type;
    const targetId = chatType === "direct" ? chatContext.partnerId : chatContext.roomId;

    startEditing(msg, chatType, targetId);
    setContextMenu(null);
  }, [contextMenu, messagesById, activeChat, chatContext, startEditing]);

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
        deleteRoomMessage({ id: msgToDelete, room_id: chatContext.roomId });
      }
      setMsgToDelete(null);
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setIsDeleting(false);
    }
  }, [msgToDelete, socketManager, chatContext, deleteMessage, deleteRoomMessage]);

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
    const msg = messagesById.get(contextMenu.msgId);
    if (!msg) return;

    const content = (msg.content ?? "").trim().length > 0
        ? msg.content!
        : msg.media_file_id ? "[attachment]" : "";

    onReply({
      id: msg.id,
      content,
      author: msg.sender_display_name || msg.sender_username || `User #${msg.sender_id}`,
    });
    setContextMenu(null);
  }, [contextMenu, messagesById, onReply]);

  const handleSelect = useCallback(() => {
    if (!contextMenu) return;
    setSelectionMode(true);
    toggleMessageSelection(contextMenu.msgId);
    setContextMenu(null);
  }, [contextMenu, setSelectionMode, toggleMessageSelection]);

  const handleForward = useCallback(() => {
    if (!contextMenu) return;
    setForwardingMessages([contextMenu.msgId]);
    setContextMenu(null);
  }, [contextMenu, setForwardingMessages]);

  const handlePerformForward = useCallback(async (target: { type: 'direct' | 'room', id: number }) => {
    if (!forwardingMessageIds || forwardingMessageIds.length === 0 || !socketManager) return;

    try {
      for (const msgId of forwardingMessageIds) {
        const msg = messagesById.get(msgId);
        if (!msg) continue;

        const payload = {
          content: msg.content,
          mediaFileId: msg.media_file_id
        };

        if (target.type === 'direct') {
          await sendMessageViaChannel(socketManager.userChannel, target.id, payload);
        } else {
          await socketManager.sendRoomMessageViaChannel(target.id, payload);
        }
      }
      
      if (target.type === 'direct') {
        setActiveChat({ type: 'direct', partnerId: target.id });
      } else {
        setActiveChat({ type: 'room', roomId: target.id });
      }

    } catch (err) {
      console.error("Forwarding failed:", err);
    } finally {
      setForwardingMessages(null);
      clearSelection();
    }
  }, [forwardingMessageIds, socketManager, messagesById, setActiveChat, clearSelection, setForwardingMessages]);

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

  const renderReplyPreview = (msg: Message, isOwn: boolean) => {
    if (!msg.reply_to_id) return null;
    const target = messagesById.get(msg.reply_to_id);
    const author = target?.sender_display_name || target?.sender_username || (target ? `User #${target.sender_id}` : "Message");

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

    return (
      <button
        type="button"
        className={cn(
          "block w-full text-left pl-3 py-0 mb-0.5 rounded-sm relative group cursor-pointer border-l-2 transition-colors",
          isOwn ? "border-primary-foreground/60 hover:bg-primary-foreground/10" : "border-primary hover:bg-primary/5"
        )}
        onClick={() => {
          const el = messageRefs.current[msg.reply_to_id!];
          if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        }}
      >
        <div className={cn("font-semibold text-xs leading-none pt-0.5 truncate", isOwn ? "text-primary-foreground" : "text-primary")}>
          {author}
        </div>
        {previewText && (
          <div className={cn("text-sm leading-tight pb-0.5 truncate", isOwn ? "text-primary-foreground/80" : "text-muted-foreground")}>
            <EmojiText text={previewText} size={14} />
          </div>
        )}
      </button>
    );
  };

  const groupedMessages = useMemo(() => {
    const groups: Array<{ date: string; messages: Message[] }> = [];
    for (const msg of messages) {
      const date = formatDate(msg.inserted_at);
      const last = groups[groups.length - 1];
      if (last?.date === date) {
        last.messages.push(msg);
      } else {
        groups.push({ date, messages: [msg] });
      }
    }
    return groups;
  }, [messages]);

  return (
    <div className="flex-1 relative flex flex-col min-w-0 h-full">
      <div 
        ref={containerRef} 
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto space-y-4 flex flex-col min-w-0 h-full scrollbar-hide"
      >
        {hasMore && (
          <div className="flex justify-center py-2 pb-3">
            <button className="bg-background/60 hover:bg-muted border border-border shadow-sm rounded-full text-foreground cursor-pointer px-4 py-1.5 text-xs font-medium backdrop-blur-md transition-all active:scale-95 disabled:opacity-50" onClick={onLoadMore} disabled={isLoading}>
              {isLoading ? "Загрузка…" : "Загрузить старые сообщения"}
            </button>
          </div>
        )}
        {messages.length === 0 && !isLoading && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Сообщений пока нет. Скажите привет! 👋</div>
        )}
        {groupedMessages.map(({ date, messages: dayMessages }) => (
          <div key={date} className="space-y-4">
            <div className="flex justify-center my-6 relative z-[5] pointer-events-none">
              <span className="bg-background/40 backdrop-blur-2xl text-foreground/80 text-[0.6875rem] font-semibold tracking-widest uppercase px-3.5 py-1.5 rounded-full border border-white/5 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.12)] ring-1 ring-inset ring-black/5 dark:ring-white/5">
                {date}
              </span>
            </div>
            {dayMessages.map((msg, idx) => {
              const prevMsg = dayMessages[idx - 1];
              return (
                <MessageItem
                  key={msg.id}
                  ref={(el) => { messageRefs.current[msg.id] = el; }}
                  msg={msg}
                  isOwn={msg.sender_id === currentUserId}
                  isConsecutive={prevMsg?.sender_id === msg.sender_id}
                  isSelected={selectedMessageIds.includes(msg.id)}
                  selectionMode={selectionMode}
                  isRoom={chatContext.type === "room"}
                  messageReactions={messageReactions[msg.id] || msg.reactions || []}
                  currentUserId={currentUserId}
                  onContextMenu={handleContextMenu}
                  onToggleSelection={toggleMessageSelection}
                  onToggleReaction={toggleReaction}
                  onLightbox={setLightboxData}
                  onReplyClick={(id) => {
                    const el = messageRefs.current[id];
                    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                  renderReplyPreview={renderReplyPreview}
                  formatTime={formatTime}
                  formatDate={formatDate}
                />
              );
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {showScrollBottom && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 h-10 w-10 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/20 flex items-center justify-center hover:bg-primary/90 hover:scale-105 active:scale-95 transition-all z-10 animate-in fade-in slide-in-from-bottom-2 duration-300"
          aria-label="К последним сообщениям"
        >
          <ArrowDown className="h-5 w-5" />
        </button>
      )}

      {selectionMode && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[500] bg-background/80 backdrop-blur-3xl border border-white/10 dark:border-white/5 rounded-[1.5rem] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.15)] px-6 py-3.5 flex items-center gap-8 animate-in slide-in-from-bottom-6 duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ring-1 ring-inset ring-black/5 dark:ring-white/10">
          <div className="text-sm font-semibold text-primary mr-2 flex items-center gap-2">
            <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-md text-xs">
              {selectedMessageIds.length}
            </span>
            выбрано
          </div>
          
          <button 
            onClick={() => setForwardingMessages(selectedMessageIds)}
            disabled={selectedMessageIds.length === 0}
            className="flex flex-col items-center gap-1 group text-muted-foreground hover:text-foreground transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] disabled:opacity-40"
          >
            <div className="p-2 rounded-[1rem] group-hover:bg-accent group-hover:scale-[1.15] group-active:scale-95 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] shadow-sm ring-1 ring-inset ring-transparent group-hover:ring-border/50">
              <Forward className="h-5 w-5" />
            </div>
            <span className="text-[0.625rem] font-semibold uppercase tracking-wider">Forward</span>
          </button>

          <button 
            onClick={() => {
              if (selectedMessageIds.length > 0) setMsgToDelete(selectedMessageIds[0]);
            }}
            disabled={selectedMessageIds.length === 0}
            className="flex flex-col items-center gap-1 group text-muted-foreground hover:text-destructive transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] disabled:opacity-40"
          >
            <div className="p-2 rounded-[1rem] group-hover:bg-destructive/10 group-hover:scale-[1.15] group-active:scale-95 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] shadow-sm ring-1 ring-inset ring-transparent group-hover:ring-destructive/20">
              <Trash2 className="h-5 w-5" />
            </div>
            <span className="text-[0.625rem] font-semibold uppercase tracking-wider">Delete</span>
          </button>

          <div className="w-[1px] h-8 bg-border/40" />

          <button 
            onClick={clearSelection}
            className="flex flex-col items-center gap-1 group text-muted-foreground hover:text-foreground transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
          >
            <div className="p-2 rounded-[1rem] group-hover:bg-accent group-hover:rotate-90 group-hover:scale-105 group-active:scale-95 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] shadow-sm ring-1 ring-inset ring-transparent group-hover:ring-border/50">
              <X className="h-5 w-5" />
            </div>
            <span className="text-[0.625rem] font-semibold uppercase tracking-wider">Cancel</span>
          </button>
        </div>
      )}

      {contextMenu && (
        <MessageContextMenu
          data={contextMenu}
          isPickerExpanded={isPickerExpanded}
          setIsPickerExpanded={setIsPickerExpanded}
          onToggleReaction={toggleReaction}
          onReply={handleReplyClick}
          onCopy={handleCopy}
          onForward={handleForward}
          onSelect={handleSelect}
          onEdit={handleEdit}
          onDelete={handleDelete}
          canEdit={!messagesById.get(contextMenu.msgId)?.media_file_id}
          onClose={() => setContextMenu(null)}
        />
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

      {lightboxData && (
        <ImageLightbox
          src={lightboxData.src}
          author={lightboxData.author}
          time={lightboxData.time}
          onClose={() => setLightboxData(null)}
        />
      )}

      {forwardingMessageIds && (
        <ForwardModal 
          onForward={handlePerformForward}
          onCancel={() => setForwardingMessages(null)}
        />
      )}
    </div>
  );
}
