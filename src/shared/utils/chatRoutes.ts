import type {
  ActiveChat,
  Channel,
  ConversationPreview,
  ResourceRef,
  RoomPreview,
  Server,
  User,
} from "@/shared/types";
import { parseNumericRef, roomRef, serverRef, userRef } from "@/shared/utils/refs";

type SearchResults = {
  users: User[];
  servers: Server[];
};

export interface ChatRouteLookup {
  activeChat: ActiveChat | null;
  currentUser: User | null;
  conversationPreviews: Record<number, ConversationPreview>;
  roomPreviews: Record<number, RoomPreview>;
  servers: Record<number, Server>;
  serverChannels: Record<number, Channel[]>;
  searchResults: SearchResults;
}

function preferredRouteRef(
  fallbackId: number,
  explicitRef?: ResourceRef | null,
  entity?: { public_id?: string | null } | null,
): ResourceRef {
  return entity?.public_id ?? explicitRef ?? fallbackId;
}

export function activeChatKey(chat: ActiveChat | null): string {
  if (!chat) return "none";

  switch (chat.type) {
    case "direct":
      return `direct:${chat.partnerId}`;
    case "room":
      return `room:${chat.roomId}`;
    case "server":
      return `server:${chat.serverId}`;
    case "channel":
      return `channel:${chat.serverId}:${chat.channelId}`;
    case "settings":
      return "settings";
  }
}

export function sameActiveChat(a: ActiveChat | null, b: ActiveChat | null): boolean {
  return activeChatKey(a) === activeChatKey(b);
}

function findConversationUserById(lookup: ChatRouteLookup, id: number): { id: number; public_id?: string | null } | null {
  const preview = lookup.conversationPreviews[id];
  if (preview) {
    return { id: preview.partner_id, public_id: preview.partner_public_id };
  }

  const fromSearch = lookup.searchResults.users.find((user) => user.id === id);
  if (fromSearch) return fromSearch;

  if (lookup.currentUser?.id === id) return lookup.currentUser;

  return null;
}

function findRoomById(lookup: ChatRouteLookup, id: number): { id: number; public_id?: string | null } | null {
  const preview = lookup.roomPreviews[id];
  if (preview) return preview;

  for (const channels of Object.values(lookup.serverChannels)) {
    const channel = channels.find((item) => item.id === id);
    if (channel) return channel;
  }

  return null;
}

function findServerById(lookup: ChatRouteLookup, id: number): Server | null {
  const server = lookup.servers[id];
  if (server) return server;

  return lookup.searchResults.servers.find((item) => item.id === id) ?? null;
}

function resolveConversationId(lookup: ChatRouteLookup, ref: string): number | null {
  const numeric = parseNumericRef(ref);
  if (numeric !== null) return numeric;

  const preview = Object.values(lookup.conversationPreviews).find((item) => item.partner_public_id === ref);
  if (preview) return preview.partner_id;

  const user = lookup.searchResults.users.find((item) => item.public_id === ref);
  if (user) return user.id;

  if (lookup.currentUser?.public_id === ref) return lookup.currentUser.id;

  return null;
}

function resolveRoomId(lookup: ChatRouteLookup, ref: string): number | null {
  const numeric = parseNumericRef(ref);
  if (numeric !== null) return numeric;

  const preview = Object.values(lookup.roomPreviews).find((item) => item.public_id === ref);
  if (preview) return preview.id;

  for (const channels of Object.values(lookup.serverChannels)) {
    const channel = channels.find((item) => item.public_id === ref);
    if (channel) return channel.id;
  }

  return null;
}

function resolveServerId(lookup: ChatRouteLookup, ref: string): number | null {
  const numeric = parseNumericRef(ref);
  if (numeric !== null) return numeric;

  const server = Object.values(lookup.servers).find((item) => item.public_id === ref);
  if (server) return server.id;

  return lookup.searchResults.servers.find((item) => item.public_id === ref)?.id ?? null;
}

function resolveChannelId(lookup: ChatRouteLookup, serverId: number, ref: string): number | null {
  const numeric = parseNumericRef(ref);
  if (numeric !== null) return numeric;

  const channel = (lookup.serverChannels[serverId] ?? []).find((item) => item.public_id === ref);
  return channel?.id ?? null;
}

export function resolveHashToActiveChat(hash: string, lookup: ChatRouteLookup): ActiveChat | null {
  if (!hash || hash === "#") return null;

  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const [first, second, third] = parts;

  if (!first) return null;
  if (first === "settings") return { type: "settings" };

  if (first === "r" && second) {
    const resolvedRoomId = resolveRoomId(lookup, second);
    if (resolvedRoomId === null) return null;
    return { type: "room", roomId: resolvedRoomId, roomRef: second };
  }

  if (first === "s" && second) {
    const resolvedServerId = resolveServerId(lookup, second);
    if (resolvedServerId === null) return null;

    if (third) {
      const resolvedChannelId = resolveChannelId(lookup, resolvedServerId, third);
      if (resolvedChannelId === null) {
        return null;
      }

      return {
        type: "channel",
        serverId: resolvedServerId,
        channelId: resolvedChannelId,
        serverRef: second,
        channelRef: third,
      };
    }

    return { type: "server", serverId: resolvedServerId, serverRef: second };
  }

  const resolvedPartnerId = resolveConversationId(lookup, first);
  if (resolvedPartnerId === null) return null;
  return { type: "direct", partnerId: resolvedPartnerId, partnerRef: first };
}

export function buildHashForActiveChat(chat: ActiveChat | null, lookup: ChatRouteLookup): string {
  if (!chat) return "#";

  switch (chat.type) {
    case "direct": {
      const target = findConversationUserById(lookup, chat.partnerId);
      return `#/${preferredRouteRef(chat.partnerId, chat.partnerRef, target)}`;
    }
    case "room": {
      const target = findRoomById(lookup, chat.roomId);
      return `#/r/${preferredRouteRef(chat.roomId, chat.roomRef, target)}`;
    }
    case "server": {
      const target = findServerById(lookup, chat.serverId);
      return `#/s/${preferredRouteRef(chat.serverId, chat.serverRef, target)}`;
    }
    case "channel": {
      const server = findServerById(lookup, chat.serverId);
      const channel = findRoomById(lookup, chat.channelId);
      return `#/s/${preferredRouteRef(chat.serverId, chat.serverRef, server)}/${preferredRouteRef(chat.channelId, chat.channelRef, channel)}`;
    }
    case "settings":
      return "#/settings";
  }
}

export function directChatForUser(user: User): ActiveChat {
  return { type: "direct", partnerId: user.id, partnerRef: userRef(user) };
}

export function roomChatForPreview(room: RoomPreview): ActiveChat {
  return { type: "room", roomId: room.id, roomRef: roomRef(room) };
}

export function serverChatForServer(server: Server): ActiveChat {
  return { type: "server", serverId: server.id, serverRef: serverRef(server) };
}

export function channelChatForChannel(server: Server, channel: Channel): ActiveChat {
  return {
    type: "channel",
    serverId: server.id,
    channelId: channel.id,
    serverRef: serverRef(server),
    channelRef: roomRef(channel),
  };
}
