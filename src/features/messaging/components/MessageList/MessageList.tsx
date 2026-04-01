import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { Message } from "@/shared/types";
import { useAppStore, type RootState } from "@/store";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import { ForwardModal } from "../ForwardModal";
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
  }), true);

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
    bottomRef.current?.scrollIntoView();
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
      bottomRef.current?.scrollIntoView();
      isFirstLoad.current = false;
    } else if (!isFirstLoad.current) {
      const el = containerRef.current;
      if (!el) return;
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      if (isNearBottom) bottomRef.current?.scrollIntoView();
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
      const author = msg.sender_display_name || msg.sender_username || `User #${msg.sender_id}`;
      setContextMenu({
        msgId: msg.id,
        content: msg.content,
        x: e.clientX,
        y: e.clientY,
        isOwn: msg.sender_id === currentUserId,
        hasText: (msg.content ?? "").trim().length > 0,
        author,
      });
    },
    [currentUserId],
  );

  const handleEdit = useCallback(() => {
    if (!contextMenu || !contextMenu.isOwn) return;
    const msg = messagesById.get(contextMenu.msgId);
    if (!msg) return;
    const chatType = chatContext.type;
    const targetId = chatType === "direct" ? chatContext.partnerId : chatContext.roomId;
    startEditing(msg, chatType, targetId);
    setContextMenu(null);
  }, [contextMenu, messagesById, chatContext, startEditing]);

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
    const content = (msg.content ?? "").trim().length > 0 ? msg.content! : msg.media_file_id ? "[attachment]" : "";
    onReply({ id: msg.id, content, author: contextMenu.author });
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
        const payload = { content: msg.content, mediaFileId: msg.media_file_id };
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
    const date = new Date(iso);
    return date.toLocaleDateString();
  };

  const renderReplyPreview = (msg: Message, isOwn: boolean) => {
    if (!msg.reply_to_id) return null;
    const target = messagesById.get(msg.reply_to_id);
    const author = target?.sender_display_name || target?.sender_username || (target ? `User #${target.sender_id}` : "Message");

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

    return (
      <button
        type="button"
        className={cn("block w-full text-left p-1 border-l-2 border-border mb-1 text-xs", isOwn ? "bg-white/10" : "bg-black/5")}
        onClick={() => {
          const el = messageRefs.current[msg.reply_to_id!];
          if (el) el.scrollIntoView();
        }}
      >
        <div className="font-normal">{author}</div>
        {previewText && <div className="truncate opacity-70">{previewText}</div>}
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
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div 
        ref={containerRef} 
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-hide"
      >
        {hasMore && (
          <div className="flex justify-center p-2">
            <button onClick={onLoadMore} disabled={isLoading}>
              {isLoading ? "Loading..." : "Older messages"}
            </button>
          </div>
        )}
        {messages.length === 0 && !isLoading && (
          <div className="text-center p-4 text-muted-foreground text-sm">No messages.</div>
        )}
        {groupedMessages.map(({ date, messages: dayMessages }) => (
          <div key={date} className="space-y-2">
            <div className="text-center border-b border-border my-4">
              <span className="bg-background px-2 text-[10px] text-muted-foreground uppercase">{date}</span>
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
                    if (el) el.scrollIntoView();
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
        <button onClick={scrollToBottom} className="absolute bottom-20 right-4 p-2 bg-primary text-primary-foreground">
          Down
        </button>
      )}

      {selectionMode && (
        <div className="p-2 border-t border-border flex items-center justify-between bg-card text-sm">
          <span>{selectedMessageIds.length} selected</span>
          <div className="flex gap-2">
            <button onClick={() => selectedMessageIds.length > 0 && setMsgToDelete(selectedMessageIds[0])} className="text-destructive">Delete</button>
            <button onClick={() => setForwardingMessages(selectedMessageIds)}>Forward</button>
            <button onClick={clearSelection}>Cancel</button>
          </div>
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
          message="Delete this message?"
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
