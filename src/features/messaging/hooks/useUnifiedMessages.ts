import { useEffect, useCallback, useMemo } from "react";
import { useAppStore, type RootState } from "@/store";
import { messagesApi } from "@/api/messages";
import { roomsApi } from "@/api/rooms";
import { markReadViaChannel, sendMessageViaChannel } from "@/services/socket";
import { useMessagePagination } from "@/shared/hooks/useMessagePagination";
import { withFallbackRef } from "@/shared/utils/refs";

export type ChatContext = 
  | { type: "direct"; partnerId: number; partnerRef?: string | number }
  | { type: "room";   roomId: number; roomRef?: string | number };

/**
 * Unified hook for handling both direct messages and room messages.
 * Replaces useMessages and useRoomMessages.
 */
export function useUnifiedMessages(context: ChatContext | null) {
  const currentUser = useAppStore((s: RootState) => s.currentUser);
  const socketManager = useAppStore((s: RootState) => s.socketManager);
  
  // Slices
  const conversations = useAppStore((s: RootState) => s.conversations);
  const conversationPreviews = useAppStore((s: RootState) => s.conversationPreviews);
  const roomConversations = useAppStore((s: RootState) => s.roomConversations);
  const roomPreviews = useAppStore((s: RootState) => s.roomPreviews);
  
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
        return roomsApi.getMessages(
          withFallbackRef(context.roomId, context.roomRef, roomPreviews[context.roomId]),
          limit,
          beforeId,
        );
      } else {
        return messagesApi.getConversation(
          withFallbackRef(
            context.partnerId,
            context.partnerRef,
            conversationPreviews[context.partnerId]
              ? { id: context.partnerId, public_id: conversationPreviews[context.partnerId].partner_public_id }
              : undefined,
          ),
          { limit, beforeId },
        );
      }
    },
    [id, currentUser, context, roomPreviews, conversationPreviews],
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
      markReadViaChannel(
        socketManager.userChannel,
        withFallbackRef(
          context.partnerId,
          context.partnerRef,
          conversationPreviews[context.partnerId]
            ? { id: context.partnerId, public_id: conversationPreviews[context.partnerId].partner_public_id }
            : undefined,
        ),
      );
      resetUnread(context.partnerId);
    } else {
      socketManager.joinRoomChannel(
        context.roomId,
        withFallbackRef(context.roomId, context.roomRef, roomPreviews[context.roomId]),
      );
      
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
  }, [id, socketManager, context, resetUnread, editRoomMessage, deleteRoomMessage, toggleRoomReaction, conversationPreviews, roomPreviews]);

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
          withFallbackRef(
            context.partnerId,
            context.partnerRef,
            conversationPreviews[context.partnerId]
              ? { id: context.partnerId, public_id: conversationPreviews[context.partnerId].partner_public_id }
              : undefined,
          ),
          {
            content,
            mediaFileId: payload.mediaFileId ?? null,
            replyToId: replyToId ?? null,
          },
        );
        appendMessage(context.partnerId, message);
      }
    },
    [id, socketManager, currentUser, context, appendRoomMessage, appendMessage, conversationPreviews],
  );

  return { messages, isLoading, hasMore, loadMore, sendMessage };
}
