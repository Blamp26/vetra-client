import { StateCreator } from 'zustand';
import { ActiveChat, MessageReactionGroup } from '@/shared/types';
import type { Theme } from "@/themes";

export type ModalType = "CREATE_PICKER" | "CREATE_SERVER" | "CREATE_ROOM";

export interface UISlice {
  theme: Theme;
  activeChat: ActiveChat | null;
  activeModal: ModalType | null;
  messageReactions: Record<number, MessageReactionGroup[]>;

  setTheme: (theme: Theme) => void;
  setActiveChat: (chat: ActiveChat | null) => void;
  openModal: (modal: ModalType) => void;
  closeModal: () => void;
  setMessageReactions: (messageId: number, reactions: MessageReactionGroup[]) => void;
}

const initialTheme = (localStorage.getItem("theme") as Theme) || "dark";

export const createUISlice: StateCreator<any, [], [], UISlice> = (set) => ({
  theme: initialTheme,
  activeChat: null,
  activeModal: null,
  messageReactions: {},

  setTheme: (theme) => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
    set({ theme });
  },

  setActiveChat: (chat) => set({ activeChat: chat }),
  openModal: (modal) => set({ activeModal: modal }),
  closeModal: () => set({ activeModal: null }),

  setMessageReactions: (messageId, reactions) =>
    set((state: any) => ({
      messageReactions: { ...state.messageReactions, [messageId]: reactions },
    })),
});
