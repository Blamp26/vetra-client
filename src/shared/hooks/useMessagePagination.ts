import { useEffect, useCallback, useRef } from "react";
import type { Message } from "@/shared/types";

const PAGE_SIZE = 50;

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

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
  fetchPage:     (limit: number, beforeId?: number, signal?: AbortSignal) => Promise<Message[]>,
  actions:       MessagePaginationActions,
  conversationKey?: string | null,
) {
  const loadedRef = useRef<Set<string>>(new Set());
  const activeKeyRef = useRef<string | null>(null);
  const requestGenerationRef = useRef(0);
  const initialRequestRef = useRef<{
    key: string;
    generation: number;
    controller: AbortController;
    actions: MessagePaginationActions;
  } | null>(null);
  const paginationRequestRef = useRef<{
    key: string;
    generation: number;
    controller: AbortController;
    actions: MessagePaginationActions;
  } | null>(null);

  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const fetchRef   = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const stateRef = useRef(state);
  stateRef.current = state;

  const messages  = state?.messages  ?? [];
  const isLoading = state?.isLoading ?? false;
  const hasMore   = state?.hasMore   ?? true;
  const loadKey = conversationKey ?? (id !== null ? String(id) : null);

  useEffect(() => {
    const previousInitial = initialRequestRef.current;
    previousInitial?.controller.abort();
    const previousPagination = paginationRequestRef.current;
    previousPagination?.controller.abort();

    if (previousInitial) previousInitial.actions.setLoading(false);
    if (previousPagination) previousPagination.actions.setLoading(false);
    initialRequestRef.current = null;
    paginationRequestRef.current = null;
    activeKeyRef.current = loadKey;

    if (!id || !currentUserId || !loadKey) return;

    const currentActions = actions;
    const currentState = stateRef.current;
    if (loadedRef.current.has(loadKey)) {
      loadedRef.current.add(loadKey);
      if (currentState?.isLoading) currentActions.setLoading(false);
      return;
    }

    const generation = ++requestGenerationRef.current;
    const controller = new AbortController();
    const request = { key: loadKey, generation, controller, actions: currentActions };
    initialRequestRef.current = request;
    currentActions.init();
    currentActions.setLoading(true);

    fetchRef.current(PAGE_SIZE, undefined, controller.signal)
      .then((msgs) => {
        if (activeKeyRef.current !== loadKey || initialRequestRef.current !== request) return;
        loadedRef.current.add(loadKey);
        currentActions.setMessages(msgs);
        currentActions.setHasMore(msgs.length === PAGE_SIZE);
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) return;
        if (activeKeyRef.current === loadKey && initialRequestRef.current === request) {
          console.error("Failed to load messages:", error);
        }
      })
      .finally(() => {
        if (activeKeyRef.current !== loadKey || initialRequestRef.current !== request) return;
        initialRequestRef.current = null;
        currentActions.setLoading(false);
      });

    return () => {
      if (initialRequestRef.current !== request) return;
      controller.abort();
      initialRequestRef.current = null;
      currentActions.setLoading(false);
    };
  }, [id, currentUserId, loadKey, actions]);

  const loadMore = useCallback(async () => {
    if (!id || !currentUserId || !loadKey || isLoading || !hasMore || messages.length === 0) return;
    if (initialRequestRef.current?.key === loadKey || paginationRequestRef.current?.key === loadKey) return;

    const oldestId = messages[0].id;
    const generation = ++requestGenerationRef.current;
    const controller = new AbortController();
    const currentActions = actionsRef.current;
    const request = { key: loadKey, generation, controller, actions: currentActions };
    paginationRequestRef.current = request;
    currentActions.setLoading(true);

    try {
      const older = await fetchRef.current(PAGE_SIZE, oldestId, controller.signal);
      if (activeKeyRef.current !== loadKey || paginationRequestRef.current !== request) return;
      currentActions.prepend(older);
      currentActions.setHasMore(older.length === PAGE_SIZE);
    } catch (err) {
      if (!isAbortError(err)) {
        console.error("Failed to load older messages:", err);
      }
    } finally {
      if (activeKeyRef.current === loadKey && paginationRequestRef.current === request) {
        paginationRequestRef.current = null;
        currentActions.setLoading(false);
      }
    }
  }, [id, currentUserId, loadKey, isLoading, hasMore, messages]);

  return { messages, isLoading, hasMore, loadMore };
}
