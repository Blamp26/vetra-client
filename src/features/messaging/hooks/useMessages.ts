import { useEffect, useCallback } from "react";
import { messagesApi } from "@/api/messages";
import { markReadViaChannel, sendMessageViaChannel } from "@/services/socket";
import { useAppStore, type RootState } from "@/store";
import { useMessagePagination } from "@/shared/hooks/useMessagePagination";

export function useMessages(partnerId: number | null) {
  const currentUser             = useAppStore((s: RootState) => s.currentUser);
  const socketManager           = useAppStore((s: RootState) => s.socketManager);
  const conversations           = useAppStore((s: RootState) => s.conversations);
  const initConversation        = useAppStore((s: RootState) => s.initConversation);
  const setConversationMessages = useAppStore((s: RootState) => s.setConversationMessages);
  const prependMessages         = useAppStore((s: RootState) => s.prependMessages);
  const appendMessage           = useAppStore((s: RootState) => s.appendMessage);
  const setConversationLoading  = useAppStore((s: RootState) => s.setConversationLoading);
  const setConversationHasMore  = useAppStore((s: RootState) => s.setConversationHasMore);
  const resetUnread             = useAppStore((s: RootState) => s.resetUnread);

  const conversation = partnerId !== null ? conversations[partnerId] : null;

  const fetchPage = useCallback(
    (limit: number, beforeId?: number) => {
      if (!partnerId || !currentUser) return Promise.resolve([]);
      return messagesApi.getConversation(partnerId, {
        limit,
        beforeId,
      });
    },
    [partnerId, currentUser],
  );

  const actions = {
    init:        () => initConversation(partnerId!),
    setLoading:  (l: boolean) => setConversationLoading(partnerId!, l),
    setMessages: (msgs: Parameters<typeof setConversationMessages>[1]) =>
      setConversationMessages(partnerId!, msgs),
    setHasMore:  (h: boolean) => setConversationHasMore(partnerId!, h),
    prepend:     (msgs: Parameters<typeof prependMessages>[1]) =>
      prependMessages(partnerId!, msgs),
  };

  const { messages, isLoading, hasMore, loadMore } = useMessagePagination(
    partnerId,
    currentUser?.id ?? null,
    conversation,
    fetchPage,
    actions,
  );

  useEffect(() => {
    if (!partnerId || !socketManager) return;
    markReadViaChannel(socketManager.userChannel, partnerId);
    resetUnread(partnerId);
  }, [partnerId, socketManager, resetUnread]);

  const sendMessage = useCallback(
    async (
      payload: { content?: string | null; mediaFileId?: string | null },
      replyToId?: number,
    ) => {
      if (!partnerId || !socketManager || !currentUser) return;
      const trimmed = payload.content?.trim() ?? "";
      const content = trimmed.length > 0 ? trimmed : null;
      if (!content && !payload.mediaFileId) return;
      const message = await sendMessageViaChannel(
        socketManager.userChannel,
        partnerId,
        {
          content,
          mediaFileId: payload.mediaFileId ?? null,
          replyToId: replyToId ?? null,
        },
      );
      appendMessage(partnerId, message);
    },
    [partnerId, socketManager, currentUser, appendMessage],
  );

  return { messages, isLoading, hasMore, loadMore, sendMessage };
}
