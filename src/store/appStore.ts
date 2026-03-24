import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Theme } from "@/themes";
import type {
  User, Message, MessageStatus,
  ConversationPreview, RoomPreview,
  Server, Channel,
  ActiveChat,
  MessageEditedPayload,
  MessageDeletedPayload,
  MessageReactionGroup,
} from "@/types";
import type { SocketManager, PresenceState, PresenceDiff } from "@/services/socket";

const AUTH_STORAGE_KEY = "vetra_user";

function getStoredUser(): User | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const s = localStorage.getItem(AUTH_STORAGE_KEY);
    return s ? (JSON.parse(s) as User) : null;
  } catch {
    return null;
  }
}

// ── Shared conversation state ─────────────────────────────────────────────────
// Используется и для личных чатов (conversations) и для комнат (roomConversations).
// Структура идентична, поэтому один интерфейс.

interface ConversationState {
  messages:  Message[];
  hasMore:   boolean;
  isLoading: boolean;
}

const DEFAULT_CONV: ConversationState = {
  messages:  [],
  hasMore:   true,
  isLoading: false,
};

/**
 * Обновляет одну запись в Record<number, ConversationState>.
 * Если записи нет — создаёт из DEFAULT_CONV + patch.
 */
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

/**
 * Добавляет или удаляет элемент из Set<number>, возвращая новый Set.
 */
function patchSet(s: Set<number>, id: number, add: boolean): Set<number> {
  const next = new Set(s);
  add ? next.add(id) : next.delete(id);
  return next;
}

// ── AppState ──────────────────────────────────────────────────────────────────

interface AppState {
  currentUser:   User | null;
  authToken:     string | null;
  socketManager: SocketManager | null;

  // ── Direct message state ───────────────────────────────────────────────────
  conversations:         Record<number, ConversationState>;
  conversationPreviews:  Record<number, ConversationPreview>;

  // ── Active chat ────────────────────────────────────────────────────────────
  activeChat: ActiveChat | null;

  // ── Room state ─────────────────────────────────────────────────────────────
  roomPreviews:        Record<number, RoomPreview>;
  roomConversations:   Record<number, ConversationState>;
  typingRoomMemberIds: Set<number>;
  typingRoomMemberInfo: Record<number, { username: string; display_name: string | null }>;

  // ── Reactions state ────────────────────────────────────────────────────────
  // Ключ — message_id, значение — массив сгруппированных реакций
  messageReactions: Record<number, MessageReactionGroup[]>;

  // ── Server & Channel state ─────────────────────────────────────────────────
  servers:         Record<number, Server>;
  serverChannels:  Record<number, Channel[]>;
  channelsLoading: Record<number, boolean>;

  // ── Search ─────────────────────────────────────────────────────────────────
  searchResults: User[];
  isSearching:   boolean;

  // ── Presence ───────────────────────────────────────────────────────────────
  onlineUserIds:    Set<number>;
  lastSeenAt:       Record<number, string>;
  typingPartnerIds: Set<number>;

  // === НОВОЕ === 
   editingMessage: { 
     id: number; 
     content: string; 
     chatType: 'direct' | 'room'; 
     targetId: number; // partnerId или roomId 
   } | null; 

  // ── Actions: core ──────────────────────────────────────────────────────────
  setCurrentUser:    (user: User | null) => void;
  setAuthSession:    (user: User, token: string) => void;
  updateCurrentUser: (updates: Partial<User>) => void;
  setSocketManager:  (manager: SocketManager | null) => void;
  setActiveChat:     (chat: ActiveChat | null) => void;
  setSearchResults:  (users: User[]) => void;
  setIsSearching:    (searching: boolean) => void;
  logout:            () => void;

  startEditing: (message: Message, chatType: 'direct' | 'room', targetId: number) => void; 
  cancelEditing: () => void; 

  // ── Actions: direct conversations ─────────────────────────────────────────
  initConversation:        (partnerId: number) => void;
  setConversationMessages: (partnerId: number, messages: Message[]) => void;
  prependMessages:         (partnerId: number, messages: Message[]) => void;
  appendMessage:           (partnerId: number, message: Message) => void;
  editMessage:             (payload: MessageEditedPayload) => void;
  deleteMessage:           (payload: MessageDeletedPayload) => void;
  setConversationLoading:  (partnerId: number, loading: boolean) => void;
  setConversationHasMore:  (partnerId: number, hasMore: boolean) => void;
  updateMessagesStatus:    (messageIds: number[], status: MessageStatus) => void;
  setPreviews:             (previews: ConversationPreview[]) => void;
  upsertPreview:           (preview: ConversationPreview) => void;
  resetUnread:             (partnerId: number) => void;

  // ── Actions: presence ─────────────────────────────────────────────────────
  applyPresenceState: (state: PresenceState) => void;
  applyPresenceDiff:  (diff: PresenceDiff) => void;
  setLastSeenAt:      (userId: number, lastSeenAt: string) => void;
  setTyping:          (partnerId: number) => void;
  clearTyping:        (partnerId: number) => void;

  // ── Actions: rooms ────────────────────────────────────────────────────────
  setRoomPreviews:             (previews: RoomPreview[]) => void;
  upsertRoomPreview:           (preview: RoomPreview) => void;
  initRoomConversation:        (roomId: number) => void;
  setRoomMessages:             (roomId: number, messages: Message[]) => void;
  prependRoomMessages:         (roomId: number, messages: Message[]) => void;
  appendRoomMessage:           (roomId: number, message: Message) => void;
  editRoomMessage:             (payload: MessageEditedPayload) => void;
  deleteRoomMessage:           (payload: MessageDeletedPayload) => void;
  setRoomConversationLoading:  (roomId: number, loading: boolean) => void;
  setRoomConversationHasMore:  (roomId: number, hasMore: boolean) => void;
  setTypingRoomMember:         (userId: number) => void;
  clearTypingRoomMember:       (userId: number) => void;
  setTypingRoomMemberInfo:     (userId: number, info: { username: string; display_name: string | null }) => void;
  clearTypingRoomMemberInfo:   (userId: number) => void;

  // ── Actions: reactions ────────────────────────────────────────────────────
  setMessageReactions: (messageId: number, reactions: MessageReactionGroup[]) => void;

  // ── Actions: servers & channels ───────────────────────────────────────────
  setServers:         (servers: Server[]) => void;
  upsertServer:       (server: Server) => void;
  setServerChannels:  (serverId: number, channels: Channel[]) => void;
  addServerChannel:   (serverId: number, channel: Channel) => void;
  setChannelsLoading: (serverId: number, loading: boolean) => void;
  removeServer: (serverId: number) => void;
  removeRoom: (roomId: number) => void;
}

// === THEME SLICE ===
interface ThemeSlice {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const initialTheme = (localStorage.getItem("theme") as Theme) || "dark";

// ── Store ─────────────────────────────────────────────────────────────────────

export const useAppStore = create<AppState & ThemeSlice>()(
  persist(
    (set, get) => ({
      theme: initialTheme,

      setTheme: (theme) => {
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("theme", theme);
        set({ theme });
      },

      currentUser:         getStoredUser(),
      authToken:           localStorage.getItem("vetra_token"),
      socketManager:       null,
  conversations:       {},
  conversationPreviews:{},
  activeChat:          null,
  roomPreviews:        {},
  roomConversations:   {},
  typingRoomMemberIds: new Set(),
  typingRoomMemberInfo: {},
  messageReactions:    {},
  servers:             {},
  serverChannels:      {},
  channelsLoading:     {},
  searchResults:       [],
  isSearching:         false,
  onlineUserIds:       new Set(),
  lastSeenAt:          {},
  typingPartnerIds:    new Set(),

  editingMessage: null, 

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

  // ── Core ───────────────────────────────────────────────────────────────────

  setCurrentUser: (user) => {
    if (typeof localStorage !== "undefined") {
      if (user) localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
      else       localStorage.removeItem(AUTH_STORAGE_KEY);
    }
    set({ currentUser: user });
  },

  setAuthSession: (user, token) => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
      localStorage.setItem("vetra_token", token);
    }
    set({ currentUser: user, authToken: token });
  },

  updateCurrentUser: (updates) => {
    const current = get().currentUser;
    if (!current) return;
    const updated = { ...current, ...updates };
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(updated));
    }
    set({ currentUser: updated });
  },

  setSocketManager: (manager) => {
    get().socketManager?.disconnect();
    set({ socketManager: manager });
  },

  setActiveChat: (chat) => set({ activeChat: chat }),

  setSearchResults: (users)     => set({ searchResults: users }),
  setIsSearching:   (searching) => set({ isSearching: searching }),

  logout: () => {
    get().socketManager?.disconnect();
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.removeItem("vetra_token");
    }
    set({
      currentUser:         null,
      authToken:           null,
      socketManager:       null,
      conversations:       {},
      conversationPreviews:{},
      activeChat:          null,
      roomPreviews:        {},
      roomConversations:   {},
      typingRoomMemberIds: new Set(),
      typingRoomMemberInfo: {},
      messageReactions:    {},
      servers:             {},
      serverChannels:      {},
      channelsLoading:     {},
      searchResults:       [],
      onlineUserIds:       new Set(),
      lastSeenAt:          {},
      typingPartnerIds:    new Set(),
    });
  },

  // ── Direct conversations ───────────────────────────────────────────────────

  initConversation: (partnerId) => {
    if (get().conversations[partnerId]) return;
    set((state) => ({
      conversations: patchConv(state.conversations, partnerId, {}),
    }));
  },

  setConversationMessages: (partnerId, messages) =>
    set((state) => ({
      conversations: patchConv(state.conversations, partnerId, { messages }),
    })),

  prependMessages: (partnerId, messages) =>
    set((state) => {
      const conv = state.conversations[partnerId];
      if (!conv) return state;
      return {
        conversations: patchConv(state.conversations, partnerId, {
          messages: [...messages, ...conv.messages],
        }),
      };
    }),

  appendMessage: (partnerId, message) =>
    set((state) => {
      const conv = state.conversations[partnerId] ?? DEFAULT_CONV;
      if (conv.messages.some((m) => m.id === message.id)) return state;
      return {
        conversations: patchConv(state.conversations, partnerId, {
          messages: [...conv.messages, message],
        }),
      };
    }),

  setConversationLoading: (partnerId, isLoading) =>
    set((state) => ({
      conversations: patchConv(state.conversations, partnerId, { isLoading }),
    })),

  setConversationHasMore: (partnerId, hasMore) =>
    set((state) => ({
      conversations: patchConv(state.conversations, partnerId, { hasMore }),
    })),

  editMessage: ({ id, content, edited_at, recipient_id, sender_id }) =>
    set((state) => {
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
          messages: conv.messages.map((m) =>
            m.id === id ? { ...m, content, edited_at: edited_at ?? m.edited_at } : m
          ),
        }),
      };
    }),

  deleteMessage: ({ id, recipient_id }) =>
    set((state) => {
      if (recipient_id == null) return state;

      const conv = state.conversations[recipient_id];
      if (!conv) return state;

      return {
        conversations: patchConv(state.conversations, recipient_id, {
          messages: conv.messages.filter((m) => m.id !== id),
        }),
      };
    }),

  updateMessagesStatus: (messageIds, status) => {
    const idSet = new Set(messageIds);
    set((state) => {
      const nextConversations: Record<number, ConversationState> = {};
      for (const [key, conv] of Object.entries(state.conversations)) {
        const partnerId = Number(key);
        let changed = false;
        const nextMessages = conv.messages.map((m) => {
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
    set((state) => ({
      conversationPreviews: {
        ...state.conversationPreviews,
        [preview.partner_id]: {
          ...state.conversationPreviews[preview.partner_id],
          ...preview,
        },
      },
    })),

  resetUnread: (partnerId) =>
    set((state) => {
      const existing = state.conversationPreviews[partnerId];
      if (!existing) return state;
      return {
        conversationPreviews: {
          ...state.conversationPreviews,
          [partnerId]: { ...existing, unread_count: 0 },
        },
      };
    }),

  // ── Presence ───────────────────────────────────────────────────────────────

  applyPresenceState: (state) => {
    const ids = new Set(
      Object.keys(state).map(Number).filter((n) => !isNaN(n))
    );
    set({ onlineUserIds: ids });
  },

  applyPresenceDiff: (diff) =>
    set((storeState) => {
      const next = new Set(storeState.onlineUserIds);
      for (const id of Object.keys(diff.joins))  { const n = Number(id); if (!isNaN(n)) next.add(n);    }
      for (const id of Object.keys(diff.leaves)) { const n = Number(id); if (!isNaN(n)) next.delete(n); }
      return { onlineUserIds: next };
    }),

  setLastSeenAt: (userId, lastSeenAt) =>
    set((state) => ({
      lastSeenAt: { ...state.lastSeenAt, [userId]: lastSeenAt },
    })),

  setTyping:   (partnerId) => set((state) => ({ typingPartnerIds: patchSet(state.typingPartnerIds, partnerId, true)  })),
  clearTyping: (partnerId) => set((state) => ({ typingPartnerIds: patchSet(state.typingPartnerIds, partnerId, false) })),

  // ── Rooms ──────────────────────────────────────────────────────────────────

  setRoomPreviews: (previews) =>
    set({ roomPreviews: Object.fromEntries(previews.map((p) => [p.id, p])) }),

  upsertRoomPreview: (room: any) =>
    set((state) => {
      const existing = state.roomPreviews[room.id];
      return {
        roomPreviews: {
          ...state.roomPreviews,
          [room.id]: {
            ...(existing || {}),
            ...room,
            name: room.name || existing?.name || "New Room",
          },
        },
      };
    }),

  initRoomConversation: (roomId) => {
    if (get().roomConversations[roomId]) return;
    set((state) => ({
      roomConversations: patchConv(state.roomConversations, roomId, {}),
    }));
  },

  setRoomMessages: (roomId, messages) =>
    set((state) => ({
      roomConversations: patchConv(state.roomConversations, roomId, { messages }),
    })),

  prependRoomMessages: (roomId, messages) =>
    set((state) => {
      const conv = state.roomConversations[roomId];
      if (!conv) return state;
      return {
        roomConversations: patchConv(state.roomConversations, roomId, {
          messages: [...messages, ...conv.messages],
        }),
      };
    }),

  appendRoomMessage: (roomId, message) =>
    set((state) => {
      const conv = state.roomConversations[roomId] ?? DEFAULT_CONV;
      if (conv.messages.some((m) => m.id === message.id)) return state;
      return {
        roomConversations: patchConv(state.roomConversations, roomId, {
          messages: [...conv.messages, message],
        }),
      };
    }),

  editRoomMessage: ({ id, content, edited_at, room_id }) =>
    set((state) => {
      if (room_id == null) return state;
      const conv = state.roomConversations[room_id];
      if (!conv) return state;
      return {
        roomConversations: patchConv(state.roomConversations, room_id, {
          messages: conv.messages.map((m) =>
            m.id === id ? { ...m, content, edited_at: edited_at ?? m.edited_at } : m
          ),
        }),
      };
    }),

  deleteRoomMessage: ({ id, room_id }) =>
    set((state) => {
      if (room_id == null) return state;
      const conv = state.roomConversations[room_id];
      if (!conv) return state;
      return {
        roomConversations: patchConv(state.roomConversations, room_id, {
          messages: conv.messages.filter((m) => m.id !== id),
        }),
      };
    }),

  setRoomConversationLoading: (roomId, isLoading) =>
    set((state) => ({
      roomConversations: patchConv(state.roomConversations, roomId, { isLoading }),
    })),

  setRoomConversationHasMore: (roomId, hasMore) =>
    set((state) => ({
      roomConversations: patchConv(state.roomConversations, roomId, { hasMore }),
    })),

  setTypingRoomMember:   (userId) => set((state) => ({ typingRoomMemberIds: patchSet(state.typingRoomMemberIds, userId, true)  })),
  clearTypingRoomMember: (userId) => set((state) => ({ typingRoomMemberIds: patchSet(state.typingRoomMemberIds, userId, false) })),

  setTypingRoomMemberInfo: (userId, info) =>
    set((state) => ({
      typingRoomMemberInfo: { ...state.typingRoomMemberInfo, [userId]: info }
    })),

  clearTypingRoomMemberInfo: (userId) =>
    set((state) => {
      const { [userId]: _, ...rest } = state.typingRoomMemberInfo;
      return { typingRoomMemberInfo: rest };
    }),

  // ── Reactions ──────────────────────────────────────────────────────────────

  setMessageReactions: (messageId, reactions) =>
    set((state) => ({
      messageReactions: { ...state.messageReactions, [messageId]: reactions },
    })),

  // ── Servers & Channels ─────────────────────────────────────────────────────

  setServers: (servers) =>
    set({ servers: Object.fromEntries(servers.map((s) => [s.id, s])) }),

  upsertServer: (server) =>
    set((state) => ({
      servers: { ...state.servers, [server.id]: server },
    })),

  setServerChannels: (serverId, channels) =>
    set((state) => ({
      serverChannels: { ...state.serverChannels, [serverId]: channels },
    })),

  addServerChannel: (serverId: number, channel: any) =>
    set((state) => {
      const arr = state.serverChannels[serverId] ?? [];

      // если уже есть канал с таким id — заменить его, иначе добавить 
      const exists = arr.some((c: any) => c.id === channel.id);
      const newArr = exists
        ? arr.map((c: any) =>
            c.id === channel.id
              ? {
                  ...c,
                  ...channel,
                  name: channel.name || c.name || "New Channel",
                }
              : c
          )
        : [
            ...arr,
            {
              id: channel.id,
              name: channel.name || "New Channel",
              created_by: channel.created_by,
              server_id: serverId,
              inserted_at: channel.inserted_at,
              ...channel,
            },
          ];

      return {
        serverChannels: {
          ...state.serverChannels,
          [serverId]: newArr,
        },
      };
    }),

  setChannelsLoading: (serverId, loading) =>
    set((state) => ({
      channelsLoading: { ...state.channelsLoading, [serverId]: loading },
    })),

  removeServer: (serverId) =>
    set((state) => {
      const { [serverId]: _, ...restServers } = state.servers;
      const { [serverId]: __, ...restChannels } = state.serverChannels;
      const { [serverId]: ___, ...restLoading } = state.channelsLoading;
      return {
        servers: restServers,
        serverChannels: restChannels,
        channelsLoading: restLoading,
      };
    }),

  removeRoom: (roomId) =>
    set((state) => {
      const { [roomId]: _, ...restPreviews } = state.roomPreviews;
      const { [roomId]: __, ...restConvs } = state.roomConversations;
      return {
        roomPreviews: restPreviews,
        roomConversations: restConvs,
      };
    }),
  }),
  {
    name: "vetra-storage",
    partialize: (state) => ({
      theme: state.theme,
    }),
  }
 )
);
