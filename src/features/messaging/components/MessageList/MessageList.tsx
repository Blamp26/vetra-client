import { useEffect, useRef, useState, useCallback, useMemo, useLayoutEffect } from "react";
import type { Message } from "@/shared/types";
import { useAppStore, type RootState } from "@/store";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import { ForwardModal } from "../ForwardModal";
import { sendMessageViaChannel } from "@/services/socket";
import { ImageLightbox } from "@/shared/components/ImageLightbox";
import { VideoLightbox } from "@/shared/components/VideoLightbox";
import { Emoji } from "@/shared/components/Emoji/Emoji";
import { cn } from "@/shared/utils/cn";
import { roomChatForPreview } from "@/shared/utils/chatRoutes";
import { withFallbackRef } from "@/shared/utils/refs";
import {
  getMessageAttachments,
  getMessageAttachment,
  getPreviewText,
  isMessageForwardable,
} from "../../utils/attachments";
import { downloadAttachmentWithAuth } from "../../utils/attachmentDownloads";

import { MessageItem } from "./MessageItem";
import { MessageContextMenu } from "./MessageContextMenu";

interface Props {
  messages:      Message[];
  currentUserId: number;
  isLoading:     boolean;
  hasMore:       boolean;
  onLoadMore:    () => void;
  chatContext:
    | { type: "direct"; partnerId: number; partnerRef?: string | number }
    | { type: "room";   roomId: number; roomRef?: string | number };
  onReply?: (target: { id: number; content: string; author: string }) => void;
}

interface ContextMenu {
  msgId:    number;
  content:  string | null;
  x:        number;
  y:        number;
  isOwn:    boolean;
  hasText:  boolean;
  hasAttachment: boolean;
  author:   string;
  bubbleRect: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
  contentRect: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
}

export const WIDE_CHAT_LEFT_COLUMN_THRESHOLD = 1000;

type MediaViewerState =
  | {
    kind: "image";
    src: string;
    authorName: string;
    createdAt: string;
    avatarSrc?: string | null;
    messageId: number;
  }
  | {
    kind: "video";
    src: string;
    authorName: string;
    createdAt: string;
    avatarSrc?: string | null;
    messageId: number;
  };

function toRect(rect: DOMRect | DOMRectReadOnly) {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

function getSafeContentRect(bubble: HTMLDivElement) {
  const contentEl = bubble.querySelector<HTMLElement>("[data-message-content-rect]");
  if (contentEl) {
    return toRect(contentEl.getBoundingClientRect());
  }

  const bubbleRect = bubble.getBoundingClientRect();
  const style = window.getComputedStyle(bubble);
  const paddingLeft = Number.parseFloat(style.paddingLeft || "0");
  const paddingRight = Number.parseFloat(style.paddingRight || "0");
  const paddingTop = Number.parseFloat(style.paddingTop || "0");
  const paddingBottom = Number.parseFloat(style.paddingBottom || "0");
  const left = bubbleRect.left + paddingLeft;
  const right = Math.max(left, bubbleRect.right - paddingRight);
  const top = bubbleRect.top + paddingTop;
  const bottom = Math.max(top, bubbleRect.bottom - paddingBottom);

  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
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
    conversationPreviews,
    roomPreviews,
    authToken,
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
    conversationPreviews: s.conversationPreviews,
    roomPreviews: s.roomPreviews,
    authToken: s.authToken,
  }), true);

  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [msgToDelete, setMsgToDelete] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [isPickerExpanded, setIsPickerExpanded] = useState(false);
  const [lightboxData, setLightboxData] = useState<MediaViewerState | null>(null);
  const [chatViewportWidth, setChatViewportWidth] = useState(0);
  const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(null);
  const pendingReplyTargetId = useRef<number | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const readWidth = () => {
      const nextWidth = container.clientWidth || container.getBoundingClientRect().width || 0;
      setChatViewportWidth((currentWidth) => (
        currentWidth === nextWidth ? currentWidth : nextWidth
      ));
    };

    readWidth();

    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      readWidth();
    });

    observer.observe(container);

    return () => observer.disconnect();
  }, []);

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

  const brieflyHighlightMessage = useCallback((messageId: number) => {
    setHighlightedMessageId(messageId);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => {
      setHighlightedMessageId((current) => current === messageId ? null : current);
    }, 1200);
  }, []);

  const toggleReaction = useCallback(async (msgId: number, emoji: string) => {
    if (!socketManager) return;
    try {
      if (chatContext.type === "room") {
        await socketManager.toggleReaction(chatContext.roomId, msgId, emoji);
      } else {
        await socketManager.toggleDirectReaction(
          withFallbackRef(
            chatContext.partnerId,
            chatContext.partnerRef,
            conversationPreviews[chatContext.partnerId]
              ? { id: chatContext.partnerId, public_id: conversationPreviews[chatContext.partnerId].partner_public_id }
              : undefined,
          ),
          msgId,
          emoji,
        );
      }
    } catch (err) {
      console.error("Toggle reaction failed:", err);
    } finally {
      setContextMenu(null);
    }
  }, [socketManager, chatContext, conversationPreviews]);

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
    const targetId = pendingReplyTargetId.current;
    if (targetId == null || !messageRefs.current[targetId]) return;

    pendingReplyTargetId.current = null;
    messageRefs.current[targetId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    brieflyHighlightMessage(targetId);
  }, [brieflyHighlightMessage, messages]);

  useEffect(() => () => {
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [contextMenu]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, msg: Message) => {
      e.preventDefault();
      const bubble = e.currentTarget;
      const author = msg.sender_display_name || msg.sender_username || `User #${msg.sender_id}`;
      setIsPickerExpanded(false);
      setContextMenu({
        msgId: msg.id,
        content: msg.content,
        x: e.clientX,
        y: e.clientY,
        isOwn: msg.sender_id === currentUserId,
        hasText: (msg.content ?? "").trim().length > 0,
        hasAttachment: getMessageAttachment(msg) != null,
        author,
        bubbleRect: toRect(bubble.getBoundingClientRect()),
        contentRect: getSafeContentRect(bubble),
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
        const partnerRef = withFallbackRef(
          chatContext.partnerId,
          chatContext.partnerRef,
          conversationPreviews[chatContext.partnerId]
            ? { id: chatContext.partnerId, public_id: conversationPreviews[chatContext.partnerId].partner_public_id }
            : undefined,
        );
        await socketManager.deleteMessage(partnerRef, msgToDelete);
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
  }, [msgToDelete, socketManager, chatContext, deleteMessage, deleteRoomMessage, conversationPreviews]);

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
    const content = getPreviewText(msg, "");
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
    const msg = messagesById.get(contextMenu.msgId);
    if (!msg || !isMessageForwardable(msg)) return;
    setForwardingMessages([contextMenu.msgId]);
    setContextMenu(null);
  }, [contextMenu, messagesById, setForwardingMessages]);

  const handleDownload = useCallback(async () => {
    if (!contextMenu) return;
    const msg = messagesById.get(contextMenu.msgId);
    if (!msg) return;

    const attachment = getMessageAttachment(msg);
    if (!attachment) return;

    try {
      await downloadAttachmentWithAuth({ attachment, authToken });
    } catch (err) {
      console.error("Download failed:", err);
    } finally {
      setContextMenu(null);
    }
  }, [authToken, contextMenu, messagesById]);

  const handleLightboxDelete = useCallback(() => {
    if (!lightboxData) return;
    const targetMessage = messagesById.get(lightboxData.messageId);
    if (!targetMessage || targetMessage.sender_id !== currentUserId) return;
    setLightboxData(null);
    setMsgToDelete(targetMessage.id);
  }, [currentUserId, lightboxData, messagesById]);

  const handleLightboxForward = useCallback(() => {
    if (!lightboxData) return;
    const targetMessage = messagesById.get(lightboxData.messageId);
    if (!targetMessage || !isMessageForwardable(targetMessage)) return;
    setLightboxData(null);
    setForwardingMessages([targetMessage.id]);
  }, [lightboxData, messagesById, setForwardingMessages]);

  const handlePerformForward = useCallback(async (target: { type: 'direct' | 'room', id: number; ref?: string | number | null }) => {
    if (!forwardingMessageIds || forwardingMessageIds.length === 0 || !socketManager) return;
    try {
      for (const msgId of forwardingMessageIds) {
        const msg = messagesById.get(msgId);
        if (!msg) continue;
        if (!isMessageForwardable(msg)) {
          return;
        }
        const payload = { content: msg.content, mediaFileId: msg.media_file_id };
        if (target.type === 'direct') {
          await sendMessageViaChannel(socketManager.userChannel, target.ref ?? target.id, payload);
        } else {
          await socketManager.sendRoomMessageViaChannel(target.id, payload);
        }
      }
      if (target.type === 'direct') {
        setActiveChat(
          { type: 'direct', partnerId: target.id, partnerRef: target.ref ?? target.id },
        );
      } else {
        const roomPreview = roomPreviews[target.id];
        setActiveChat(
          roomPreview
            ? roomChatForPreview(roomPreview)
            : { type: 'room', roomId: target.id, roomRef: target.ref ?? target.id },
        );
      }
    } catch (err) {
      console.error("Forwarding failed:", err);
    } finally {
      setForwardingMessages(null);
      clearSelection();
    }
  }, [forwardingMessageIds, socketManager, messagesById, setActiveChat, clearSelection, setForwardingMessages, roomPreviews]);

  const selectedMessages = useMemo(
    () =>
      selectedMessageIds
        .map((id) => messagesById.get(id))
        .filter((message): message is Message => Boolean(message)),
    [messagesById, selectedMessageIds],
  );

  const selectedForwardBlocked = selectedMessages.some(
    (message) => !isMessageForwardable(message),
  );

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

  const formatDate = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleDateString();
  };

  const renderReplyPreview = (msg: Message, isOwn: boolean) => {
    const replyTargetId = msg.reply_to_id;
    if (replyTargetId == null) return null;
    const target = messagesById.get(replyTargetId);
    const author = target?.sender_display_name || target?.sender_username || (target ? `User #${target.sender_id}` : "Message");

    const targetAttachment = target ? getMessageAttachment(target) : null;
    const isDocument = targetAttachment?.kind === "file";
    const previewText = target
      ? (isDocument
        ? targetAttachment.original_name || getPreviewText(target, "Message")
        : getPreviewText(target, "Message"))
        .replace(/\s+/g, " ")
        .trim()
      : "Message";

    const jumpToReplyTarget = () => {
      const targetId = replyTargetId;
      const element = messageRefs.current[targetId];
      if (!element) {
        pendingReplyTargetId.current = targetId;
        if (hasMore && !isLoading) onLoadMore();
        return;
      }

      element.scrollIntoView({ behavior: "smooth", block: "center" });
      brieflyHighlightMessage(targetId);
    };

    return (
      <div
        className="box-border flex h-[49px] w-full flex-col justify-start gap-[4px] px-0 pb-[2px] pt-[2px]"
        data-testid="message-reply-preview-wrapper"
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          paddingTop: "2px",
          paddingBottom: "2px",
          gap: "4px",
          height: "49px",
        }}
      >
        <button
          type="button"
          className="relative box-border flex h-[44px] w-full min-w-0 cursor-pointer items-center overflow-hidden rounded-[6px] border-0 p-0 text-left shadow-none"
          data-testid="message-reply-preview-card"
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            width: "100%",
            height: "44px",
            boxSizing: "border-box",
            padding: "3px 6px 3px 9px",
            marginBottom: "1px",
            borderRadius: "6px",
            overflow: "hidden",
            cursor: "pointer",
            backgroundColor: isOwn ? "var(--bubble-outgoing-meta-bg)" : "var(--bubble-incoming-meta-bg)",
            color: isOwn ? "var(--bubble-outgoing-meta)" : "var(--bubble-incoming-meta)",
            boxShadow: "none",
          }}
          onClick={(event) => {
            event.stopPropagation();
            jumpToReplyTarget();
          }}
          onContextMenu={(event) => event.stopPropagation()}
        >
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-[3px]"
            data-testid="message-reply-preview-accent"
            style={{
              position: "absolute",
              width: "3px",
              height: "100%",
              top: "0",
              left: "0",
              backgroundColor: "currentColor",
            }}
          />
          <span className="flex h-[38px] min-w-0 flex-1 flex-col justify-start">
            <span
              className="block h-[20px] min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[14px] font-medium leading-[20px]"
              data-testid="message-reply-preview-sender"
              style={{
                height: "20px",
                fontSize: "14px",
                fontWeight: 500,
                lineHeight: "20px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: "0",
                maxWidth: "100%",
              }}
            >
              {author}
            </span>
            <span
              className="flex h-[18px] min-w-0 max-w-full items-center overflow-hidden text-ellipsis whitespace-nowrap text-[14px] font-normal leading-[18px]"
              data-testid="message-reply-preview-quoted"
              style={{
                height: "18px",
                fontSize: "14px",
                fontWeight: 400,
                lineHeight: "18px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: "0",
              }}
            >
              {isDocument && <Emoji emoji="📎" size={18} className="mr-px shrink-0" />}
              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{previewText}</span>
            </span>
          </span>
        </button>
      </div>
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

  const alignmentMode = chatViewportWidth > WIDE_CHAT_LEFT_COLUMN_THRESHOLD
    ? "left-column"
    : "split";

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div 
        ref={containerRef} 
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-4 scrollbar-hide sm:px-4"
        data-testid="message-list-scroll"
      >
        <div
          className={cn(
            "flex w-full max-w-[900px] flex-col",
            alignmentMode === "left-column" ? "mr-auto" : "mx-auto",
          )}
          data-testid="message-list-rail"
          data-alignment-mode={alignmentMode}
        >
          {hasMore && (
            <div className="flex justify-center p-2">
              <button onClick={onLoadMore} disabled={isLoading} className="vt-button">
                {isLoading ? "Loading..." : "Older messages"}
              </button>
            </div>
          )}
          {messages.length === 0 && !isLoading && (
            <div className="vt-panel mx-auto max-w-md px-5 py-6 text-center">
              <div className="space-y-1.5">
                <span className="vt-kicker">No messages yet</span>
                <p className="text-sm text-muted-foreground">Start the conversation with a message or file.</p>
              </div>
            </div>
          )}
          {groupedMessages.map(({ date, messages: dayMessages }) => (
            <div key={date} className="w-full" data-testid="message-date-group">
              <div className="my-3 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="rounded-full border border-border bg-card px-3 py-1 text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                  {date}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
              {dayMessages.map((msg, idx) => {
                const prevMsg = dayMessages[idx - 1];
                const nextMsg = dayMessages[idx + 1];
                const isConsecutive = prevMsg?.sender_id === msg.sender_id;
                const isGroupedWithNext = nextMsg?.sender_id === msg.sender_id;
                const messageAttachments = getMessageAttachments(msg);
                const previousMessageAttachments = prevMsg ? getMessageAttachments(prevMsg) : [];
                const hasAttachment = messageAttachments.length > 0;
                const prevHasAttachment = previousMessageAttachments.length > 0;
                const isAlbum = messageAttachments.length > 1;
                const prevIsAlbum = previousMessageAttachments.length > 1;
                const isAlbumBoundary = isAlbum || prevIsAlbum;
                const isAttachmentRun = isConsecutive && hasAttachment && prevHasAttachment && !isAlbumBoundary;
                const isPlainTextGroup = isConsecutive && !hasAttachment && !prevHasAttachment;
                return (
                  <div
                    key={msg.id}
                    data-testid="message-row-spacing"
                    data-attachment-run={isAttachmentRun ? "true" : "false"}
                    data-grouped-with-previous={isConsecutive ? "true" : "false"}
                    data-grouped-with-next={isGroupedWithNext ? "true" : "false"}
                    className={cn(
                      idx === 0
                        ? "mt-0"
                        : isAlbumBoundary
                          ? isConsecutive
                            ? "mt-1.5"
                            : "mt-2.5"
                        : isAttachmentRun
                          ? "mt-0.5"
                          : isPlainTextGroup
                            ? "mt-1.5"
                            : isConsecutive
                              ? "mt-0.5"
                            : "mt-2.5",
                    )}
                  >
                    <MessageItem
                      ref={(el) => { messageRefs.current[msg.id] = el; }}
                      msg={msg}
                      isOwn={msg.sender_id === currentUserId}
                      alignmentMode={alignmentMode}
                      isConsecutive={isConsecutive}
                      isGroupedWithNext={isGroupedWithNext}
                      isSelected={selectedMessageIds.includes(msg.id)}
                      isHighlighted={highlightedMessageId === msg.id}
                      selectionMode={selectionMode}
                      isRoom={chatContext.type === "room"}
                      messageReactions={messageReactions[msg.id] || msg.reactions || []}
                      currentUserId={currentUserId}
                      onContextMenu={handleContextMenu}
                      onToggleSelection={toggleMessageSelection}
                      onToggleReaction={toggleReaction}
                      onLightbox={setLightboxData}
                      renderReplyPreview={renderReplyPreview}
                      formatTime={formatTime}
                    />
                  </div>
                );
              })}
            </div>
          ))}
          <div ref={bottomRef} className="h-3" data-testid="message-list-bottom-spacer" />
        </div>
      </div>

      {showScrollBottom && (
        <button
          onClick={scrollToBottom}
          aria-label="Scroll to latest messages"
          className="vt-button vt-button--primary absolute bottom-24 right-6 z-10 min-h-10 rounded-full px-4 shadow-[var(--overlay-shadow)] ring-1 ring-black/10"
        >
          Down
        </button>
      )}

      {selectionMode && (
        <div className="border-t border-border bg-card px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-medium">{selectedMessageIds.length} selected</span>
            <div className="flex flex-wrap items-center gap-2">
            {selectedForwardBlocked && (
              <span className="text-[10px] text-muted-foreground">
                Attachment messages cannot be forwarded yet.
              </span>
            )}
              <button onClick={() => selectedMessageIds.length > 0 && setMsgToDelete(selectedMessageIds[0])} className="vt-button vt-button--danger min-h-9 px-3 py-0 text-xs">Delete</button>
            <button
              onClick={() => !selectedForwardBlocked && setForwardingMessages(selectedMessageIds)}
              disabled={selectedForwardBlocked || selectedMessageIds.length === 0}
                className={cn(
                  "vt-button min-h-9 px-3 py-0 text-xs",
                  selectedForwardBlocked && "cursor-not-allowed opacity-50",
                )}
            >
              Forward
            </button>
              <button onClick={clearSelection} className="vt-button vt-button--ghost min-h-9 px-3 py-0 text-xs">Cancel</button>
            </div>
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
          onDownload={handleDownload}
          onForward={handleForward}
          onSelect={handleSelect}
          onEdit={handleEdit}
          onDelete={handleDelete}
          canReply={Boolean(onReply)}
          canEdit={(() => {
            const contextMessage = messagesById.get(contextMenu.msgId);
            return !!contextMessage && isMessageForwardable(contextMessage);
          })()}
          canDownload={(() => {
            const contextMessage = messagesById.get(contextMenu.msgId);
            return !!contextMessage && getMessageAttachment(contextMessage) != null;
          })()}
          canForward={!contextMenu.hasAttachment}
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

      {lightboxData?.kind === "image" && (
        <ImageLightbox
          src={lightboxData.src}
          authorName={lightboxData.authorName}
          avatarSrc={lightboxData.avatarSrc}
          createdAt={lightboxData.createdAt}
          onForward={
            (() => {
              const targetMessage = messagesById.get(lightboxData.messageId);
              return targetMessage && isMessageForwardable(targetMessage)
                ? handleLightboxForward
                : undefined;
            })()
          }
          onDelete={
            (() => {
              const targetMessage = messagesById.get(lightboxData.messageId);
              return targetMessage && targetMessage.sender_id === currentUserId
                ? handleLightboxDelete
                : undefined;
            })()
          }
          onClose={() => setLightboxData(null)}
        />
      )}

      {lightboxData?.kind === "video" && (
        <VideoLightbox
          src={lightboxData.src}
          authorName={lightboxData.authorName}
          avatarSrc={lightboxData.avatarSrc}
          createdAt={lightboxData.createdAt}
          onForward={
            (() => {
              const targetMessage = messagesById.get(lightboxData.messageId);
              return targetMessage && isMessageForwardable(targetMessage)
                ? handleLightboxForward
                : undefined;
            })()
          }
          onDelete={
            (() => {
              const targetMessage = messagesById.get(lightboxData.messageId);
              return targetMessage && targetMessage.sender_id === currentUserId
                ? handleLightboxDelete
                : undefined;
            })()
          }
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
