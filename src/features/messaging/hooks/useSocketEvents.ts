import { useEffect } from "react";
import { useAppStore, type RootState, getState } from "@/store";
import type { Message, RoomMessageSummary } from "@/shared/types";
import { showNotification } from "@/services/notifications";
import { markReadViaChannel } from "@/services/socket";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  buildPreviewMessage,
  buildPreviewMessageFromSummary,
  getPreviewText,
} from "../utils/attachments";

export function useSocketEvents() {
  const {
    socketManager,
    currentUser,
    appendMessage,
    editMessage,
    deleteMessage,
    upsertPreview,
    applyPresenceState,
    applyPresenceDiff,
    setLastSeenAt,
    setTyping,
    clearTyping,
    editRoomMessage,
    deleteRoomMessage,
    upsertRoomPreview,
    upsertServer,
    removeServer,
    addServerChannel,
    removeRoom,
    setActiveChat,
    incrementChannelUnread,
    setMessageReactions,
    resetUnread,
    incrementRoomUnread,
    resetRoomUnread,
    updateMessagesStatus,
  } = useAppStore((s: RootState) => ({
    socketManager: s.socketManager,
    currentUser: s.currentUser,
    appendMessage: s.appendMessage,
    editMessage: s.editMessage,
    deleteMessage: s.deleteMessage,
    upsertPreview: s.upsertPreview,
    applyPresenceState: s.applyPresenceState,
    applyPresenceDiff: s.applyPresenceDiff,
    setLastSeenAt: s.setLastSeenAt,
    setTyping: s.setTyping,
    clearTyping: s.clearTyping,
    editRoomMessage: s.editRoomMessage,
    deleteRoomMessage: s.deleteRoomMessage,
    upsertRoomPreview: s.upsertRoomPreview,
    upsertServer: s.upsertServer,
    removeServer: s.removeServer,
    addServerChannel: s.addServerChannel,
    removeRoom: s.removeRoom,
    setActiveChat: s.setActiveChat,
    incrementChannelUnread: s.incrementChannelUnread,
    setMessageReactions: s.setMessageReactions,
    resetUnread: s.resetUnread,
    incrementRoomUnread: s.incrementRoomUnread,
    resetRoomUnread: s.resetRoomUnread,
    updateMessagesStatus: s.updateMessagesStatus,
  }), true);

  useEffect(() => {
    if (!socketManager || !currentUser) return;

    const unsubs: Array<() => void> = [];

    const isWindowFocused = async () => {
      try {
        const appWindow = getCurrentWebviewWindow();
        return await appWindow.isFocused();
      } catch {
        return document.hasFocus();
      }
    };

    const isActiveRoom = (roomId: number) => {
      const active = getState().activeChat;
      return (
        (active?.type === "room" && active.roomId === roomId) ||
        (active?.type === "channel" && active.channelId === roomId)
      );
    };

    const openRoomFromRealtime = (roomId: number, roomRef?: string | number | null) => {
      const state = getState();
      const preview = state.roomPreviews[roomId];

      if (preview?.server_id != null) {
        state.setActiveChat({
          type: "channel",
          channelId: roomId,
          serverId: preview.server_id,
          channelRef: roomRef ?? preview.public_id ?? roomId,
          serverRef: preview.server_public_id ?? preview.server_id,
        });
        return;
      }

      state.setActiveChat({
        type: "room",
        roomId,
        roomRef: roomRef ?? preview?.public_id ?? roomId,
      });
    };

    const updateRoomPreviewFromMessage = (msg: Message) => {
      const roomId = msg.room_id;
      if (!roomId) return;

      upsertRoomPreview({
        id: roomId,
        public_id: msg.room_public_id,
        last_message_at: msg.inserted_at,
        last_message: buildPreviewMessage(msg),
      });
    };

    const updateRoomPreviewFromSummary = (summary: RoomMessageSummary) => {
      upsertRoomPreview({
        id: summary.room_id,
        public_id: summary.room_public_id,
        last_message_at: summary.inserted_at,
        last_message: buildPreviewMessageFromSummary(summary),
      });
    };

    const trackRoomUnread = (roomId: number, delta = 1) => {
      const preview = getState().roomPreviews[roomId];

      if (preview?.server_id != null) {
        incrementChannelUnread(roomId);
      } else {
        incrementRoomUnread(roomId, delta);
      }
    };

    const notifyRoomActivity = (
      roomId: number,
      roomPublicId: string | number | null | undefined,
      senderName: string,
      body: string,
    ) => {
      const state = getState();
      const roomName = state.roomPreviews[roomId]?.name || "Group";

      showNotification(roomName, {
        body: `${senderName}: ${body}`,
        onClick: () => openRoomFromRealtime(roomId, roomPublicId),
      });
    };

    unsubs.push(socketManager.onMessage((msg: Message) => {
      const partnerId = msg.sender_id === currentUser.id ? msg.recipient_id : msg.sender_id;
      if (partnerId) {
        appendMessage(partnerId, msg);

        // Show notification for new messages from other users
        if (msg.sender_id !== currentUser.id) {
          isWindowFocused().then(async (focused) => {
            const state = getState();
            const activeChat = state.activeChat;
            const isActive =
              activeChat?.type === "direct" &&
              activeChat.partnerId === msg.sender_id;

            if (isActive && focused) {
              // Если чат активен и окно в фокусе — помечаем сразу как прочитанное
              markReadViaChannel(
                socketManager.userChannel,
                msg.sender_id === currentUser.id
                  ? msg.recipient_public_id ?? partnerId
                  : msg.sender_public_id ?? partnerId,
              );
              resetUnread(partnerId);
            } else {
              // Иначе увеличиваем счетчик непрочитанных в превью
              upsertPreview({
                partner_id: partnerId,
                partner_public_id: msg.sender_public_id,
                partner_username: msg.sender_username || "Unknown",
                partner_display_name: msg.sender_display_name || null,
                unread_count: 1, // Store will increment this
                last_message: buildPreviewMessage(msg),
              });

              if (!focused || !isActive) {
                const senderName =
                  msg.sender_display_name || msg.sender_username || "User";
                showNotification(senderName, {
                  body: getPreviewText(msg, "New message"),
                  icon: msg.sender?.avatar_url ?? undefined,
                  onClick: () => {
                    getState().setActiveChat({
                      type: "direct",
                      partnerId: msg.sender_id,
                      partnerRef: msg.sender_public_id ?? msg.sender_id,
                    });
                  },
                });
              }
            }
          });
        } else {
          // Если это наше сообщение (отправленное с другого устройства)
          upsertPreview({
            partner_id: partnerId,
            partner_public_id: msg.recipient_public_id,
            partner_username: msg.recipient_username || "Unknown",
            partner_display_name: msg.recipient_display_name || null,
            unread_count: 0,
            last_message: buildPreviewMessage(msg),
          });
        }
      }
    }));

    // Авто-прочтение при фокусе окна
    const handleFocus = async () => {
      const state = getState();
      const active = state.activeChat;
      if (active?.type === "direct" && active.partnerId) {
        markReadViaChannel(socketManager.userChannel, active.partnerRef ?? active.partnerId);
        resetUnread(active.partnerId);
      }
    };

    window.addEventListener("focus", handleFocus);
    unsubs.push(() => window.removeEventListener("focus", handleFocus));

    unsubs.push(socketManager.onMessageEdited((p) => editMessage(p)));
    unsubs.push(socketManager.onMessageDeleted((p) => deleteMessage(p)));
    unsubs.push(socketManager.onStatusUpdate((ids, status) => updateMessagesStatus(ids, status)));
    unsubs.push(socketManager.onDirectReactionUpdated((p) => {
      const partnerId = p.partner_id ?? (p.sender_id === currentUser.id ? null : p.sender_id);
      const message = partnerId == null
        ? undefined
        : getState().conversations[partnerId]?.messages.find((item) => item.id === p.message_id);
      const reactions = p.reactions.map((incoming: any) => {
        if (incoming.chosen !== undefined) return incoming;
        const key = incoming.reaction ?? incoming.emoji;
        const local = message?.reactions?.find((item: any) => (item.reaction ?? item.emoji) === key);
        return local ? { ...incoming, chosen: local.chosen } : { ...incoming, chosen: false };
      });
      setMessageReactions(p.message_id, reactions, p.updated_at);
    }));
    unsubs.push(socketManager.onPresenceState((s) => applyPresenceState(s)));
    unsubs.push(socketManager.onPresenceDiff((d) => applyPresenceDiff(d)));
    unsubs.push(socketManager.onTypingStart((id) => setTyping(id)));
    unsubs.push(socketManager.onTypingStop((id) => clearTyping(id)));
    unsubs.push(socketManager.onLastSeen((id, seen) => setLastSeenAt(id, seen)));

    unsubs.push(socketManager.onRoomMessageGlobal((msg) => {
      const roomId = msg.room_id;
      if (!roomId) return;

      updateRoomPreviewFromMessage(msg);

      if (msg.sender_id !== currentUser.id) {
        const active = isActiveRoom(roomId);

        if (!active) {
          trackRoomUnread(roomId);
        }

        isWindowFocused().then(async (focused) => {
          if (!active || !focused) {
            notifyRoomActivity(
              roomId,
              msg.room_public_id ?? roomId,
              msg.sender_display_name || msg.sender_username || "Someone",
              getPreviewText(msg, "New message"),
            );
          }
        });
      }
    }));

    unsubs.push(socketManager.onRoomMessageSummary((summary) => {
      updateRoomPreviewFromSummary(summary);

      if (summary.sender_id !== currentUser.id) {
        const active = isActiveRoom(summary.room_id);

        if (!active) {
          trackRoomUnread(summary.room_id, summary.unread_delta ?? 1);
        }

        isWindowFocused().then(async (focused) => {
          if (!active || !focused) {
            notifyRoomActivity(
              summary.room_id,
              summary.room_public_id ?? summary.room_id,
              summary.sender_display_name || summary.sender_username || "Someone",
              summary.preview || "New message",
            );
          }
        });
      }
    }));

    unsubs.push(socketManager.onRoomCreated((room) => {
      console.log("📥 room_created received", room);
      upsertRoomPreview(room);
    }));
    unsubs.push(socketManager.onRoomDeleted(({ room_id }) => {
      removeRoom(room_id);
      const active = getState().activeChat;
      if (active?.type === "room" && active.roomId === room_id) {
        resetRoomUnread(room_id);
        setActiveChat(null);
      }
    }));
    unsubs.push(socketManager.onChannelDeleted(({ channel_id }) => {
      removeRoom(channel_id); // removeRoom handles serverChannels as well
      const active = getState().activeChat;
      if (active?.type === "channel" && active.channelId === channel_id) {
        setActiveChat(null);
      }
    }));

    unsubs.push(socketManager.onServerMemberAdded(({ server }) => {
      if (server) {
        // ServerJSON.show wraps in { data: ... }
        const unwrapped = (server as any)?.data ?? server;
        upsertServer(unwrapped);
      }
    }));

    unsubs.push(socketManager.onServerMemberRemoved(({ server_id, user_id }) => {
      if (user_id === currentUser.id) {
        removeServer(server_id);
        const active = getState().activeChat;
        if (
          (active?.type === "server" && active.serverId === server_id) ||
          (active?.type === "channel" && active.serverId === server_id)
        ) {
          setActiveChat(null);
        }
      }
    }));

    unsubs.push(socketManager.onRoomMemberAdded(({ user_id, room }) => {
      console.log("📥 room_member_added received", { user_id, room });
      if (user_id === currentUser.id && room) {
        upsertRoomPreview(room);
      }
    }));

    unsubs.push(socketManager.onRoomMemberRemoved(({ room_id, user_id }) => {
      if (user_id === currentUser.id) {
        removeRoom(room_id);
        const active = getState().activeChat;
        if (active?.type === "room" && active.roomId === room_id) {
          setActiveChat(null);
        }
      } else {
        // Someone else was removed from a room we are in.
        // Update the members array if it exists in the preview.
        const state = getState();
        const existing = state.roomPreviews[room_id];
        if (existing && existing.members) {
          const updatedMembers = existing.members.filter((m: any) => m.id !== user_id);
          upsertRoomPreview({ id: room_id, members: updatedMembers });
        }
      }
    }));

    unsubs.push(socketManager.onServerDeleted(({ server_id }) => {
      removeServer(server_id);
      const active = getState().activeChat;
      if (
        (active?.type === "server" && active.serverId === server_id) ||
        (active?.type === "channel" && active.serverId === server_id)
      ) {
        setActiveChat(null);
      }
    }));
    unsubs.push(socketManager.onChannelCreated(({ server_id, channel }) => addServerChannel(server_id, channel)));

    return () => unsubs.forEach((fn) => fn());
  }, [
    socketManager,
    currentUser,
    appendMessage,
    editMessage,
    deleteMessage,
    upsertPreview,
    applyPresenceState,
    applyPresenceDiff,
    setLastSeenAt,
    setTyping,
    clearTyping,
    editRoomMessage,
    deleteRoomMessage,
    upsertRoomPreview,
    removeRoom,
    upsertServer,
    removeServer,
    addServerChannel,
    incrementChannelUnread,
    incrementRoomUnread,
    setActiveChat,
    setMessageReactions,
    updateMessagesStatus,
    resetUnread,
    resetRoomUnread,
  ]);
}
