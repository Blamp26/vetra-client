// client/src/services/socket.ts

import { Socket, Channel } from "phoenix";
import type {
  Message,
  MessageStatus,
  MessageEditedPayload,
  MessageDeletedPayload,
  ReactionUpdatedPayload,
} from "@/shared/types";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "ws://localhost:4000/socket";

// ── Public handler types ──────────────────────────────────────────────────────

export type MessageHandler        = (message: Message) => void;
export type StatusUpdateHandler   = (messageIds: number[], status: MessageStatus) => void;
export type MessageEditedHandler  = (payload: MessageEditedPayload) => void;
export type MessageDeletedHandler = (payload: MessageDeletedPayload) => void;
export type ReactionUpdatedHandler  = (payload: ReactionUpdatedPayload) => void;

export type PresenceState = Record<
  string,
  { metas: Array<{ online_at: string; status?: 'online' | 'away' | 'dnd' | 'offline'; phx_ref: string }> }
>;

export interface PresenceDiff {
  joins:  PresenceState;
  leaves: PresenceState;
}

export type PresenceStateHandler = (state: PresenceState) => void;
export type PresenceDiffHandler  = (diff: PresenceDiff) => void;
export type TypingHandler        = (senderId: number) => void;
export type LastSeenHandler      = (userId: number, lastSeenAt: string) => void;
export type RoomMessageHandler   = (message: Message) => void;
export type RoomTypingPayload    = { sender_id: number; sender_username?: string; sender_display_name?: string };
export type RoomTypingHandler    = (payload: RoomTypingPayload) => void;

// <-- NEW: типы для событий серверов и комнат
export type ServerMemberAddedHandler = (payload: { server_id: number; server_name: string; user_id: number; server: any }) => void;
export type ServerMemberRemovedHandler = (payload: { server_id: number; user_id: number }) => void;
export type ServerDeletedHandler = (payload: { server_id: number }) => void;
export type RoomMemberAddedHandler = (payload: { room_id: number; room_name: string; user_id: number; room: any }) => void;
export type RoomMemberRemovedHandler = (payload: { room_id: number; user_id: number }) => void;
export type RoomDeletedHandler = (payload: { room_id: number }) => void;
export type ChannelDeletedHandler = (payload: { server_id: number; channel_id: number }) => void;
export type RoomCreatedHandler = (room: any) => void;
export type ChannelCreatedHandler = (payload: { server_id: number; channel: any }) => void;

export type OutgoingMessagePayload = { content?: string | null; mediaFileId?: string | null; replyToId?: number | null };

export interface SocketManager {
  socket:      Socket;
  userChannel: Channel;

  onMessage:        (handler: MessageHandler)        => () => void;
  onStatusUpdate:   (handler: StatusUpdateHandler)   => () => void;
  onMessageEdited:  (handler: MessageEditedHandler)  => () => void;
  onMessageDeleted: (handler: MessageDeletedHandler) => () => void;
  onDirectReactionUpdated: (handler: ReactionUpdatedHandler) => () => void;
  onPresenceState:  (handler: PresenceStateHandler)  => () => void;
  onPresenceDiff:   (handler: PresenceDiffHandler)   => () => void;
  onTypingStart:    (handler: TypingHandler)         => () => void;
  onTypingStop:     (handler: TypingHandler)         => () => void;
  onLastSeen:       (handler: LastSeenHandler)       => () => void;

  // <-- NEW: события серверов и комнат
  onServerMemberAdded:   (handler: ServerMemberAddedHandler) => () => void;
  onServerMemberRemoved: (handler: ServerMemberRemovedHandler) => () => void;
  onServerDeleted:       (handler: ServerDeletedHandler) => () => void;
  onRoomMemberAdded:     (handler: RoomMemberAddedHandler) => () => void;
  onRoomMemberRemoved: (handler: RoomMemberRemovedHandler) => () => void;
  onRoomDeleted:         (handler: RoomDeletedHandler) => () => void;
  onChannelDeleted:      (handler: ChannelDeletedHandler) => () => void;
  onRoomCreated:         (handler: RoomCreatedHandler) => () => void;
  onChannelCreated:      (handler: ChannelCreatedHandler) => () => void;
  onRoomMessageGlobal: (handler: (message: Message) => void) => () => void;

  updateStatus: (status: 'online' | 'away' | 'dnd' | 'offline') => void;

  sendTypingStart: (recipientId: number) => void;
  sendTypingStop:  (recipientId: number) => void;

  editMessage:   (recipientId: number, messageId: number, content: string) => Promise<MessageEditedPayload>;
  deleteMessage: (recipientId: number, messageId: number) => Promise<{ id: number }>;

  joinRoomChannel:            (roomId: number) => Promise<void>;
  leaveRoomChannel:           (roomId: number) => void;
  sendRoomMessageViaChannel:  (roomId: number, payload: OutgoingMessagePayload) => Promise<Message>;
  sendRoomTypingStart:        (roomId: number) => void;
  sendRoomTypingStop:         (roomId: number) => void;
  onRoomMessage:              (roomId: number, handler: RoomMessageHandler)   => () => void;
  onRoomTypingStart:          (roomId: number, handler: RoomTypingHandler)    => () => void;
  onRoomTypingStop:           (roomId: number, handler: RoomTypingHandler)    => () => void;
  onRoomMessageEdited:        (roomId: number, handler: MessageEditedHandler) => () => void;
  onRoomMessageDeleted:       (roomId: number, handler: MessageDeletedHandler) => () => void;
  onRoomReactionUpdated:      (roomId: number, handler: ReactionUpdatedHandler) => () => void;
  editRoomMessage:            (roomId: number, messageId: number, content: string) => Promise<MessageEditedPayload>;
  deleteRoomMessage:          (roomId: number, messageId: number) => Promise<{ id: number }>;
  toggleReaction:             (roomId: number, messageId: number, emoji: string) => Promise<ReactionUpdatedPayload>;
  toggleDirectReaction: (partnerId: number, messageId: number, emoji: string) => Promise<ReactionUpdatedPayload>;

  disconnect: () => void;
}

// ── Event bus factory ─────────────────────────────────────────────────────────

function makeEventBus<T>() {
  const handlers = new Set<(payload: T) => void>();
  return {
    emit: (payload: T): void => {
      handlers.forEach((h) => h(payload));
    },
    subscribe: (h: (payload: T) => void): (() => void) => {
      handlers.add(h);
      return () => handlers.delete(h);
    },
  };
}

// ── Room buses (per-room) ─────────────────────────────────────────────────────

interface RoomBus {
  message:        ReturnType<typeof makeEventBus<Message>>;
  typingStart:    ReturnType<typeof makeEventBus<RoomTypingPayload>>;
  typingStop:     ReturnType<typeof makeEventBus<RoomTypingPayload>>;
  messageEdited:  ReturnType<typeof makeEventBus<MessageEditedPayload>>;
  messageDeleted: ReturnType<typeof makeEventBus<MessageDeletedPayload>>;
  reactionUpdated:  ReturnType<typeof makeEventBus<ReactionUpdatedPayload>>;
}

// ── connectSocket ─────────────────────────────────────────────────────────────

export async function connectSocket(token: string, userId: number): Promise<SocketManager> {
  const socket = new Socket(SOCKET_URL, {
    params: { token },
    reconnectAfterMs: (tries: number) =>
      [1000, 2000, 5000, 10000][tries - 1] || 10000,
  });
  socket.connect();

  const userChannel = socket.channel(`user:${userId}`, {});

  // ── User channel buses ───────────────────────────────────────────

  const messageBus        = makeEventBus<Message>();
  const statusBus         = makeEventBus<{ ids: number[]; status: MessageStatus }>();
  const messageEditedBus  = makeEventBus<MessageEditedPayload>();
  const messageDeletedBus = makeEventBus<MessageDeletedPayload>();
  const reactionBus = makeEventBus<ReactionUpdatedPayload>();
  const presStateBus      = makeEventBus<PresenceState>();
  const presDiffBus       = makeEventBus<PresenceDiff>();
  const typStartBus       = makeEventBus<number>();
  const typStopBus        = makeEventBus<number>();
  const lastSeenBus       = makeEventBus<{ userId: number; lastSeenAt: string }>();

  // <-- NEW: buses для серверов и комнат
  const serverMemberAddedBus   = makeEventBus<{ server_id: number; server_name: string; user_id: number; server: any }>();
  const serverMemberRemovedBus = makeEventBus<{ server_id: number; user_id: number }>();
  const serverDeletedBus       = makeEventBus<{ server_id: number }>();
  const roomMemberAddedBus     = makeEventBus<{ room_id: number; room_name: string; user_id: number; room: any }>();
  const roomMemberRemovedBus   = makeEventBus<{ room_id: number; user_id: number }>();
  const roomDeletedBus         = makeEventBus<{ room_id: number }>();
  const channelDeletedBus      = makeEventBus<{ server_id: number; channel_id: number }>();
  const roomCreatedBus         = makeEventBus<any>();
  const channelCreatedBus      = makeEventBus<{ server_id: number; channel: any }>();
  const roomMessageGlobalBus = makeEventBus<Message>();

  userChannel.on("new_message", (p: Message) => messageBus.emit(p));

  userChannel.on("messages_status_updated",
    (p: { message_ids: number[]; status: MessageStatus }) =>
      statusBus.emit({ ids: p.message_ids, status: p.status }));

  userChannel.on("message_edited",  (p: MessageEditedPayload)  => messageEditedBus.emit(p));
  userChannel.on("message_deleted", (p: MessageDeletedPayload) => messageDeletedBus.emit(p));
  userChannel.on("reaction_updated", (p: ReactionUpdatedPayload) => reactionBus.emit(p));

  userChannel.on("presence_state", (p: PresenceState) =>
    presStateBus.emit(p));

  userChannel.on("presence_diff", (p: PresenceDiff) =>
    presDiffBus.emit(p));

  userChannel.on("typing_start", (p: { sender_id: number }) =>
    typStartBus.emit(p.sender_id));

  userChannel.on("typing_stop", (p: { sender_id: number }) =>
    typStopBus.emit(p.sender_id));

  userChannel.on("user_last_seen",
    (p: { user_id: number; last_seen_at: string }) =>
      lastSeenBus.emit({ userId: p.user_id, lastSeenAt: p.last_seen_at }));

  // <-- NEW: подписка на новые события
  userChannel.on("server_member_added",   (p) => serverMemberAddedBus.emit(p));
  userChannel.on("server_member_removed", (p) => serverMemberRemovedBus.emit(p));
  userChannel.on("server_deleted",        (p) => serverDeletedBus.emit(p));
  userChannel.on("room_member_added",     (p) => roomMemberAddedBus.emit(p));
  userChannel.on("room_member_removed",   (p) => roomMemberRemovedBus.emit(p));
  userChannel.on("room_deleted",          (p) => roomDeletedBus.emit(p));
  userChannel.on("channel_deleted",       (p) => channelDeletedBus.emit(p));
  userChannel.on("room_created",          (p) => roomCreatedBus.emit(p));
  userChannel.on("new_room_message", (payload: Message) => {
    roomMessageGlobalBus.emit(payload);
  });

  // Normalize channel_created payload: backend sometimes wraps the channel as { data: {...} } 
  userChannel.on("channel_created", (p) => { 
    try { 
      const server_id = p?.server_id ?? p?.serverId ?? null; 
      let channel = p?.channel ?? null; 
  
      // If the backend sent { channel: { data: { ... } } } — unwrap it 
      if (channel && typeof channel === "object" && "data" in channel && channel.data) { 
        channel = channel.data; 
      } 
  
      channelCreatedBus.emit({ server_id, channel }); 
    } catch (err) { 
      // don't break socket on malformed payloads 
      console.error("channel_created handler error:", err, p); 
      channelCreatedBus.emit(p); // fallback 
    } 
  }); 

  await new Promise<void>((resolve, reject) => {
    userChannel
      .join()
      .receive("ok",      () => resolve())
      .receive("error",   (resp) =>
        reject(new Error(String(resp?.reason ?? "Channel join failed"))))
      .receive("timeout", () =>
        reject(new Error("Channel join timed out")));
  });

  // ── Room channel registry ─────────────────────────────────────────────────

  const roomChannels = new Map<number, Channel>();
  const roomBuses    = new Map<number, RoomBus>();

  function ensureRoomBus(roomId: number): RoomBus {
    if (!roomBuses.has(roomId)) {
      roomBuses.set(roomId, {
        message:        makeEventBus<Message>(),
        typingStart:    makeEventBus<RoomTypingPayload>(),
        typingStop:     makeEventBus<RoomTypingPayload>(),
        messageEdited:  makeEventBus<MessageEditedPayload>(),
        messageDeleted: makeEventBus<MessageDeletedPayload>(),
        reactionUpdated: makeEventBus<ReactionUpdatedPayload>(),
      });
    }
    return roomBuses.get(roomId)!;
  }

  // ── Return SocketManager ──────────────────────────────────────────────────

  return {
    socket,
    userChannel,

    onMessage:        (h) => messageBus.subscribe(h),
    onStatusUpdate:   (h) => statusBus.subscribe(({ ids, status }) => h(ids, status)),
    onMessageEdited:  (h) => messageEditedBus.subscribe(h),
    onMessageDeleted: (h) => messageDeletedBus.subscribe(h),
    onDirectReactionUpdated: (h) => reactionBus.subscribe(h),
    onPresenceState:  (h) => presStateBus.subscribe(h),
    onPresenceDiff:   (h) => presDiffBus.subscribe(h),
    onTypingStart:    (h) => typStartBus.subscribe(h),
    onTypingStop:     (h) => typStopBus.subscribe(h),
    onLastSeen:       (h) => lastSeenBus.subscribe(({ userId, lastSeenAt }) => h(userId, lastSeenAt)),

    // <-- NEW: методы подписки
    onServerMemberAdded:   (h) => serverMemberAddedBus.subscribe(h),
    onServerMemberRemoved: (h) => serverMemberRemovedBus.subscribe(h),
    onServerDeleted:       (h) => serverDeletedBus.subscribe(h),
    onRoomMemberAdded:     (h) => roomMemberAddedBus.subscribe(h),
    onRoomMemberRemoved: (h) => roomMemberRemovedBus.subscribe(h),
    onRoomDeleted:         (h) => roomDeletedBus.subscribe(h),
    onChannelDeleted:      (h) => channelDeletedBus.subscribe(h),
    onRoomCreated:         (h) => roomCreatedBus.subscribe(h),
    onChannelCreated:      (h) => channelCreatedBus.subscribe(h),
    onRoomMessageGlobal: (h) => roomMessageGlobalBus.subscribe(h),

    updateStatus: (status) =>
      userChannel.push("update_status", { status }),

    sendTypingStart: (rid) =>
      userChannel.push("typing_start", { recipient_id: rid }),
    sendTypingStop: (recipientId) =>
      userChannel.push("typing_stop", { recipient_id: recipientId }),

    editMessage(recipientId, messageId, content) {
      return new Promise((resolve, reject) => {
        userChannel
          .push("edit_message", { message_id: messageId, content, recipient_id: recipientId })
          .receive("ok",      (p: MessageEditedPayload) => resolve(p))
          .receive("error",   (r) => reject(new Error(r?.reason ?? "Edit failed")))
          .receive("timeout", () => reject(new Error("Edit timed out")));
      });
    },

    deleteMessage(recipientId, messageId) {
      return new Promise((resolve, reject) => {
        userChannel
          .push("delete_message", { message_id: messageId, recipient_id: recipientId })
          .receive("ok",      (p: { id: number }) => resolve(p))
          .receive("error",   (r) => reject(new Error(r?.reason ?? "Delete failed")))
          .receive("timeout", () => reject(new Error("Delete timed out")));
      });
    },

    toggleDirectReaction(partnerId, messageId, emoji) {
      return new Promise((resolve, reject) => {
        userChannel
          .push("toggle_reaction", { message_id: messageId, emoji, partner_id: partnerId })
          .receive("ok",      (p: ReactionUpdatedPayload) => resolve(p))
          .receive("error",   (r) => reject(new Error(r?.reason ?? "Reaction failed")))
          .receive("timeout", () => reject(new Error("Reaction timed out")));
      });
    },

    async joinRoomChannel(roomId) {
      if (roomChannels.has(roomId)) return;

      const bus     = ensureRoomBus(roomId);
      const channel = socket.channel(`room:${roomId}`, {});

      channel.on("new_room_message", (p: Message)                => bus.message.emit(p));
      channel.on("typing_start",     (p: RoomTypingPayload)      => bus.typingStart.emit(p));
      channel.on("typing_stop",      (p: RoomTypingPayload)      => bus.typingStop.emit(p));
      channel.on("message_edited",   (p: MessageEditedPayload)   => bus.messageEdited.emit(p));
      channel.on("message_deleted",   (p: MessageDeletedPayload)  => bus.messageDeleted.emit(p));
      channel.on("reaction_updated",  (p: ReactionUpdatedPayload) => bus.reactionUpdated.emit(p));

      await new Promise<void>((resolve, reject) => {
        channel
          .join()
          .receive("ok",      () => resolve())
          .receive("error",   (resp) =>
            reject(new Error(String(resp?.reason ?? "Room channel join failed"))))
          .receive("timeout", () =>
            reject(new Error("Room channel join timed out")));
      });

      roomChannels.set(roomId, channel);
    },

    leaveRoomChannel(roomId) {
      roomChannels.get(roomId)?.leave();
      roomChannels.delete(roomId);
    },

    sendRoomMessageViaChannel(roomId, payload) {
      return new Promise((resolve, reject) => {
        const ch = roomChannels.get(roomId);
        if (!ch) {
          reject(new Error(`Not joined room ${roomId}`));
          return;
        }
        ch.push("send_message", {
          content: payload.content ?? null,
          media_file_id: payload.mediaFileId ?? null,
          reply_to_id: payload.replyToId ?? null
        })
          .receive("ok",      (p: Message) => resolve(p))
          .receive("error",   (resp) =>
            reject(new Error(resp?.errors?.content?.[0] ?? "Failed to send room message")))
          .receive("timeout", () =>
            reject(new Error("Send room message timed out")));
      });
    },

    sendRoomTypingStart: (roomId) =>
      roomChannels.get(roomId)?.push("typing_start", {}),
    sendRoomTypingStop: (roomId) =>
      roomChannels.get(roomId)?.push("typing_stop", {}),

    onRoomMessage:       (roomId, h) => ensureRoomBus(roomId).message.subscribe(h),
    onRoomTypingStart:   (roomId, h) => ensureRoomBus(roomId).typingStart.subscribe(h),
    onRoomTypingStop:    (roomId, h) => ensureRoomBus(roomId).typingStop.subscribe(h),
    onRoomMessageEdited:  (roomId, h) => ensureRoomBus(roomId).messageEdited.subscribe(h),
    onRoomMessageDeleted: (roomId, h) => ensureRoomBus(roomId).messageDeleted.subscribe(h),
    onRoomReactionUpdated: (roomId, h) => ensureRoomBus(roomId).reactionUpdated.subscribe(h),

    editRoomMessage(roomId, messageId, content) {
      return new Promise((resolve, reject) => {
        const ch = roomChannels.get(roomId);
        if (!ch) { reject(new Error(`Not joined room ${roomId}`)); return; }
        ch.push("edit_message", { message_id: messageId, content })
          .receive("ok",      (p: MessageEditedPayload) => resolve(p))
          .receive("error",   (r) => reject(new Error(r?.reason ?? "Edit failed")))
          .receive("timeout", () => reject(new Error("Edit timed out")));
      });
    },

    deleteRoomMessage(roomId, messageId) {
      return new Promise((resolve, reject) => {
        const ch = roomChannels.get(roomId);
        if (!ch) { reject(new Error(`Not joined room ${roomId}`)); return; }
        ch.push("delete_message", { message_id: messageId })
          .receive("ok",      (p: { id: number }) => resolve(p))
          .receive("error",   (r) => reject(new Error(r?.reason ?? "Delete failed")))
          .receive("timeout", () => reject(new Error("Delete timed out")));
      });
    },

    toggleReaction(roomId, messageId, emoji) {
      return new Promise((resolve, reject) => {
        const ch = roomChannels.get(roomId);
        if (!ch) { reject(new Error(`Not joined room ${roomId}`)); return; }
        ch.push("toggle_reaction", { message_id: messageId, emoji })
          .receive("ok",      (p: ReactionUpdatedPayload) => resolve(p))
          .receive("error",   (r) => reject(new Error(r?.reason ?? "Reaction failed")))
          .receive("timeout", () => reject(new Error("Reaction timed out")));
      });
    },

    disconnect() {
      roomChannels.forEach((ch) => ch.leave());
      roomChannels.clear();
      userChannel.leave();
      socket.disconnect();
    },
  };
}

// ── Standalone helpers (используются в useMessages / useSocketEvents) ─────────

export function sendMessageViaChannel(
  channel:     Channel,
  recipientId: number,
  payload:     OutgoingMessagePayload,
): Promise<Message> {
  return new Promise((resolve, reject) => {
    channel
      .push("send_message", {
        recipient_id: recipientId,
        content: payload.content ?? null,
        media_file_id: payload.mediaFileId ?? null,
        reply_to_id: payload.replyToId ?? null
      })
      .receive("ok",      (payload: Message) => resolve(payload))
      .receive("error",   (resp) =>
        reject(new Error(resp?.errors?.content?.[0] ?? "Failed to send message")))
      .receive("timeout", () =>
        reject(new Error("Send message timed out")));
  });
}

export function markReadViaChannel(channel: Channel, partnerId: number): void {
  channel.push("mark_read", { partner_id: partnerId });
}
