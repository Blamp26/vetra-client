import { useEffect, useCallback } from "react";
import { messagesApi } from "@/api/messages";
import { markReadViaChannel, sendMessageViaChannel } from "@/services/socket";
import { useAppStore } from "@/store";
import { useMessagePagination } from "./useMessagePagination";

export function useMessages(partnerId: number | null) {
  const currentUser             = useAppStore((s) => s.currentUser);
  const socketManager           = useAppStore((s) => s.socketManager);
  const conversations           = useAppStore((s) => s.conversations);
  const initConversation        = useAppStore((s) => s.initConversation);
  const setConversationMessages = useAppStore((s) => s.setConversationMessages);
  const prependMessages         = useAppStore((s) => s.prependMessages);
  const appendMessage           = useAppStore((s) => s.appendMessage);
  const setConversationLoading  = useAppStore((s) => s.setConversationLoading);
  const setConversationHasMore  = useAppStore((s) => s.setConversationHasMore);
  const updateMessagesStatus    = useAppStore((s) => s.updateMessagesStatus);
  const resetUnread             = useAppStore((s) => s.resetUnread);

  const conversation = partnerId !== null ? conversations[partnerId] : null;

  // Функция загрузки страницы; стабилизируется useCallback.
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

  // Экшены передаются объектом; стабилизируются через useRef внутри хука.
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

  // ── Подписка на обновления статусов сообщений ─────────────────────────────
  useEffect(() => {
    if (!socketManager) return;
    return socketManager.onStatusUpdate((ids, status) => {
      updateMessagesStatus(ids, status);
    });
  }, [socketManager, updateMessagesStatus]);

  // ── Пометить прочитанным при открытии чата ────────────────────────────────
  useEffect(() => {
    if (!partnerId || !socketManager) return;
    markReadViaChannel(socketManager.userChannel, partnerId);
    resetUnread(partnerId);
  }, [partnerId, socketManager, resetUnread]);

  // ── Отправка сообщения ────────────────────────────────────────────────────
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
