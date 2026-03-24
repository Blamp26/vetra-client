// client/src/hooks/useSocketEvents.ts

import { useEffect, useRef } from "react";
import { useAppStore } from "@/store";
import { markReadViaChannel } from "@/services/socket";
import type { Message } from "@/types";

const TYPING_TIMEOUT_MS = 4000;

export function useSocketEvents() {
  const currentUser = useAppStore((s) => s.currentUser);
  const socketManager = useAppStore((s) => s.socketManager);
  const activeChat = useAppStore((s) => s.activeChat);
  const appendMessage = useAppStore((s) => s.appendMessage);
  const editMessage   = useAppStore((s) => s.editMessage);
  const deleteMessage = useAppStore((s) => s.deleteMessage);
  const toggleDirectReaction = useAppStore((s) => s.toggleDirectReaction);
  const upsertPreview = useAppStore((s) => s.upsertPreview);
  const applyPresenceState = useAppStore((s) => s.applyPresenceState);
  const applyPresenceDiff = useAppStore((s) => s.applyPresenceDiff);
  const setTyping = useAppStore((s) => s.setTyping);
  const clearTyping = useAppStore((s) => s.clearTyping);
  const setLastSeenAt = useAppStore((s) => s.setLastSeenAt);

  // <-- NEW: импорты для новых экшенов
  const removeServer = useAppStore((s) => s.removeServer);
  const removeRoom = useAppStore((s) => s.removeRoom);
  const upsertServer = useAppStore((s) => s.upsertServer);
  const upsertRoomPreview = useAppStore((s) => s.upsertRoomPreview);
  const addServerChannel = useAppStore((s) => s.addServerChannel);
  const setActiveChat = useAppStore((s) => s.setActiveChat);

  const activeChatRef = useRef(activeChat);
  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  const typingTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (socketManager) {
      console.log("🔌 useSocketEvents: attaching real-time listeners");
    }
  }, [socketManager]);

  // ── new_message (только личные чаты) ────────────────────────────────────
  useEffect(() => {
    if (!socketManager || !currentUser) return;

    const unsubscribe = socketManager.onMessage((message: Message) => {
      // Групповые сообщения приходят через room channel, не сюда
      if (!message.recipient_id) return;

      const partnerId =
        message.sender_id === currentUser.id
          ? message.recipient_id
          : message.sender_id;

      appendMessage(partnerId, message);

      const current = activeChatRef.current;
      const isActiveChat =
        current?.type === "direct" && current.partnerId === partnerId;

      const existing = useAppStore.getState().conversationPreviews[partnerId];

      upsertPreview({
        partner_id: partnerId,
        partner_username:
          message.sender_id === currentUser.id
            ? (existing?.partner_username ?? `user_${partnerId}`)
            : (message.sender_username || `user_${partnerId}`),
        partner_display_name:
          message.sender_id === currentUser.id
            ? (existing?.partner_display_name ?? null)
            : (message.sender_display_name || null),
        unread_count: isActiveChat
          ? 0
          : (existing?.unread_count ?? 0) +
            (message.sender_id !== currentUser.id ? 1 : 0),
        last_message: {
          content: message.content,
          inserted_at: message.inserted_at,
          sender_id: message.sender_id,
          media_file_id: message.media_file_id ?? null,
          media_mime_type: message.media_mime_type ?? null,
        },
      });

      if (message.sender_id !== currentUser.id && isActiveChat) {
        markReadViaChannel(socketManager.userChannel, message.sender_id);
      }
    });

    return unsubscribe;
  }, [socketManager, currentUser, appendMessage, upsertPreview]);

  // ── message_edited (личные чаты) ─────────────────────────────────────────
  useEffect(() => {
    if (!socketManager) return;
    return socketManager.onMessageEdited((payload) => {
      editMessage(payload);
    });
  }, [socketManager, editMessage]);

  // ── message_deleted (личные чаты) ────────────────────────────────────────
  useEffect(() => {
    if (!socketManager) return;
    return socketManager.onMessageDeleted((payload) => {
      deleteMessage(payload);
    });
  }, [socketManager, deleteMessage]);

  // ── reaction_updated (личные чаты) ───────────────────────────────────────
  useEffect(() => {
    if (!socketManager) return;
    return socketManager.onDirectReactionUpdated((payload) => {
      toggleDirectReaction(payload);
    });
  }, [socketManager, toggleDirectReaction]);

  // ── presence_state ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!socketManager) return;
    return socketManager.onPresenceState(applyPresenceState);
  }, [socketManager, applyPresenceState]);

  // ── presence_diff ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socketManager) return;
    return socketManager.onPresenceDiff(applyPresenceDiff);
  }, [socketManager, applyPresenceDiff]);

  // ── user_last_seen ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!socketManager) return;
    return socketManager.onLastSeen((userId, lastSeenAt) => {
      setLastSeenAt(userId, lastSeenAt);
    });
  }, [socketManager, setLastSeenAt]);

  // ── typing_start (личные чаты) ───────────────────────────────────────────
  useEffect(() => {
    if (!socketManager) return;

    return socketManager.onTypingStart((senderId) => {
      setTyping(senderId);

      const existing = typingTimers.current.get(senderId);
      if (existing !== undefined) clearTimeout(existing);

      const timer = setTimeout(() => {
        clearTyping(senderId);
        typingTimers.current.delete(senderId);
      }, TYPING_TIMEOUT_MS);

      typingTimers.current.set(senderId, timer);
    });
  }, [socketManager, setTyping, clearTyping]);

  // ── typing_stop (личные чаты) ────────────────────────────────────────────
  useEffect(() => {
    if (!socketManager) return;

    return socketManager.onTypingStop((senderId) => {
      const existing = typingTimers.current.get(senderId);
      if (existing !== undefined) {
        clearTimeout(existing);
        typingTimers.current.delete(senderId);
      }
      clearTyping(senderId);
    });
  }, [socketManager, clearTyping]);

  // <-- NEW: server_member_added ─────────────────────────────────────────────
  useEffect(() => {
    if (!socketManager || !currentUser) return;

    return socketManager.onServerMemberAdded((payload) => {
      const { user_id, server } = payload;
      if (user_id === currentUser.id && server) {
        upsertServer(server);
      }
    });
  }, [socketManager, currentUser, upsertServer]);

  // <-- NEW: server_member_removed ───────────────────────────────────────────
  useEffect(() => {
    if (!socketManager || !currentUser) return;

    return socketManager.onServerMemberRemoved((payload) => {
      const { server_id, user_id } = payload;
      if (user_id === currentUser.id) {
        removeServer(server_id);
        const current = activeChatRef.current;
        if (
          current?.type === "server" && current.serverId === server_id ||
          current?.type === "channel" && current.serverId === server_id
        ) {
          setActiveChat(null);
        }
      }
    });
  }, [socketManager, currentUser, removeServer, setActiveChat]);

  // <-- NEW: server_deleted ──────────────────────────────────────────────────
  useEffect(() => {
    if (!socketManager) return;

    return socketManager.onServerDeleted((payload) => {
      const { server_id } = payload;
      removeServer(server_id);
      const current = activeChatRef.current;
      if (
        current?.type === "server" && current.serverId === server_id ||
        current?.type === "channel" && current.serverId === server_id
      ) {
        setActiveChat(null);
      }
    });
  }, [socketManager, removeServer, setActiveChat]);

  // <-- NEW: room_member_added ───────────────────────────────────────────────
  useEffect(() => {
    if (!socketManager || !currentUser) return;

    return socketManager.onRoomMemberAdded((payload) => {
      const { user_id, room } = payload;
      if (user_id === currentUser.id && room) {
        upsertRoomPreview(room);
      }
    });
  }, [socketManager, currentUser, upsertRoomPreview]);

  // <-- NEW: room_member_removed ─────────────────────────────────────────────
  useEffect(() => {
    if (!socketManager || !currentUser) return;

    return socketManager.onRoomMemberRemoved((payload) => {
      const { room_id, user_id } = payload;
      if (user_id === currentUser.id) {
        removeRoom(room_id);
        const current = activeChatRef.current;
        if (
          (current?.type === "room" && current.roomId === room_id) ||
          (current?.type === "channel" && current.channelId === room_id)
        ) {
          setActiveChat(null);
        }
      }
    });
  }, [socketManager, currentUser, removeRoom, setActiveChat]);

  // <-- NEW: room_deleted ────────────────────────────────────────────────────
  useEffect(() => {
    if (!socketManager) return;

    return socketManager.onRoomDeleted((payload) => {
      const { room_id } = payload;
      removeRoom(room_id);
      const current = activeChatRef.current;
      if (
        (current?.type === "room" && current.roomId === room_id) ||
        (current?.type === "channel" && current.channelId === room_id)
      ) {
        setActiveChat(null);
      }
    });
  }, [socketManager, removeRoom, setActiveChat]);

  // <-- NEW: room_created ───────────────────────────────────────────────────
  useEffect(() => {
    if (!socketManager) return;

    return socketManager.onRoomCreated((room) => {
      console.log("📥 room_created →", room);
      upsertRoomPreview(room);
    });
  }, [socketManager, upsertRoomPreview]);

  // <-- NEW: channel_created ────────────────────────────────────────────────
  useEffect(() => {
    if (!socketManager) return;

    return socketManager.onChannelCreated((payload) => {
      console.log("📥 channel_created →", payload);

      // payload may be { server_id, channel } OR { server_id, channel: { data: { ... } } } 
      const server_id = payload.server_id; 
      const rawChannel = payload?.channel ?? null; 
      const channel = rawChannel?.data ?? rawChannel; 
  
      if (!channel || !server_id) { 
        console.warn("channel_created: missing server_id or channel", payload); 
        return; 
      } 
  
      // Avoid passing undefined fields further 
      addServerChannel(server_id, channel); 
  
      // Также добавляем в список превью для Sidebar (защита от отсутствующих полей) 
      upsertRoomPreview({ 
        id: channel.id, 
        name: channel.name ?? "New Channel", 
        created_by: channel.created_by ?? null, 
        server_id: server_id, 
        inserted_at: channel.inserted_at ?? new Date().toISOString(), 
        unread_count: 0, 
        last_message_at: null, 
        last_message: null, 
      }); 

      // Добавляем автоматическое присоединение к новому каналу 
      socketManager.joinRoomChannel(channel.id).catch((err) => { 
        console.error(`Failed to auto-join channel ${channel.id}:`, err); 
      }); 
    });
  }, [socketManager, addServerChannel, upsertRoomPreview]);

  // Подписка на глобальные комнатные сообщения (обновление превью) 
  useEffect(() => { 
    if (!socketManager) return; 
  
    return socketManager.onRoomMessageGlobal((message: Message) => { 
      const roomId = message.room_id; 
      if (!roomId) return; 
  
      const preview = useAppStore.getState().roomPreviews[roomId]; 
      if (preview) { 
        upsertRoomPreview({ 
          ...preview, 
          last_message_at: message.inserted_at, 
          last_message: { 
            content: message.content, 
            inserted_at: message.inserted_at, 
            sender_id: message.sender_id, 
            media_file_id: message.media_file_id ?? null, 
            media_mime_type: message.media_mime_type ?? null, 
          }, 
        }); 
      } 
    }); 
  }, [socketManager, upsertRoomPreview]);

  // Cleanup таймеров при размонтировании
  useEffect(() => {
    return () => {
      typingTimers.current.forEach((timer) => clearTimeout(timer));
      typingTimers.current.clear();
    };
  }, [socketManager]);
}
