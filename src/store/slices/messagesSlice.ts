import { StateCreator } from "zustand";
import {
  Message,
  MessageStatus,
  ConversationPreview,
  MessageEditedPayload,
  MessageDeletedPayload,
  ConversationState,
  DEFAULT_CONV,
  User,
  Server,
} from "@/shared/types";

function mergeReactions(existing: any[], incoming: any[]) {
  return incoming.map((item) => {
    const key = item.reaction ?? item.emoji;
    const old = existing.find((candidate) => (candidate.reaction ?? candidate.emoji) === key);
    return item.chosen === undefined && old ? { ...item, chosen: old.chosen } : item;
  });
}

function sameSearchResults(
  a: { users: User[]; servers: Server[] },
  b: { users: User[]; servers: Server[] },
): boolean {
  if (
    a.users.length !== b.users.length ||
    a.servers.length !== b.servers.length
  ) {
    return false;
  }

  const sameUsers = a.users.every((user, index) => {
    const next = b.users[index];
    return (
      user.id === next?.id &&
      (user.public_id ?? null) === (next?.public_id ?? null)
    );
  });

  if (!sameUsers) return false;

  return a.servers.every((server, index) => {
    const next = b.servers[index];
    return (
      server.id === next?.id &&
      (server.public_id ?? null) === (next?.public_id ?? null)
    );
  });
}

function patchConv(
  record: Record<number, ConversationState>,
  id: number,
  patch: Partial<ConversationState>,
): Record<number, ConversationState> {
  return {
    ...record,
    [id]: { ...(record[id] ?? DEFAULT_CONV), ...patch },
  };
}

function patchConvIfChanged(
  record: Record<number, ConversationState>,
  id: number,
  patch: Partial<ConversationState>,
): Record<number, ConversationState> {
  const current = record[id] ?? DEFAULT_CONV;
  const changed = Object.entries(patch).some(
    ([key, value]) => current[key as keyof ConversationState] !== value,
  );

  if (!changed) return record;
  return patchConv(record, id, patch);
}

function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
  const byId = new Map<number, Message>();
  existing.forEach((message) => byId.set(message.id, message));
  incoming.forEach((message) => {
    const existing = byId.get(message.id);
    byId.set(
      message.id,
      existing
        ? { ...existing, ...message, reactions: message.reactions ?? existing.reactions }
        : { ...message, reactions: message.reactions ?? [] },
    );
  });

  return Array.from(byId.values()).sort((a, b) => {
    const timeDifference = parseMessageTime(a.inserted_at) - parseMessageTime(b.inserted_at);
    return timeDifference !== 0 ? timeDifference : a.id - b.id;
  });
}

function parseMessageTime(value?: string | null): number {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export interface MessagesSlice {
  conversations: Record<number, ConversationState>;
  conversationPreviews: Record<number, ConversationPreview>;
  searchResults: { users: User[]; servers: Server[] };
  isSearching: boolean;
  editingMessage: {
    id: number;
    content: string;
    entities: Message["entities"];
    chatType: "direct" | "room";
    targetId: number;
  } | null;
  selectionMode: boolean;
  selectedMessageIds: number[];
  forwardingMessageIds: number[] | null;

  setSearchResults: (results: { users: User[]; servers: Server[] }) => void;
  setIsSearching: (searching: boolean) => void;
  startEditing: (
    message: Message,
    chatType: "direct" | "room",
    targetId: number,
  ) => void;
  cancelEditing: () => void;
  setSelectionMode: (enabled: boolean) => void;
  toggleMessageSelection: (messageId: number) => void;
  clearSelection: () => void;
  setForwardingMessages: (messageIds: number[] | null) => void;
  initConversation: (partnerId: number) => void;
  setConversationMessages: (partnerId: number, messages: Message[]) => void;
  prependMessages: (partnerId: number, messages: Message[]) => void;
  appendMessage: (partnerId: number, message: Message) => void;
  editMessage: (payload: MessageEditedPayload) => void;
  deleteMessage: (payload: MessageDeletedPayload) => void;
  setConversationLoading: (partnerId: number, loading: boolean) => void;
  setConversationHasMore: (partnerId: number, hasMore: boolean) => void;
  updateMessagesStatus: (messageIds: number[], status: MessageStatus) => void;
  setPreviews: (previews: ConversationPreview[]) => void;
  upsertPreview: (preview: ConversationPreview) => void;
  resetUnread: (partnerId: number) => void;
  toggleDirectReaction: (payload: any) => void;
}

export const createMessagesSlice: StateCreator<any, [], [], MessagesSlice> = (
  set,
  get,
) => ({
  conversations: {},
  conversationPreviews: {},
  searchResults: { users: [], servers: [] },
  isSearching: false,
  editingMessage: null,
  selectionMode: false,
  selectedMessageIds: [],
  forwardingMessageIds: null,

  setSearchResults: (results) =>
    set((state: any) => {
      if (sameSearchResults(state.searchResults, results)) return state;
      return { searchResults: results };
    }),
  setIsSearching: (searching) =>
    set((state: any) => {
      if (state.isSearching === searching) return state;
      return { isSearching: searching };
    }),

  startEditing: (message, chatType, targetId) =>
    set({
      editingMessage: {
        id: message.id,
        content: message.content ?? "",
        entities: message.entities ?? [],
        chatType,
        targetId,
      },
    }),

  cancelEditing: () => set({ editingMessage: null }),

  setSelectionMode: (enabled) =>
    set({
      selectionMode: enabled,
      selectedMessageIds: enabled ? get().selectedMessageIds : [],
    }),

  toggleMessageSelection: (messageId) => {
    const { selectedMessageIds } = get();
    const isSelected = selectedMessageIds.includes(messageId);
    set({
      selectedMessageIds: isSelected
        ? selectedMessageIds.filter((id: number) => id !== messageId)
        : [...selectedMessageIds, messageId],
    });
  },

  clearSelection: () => set({ selectionMode: false, selectedMessageIds: [] }),

  setForwardingMessages: (messageIds) =>
    set({ forwardingMessageIds: messageIds }),

  initConversation: (partnerId) => {
    if (get().conversations[partnerId]) return;
    set((state: any) => ({
      conversations: patchConv(state.conversations, partnerId, {}),
    }));
  },

  setConversationMessages: (partnerId, messages) =>
    set((state: any) => {
      const current = state.conversations[partnerId] ?? DEFAULT_CONV;
      return {
        conversations: patchConv(state.conversations, partnerId, {
          messages: mergeMessages(current.messages, messages),
        }),
      };
    }),

  prependMessages: (partnerId, messages) =>
    set((state: any) => {
      const conv = state.conversations[partnerId];
      if (!conv) return state;
      return {
        conversations: patchConv(state.conversations, partnerId, {
          messages: mergeMessages(conv.messages, messages),
        }),
      };
    }),

  appendMessage: (partnerId, message) =>
    set((state: any) => {
      const conv = state.conversations[partnerId] ?? DEFAULT_CONV;
      const existing = conv.messages.find((current: Message) => current.id === message.id);
      if (existing === message) return state;
      return {
        conversations: patchConv(state.conversations, partnerId, {
          messages: mergeMessages(conv.messages, [message]),
        }),
      };
    }),

  setConversationLoading: (partnerId, isLoading) =>
    set((state: any) => {
      const conversations = patchConvIfChanged(state.conversations, partnerId, {
        isLoading,
      });
      if (conversations === state.conversations) return state;
      return { conversations };
    }),

  setConversationHasMore: (partnerId, hasMore) =>
    set((state: any) => {
      const conversations = patchConvIfChanged(state.conversations, partnerId, {
        hasMore,
      });
      if (conversations === state.conversations) return state;
      return { conversations };
    }),

  editMessage: ({ id, content, entities, edited_at, recipient_id, sender_id }) =>
    set((state: any) => {
      const currentId = state.currentUser?.id;
      const partnerId =
        recipient_id != null
          ? sender_id === currentId
            ? recipient_id
            : (sender_id ?? null)
          : null;
      if (partnerId == null) return state;

      const conv = state.conversations[partnerId];
      if (!conv) return state;

      return {
        conversations: patchConv(state.conversations, partnerId, {
          messages: conv.messages.map((m: Message) =>
            m.id === id
              ? { ...m, content, entities: entities ?? [], edited_at: edited_at ?? m.edited_at }
              : m,
          ),
        }),
      };
    }),

  deleteMessage: ({ id, recipient_id, sender_id }) =>
    set((state: any) => {
      const currentId = state.currentUser?.id;
      const partnerId =
        recipient_id != null
          ? sender_id === currentId
            ? recipient_id
            : (sender_id ?? null)
          : null;
      if (partnerId == null) return state;

      const conv = state.conversations[partnerId];
      if (!conv) return state;

      return {
        conversations: patchConv(state.conversations, partnerId, {
          messages: conv.messages.filter((m: Message) => m.id !== id),
        }),
      };
    }),

  updateMessagesStatus: (messageIds, status) => {
    const idSet = new Set(messageIds);
    set((state: any) => {
      // 1. Обновляем сообщения в активных чатах
      const nextConversations: Record<number, ConversationState> = {};
      for (const [key, conv] of Object.entries(state.conversations) as [
        string,
        ConversationState,
      ][]) {
        const partnerId = Number(key);
        let changed = false;
        const nextMessages = conv.messages.map((m: Message) => {
          if (idSet.has(m.id) && m.status !== status) {
            changed = true;
            return { ...m, status };
          }
          return m;
        });
        nextConversations[partnerId] = changed
          ? { ...conv, messages: nextMessages }
          : conv;
      }

      // 2. Обновляем статус последнего сообщения в списке превью
      const nextPreviews: Record<number, ConversationPreview> = {};
      for (const [key, preview] of Object.entries(
        state.conversationPreviews,
      ) as [string, ConversationPreview][]) {
        const partnerId = Number(key);
        if (preview.last_message && idSet.has(preview.last_message.id)) {
          nextPreviews[partnerId] = {
            ...preview,
            last_message: { ...preview.last_message, status },
          };
        } else {
          nextPreviews[partnerId] = preview;
        }
      }

      return {
        conversations: nextConversations,
        conversationPreviews: nextPreviews,
      };
    });
  },

  setPreviews: (previews) =>
    set({
      conversationPreviews: Object.fromEntries(
        previews.map((p) => [p.partner_id, p]),
      ),
    }),

  upsertPreview: (preview) =>
    set((state: any) => {
      const existing = state.conversationPreviews[preview.partner_id];
      const newUnread =
        preview.unread_count === 0
          ? 0
          : (existing?.unread_count ?? 0) + (preview.unread_count ?? 0);

      return {
        conversationPreviews: {
          ...state.conversationPreviews,
          [preview.partner_id]: {
            ...(existing ?? {}),
            ...preview,
            unread_count: newUnread,
          },
        },
      };
    }),

  resetUnread: (partnerId) =>
    set((state: any) => {
      const existing = state.conversationPreviews[partnerId];
      if (!existing) return state;
      if (existing.unread_count === 0) return state;
      return {
        conversationPreviews: {
          ...state.conversationPreviews,
          [partnerId]: { ...existing, unread_count: 0 },
        },
      };
    }),

  toggleDirectReaction: ({ message_id, reactions, partner_id, sender_id }) =>
    set((state: any) => {
      const currentId = state.currentUser?.id;
      const targetPartnerId =
        partner_id != null
          ? sender_id === currentId
            ? partner_id
            : (sender_id ?? null)
          : null;
      if (targetPartnerId == null) return state;

      const conv = state.conversations[targetPartnerId];
      if (!conv) return state;

      return {
        conversations: patchConv(state.conversations, targetPartnerId, {
          messages: conv.messages.map((m: Message) =>
            m.id === message_id ? { ...m, reactions: mergeReactions(m.reactions ?? [], reactions) } : m,
          ),
        }),
      };
    }),
});
