import { StateCreator } from 'zustand';
import { 
  Message, 
  RoomPreview, 
  MessageEditedPayload, 
  MessageDeletedPayload,
  ConversationState,
  DEFAULT_CONV
} from '@/shared/types';
import { mergeEditedMessageEntities } from '@/shared/utils/textEntities';

function mergeReactions(existing: any[], incoming: any[]) {
  return incoming.map((item) => {
    const key = item.reaction ?? item.emoji;
    const old = existing.find((candidate) => (candidate.reaction ?? candidate.emoji) === key);
    return item.chosen === undefined && old ? { ...item, chosen: old.chosen } : item;
  });
}

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

function patchSet(s: Set<number>, id: number, add: boolean): Set<number> {
  const next = new Set(s);
  add ? next.add(id) : next.delete(id);
  return next;
}

export interface RoomsSlice {
  roomPreviews: Record<number, RoomPreview>;
  roomConversations: Record<number, ConversationState>;
  roomReactionVersions: Record<number, string>;
  typingRoomMemberIds: Set<number>;
  typingRoomMemberInfo: Record<number, { username: string; display_name: string | null }>;

  setRoomPreviews: (previews: RoomPreview[]) => void;
  upsertRoomPreview: (preview: any) => void;
  initRoomConversation: (roomId: number) => void;
  setRoomMessages: (roomId: number, messages: Message[]) => void;
  prependRoomMessages: (roomId: number, messages: Message[]) => void;
  appendRoomMessage: (roomId: number, message: Message) => void;
  editRoomMessage: (payload: MessageEditedPayload) => void;
  deleteRoomMessage: (payload: MessageDeletedPayload) => void;
  setRoomConversationLoading: (roomId: number, loading: boolean) => void;
  setRoomConversationHasMore: (roomId: number, hasMore: boolean) => void;
  setTypingRoomMember: (userId: number) => void;
  clearTypingRoomMember: (userId: number) => void;
  setTypingRoomMemberInfo: (userId: number, info: { username: string; display_name: string | null }) => void;
  clearTypingRoomMemberInfo: (userId: number) => void;
  incrementRoomUnread: (roomId: number, delta?: number) => void;
  resetRoomUnread: (roomId: number) => void;
  removeRoom: (roomId: number) => void;
  removeServerChannel: (serverId: number, channelId: number) => void;
  toggleRoomReaction: (payload: any) => void;
}

export const createRoomsSlice: StateCreator<any, [], [], RoomsSlice> = (set, get) => ({
  roomPreviews: {},
  roomConversations: {},
  roomReactionVersions: {},
  typingRoomMemberIds: new Set(),
  typingRoomMemberInfo: {},

  setRoomPreviews: (previews) =>
    set({ roomPreviews: Object.fromEntries(previews.map((p) => [p.id, p])) }),

  upsertRoomPreview: (room: any) =>
    set((state: any) => {
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
    set((state: any) => ({
      roomConversations: patchConv(state.roomConversations, roomId, {}),
    }));
  },

  setRoomMessages: (roomId, messages) =>
    set((state: any) => {
      const current = state.roomConversations[roomId] ?? DEFAULT_CONV;
      return {
        roomConversations: patchConv(state.roomConversations, roomId, {
          messages: mergeMessages(current.messages, messages),
        }),
      };
    }),

  prependRoomMessages: (roomId, messages) =>
    set((state: any) => {
      const conv = state.roomConversations[roomId];
      if (!conv) return state;
      return {
        roomConversations: patchConv(state.roomConversations, roomId, {
          messages: mergeMessages(conv.messages, messages),
        }),
      };
    }),

  appendRoomMessage: (roomId, message) =>
    set((state: any) => {
      const conv = state.roomConversations[roomId] ?? DEFAULT_CONV;
      const existing = conv.messages.find((current: Message) => current.id === message.id);
      if (existing === message) return state;
      return {
        roomConversations: patchConv(state.roomConversations, roomId, {
          messages: mergeMessages(conv.messages, [message]),
        }),
      };
    }),

  editRoomMessage: ({ id, content, entities, edited_at, room_id }) =>
    set((state: any) => {
      if (room_id == null) return state;
      const conv = state.roomConversations[room_id];
      if (!conv) return state;
      return {
        roomConversations: patchConv(state.roomConversations, room_id, {
          messages: conv.messages.map((m: Message) =>
            m.id === id ? { ...m, content, entities: mergeEditedMessageEntities(m.entities, entities, content), edited_at: edited_at ?? m.edited_at } : m
          ),
        }),
      };
    }),

  deleteRoomMessage: ({ id, room_id }) =>
    set((state: any) => {
      if (room_id == null) return state;
      const conv = state.roomConversations[room_id];
      if (!conv) return state;
      return {
        roomConversations: patchConv(state.roomConversations, room_id, {
          messages: conv.messages.filter((m: Message) => m.id !== id),
        }),
      };
    }),

  setRoomConversationLoading: (roomId, isLoading) =>
    set((state: any) => {
      const roomConversations = patchConvIfChanged(
        state.roomConversations,
        roomId,
        { isLoading },
      );
      if (roomConversations === state.roomConversations) return state;
      return { roomConversations };
    }),

  setRoomConversationHasMore: (roomId, hasMore) =>
    set((state: any) => {
      const roomConversations = patchConvIfChanged(
        state.roomConversations,
        roomId,
        { hasMore },
      );
      if (roomConversations === state.roomConversations) return state;
      return { roomConversations };
    }),

  setTypingRoomMember:   (userId) => set((state: any) => ({ typingRoomMemberIds: patchSet(state.typingRoomMemberIds, userId, true)  })),
  clearTypingRoomMember: (userId) => set((state: any) => ({ typingRoomMemberIds: patchSet(state.typingRoomMemberIds, userId, false) })),

  setTypingRoomMemberInfo: (userId, info) =>
    set((state: any) => ({
      typingRoomMemberInfo: { ...state.typingRoomMemberInfo, [userId]: info }
    })),

  clearTypingRoomMemberInfo: (userId) =>
    set((state: any) => {
      const { [userId]: _, ...rest } = state.typingRoomMemberInfo;
      return { typingRoomMemberInfo: rest };
    }),

  incrementRoomUnread: (roomId, delta = 1) =>
    set((state: any) => {
      const existing = state.roomPreviews[roomId];
      if (!existing) return state;

      return {
        roomPreviews: {
          ...state.roomPreviews,
          [roomId]: {
            ...existing,
            unread_count: (existing.unread_count ?? 0) + delta,
          },
        },
      };
    }),

  resetRoomUnread: (roomId) =>
    set((state: any) => {
      const existing = state.roomPreviews[roomId];
      if (!existing || (existing.unread_count ?? 0) === 0) return state;

      return {
        roomPreviews: {
          ...state.roomPreviews,
          [roomId]: {
            ...existing,
            unread_count: 0,
          },
        },
      };
    }),

  removeRoom: (roomId) =>
    set((state: any) => {
      const { [roomId]: _, ...restPreviews } = state.roomPreviews;
      const { [roomId]: __, ...restConvs } = state.roomConversations;
      
      // Also try to remove from serverChannels if it exists in any server
      const serverChannels = { ...state.serverChannels };
      let changed = false;
      
      Object.keys(serverChannels).forEach(serverId => {
        const sid = Number(serverId);
        const channels = serverChannels[sid];
        if (channels && channels.some((c: any) => c.id === roomId)) {
          serverChannels[sid] = channels.filter((c: any) => c.id !== roomId);
          changed = true;
        }
      });

      return {
        roomPreviews: restPreviews,
        roomConversations: restConvs,
        ...(changed ? { serverChannels } : {})
      };
    }),

  removeServerChannel: (serverId, channelId) =>
    set((state: any) => {
      const channels = state.serverChannels[serverId];
      if (!channels) return state;
      
      return {
        serverChannels: {
          ...state.serverChannels,
          [serverId]: channels.filter((c: any) => c.id !== channelId)
        }
      };
    }),

  toggleRoomReaction: ({ message_id, reactions, room_id, updated_at }) =>
    set((state: any) => {
      if (!room_id) return state;
      const previousVersion = (state.roomReactionVersions ?? {})[message_id];
      if (updated_at && previousVersion && updated_at <= previousVersion) return state;
      const conv = state.roomConversations[room_id];
      if (!conv) return state;
      
      return {
        roomConversations: patchConv(state.roomConversations, room_id, {
          messages: conv.messages.map((m: Message) =>
            m.id === message_id ? { ...m, reactions: mergeReactions(m.reactions ?? [], reactions) } : m
          ),
        }),
        roomReactionVersions: updated_at
          ? { ...(state.roomReactionVersions ?? {}), [message_id]: updated_at }
          : (state.roomReactionVersions ?? {}),
      };
    }),
});
