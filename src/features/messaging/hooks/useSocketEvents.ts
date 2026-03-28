import { useEffect } from "react";
import { useAppStore, type RootState, getState } from "@/store";
import type { Message } from "@/shared/types";
import { showNotification } from "@/services/notifications";
import { markReadViaChannel } from "@/services/socket";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

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
    appendRoomMessage,
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
    appendRoomMessage: s.appendRoomMessage,
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
              markReadViaChannel(socketManager.userChannel, partnerId);
              resetUnread(partnerId);
            } else {
              // Иначе увеличиваем счетчик непрочитанных в превью
              upsertPreview({
                partner_id: partnerId,
                partner_username: msg.sender_username || "Unknown",
                partner_display_name: msg.sender_display_name || null,
                unread_count: 1, // Store will increment this
                last_message: {
                  id: msg.id,
                  content: msg.content,
                  inserted_at: msg.inserted_at,
                  sender_id: msg.sender_id,
                  status: msg.status,
                },
              });

              if (!focused || !isActive) {
                const senderName =
                  msg.sender_display_name || msg.sender_username || "User";
                showNotification(senderName, {
                  body: msg.content || (msg.media_file_id ? "📎 Media" : "New message"),
                  icon: msg.sender?.avatar_url ?? undefined,
                  onClick: () => {
                    getState().setActiveChat({
                      type: "direct",
                      partnerId: msg.sender_id,
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
            partner_username: msg.recipient_username || "Unknown",
            partner_display_name: msg.recipient_display_name || null,
            unread_count: 0,
            last_message: {
              id: msg.id,
              content: msg.content,
              inserted_at: msg.inserted_at,
              sender_id: msg.sender_id,
              status: msg.status,
            },
          });
        }
      }
    }));

    // Авто-прочтение при фокусе окна
    const handleFocus = async () => {
      const state = getState();
      const active = state.activeChat;
      if (active?.type === "direct" && active.partnerId) {
        markReadViaChannel(socketManager.userChannel, active.partnerId);
        resetUnread(active.partnerId);
      }
    };

    window.addEventListener("focus", handleFocus);
    unsubs.push(() => window.removeEventListener("focus", handleFocus));

    unsubs.push(socketManager.onMessageEdited((p) => editMessage(p)));
    unsubs.push(socketManager.onMessageDeleted((p) => deleteMessage(p)));
    unsubs.push(socketManager.onStatusUpdate((ids, status) => updateMessagesStatus(ids, status)));
    unsubs.push(socketManager.onDirectReactionUpdated((p) => setMessageReactions(p.message_id, p.reactions)));
    unsubs.push(socketManager.onPresenceState((s) => applyPresenceState(s)));
    unsubs.push(socketManager.onPresenceDiff((d) => applyPresenceDiff(d)));
    unsubs.push(socketManager.onTypingStart((id) => setTyping(id)));
    unsubs.push(socketManager.onTypingStop((id) => clearTyping(id)));
    unsubs.push(socketManager.onLastSeen((id, seen) => setLastSeenAt(id, seen)));

    unsubs.push(socketManager.onRoomMessageGlobal((msg) => {
      const roomId = msg.room_id;
      if (!roomId) return;

      appendRoomMessage(roomId, msg);
      upsertRoomPreview({
        id: roomId,
        last_message: {
          id: msg.id,
          content: msg.content,
          inserted_at: msg.inserted_at,
          sender_id: msg.sender_id,
          status: msg.status,
        },
      });

      // Track unread count if message is not from current user
      if (msg.sender_id !== currentUser?.id) {
        const state = getState();
        const active = state.activeChat;
        const isActive = active?.type === "channel" && active.channelId === roomId;
        
        if (!isActive) {
          incrementChannelUnread(roomId);
        }

        // Show notification for room messages
        isWindowFocused().then(async (focused) => {
          if (!isActive || !focused) {
            const state = getState();
            const roomName =
              state.roomPreviews[roomId]?.name || "Group";
            const senderName =
              msg.sender_display_name || msg.sender_username || "Someone";
            showNotification(roomName, {
              body: `${senderName}: ${
                msg.content || (msg.media_file_id ? "📎 Media" : "New message")
              }`,
              onClick: () => {
                getState().setActiveChat({
                  type: "room",
                  roomId,
                });
              },
            });
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
    appendRoomMessage,
    editRoomMessage,
    deleteRoomMessage,
    upsertRoomPreview,
    removeRoom,
    upsertServer,
    removeServer,
    addServerChannel,
    incrementChannelUnread,
    setActiveChat,
    setMessageReactions,
    updateMessagesStatus,
    resetUnread,
  ]);
}
