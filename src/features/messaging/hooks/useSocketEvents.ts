import { useEffect } from "react";
import { useAppStore, type RootState } from "@/store";
import type { Message } from "@/shared/types";
import { showNotification } from "@/services/notifications";
import { markReadViaChannel } from "@/services/socket";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

export function useSocketEvents() {
  const socketManager        = useAppStore((s: RootState) => s.socketManager);
  const currentUser          = useAppStore((s: RootState) => s.currentUser);
  const appendMessage        = useAppStore((s: RootState) => s.appendMessage);
  const editMessage          = useAppStore((s: RootState) => s.editMessage);
  const deleteMessage        = useAppStore((s: RootState) => s.deleteMessage);
  const upsertPreview        = useAppStore((s: RootState) => s.upsertPreview);
  const applyPresenceState   = useAppStore((s: RootState) => s.applyPresenceState);
  const applyPresenceDiff    = useAppStore((s: RootState) => s.applyPresenceDiff);
  const setLastSeenAt        = useAppStore((s: RootState) => s.setLastSeenAt);
  const setTyping            = useAppStore((s: RootState) => s.setTyping);
  const clearTyping          = useAppStore((s: RootState) => s.clearTyping);
  const appendRoomMessage    = useAppStore((s: RootState) => s.appendRoomMessage);
  const editRoomMessage      = useAppStore((s: RootState) => s.editRoomMessage);
  const deleteRoomMessage    = useAppStore((s: RootState) => s.deleteRoomMessage);
  const upsertRoomPreview    = useAppStore((s: RootState) => s.upsertRoomPreview);
  const upsertServer         = useAppStore((s: RootState) => s.upsertServer);
  const removeServer         = useAppStore((s: RootState) => s.removeServer);
  const addServerChannel     = useAppStore((s: RootState) => s.addServerChannel);
  const removeRoom           = useAppStore((s: RootState) => s.removeRoom);
  const setActiveChat        = useAppStore((s: RootState) => s.setActiveChat);
  const incrementChannelUnread = useAppStore((s: RootState) => s.incrementChannelUnread);
  const setMessageReactions  = useAppStore((s: RootState) => s.setMessageReactions);
  const resetUnread          = useAppStore((s: RootState) => s.resetUnread);
  const updateMessagesStatus = useAppStore((s: RootState) => s.updateMessagesStatus);

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
            const state = useAppStore.getState();
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
                  content: msg.content,
                  inserted_at: msg.inserted_at,
                  sender_id: msg.sender_id,
                },
              });

              if (!focused || !isActive) {
                const senderName =
                  msg.sender_display_name || msg.sender_username || "User";
                showNotification(senderName, {
                  body: msg.content || (msg.media_file_id ? "📎 Media" : "New message"),
                  icon: msg.sender?.avatar_url ?? undefined,
                  onClick: () => {
                    useAppStore.getState().setActiveChat({
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
              content: msg.content,
              inserted_at: msg.inserted_at,
              sender_id: msg.sender_id,
            },
          });
        }
      }
    }));

    // Авто-прочтение при фокусе окна
    const handleFocus = async () => {
      const state = useAppStore.getState();
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
          content: msg.content,
          inserted_at: msg.inserted_at,
          sender_id: msg.sender_id,
        },
      });

      // Track unread count if message is not from current user
      if (msg.sender_id !== currentUser?.id) {
        const state = useAppStore.getState();
        const active = state.activeChat;
        const isActive = active?.type === "channel" && active.channelId === roomId;
        
        if (!isActive) {
          incrementChannelUnread(roomId);
        }

        // Show notification for room messages
        isWindowFocused().then(async (focused) => {
          if (!isActive || !focused) {
            const state = useAppStore.getState();
            const roomName =
              state.roomPreviews[roomId]?.name || "Group";
            const senderName =
              msg.sender_display_name || msg.sender_username || "Someone";
            showNotification(roomName, {
              body: `${senderName}: ${
                msg.content || (msg.media_file_id ? "📎 Media" : "New message")
              }`,
              onClick: () => {
                useAppStore.getState().setActiveChat({
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
      const active = useAppStore.getState().activeChat;
      if (active?.type === "room" && active.roomId === room_id) {
        setActiveChat(null);
      }
    }));
    unsubs.push(socketManager.onChannelDeleted(({ channel_id }) => {
      removeRoom(channel_id); // removeRoom handles serverChannels as well
      const active = useAppStore.getState().activeChat;
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
        const active = useAppStore.getState().activeChat;
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
        const active = useAppStore.getState().activeChat;
        if (active?.type === "room" && active.roomId === room_id) {
          setActiveChat(null);
        }
      } else {
        // Someone else was removed from a room we are in.
        // Update the members array if it exists in the preview.
        const state = useAppStore.getState();
        const existing = state.roomPreviews[room_id];
        if (existing && existing.members) {
          const updatedMembers = existing.members.filter((m: any) => m.id !== user_id);
          upsertRoomPreview({ id: room_id, members: updatedMembers });
        }
      }
    }));

    unsubs.push(socketManager.onServerDeleted(({ server_id }) => {
      removeServer(server_id);
      const active = useAppStore.getState().activeChat;
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
