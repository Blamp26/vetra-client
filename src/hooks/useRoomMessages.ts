import { useEffect, useCallback, useRef } from "react";
import { roomsApi } from "@/api/rooms";
import { useAppStore } from "@/store";
import { useMessagePagination } from "./useMessagePagination";
import type { Message } from "@/types";

const TYPING_TIMEOUT_MS = 4000;

export function useRoomMessages(roomId: number | null) {
  const currentUser                = useAppStore((s) => s.currentUser);
  const socketManager              = useAppStore((s) => s.socketManager);
  const roomConversations          = useAppStore((s) => s.roomConversations);
  const initRoomConversation       = useAppStore((s) => s.initRoomConversation);
  const setRoomMessages            = useAppStore((s) => s.setRoomMessages);
  const prependRoomMessages        = useAppStore((s) => s.prependRoomMessages);
  const appendRoomMessage          = useAppStore((s) => s.appendRoomMessage);
  const editRoomMessage            = useAppStore((s) => s.editRoomMessage);
  const deleteRoomMessage          = useAppStore((s) => s.deleteRoomMessage);
  const setRoomConversationLoading = useAppStore((s) => s.setRoomConversationLoading);
  const setRoomConversationHasMore = useAppStore((s) => s.setRoomConversationHasMore);
  const upsertRoomPreview          = useAppStore((s) => s.upsertRoomPreview);
  const roomPreviews               = useAppStore((s) => s.roomPreviews);
  const setTypingRoomMember        = useAppStore((s) => s.setTypingRoomMember);
  const clearTypingRoomMember      = useAppStore((s) => s.clearTypingRoomMember);
  const setTypingRoomMemberInfo    = useAppStore((s) => s.setTypingRoomMemberInfo);
  const clearTypingRoomMemberInfo  = useAppStore((s) => s.clearTypingRoomMemberInfo);
  const setMessageReactions        = useAppStore((s) => s.setMessageReactions);

  const typingTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const roomState = roomId !== null ? roomConversations[roomId] : null;

  // Разбрасывает реакции из массива сообщений по стору
  const hydrateReactions = useCallback(
    (msgs: Message[]) => {
      for (const msg of msgs) {
        if (msg.reactions && msg.reactions.length > 0) {
          setMessageReactions(msg.id, msg.reactions);
        }
      }
    },
    [setMessageReactions],
  );

  // Функция загрузки страницы; limit передаётся, но API комнат его игнорирует
  // (возвращает дефолтные 50). beforeId используется для пагинации.
  const fetchPage = useCallback(
    (limit: number, beforeId?: number) => {
      if (!roomId || !currentUser) return Promise.resolve<Message[]>([]);
      return roomsApi.getMessages(roomId, limit, beforeId);
    },
    [roomId, currentUser],
  );

  const actions = {
    init:        () => initRoomConversation(roomId!),
    setLoading:  (l: boolean) => setRoomConversationLoading(roomId!, l),
    setMessages: (msgs: Message[]) => {
      setRoomMessages(roomId!, msgs);
      hydrateReactions(msgs);
    },
    setHasMore:  (h: boolean) => setRoomConversationHasMore(roomId!, h),
    prepend:     (msgs: Message[]) => {
      prependRoomMessages(roomId!, msgs);
      hydrateReactions(msgs);
    },
  };

  const { messages, isLoading, hasMore, loadMore } = useMessagePagination(
    roomId,
    currentUser?.id ?? null,
    roomState,
    fetchPage,
    actions,
  );

  // ── Подключение к каналу + подписки на сообщения и тайпинг ───────────────
  useEffect(() => {
    if (!roomId || !socketManager) return;

    let cancelled = false;

    socketManager.joinRoomChannel(roomId).catch((err) => {
      console.error(`Failed to join room channel ${roomId}:`, err);
    });

    const unsubMsg = socketManager.onRoomMessage(roomId, (message: Message) => {
      if (cancelled) return;
      appendRoomMessage(roomId, message);

      // Обновляем превью комнаты в сайдбаре
      const preview = useAppStore.getState().roomPreviews[roomId];
      if (preview) {
        upsertRoomPreview({
          ...preview,
          last_message_at: message.inserted_at,
          last_message: {
            content:     message.content,
            inserted_at: message.inserted_at,
            sender_id:   message.sender_id,
            media_file_id: message.media_file_id ?? null,
            media_mime_type: message.media_mime_type ?? null,
          },
        });
      }
    });

    const unsubTypingStart = socketManager.onRoomTypingStart(roomId, (payload) => {
      if (cancelled) return;
      const senderId = payload.sender_id;

      // Сохраняем информацию о пользователе 
      if (payload.sender_username) { 
        setTypingRoomMemberInfo(senderId, { 
          username: payload.sender_username, 
          display_name: payload.sender_display_name ?? null, 
        }); 
      } 
      setTypingRoomMember(senderId);

      const existing = typingTimers.current.get(senderId);
      if (existing !== undefined) clearTimeout(existing);

      const timer = setTimeout(() => {
        clearTypingRoomMember(senderId);
        clearTypingRoomMemberInfo(senderId);
        typingTimers.current.delete(senderId);
      }, TYPING_TIMEOUT_MS);

      typingTimers.current.set(senderId, timer);
    });

    const unsubTypingStop = socketManager.onRoomTypingStop(roomId, (payload) => {
      if (cancelled) return;
      const senderId = payload.sender_id;
      const existing = typingTimers.current.get(senderId);
      if (existing !== undefined) {
        clearTimeout(existing);
        typingTimers.current.delete(senderId);
      }
      clearTypingRoomMember(senderId);
      clearTypingRoomMemberInfo(senderId);
    });

    const unsubEdited = socketManager.onRoomMessageEdited(roomId, (payload) => {
      if (cancelled) return;
      editRoomMessage(payload);
    });

    const unsubDeleted = socketManager.onRoomMessageDeleted(roomId, (payload) => {
      if (cancelled) return;
      deleteRoomMessage(payload);
    });

    return () => {
      cancelled = true;
      unsubMsg();
      unsubTypingStart();
      unsubTypingStop();
      unsubEdited();
      unsubDeleted();
      typingTimers.current.forEach((t) => clearTimeout(t));
      typingTimers.current.clear();
    };
  }, [
    roomId,
    socketManager,
    appendRoomMessage,
    editRoomMessage,
    deleteRoomMessage,
    upsertRoomPreview,
    setTypingRoomMember,
    clearTypingRoomMember,
    setTypingRoomMemberInfo,
    clearTypingRoomMemberInfo,
  ]);

  // ── Очистка таймеров при смене socketManager (logout / reconnect) ─────────
  useEffect(() => {
    return () => {
      typingTimers.current.forEach((timer) => clearTimeout(timer));
      typingTimers.current.clear();
    };
  }, [socketManager]);

  // ── Отправка сообщения ────────────────────────────────────────────────────
  // broadcast на сервере: сообщение вернётся всем участникам через onRoomMessage,
  // поэтому appendRoomMessage здесь не вызываем.
  const sendMessage = useCallback(
    async (payload: { content?: string | null; mediaFileId?: string | null }) => {
      if (!roomId || !socketManager) return;
      const trimmed = payload.content?.trim() ?? "";
      const content = trimmed.length > 0 ? trimmed : null;
      if (!content && !payload.mediaFileId) return;
      await socketManager.sendRoomMessageViaChannel(roomId, {
        content,
        mediaFileId: payload.mediaFileId ?? null
      });
    },
    [roomId, socketManager],
  );

  const roomPreview = roomId !== null ? roomPreviews[roomId] : null;

  return { messages, isLoading, hasMore, loadMore, sendMessage, roomPreview };
}
