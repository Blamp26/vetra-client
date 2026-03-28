// client/src/store/index.ts
//
// УДАЛЕНО: theme из partialize — тема больше не хранится в localStorage.
//          Zustand persist оставлен для возможного использования в будущем.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { shallow } from 'zustand/shallow';
import { createAuthSlice, AuthSlice } from './slices/authSlice';
import { createMessagesSlice, MessagesSlice } from './slices/messagesSlice';
import { createRoomsSlice, RoomsSlice } from './slices/roomsSlice';
import { createServersSlice, ServersSlice } from './slices/serversSlice';
import { createPresenceSlice, PresenceSlice } from './slices/presenceSlice';
import { createUISlice, UISlice } from './slices/uiSlice';
import { createChannelsSlice, ChannelsSlice } from './slices/channelsSlice';
import { createAudioSlice, AudioSlice } from './slices/audioSlice';

export type RootState =
  AuthSlice &
  MessagesSlice &
  RoomsSlice &
  ServersSlice &
  PresenceSlice &
  UISlice &
  ChannelsSlice &
  AudioSlice;

const useAppStoreBase = create<RootState>()(
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

/**
 * Custom hook for accessing the store with optional shallow comparison.
 * 
 * Usage:
 * const user = useAppStore(s => s.currentUser); // normal
 * const { a, b } = useAppStore(s => ({ a: s.a, b: s.b }), true); // shallow
 */
export const useAppStore = <U>(
  selector: (state: RootState) => U,
  useShallow = false
): U => {
  return useAppStoreBase(selector, useShallow ? (shallow as any) : undefined);
};

// Re-export getState for non-component usage
export const getState = () => useAppStoreBase.getState();