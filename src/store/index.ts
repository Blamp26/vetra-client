// client/src/store/index.ts
//
// УДАЛЕНО: theme из partialize — тема больше не хранится в localStorage.
//          Zustand persist оставлен для возможного использования в будущем.

import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { shallow } from 'zustand/shallow';
import { createAuthSlice, AuthSlice } from './slices/authSlice';
import { createMessagesSlice, MessagesSlice } from './slices/messagesSlice';
import { createRoomsSlice, RoomsSlice } from './slices/roomsSlice';
import { createServersSlice, ServersSlice } from './slices/serversSlice';
import { createPresenceSlice, PresenceSlice } from './slices/presenceSlice';
import { createUISlice, UISlice } from './slices/uiSlice';
import { createChannelsSlice, ChannelsSlice } from './slices/channelsSlice';
import { createAudioSlice, AudioSlice } from './slices/audioSlice';
import { createDirectedCallHistorySlice, DirectedCallHistorySlice } from './slices/directedCallHistorySlice';
import { storage, STORAGE_KEYS } from '@/shared/utils/storage';

export type RootState =
  AuthSlice &
  MessagesSlice &
  RoomsSlice &
  ServersSlice &
  PresenceSlice &
  UISlice &
  ChannelsSlice &
  AudioSlice &
  DirectedCallHistorySlice;

const safePersistStorage: StateStorage = {
  getItem: (name) => storage.getString(name),
  setItem: (name, value) => storage.setString(name, value),
  removeItem: (name) => storage.remove(name),
};

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
      ...createDirectedCallHistorySlice(...a),
    }),
    {
      name: STORAGE_KEYS.APP_STATE,
      storage: createJSONStorage(() => safePersistStorage),
      partialize: (state) => ({
        theme: state.theme,
        selectedInputDeviceId: state.selectedInputDeviceId,
        selectedOutputDeviceId: state.selectedOutputDeviceId,
        noiseSuppression: state.noiseSuppression,
        echoCancellation: state.echoCancellation,
        autoGainControl: state.autoGainControl,
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...{
          theme: (persistedState as Partial<RootState> | undefined)?.theme ?? currentState.theme,
          selectedInputDeviceId:
            (persistedState as Partial<RootState> | undefined)?.selectedInputDeviceId ??
            currentState.selectedInputDeviceId,
          selectedOutputDeviceId:
            (persistedState as Partial<RootState> | undefined)?.selectedOutputDeviceId ??
            currentState.selectedOutputDeviceId,
          noiseSuppression:
            (persistedState as Partial<RootState> | undefined)?.noiseSuppression ??
            currentState.noiseSuppression,
          echoCancellation:
            (persistedState as Partial<RootState> | undefined)?.echoCancellation ??
            currentState.echoCancellation,
          autoGainControl:
            (persistedState as Partial<RootState> | undefined)?.autoGainControl ??
            currentState.autoGainControl,
        },
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
