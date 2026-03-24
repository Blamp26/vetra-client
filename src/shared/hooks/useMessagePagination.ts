import { useEffect, useCallback, useRef } from "react";
import type { Message } from "@/shared/types";

const PAGE_SIZE = 50;

export interface MessagePaginationState {
  messages:  Message[];
  isLoading: boolean;
  hasMore:   boolean;
}

export interface MessagePaginationActions {
  /** Инициализирует запись в хранилище (если ещё нет). */
  init:        () => void;
  setLoading:  (loading: boolean) => void;
  setMessages: (messages: Message[]) => void;
  setHasMore:  (hasMore: boolean) => void;
  prepend:     (messages: Message[]) => void;
}

/**
 * Общая логика пагинации для useMessages и useRoomMessages.
 */
export function useMessagePagination(
  id:            number | null,
  currentUserId: number | null,
  state:         MessagePaginationState | null,
  fetchPage:     (limit: number, beforeId?: number) => Promise<Message[]>,
  actions:       MessagePaginationActions,
) {
  const loadedRef  = useRef<Set<number>>(new Set());

  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const fetchRef   = useRef(fetchPage);
  fetchRef.current = fetchPage;

  const messages  = state?.messages  ?? [];
  const isLoading = state?.isLoading ?? false;
  const hasMore   = state?.hasMore   ?? true;

  useEffect(() => {
    if (!id || !currentUserId) return;
    if (loadedRef.current.has(id)) return;

    loadedRef.current.add(id);
    actionsRef.current.init();
    actionsRef.current.setLoading(true);

    fetchRef.current(PAGE_SIZE)
      .then((msgs) => {
        actionsRef.current.setMessages(msgs);
        actionsRef.current.setHasMore(msgs.length === PAGE_SIZE);
      })
      .catch(console.error)
      .finally(() => actionsRef.current.setLoading(false));
  }, [id, currentUserId]);

  const loadMore = useCallback(async () => {
    if (!id || !currentUserId || isLoading || !hasMore || messages.length === 0) return;
    const oldestId = messages[0].id;
    actionsRef.current.setLoading(true);
    try {
      const older = await fetchRef.current(PAGE_SIZE, oldestId);
      actionsRef.current.prepend(older);
      actionsRef.current.setHasMore(older.length === PAGE_SIZE);
    } catch (err) {
      console.error("Failed to load older messages:", err);
    } finally {
      actionsRef.current.setLoading(false);
    }
  }, [id, currentUserId, isLoading, hasMore, messages]);

  return { messages, isLoading, hasMore, loadMore };
}
