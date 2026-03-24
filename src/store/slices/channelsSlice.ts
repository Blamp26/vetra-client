import { StateCreator } from 'zustand';

export interface ChannelsSlice {
  channelUnread: Record<number, number>;
  incrementChannelUnread: (channelId: number) => void;
  resetChannelUnread: (channelId: number) => void;
  setChannelUnread: (channelId: number, count: number) => void;
}

export const createChannelsSlice: StateCreator<any, [], [], ChannelsSlice> = (set) => ({
  channelUnread: {},

  incrementChannelUnread: (channelId) =>
    set((state: any) => ({
      channelUnread: {
        ...state.channelUnread,
        [channelId]: (state.channelUnread[channelId] || 0) + 1,
      },
    })),

  resetChannelUnread: (channelId) =>
    set((state: any) => {
      const { [channelId]: _, ...rest } = state.channelUnread;
      return { channelUnread: rest };
    }),

  setChannelUnread: (channelId, count) =>
    set((state: any) => ({
      channelUnread: {
        ...state.channelUnread,
        [channelId]: count,
      },
    })),
});
