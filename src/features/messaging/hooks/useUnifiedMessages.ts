import { useEffect, useCallback, useMemo } from "react";
import { useAppStore, type RootState } from "@/store";
import { messagesApi } from "@/api/messages";
import { roomsApi } from "@/api/rooms";
import { markReadViaChannel, sendMessageViaChannel } from "@/services/socket";
import { useMessagePagination } from "@/shared/hooks/useMessagePagination";

export type ChatContext = 
  | { type: "direct"; partnerId: number }
  | { type: "room";   roomId: number };

/**
 * Unified hook for handling both direct messages and room messages.
 * Replaces useMessages and useRoomMessages.
 */
export function useUnifiedMessages(context: ChatContext | null) {
  const currentUser = useAppStore((s: RootState) => s.currentUser);
  const socketManager = useAppStore((s: RootState) => s.socketManager);
  
  // Slices
  const conversations = useAppStore((s: RootState) => s.conversations);
  const roomConversations = useAppStore((s: RootState) => s.roomConversations);
  
  // Actions
  const initConversation = useAppStore((s: RootState) => s.initConversation);
  const setConversationMessages = useAppStore((s: RootState) => s.setConversationMessages);
  const prependMessages = useAppStore((s: RootState) => s.prependMessages);
  const appendMessage = useAppStore((s: RootState) => s.appendMessage);
  const setConversationLoading = useAppStore((s: RootState) => s.setConversationLoading);
  const setConversationHasMore = useAppStore((s: RootState) => s.setConversationHasMore);
  const resetUnread = useAppStore((s: RootState) => s.resetUnread);

  const initRoomConversation = useAppStore((s: RootState) => s.initRoomConversation);
  const setRoomMessages = useAppStore((s: RootState) => s.setRoomMessages);
  const prependRoomMessages = useAppStore((s: RootState) => s.prependRoomMessages);
  const appendRoomMessage = useAppStore((s: RootState) => s.appendRoomMessage);
  const setRoomLoading = useAppStore((s: RootState) => s.setRoomConversationLoading);
  const setRoomHasMore = useAppStore((s: RootState) => s.setRoomConversationHasMore);
  const editRoomMessage = useAppStore((s: RootState) => s.editRoomMessage);
  const deleteRoomMessage = useAppStore((s: RootState) => s.deleteRoomMessage);
  const toggleRoomReaction = useAppStore((s: RootState) => s.toggleRoomReaction);

  const isRoom = context?.type === "room";
  const id = context ? (isRoom ? context.roomId : context.partnerId) : null;
  
  const conversation = useMemo(() => {
    if (!context) return null;
    return isRoom ? roomConversations[context.roomId] : conversations[context.partnerId];
  }, [context, isRoom, roomConversations, conversations]);

  const fetchPage = useCallback(
    (limit: number, beforeId?: number) => {
      if (!id || !currentUser || !context) return Promise.resolve([]);
      if (context.type === "room") {
        return roomsApi.getMessages(context.roomId, limit, beforeId);
      } else {
        return messagesApi.getConversation(context.partnerId, { limit, beforeId });
      }
    },
    [id, currentUser, context],
  );

  const actions = useMemo(() => {
    if (!context) return null;
    if (context.type === "room") {
      const roomId = context.roomId;
      return {
        init: () => initRoomConversation(roomId),
        setLoading: (l: boolean) => setRoomLoading(roomId, l),
        setMessages: (msgs: any) => setRoomMessages(roomId, msgs),
        setHasMore: (h: boolean) => setRoomHasMore(roomId, h),
        prepend: (msgs: any) => prependRoomMessages(roomId, msgs),
      };
    } else {
      const partnerId = context.partnerId;
      return {
        init: () => initConversation(partnerId),
        setLoading: (l: boolean) => setConversationLoading(partnerId, l),
        setMessages: (msgs: any) => setConversationMessages(partnerId, msgs),
        setHasMore: (h: boolean) => setConversationHasMore(partnerId, h),
        prepend: (msgs: any) => prependMessages(partnerId, msgs),
      };
    }
  }, [
    context, 
    initRoomConversation, setRoomLoading, setRoomMessages, setRoomHasMore, prependRoomMessages, 
    initConversation, setConversationLoading, setConversationMessages, setConversationHasMore, prependMessages
  ]);

  const { messages, isLoading, hasMore, loadMore } = useMessagePagination(
    id,
    currentUser?.id ?? null,
    conversation,
    fetchPage,
    actions!,
  );

  // Effect for read status and joining room channels
  useEffect(() => {
    if (!id || !socketManager || !context) return;

    if (context.type === "direct") {
      markReadViaChannel(socketManager.userChannel, context.partnerId);
      resetUnread(context.partnerId);
    } else {
      socketManager.joinRoomChannel(context.roomId);
      
      // Local room events that aren't global (edited, deleted, reactions)
      // Note: Room message append is handled globally in useSocketEvents
      const unsubEdited = socketManager.onRoomMessageEdited(context.roomId, (p) => editRoomMessage(p));
      const unsubDeleted = socketManager.onRoomMessageDeleted(context.roomId, (p) => deleteRoomMessage(p));
      const unsubReaction = socketManager.onRoomReactionUpdated(context.roomId, (p) => toggleRoomReaction(p));

      return () => {
        unsubEdited();
        unsubDeleted();
        unsubReaction();
        socketManager.leaveRoomChannel(context.roomId);
      };
    }
  }, [id, socketManager, context, resetUnread, editRoomMessage, deleteRoomMessage, toggleRoomReaction]);

  const sendMessage = useCallback(
    async (
      payload: { content?: string | null; mediaFileId?: string | null },
      replyToId?: number,
    ) => {
      if (!id || !socketManager || !currentUser || !context) return;
      const trimmed = payload.content?.trim() ?? "";
      const content = trimmed.length > 0 ? trimmed : null;
      if (!content && !payload.mediaFileId) return;

      if (context.type === "room") {
        const message = await socketManager.sendRoomMessageViaChannel(context.roomId, {
          content,
          mediaFileId: payload.mediaFileId ?? null,
          replyToId: replyToId ?? null,
        });
        appendRoomMessage(context.roomId, message);
      } else {
        const message = await sendMessageViaChannel(
          socketManager.userChannel,
          context.partnerId,
          {
            content,
            mediaFileId: payload.mediaFileId ?? null,
            replyToId: replyToId ?? null,
          },
        );
        appendMessage(context.partnerId, message);
      }
    },
    [id, socketManager, currentUser, context, appendRoomMessage, appendMessage],
  );

  return { messages, isLoading, hasMore, loadMore, sendMessage };
}
