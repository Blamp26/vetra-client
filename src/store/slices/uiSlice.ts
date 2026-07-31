// client/src/store/slices/uiSlice.ts

import { StateCreator } from "zustand";
import { ActiveChat, MessageReactionGroup } from "@/shared/types";
import { Theme } from "@/themes";
import { storage, STORAGE_KEYS } from "@/shared/utils/storage";
import { sameActiveChat } from "@/shared/utils/chatRoutes";

export type ModalType = "CREATE_PICKER" | "CREATE_SERVER" | "CREATE_ROOM";

export type RailContext =
  | { type: "conversations" }
  | { type: "server"; serverId: number };

export interface UISlice {
  activeChat: ActiveChat | null;
  railContext: RailContext;
  lastConversationChat: Extract<ActiveChat, { type: "direct" | "room" }> | null;
  lastServerContext: number | null;
  lastChannelIdByServer: Record<number, number>;
  activeModal: ModalType | null;
  messageReactions: Record<number, MessageReactionGroup[]>;
  messageReactionVersions: Record<number, string>;
  theme: Theme;

  setActiveChat: (chat: ActiveChat | null) => void;
  setRailContext: (context: RailContext) => void;
  selectConversations: () => void;
  selectServer: (serverId: number) => void;
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
  railContext: { type: "conversations" },
  lastConversationChat: null,
  lastServerContext: null,
  lastChannelIdByServer: {},
  activeModal: null,
  messageReactions: {},
  messageReactionVersions: {},
  theme: (storage.getString(STORAGE_KEYS.THEME) as Theme) || "light",

  setActiveChat: (chat) =>
    set((state: any) => {
      const next: any = {};
      if (chat?.type === "direct" || chat?.type === "room") {
        next.railContext = { type: "conversations" };
        next.lastConversationChat = chat;
      } else if (chat?.type === "server") {
        next.railContext = { type: "server", serverId: chat.serverId };
        next.lastServerContext = chat.serverId;
      } else if (chat?.type === "channel") {
        next.railContext = { type: "server", serverId: chat.serverId };
        next.lastServerContext = chat.serverId;
        next.lastChannelIdByServer = {
          ...(state.lastChannelIdByServer ?? {}),
          [chat.serverId]: chat.channelId,
        };
      } else if (chat === null) {
        const context = state.railContext;
        if (context?.type === "server") {
          if (state.servers?.[context.serverId]) {
            next.activeChat = { type: "server", serverId: context.serverId };
            const rememberedChannelId =
              state.lastChannelIdByServer?.[context.serverId];
            if (
              rememberedChannelId !== undefined &&
              Array.isArray(state.serverChannels?.[context.serverId]) &&
              !state.serverChannels[context.serverId].some(
                (channel: any) => channel.id === rememberedChannelId,
              )
            ) {
              next.lastChannelIdByServer = omitKey(
                state.lastChannelIdByServer ?? {},
                context.serverId,
              );
            }
          } else {
            next.railContext = { type: "conversations" };
            next.lastServerContext = null;
            const remembered = state.lastConversationChat;
            if (
              remembered &&
              isRememberedConversationValid(state, remembered)
            ) {
              next.activeChat = remembered;
            } else {
              next.activeChat = null;
              next.lastConversationChat = null;
            }
          }
        } else {
          next.activeChat = null;
        }
      }
      if (chat !== null && chat !== undefined) next.activeChat = chat;
      if (
        !state.railContext &&
        sameActiveChat(state.activeChat, next.activeChat)
      )
        return state;
      if (
        Object.keys(next).length === 0 ||
        (sameActiveChat(state.activeChat, next.activeChat) &&
          state.railContext?.type === next.railContext?.type &&
          state.railContext?.serverId === next.railContext?.serverId)
      )
        return state;
      return next;
    }),
  setRailContext: (context) => set({ railContext: context }),
  selectConversations: () =>
    set((state: any) => {
      const remembered = state.lastConversationChat;
      const chat =
        remembered && isRememberedConversationValid(state, remembered)
          ? remembered
          : null;
      return {
        railContext: { type: "conversations" },
        activeChat: chat,
        ...(remembered && !chat ? { lastConversationChat: null } : {}),
      };
    }),
  selectServer: (serverId) =>
    set((state: any) => {
      if (!state.servers?.[serverId]) return state;
      const rememberedChannelId = state.lastChannelIdByServer?.[serverId];
      const channels = state.serverChannels?.[serverId];
      const channel =
        rememberedChannelId === undefined || !Array.isArray(channels)
          ? null
          : channels.find((item: any) => item.id === rememberedChannelId);
      const server = state.servers[serverId];
      const activeChat = channel
        ? {
            type: "channel",
            serverId,
            channelId: channel.id,
            serverRef: server.public_id ?? serverId,
            channelRef: channel.public_id ?? channel.id,
          }
        : { type: "server", serverId, serverRef: server.public_id ?? serverId };
      return {
        railContext: { type: "server", serverId },
        lastServerContext: serverId,
        activeChat,
        ...(rememberedChannelId !== undefined &&
        Array.isArray(channels) &&
        !channel
          ? {
              lastChannelIdByServer: omitKey(
                state.lastChannelIdByServer ?? {},
                serverId,
              ),
            }
          : {}),
      };
    }),
  openModal: (modal) => set({ activeModal: modal }),
  closeModal: () => set({ activeModal: null }),

  setMessageReactions: (messageId, reactions, updatedAt) =>
    set((state: any) => {
      const previousVersion = (state.messageReactionVersions ?? {})[messageId];
      if (updatedAt && previousVersion && updatedAt <= previousVersion)
        return state;
      const previous = state.messageReactions[messageId] ?? [];
      const merged = reactions.map((incoming: any) => {
        const key = incoming.reaction ?? incoming.emoji;
        const old = previous.find(
          (item: any) => (item.reaction ?? item.emoji) === key,
        );
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

function omitKey(record: Record<number, number>, key: number) {
  const next = { ...record };
  delete next[key];
  return next;
}

function isRememberedConversationValid(
  state: any,
  chat: Extract<ActiveChat, { type: "direct" | "room" }>,
) {
  if (chat.type === "direct")
    return Boolean(state.conversationPreviews?.[chat.partnerId]);
  const room = state.roomPreviews?.[chat.roomId];
  return Boolean(room && room.server_id == null);
}
