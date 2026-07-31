// client/src/store/slices/uiSlice.ts

import { StateCreator } from "zustand";
import { ActiveChat, MessageReactionGroup } from "@/shared/types";
import { Theme } from "@/themes";
import { storage, STORAGE_KEYS } from "@/shared/utils/storage";
import { sameActiveChat } from "@/shared/utils/chatRoutes";

export type ModalType = "CREATE_PICKER" | "CREATE_SERVER" | "CREATE_ROOM";

export interface UISlice {
  activeChat: ActiveChat | null;
  activeModal: ModalType | null;
  messageReactions: Record<number, MessageReactionGroup[]>;
  messageReactionVersions: Record<number, string>;
  theme: Theme;

  setActiveChat: (chat: ActiveChat | null) => void;
  openModal: (modal: ModalType) => void;
  closeModal: () => void;
  setMessageReactions: (
    messageId: number,
    reactions: MessageReactionGroup[],
    updatedAt?: string,
  ) => void;
  setTheme: (theme: Theme) => void;
}

export const createUISlice: StateCreator<any, [], [], UISlice> = (set) => ({
  activeChat: null,
  activeModal: null,
  messageReactions: {},
  messageReactionVersions: {},
  theme: (storage.getString(STORAGE_KEYS.THEME) as Theme) || "light",

  setActiveChat: (chat) =>
    set((state: any) => {
      if (sameActiveChat(state.activeChat, chat)) return state;
      return { activeChat: chat };
    }),
  openModal: (modal) => set({ activeModal: modal }),
  closeModal: () => set({ activeModal: null }),

  setMessageReactions: (messageId, reactions, updatedAt) =>
    set((state: any) => {
      const previousVersion = (state.messageReactionVersions ?? {})[messageId];
      if (updatedAt && previousVersion && updatedAt <= previousVersion) return state;
      const previous = state.messageReactions[messageId] ?? [];
      const merged = reactions.map((incoming: any) => {
        const key = incoming.reaction ?? incoming.emoji;
        const old = previous.find((item: any) => (item.reaction ?? item.emoji) === key);
        return incoming.chosen === undefined && old
          ? { ...incoming, chosen: old.chosen }
          : incoming;
      });
      return {
        messageReactions: { ...state.messageReactions, [messageId]: merged },
        messageReactionVersions: updatedAt
          ? { ...(state.messageReactionVersions ?? {}), [messageId]: updatedAt }
          : (state.messageReactionVersions ?? {}),
      };
    }),

  setTheme: (theme) => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    storage.setString(STORAGE_KEYS.THEME, theme);
    set({ theme });
  },
});
