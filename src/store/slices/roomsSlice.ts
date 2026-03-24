import { StateCreator } from 'zustand';
import { 
  Message, 
  RoomPreview, 
  MessageEditedPayload, 
  MessageDeletedPayload,
  ConversationState,
  DEFAULT_CONV
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

function patchSet(s: Set<number>, id: number, add: boolean): Set<number> {
  const next = new Set(s);
  add ? next.add(id) : next.delete(id);
  return next;
}

export interface RoomsSlice {
  roomPreviews: Record<number, RoomPreview>;
  roomConversations: Record<number, ConversationState>;
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
  removeRoom: (roomId: number) => void;
  removeServerChannel: (serverId: number, channelId: number) => void;
  toggleRoomReaction: (payload: any) => void;
}

export const createRoomsSlice: StateCreator<any, [], [], RoomsSlice> = (set, get) => ({
  roomPreviews: {},
  roomConversations: {},
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
    set((state: any) => ({
      roomConversations: patchConv(state.roomConversations, roomId, { messages }),
    })),

  prependRoomMessages: (roomId, messages) =>
    set((state: any) => {
      const conv = state.roomConversations[roomId];
      if (!conv) return state;
      return {
        roomConversations: patchConv(state.roomConversations, roomId, {
          messages: [...messages, ...conv.messages],
        }),
      };
    }),

  appendRoomMessage: (roomId, message) =>
    set((state: any) => {
      const conv = state.roomConversations[roomId] ?? DEFAULT_CONV;
      if (conv.messages.some((m: Message) => m.id === message.id)) return state;
      return {
        roomConversations: patchConv(state.roomConversations, roomId, {
          messages: [...conv.messages, message],
        }),
      };
    }),

  editRoomMessage: ({ id, content, edited_at, room_id }) =>
    set((state: any) => {
      if (room_id == null) return state;
      const conv = state.roomConversations[room_id];
      if (!conv) return state;
      return {
        roomConversations: patchConv(state.roomConversations, room_id, {
          messages: conv.messages.map((m: Message) =>
            m.id === id ? { ...m, content, edited_at: edited_at ?? m.edited_at } : m
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
    set((state: any) => ({
      roomConversations: patchConv(state.roomConversations, roomId, { isLoading }),
    })),

  setRoomConversationHasMore: (roomId, hasMore) =>
    set((state: any) => ({
      roomConversations: patchConv(state.roomConversations, roomId, { hasMore }),
    })),

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

  toggleRoomReaction: ({ message_id, reactions, room_id }) =>
    set((state: any) => {
      if (!room_id) return state;
      const conv = state.roomConversations[room_id];
      if (!conv) return state;
      
      return {
        roomConversations: patchConv(state.roomConversations, room_id, {
          messages: conv.messages.map((m: Message) =>
            m.id === message_id ? { ...m, reactions } : m
          ),
        }),
      };
    }),
});
