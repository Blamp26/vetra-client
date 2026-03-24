import { StateCreator } from 'zustand';
import { 
  Message, 
  MessageStatus, 
  ConversationPreview, 
  MessageEditedPayload, 
  MessageDeletedPayload,
  ConversationState,
  DEFAULT_CONV,
  User
} from '@/shared/types';

function patchConv(
  record: Record<number, ConversationState>,
  id:     number,
  patch:  Partial<ConversationState>,
): Record<number, ConversationState> {
  return {
    ...record,
    [id]: { ...(record[id] ?? DEFAULT_CONV), ...patch },
  };
}

export interface MessagesSlice {
  conversations: Record<number, ConversationState>;
  conversationPreviews: Record<number, ConversationPreview>;
  searchResults: User[];
  isSearching: boolean;
  editingMessage: { 
    id: number; 
    content: string; 
    chatType: 'direct' | 'room'; 
    targetId: number; 
  } | null;

  setSearchResults: (users: User[]) => void;
  setIsSearching: (searching: boolean) => void;
  startEditing: (message: Message, chatType: 'direct' | 'room', targetId: number) => void; 
  cancelEditing: () => void; 
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

export const createMessagesSlice: StateCreator<any, [], [], MessagesSlice> = (set, get) => ({
  conversations: {},
  conversationPreviews: {},
  searchResults: [],
  isSearching: false,
  editingMessage: null,

  setSearchResults: (users) => set({ searchResults: users }),
  setIsSearching: (searching) => set({ isSearching: searching }),

  startEditing: (message, chatType, targetId) => 
    set({ 
      editingMessage: { 
        id: message.id, 
        content: message.content ?? "", 
        chatType, 
        targetId, 
      }, 
    }), 

  cancelEditing: () => set({ editingMessage: null }), 

  initConversation: (partnerId) => {
    if (get().conversations[partnerId]) return;
    set((state: any) => ({
      conversations: patchConv(state.conversations, partnerId, {}),
    }));
  },

  setConversationMessages: (partnerId, messages) =>
    set((state: any) => ({
      conversations: patchConv(state.conversations, partnerId, { messages }),
    })),

  prependMessages: (partnerId, messages) =>
    set((state: any) => {
      const conv = state.conversations[partnerId];
      if (!conv) return state;
      return {
        conversations: patchConv(state.conversations, partnerId, {
          messages: [...messages, ...conv.messages],
        }),
      };
    }),

  appendMessage: (partnerId, message) =>
    set((state: any) => {
      const conv = state.conversations[partnerId] ?? DEFAULT_CONV;
      if (conv.messages.some((m: Message) => m.id === message.id)) return state;
      return {
        conversations: patchConv(state.conversations, partnerId, {
          messages: [...conv.messages, message],
        }),
      };
    }),

  setConversationLoading: (partnerId, isLoading) =>
    set((state: any) => ({
      conversations: patchConv(state.conversations, partnerId, { isLoading }),
    })),

  setConversationHasMore: (partnerId, hasMore) =>
    set((state: any) => ({
      conversations: patchConv(state.conversations, partnerId, { hasMore }),
    })),

  editMessage: ({ id, content, edited_at, recipient_id, sender_id }) =>
    set((state: any) => {
      const currentId = state.currentUser?.id;
      const partnerId =
        recipient_id != null
          ? sender_id === currentId
            ? recipient_id
            : sender_id ?? null
          : null;
      if (partnerId == null) return state;

      const conv = state.conversations[partnerId];
      if (!conv) return state;

      return {
        conversations: patchConv(state.conversations, partnerId, {
          messages: conv.messages.map((m: Message) =>
            m.id === id ? { ...m, content, edited_at: edited_at ?? m.edited_at } : m
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
            : sender_id ?? null
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
      const nextConversations: Record<number, ConversationState> = {};
      for (const [key, conv] of Object.entries(state.conversations) as [string, ConversationState][]) {
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
      return { conversations: nextConversations };
    });
  },

  setPreviews: (previews) =>
    set({
      conversationPreviews: Object.fromEntries(previews.map((p) => [p.partner_id, p])),
    }),

  upsertPreview: (preview) =>
    set((state: any) => ({
      conversationPreviews: {
        ...state.conversationPreviews,
        [preview.partner_id]: {
          ...state.conversationPreviews[preview.partner_id],
          ...preview,
        },
      },
    })),

  resetUnread: (partnerId) =>
    set((state: any) => {
      const existing = state.conversationPreviews[partnerId];
      if (!existing) return state;
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
            : sender_id ?? null
          : null;
      if (targetPartnerId == null) return state;

      const conv = state.conversations[targetPartnerId];
      if (!conv) return state;
      
      return {
        conversations: patchConv(state.conversations, targetPartnerId, {
          messages: conv.messages.map((m: Message) =>
            m.id === message_id ? { ...m, reactions } : m
          ),
        }),
      };
    }),
});
