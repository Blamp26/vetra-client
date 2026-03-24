import { useEffect, useCallback } from "react";
import { roomsApi } from "@/api/rooms";
import { useAppStore, type RootState } from "@/store";
import { useMessagePagination } from "@/shared/hooks/useMessagePagination";

export function useRoomMessages(roomId: number | null) {
  const currentUser             = useAppStore((s: RootState) => s.currentUser);
  const socketManager           = useAppStore((s: RootState) => s.socketManager);
  const roomConversations       = useAppStore((s: RootState) => s.roomConversations);
  const initRoomConversation    = useAppStore((s: RootState) => s.initRoomConversation);
  const setRoomMessages         = useAppStore((s: RootState) => s.setRoomMessages);
  const prependRoomMessages     = useAppStore((s: RootState) => s.prependRoomMessages);
  const appendRoomMessage       = useAppStore((s: RootState) => s.appendRoomMessage);
  const setRoomLoading          = useAppStore((s: RootState) => s.setRoomConversationLoading);
  const setRoomHasMore          = useAppStore((s: RootState) => s.setRoomConversationHasMore);
  const editRoomMessage         = useAppStore((s: RootState) => s.editRoomMessage);
  const deleteRoomMessage       = useAppStore((s: RootState) => s.deleteRoomMessage);
  const toggleRoomReaction      = useAppStore((s: RootState) => s.toggleRoomReaction);

  const conversation = roomId !== null ? roomConversations[roomId] : null;

  const fetchPage = useCallback(
    (limit: number, beforeId?: number) => {
      if (!roomId || !currentUser) return Promise.resolve([]);
      return roomsApi.getMessages(roomId, limit, beforeId);
    },
    [roomId, currentUser],
  );

  const actions = {
    init:        () => initRoomConversation(roomId!),
    setLoading:  (l: boolean) => setRoomLoading(roomId!, l),
    setMessages: (msgs: Parameters<typeof setRoomMessages>[1]) =>
      setRoomMessages(roomId!, msgs),
    setHasMore:  (h: boolean) => setRoomHasMore(roomId!, h),
    prepend:     (msgs: Parameters<typeof prependRoomMessages>[1]) =>
      prependRoomMessages(roomId!, msgs),
  };

  const { messages, isLoading, hasMore, loadMore } = useMessagePagination(
    roomId,
    currentUser?.id ?? null,
    conversation,
    fetchPage,
    actions,
  );

  useEffect(() => {
    if (!roomId || !socketManager) return;
    
    socketManager.joinRoomChannel(roomId);

    const unsubMsg     = socketManager.onRoomMessage(roomId, (msg) => appendRoomMessage(roomId, msg));
    const unsubEdited  = socketManager.onRoomMessageEdited(roomId, (p) => editRoomMessage(p));
    const unsubDeleted = socketManager.onRoomMessageDeleted(roomId, (p) => deleteRoomMessage(p));
    const unsubReaction = socketManager.onRoomReactionUpdated(roomId, (p) => toggleRoomReaction(p));

    return () => {
      unsubMsg();
      unsubEdited();
      unsubDeleted();
      unsubReaction();
      socketManager.leaveRoomChannel(roomId);
    };
  }, [roomId, socketManager, appendRoomMessage, editRoomMessage, deleteRoomMessage, toggleRoomReaction]);

  const sendMessage = useCallback(
    async (
      payload: { content?: string | null; mediaFileId?: string | null },
      replyToId?: number,
    ) => {
      if (!roomId || !socketManager) return;
      const trimmed = payload.content?.trim() ?? "";
      const content = trimmed.length > 0 ? trimmed : null;
      if (!content && !payload.mediaFileId) return;
      const message = await socketManager.sendRoomMessageViaChannel(roomId, {
        content,
        mediaFileId: payload.mediaFileId ?? null,
        replyToId: replyToId ?? null,
      });
      appendRoomMessage(roomId, message);
    },
    [roomId, socketManager, appendRoomMessage],
  );

  return { messages, isLoading, hasMore, loadMore, sendMessage };
}
