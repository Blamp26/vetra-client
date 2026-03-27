// client/src/store/slices/uiSlice.ts
//
// УДАЛЕНО: theme, setTheme — переключение тем убрано.
//          Светлая тема задана статически через CSS-переменные в styles.css.
// СОХРАНЕНО: activeChat, activeModal, messageReactions и все их экшены.

import { StateCreator } from 'zustand';
import { ActiveChat, MessageReactionGroup } from '@/shared/types';
import { Theme } from '@/themes';

export type ModalType = 'CREATE_PICKER' | 'CREATE_SERVER' | 'CREATE_ROOM';

export interface UISlice {
  activeChat: ActiveChat | null;
  activeModal: ModalType | null;
  messageReactions: Record<number, MessageReactionGroup[]>;
  theme: Theme;

  setActiveChat: (chat: ActiveChat | null) => void;
  openModal: (modal: ModalType) => void;
  closeModal: () => void;
  setMessageReactions: (messageId: number, reactions: MessageReactionGroup[]) => void;
  setTheme: (theme: Theme) => void;
}

export const createUISlice: StateCreator<any, [], [], UISlice> = (set) => ({
  activeChat: null,
  activeModal: null,
  messageReactions: {},
  theme: (localStorage.getItem('vetra_theme') as Theme) || 'light',

  setActiveChat: (chat) => set({ activeChat: chat }),
  openModal: (modal) => set({ activeModal: modal }),
  closeModal: () => set({ activeModal: null }),

  setMessageReactions: (messageId, reactions) =>
    set((state: any) => ({
      messageReactions: { ...state.messageReactions, [messageId]: reactions },
    })),

  setTheme: (theme) => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('vetra_theme', theme);
    set({ theme });
  },
});