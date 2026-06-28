import { useEffect, useCallback, useMemo } from "react";
import { useAppStore, type RootState } from "@/store";
import { messagesApi } from "@/api/messages";
import { roomsApi } from "@/api/rooms";
import { markReadViaChannel, sendMessageViaChannel } from "@/services/socket";
import { useMessagePagination } from "@/shared/hooks/useMessagePagination";
import { withFallbackRef } from "@/shared/utils/refs";

export type ChatContext =
  | { type: "direct"; partnerId: number; partnerRef?: string | number }
  | { type: "room"; roomId: number; roomRef?: string | number };

/**
 * Unified hook for handling both direct messages and room messages.
 * Replaces useMessages and useRoomMessages.
 */
export function useUnifiedMessages(context: ChatContext | null) {
  const currentUser = useAppStore((s: RootState) => s.currentUser);
  const socketManager = useAppStore((s: RootState) => s.socketManager);

  // Slices
  const conversations = useAppStore((s: RootState) => s.conversations);
  const conversationPreviews = useAppStore(
    (s: RootState) => s.conversationPreviews,
  );
  const roomConversations = useAppStore((s: RootState) => s.roomConversations);
  const roomPreviews = useAppStore((s: RootState) => s.roomPreviews);

  // Actions
  const initConversation = useAppStore((s: RootState) => s.initConversation);
  const setConversationMessages = useAppStore(
    (s: RootState) => s.setConversationMessages,
  );
  const prependMessages = useAppStore((s: RootState) => s.prependMessages);
  const appendMessage = useAppStore((s: RootState) => s.appendMessage);
  const setConversationLoading = useAppStore(
    (s: RootState) => s.setConversationLoading,
  );
  const setConversationHasMore = useAppStore(
    (s: RootState) => s.setConversationHasMore,
  );
  const resetUnread = useAppStore((s: RootState) => s.resetUnread);

  const initRoomConversation = useAppStore(
    (s: RootState) => s.initRoomConversation,
  );
  const setRoomMessages = useAppStore((s: RootState) => s.setRoomMessages);
  const prependRoomMessages = useAppStore(
    (s: RootState) => s.prependRoomMessages,
  );
  const appendRoomMessage = useAppStore((s: RootState) => s.appendRoomMessage);
  const setRoomLoading = useAppStore(
    (s: RootState) => s.setRoomConversationLoading,
  );
  const setRoomHasMore = useAppStore(
    (s: RootState) => s.setRoomConversationHasMore,
  );
  const editRoomMessage = useAppStore((s: RootState) => s.editRoomMessage);
  const deleteRoomMessage = useAppStore((s: RootState) => s.deleteRoomMessage);
  const toggleRoomReaction = useAppStore(
    (s: RootState) => s.toggleRoomReaction,
  );

  const isRoom = context?.type === "room";
  const id = context ? (isRoom ? context.roomId : context.partnerId) : null;
  const contextType = context?.type ?? null;
  const directPartnerId = context?.type === "direct" ? context.partnerId : null;
  const directPartnerExplicitRef =
    context?.type === "direct" ? context.partnerRef : undefined;
  const roomId = context?.type === "room" ? context.roomId : null;
  const roomExplicitRef =
    context?.type === "room" ? context.roomRef : undefined;
  const directPreviewPublicId =
    directPartnerId !== null
      ? conversationPreviews[directPartnerId]?.partner_public_id
      : undefined;
  const roomPreviewPublicId =
    roomId !== null ? roomPreviews[roomId]?.public_id : undefined;

  const directTargetRef = useMemo(
    () =>
      directPartnerId !== null
        ? withFallbackRef(
            directPartnerId,
            directPartnerExplicitRef,
            directPreviewPublicId
              ? { id: directPartnerId, public_id: directPreviewPublicId }
              : undefined,
          )
        : null,
    [directPartnerId, directPartnerExplicitRef, directPreviewPublicId],
  );

  const roomTargetRef = useMemo(
    () =>
      roomId !== null
        ? withFallbackRef(
            roomId,
            roomExplicitRef,
            roomPreviewPublicId
              ? { id: roomId, public_id: roomPreviewPublicId }
              : undefined,
          )
        : null,
    [roomId, roomExplicitRef, roomPreviewPublicId],
  );

  const conversation = useMemo(() => {
    if (contextType === "room" && roomId !== null) {
      return roomConversations[roomId] ?? null;
    }

    if (contextType === "direct" && directPartnerId !== null) {
      return conversations[directPartnerId] ?? null;
    }

    return null;
  }, [contextType, roomId, directPartnerId, roomConversations, conversations]);

  const fetchPage = useCallback(
    (limit: number, beforeId?: number) => {
      if (!id || !currentUser || !contextType) return Promise.resolve([]);
      if (contextType === "room" && roomId !== null) {
        return roomsApi.getMessages(roomTargetRef ?? roomId, limit, beforeId);
      } else {
        return messagesApi.getConversation(
          directTargetRef ?? directPartnerId!,
          {
            limit,
            beforeId,
          },
        );
      }
    },
    [
      id,
      currentUser,
      contextType,
      roomId,
      roomTargetRef,
      directTargetRef,
      directPartnerId,
    ],
  );

  const actions = useMemo(() => {
    if (!contextType) return null;
    if (contextType === "room" && roomId !== null) {
      return {
        init: () => initRoomConversation(roomId),
        setLoading: (l: boolean) => setRoomLoading(roomId, l),
        setMessages: (msgs: any) => setRoomMessages(roomId, msgs),
        setHasMore: (h: boolean) => setRoomHasMore(roomId, h),
        prepend: (msgs: any) => prependRoomMessages(roomId, msgs),
      };
    } else {
      const partnerId = directPartnerId!;
      return {
        init: () => initConversation(partnerId),
        setLoading: (l: boolean) => setConversationLoading(partnerId, l),
        setMessages: (msgs: any) => setConversationMessages(partnerId, msgs),
        setHasMore: (h: boolean) => setConversationHasMore(partnerId, h),
        prepend: (msgs: any) => prependMessages(partnerId, msgs),
      };
    }
  }, [
    contextType,
    roomId,
    directPartnerId,
    initRoomConversation,
    setRoomLoading,
    setRoomMessages,
    setRoomHasMore,
    prependRoomMessages,
    initConversation,
    setConversationLoading,
    setConversationMessages,
    setConversationHasMore,
    prependMessages,
  ]);

  const conversationKey =
    contextType && id ? `${contextType}:${id}` : null;

  const { messages, isLoading, hasMore, loadMore } = useMessagePagination(
    id,
    currentUser?.id ?? null,
    conversation,
    fetchPage,
    actions!,
    conversationKey,
  );

  // Effect for read status and joining room channels
  useEffect(() => {
    if (!id || !socketManager || !contextType) return;

    if (contextType === "direct" && directPartnerId !== null) {
      markReadViaChannel(
        socketManager.userChannel,
        directTargetRef ?? directPartnerId,
      );
      resetUnread(directPartnerId);
    } else {
      if (roomId === null) return;
      socketManager.joinRoomChannel(roomId, roomTargetRef ?? roomId);

      // Local room events that aren't global (edited, deleted, reactions)
      // Note: Room message append is handled globally in useSocketEvents
      const unsubEdited = socketManager.onRoomMessageEdited(roomId, (p) =>
        editRoomMessage(p),
      );
      const unsubDeleted = socketManager.onRoomMessageDeleted(roomId, (p) =>
        deleteRoomMessage(p),
      );
      const unsubReaction = socketManager.onRoomReactionUpdated(roomId, (p) =>
        toggleRoomReaction(p),
      );

      return () => {
        unsubEdited();
        unsubDeleted();
        unsubReaction();
        socketManager.leaveRoomChannel(roomId);
      };
    }
  }, [
    id,
    socketManager,
    contextType,
    directPartnerId,
    roomId,
    directTargetRef,
    roomTargetRef,
    resetUnread,
    editRoomMessage,
    deleteRoomMessage,
    toggleRoomReaction,
  ]);

  const sendMessage = useCallback(
    async (
      payload: { content?: string | null; mediaFileId?: string | null },
      replyToId?: number,
    ) => {
      if (!id || !socketManager || !currentUser || !contextType) return;
      const trimmed = payload.content?.trim() ?? "";
      const content = trimmed.length > 0 ? trimmed : null;
      if (!content && !payload.mediaFileId) return;

      if (contextType === "room" && roomId !== null) {
        const message = await socketManager.sendRoomMessageViaChannel(roomId, {
          content,
          mediaFileId: payload.mediaFileId ?? null,
          replyToId: replyToId ?? null,
        });
        appendRoomMessage(roomId, message);
      } else {
        const message = await sendMessageViaChannel(
          socketManager.userChannel,
          directTargetRef ?? directPartnerId!,
          {
            content,
            mediaFileId: payload.mediaFileId ?? null,
            replyToId: replyToId ?? null,
          },
        );
        appendMessage(directPartnerId!, message);
      }
    },
    [
      id,
      socketManager,
      currentUser,
      contextType,
      roomId,
      directPartnerId,
      directTargetRef,
      appendRoomMessage,
      appendMessage,
    ],
  );

  return { messages, isLoading, hasMore, loadMore, sendMessage };
}
