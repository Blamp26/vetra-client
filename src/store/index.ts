import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createAuthSlice, AuthSlice } from './slices/authSlice';
import { createMessagesSlice, MessagesSlice } from './slices/messagesSlice';
import { createRoomsSlice, RoomsSlice } from './slices/roomsSlice';
import { createServersSlice, ServersSlice } from './slices/serversSlice';
import { createPresenceSlice, PresenceSlice } from './slices/presenceSlice';
import { createUISlice, UISlice } from './slices/uiSlice';
import { createChannelsSlice, ChannelsSlice } from './slices/channelsSlice';
import { createAudioSlice, AudioSlice } from "./slices/audioSlice";

export type RootState = AuthSlice & 
  MessagesSlice & 
  RoomsSlice & 
  ServersSlice & 
  PresenceSlice & 
  UISlice &
  ChannelsSlice &
  AudioSlice;

export const useAppStore = create<RootState>()(
  persist(
    (...a) => ({
      ...createAuthSlice(...a),
      ...createMessagesSlice(...a),
      ...createRoomsSlice(...a),
      ...createServersSlice(...a),
      ...createPresenceSlice(...a),
      ...createUISlice(...a),
      ...createChannelsSlice(...a),
      ...createAudioSlice(...a),
    }),
    {
      name: 'vetra-storage',
      partialize: (state) => ({
        theme: state.theme,
      }),
    }
  )
);
