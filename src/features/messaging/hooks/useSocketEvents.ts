import { useEffect } from "react";
import { useAppStore, type RootState, getState } from "@/store";
import type { Message, RoomMessageSummary } from "@/shared/types";
import { showNotification } from "@/services/notifications";
import { markReadViaChannel } from "@/services/socket";
import { serversApi } from "@/api/servers";
import { reconcileUnreadLists } from "@/features/messaging/services/unreadReconciliation";
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
    clearTypingRoomMember,
    editRoomMessage,
    deleteRoomMessage,
    upsertRoomPreview,
    upsertServer,
    removeServer,
    addServerChannel,
    removeRoom,
    setActiveChat,
    setMessageReactions,
    setUnreadState,
    setRoomUnreadState,
    setPreviews,
    setRoomPreviews,
    setServers,
    setServerChannels,
    updateMessagesStatus,
  } = useAppStore(
    (s: RootState) => ({
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
      clearTypingRoomMember: s.clearTypingRoomMember,
      editRoomMessage: s.editRoomMessage,
      deleteRoomMessage: s.deleteRoomMessage,
      upsertRoomPreview: s.upsertRoomPreview,
      upsertServer: s.upsertServer,
      removeServer: s.removeServer,
      addServerChannel: s.addServerChannel,
      removeRoom: s.removeRoom,
      setActiveChat: s.setActiveChat,
      setMessageReactions: s.setMessageReactions,
      setUnreadState: s.setUnreadState,
      setRoomUnreadState: s.setRoomUnreadState,
      setPreviews: s.setPreviews,
      setRoomPreviews: s.setRoomPreviews,
      setServers: s.setServers,
      setServerChannels: s.setServerChannels,
      updateMessagesStatus: s.updateMessagesStatus,
    }),
    true,
  );

  useEffect(() => {
    if (!socketManager || !currentUser) return;

    const unsubs: Array<() => void> = [];
    let reconciliationTimer: ReturnType<typeof setTimeout> | undefined;
    let reconciliationGeneration = 0;
    const runReconciliation = () => {
      const generation = ++reconciliationGeneration;
      void reconcileUnreadLists({
        setPreviews,
        setRoomPreviews,
        setServers,
        setServerChannels,
        isCurrent: () => generation === reconciliationGeneration,
      }).catch(() => undefined);
    };
    const scheduleReconciliation = () => {
      if (reconciliationTimer) clearTimeout(reconciliationTimer);
      reconciliationTimer = setTimeout(() => {
        reconciliationTimer = undefined;
        runReconciliation();
      }, 40);
    };
    if (socketManager.socket?.onOpen)
      socketManager.socket.onOpen(runReconciliation);

    if (typeof socketManager.onServerOwnerChanged === "function")
      unsubs.push(
        socketManager.onServerOwnerChanged(({ server_id, owner_id }) => {
          const state = getState();
          const server = state.servers[server_id];
          if (!server) return;
          state.upsertServer({
            ...server,
            owner_id,
            ownerless: owner_id == null,
            ownership: undefined,
          });
          void serversApi
            .getList()
            .then(state.setServers)
            .catch(() => undefined);
        }),
      );

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

    const openRoomFromRealtime = (
      roomId: number,
      roomRef?: string | number | null,
    ) => {
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

    unsubs.push(
      socketManager.onMessage((msg: Message) => {
        const partnerId =
          msg.sender_id === currentUser.id ? msg.recipient_id : msg.sender_id;
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
                const request = markReadViaChannel(
                  socketManager.userChannel,
                  msg.sender_id === currentUser.id
                    ? (msg.recipient_public_id ?? partnerId)
                    : (msg.sender_public_id ?? partnerId),
                );
                if (request && typeof request.then === "function") {
                  void request
                    .then((state) =>
                      setUnreadState(
                        partnerId,
                        state.unread_count,
                        state.cursor,
                      ),
                    )
                    .catch(() => undefined);
                }
              } else {
                // Иначе увеличиваем счетчик непрочитанных в превью
                upsertPreview({
                  partner_id: partnerId,
                  partner_public_id: msg.sender_public_id,
                  partner_username: msg.sender_username || "Unknown",
                  partner_display_name: msg.sender_display_name || null,
                  unread_count: 0,
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
      }),
    );

    if (typeof socketManager.onUnreadStateUpdated === "function") {
      unsubs.push(
        socketManager.onUnreadStateUpdated((payload) => {
          if (
            payload.conversation_type === "dm" &&
            payload.partner_id != null
          ) {
            setUnreadState(
              payload.partner_id,
              payload.unread_count,
              payload.cursor,
            );
          } else if (payload.room_id != null) {
            setRoomUnreadState(
              payload.room_id,
              payload.unread_count,
              payload.cursor,
            );
          }
        }),
      );
    }

    // Авто-прочтение при фокусе окна
    const handleFocus = async () => {
      const state = getState();
      const active = state.activeChat;
      if (active?.type === "direct" && active.partnerId) {
        const request = markReadViaChannel(
          socketManager.userChannel,
          active.partnerRef ?? active.partnerId,
        );
        if (request && typeof request.then === "function") {
          void request
            .then((state) =>
              setUnreadState(
                active.partnerId,
                state.unread_count,
                state.cursor,
              ),
            )
            .catch(() => undefined);
        }
      }
    };

    window.addEventListener("focus", handleFocus);
    unsubs.push(() => window.removeEventListener("focus", handleFocus));
    unsubs.push(() => {
      if (reconciliationTimer) clearTimeout(reconciliationTimer);
      reconciliationGeneration += 1;
    });

    unsubs.push(socketManager.onMessageEdited((p) => editMessage(p)));
    unsubs.push(socketManager.onMessageDeleted((p) => deleteMessage(p)));
    unsubs.push(
      socketManager.onStatusUpdate((ids, status) =>
        updateMessagesStatus(ids, status),
      ),
    );
    unsubs.push(
      socketManager.onDirectReactionUpdated((p) => {
        const partnerId =
          p.partner_id ?? (p.sender_id === currentUser.id ? null : p.sender_id);
        const message =
          partnerId == null
            ? undefined
            : getState().conversations[partnerId]?.messages.find(
                (item) => item.id === p.message_id,
              );
        const reactions = p.reactions.map((incoming: any) => {
          if (incoming.chosen !== undefined) return incoming;
          const key = incoming.reaction ?? incoming.emoji;
          const local = message?.reactions?.find(
            (item: any) => (item.reaction ?? item.emoji) === key,
          );
          return local
            ? { ...incoming, chosen: local.chosen }
            : { ...incoming, chosen: false };
        });
        setMessageReactions(p.message_id, reactions, p.updated_at);
      }),
    );
    unsubs.push(socketManager.onPresenceState((s) => applyPresenceState(s)));
    unsubs.push(socketManager.onPresenceDiff((d) => applyPresenceDiff(d)));
    unsubs.push(socketManager.onTypingStart((id) => setTyping(id)));
    unsubs.push(socketManager.onTypingStop((id) => clearTyping(id)));
    unsubs.push(
      socketManager.onLastSeen((id, seen) => setLastSeenAt(id, seen)),
    );

    unsubs.push(
      socketManager.onRoomMessageGlobal((msg) => {
        const roomId = msg.room_id;
        if (!roomId) return;

        updateRoomPreviewFromMessage(msg);
        scheduleReconciliation();

        if (msg.sender_id !== currentUser.id) {
          const active = isActiveRoom(roomId);

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
      }),
    );

    unsubs.push(
      socketManager.onRoomMessageSummary((summary) => {
        updateRoomPreviewFromSummary(summary);
        scheduleReconciliation();

        if (summary.sender_id !== currentUser.id) {
          const active = isActiveRoom(summary.room_id);

          if (!active) {
          }

          isWindowFocused().then(async (focused) => {
            if (!active || !focused) {
              notifyRoomActivity(
                summary.room_id,
                summary.room_public_id ?? summary.room_id,
                summary.sender_display_name ||
                  summary.sender_username ||
                  "Someone",
                summary.preview || "New message",
              );
            }
          });
        }
      }),
    );

    unsubs.push(
      socketManager.onRoomCreated((room) => {
        console.log("📥 room_created received", room);
        upsertRoomPreview(room);
      }),
    );
    unsubs.push(
      socketManager.onRoomDeleted(({ room_id }) => {
        removeRoom(room_id);
        const active = getState().activeChat;
        if (active?.type === "room" && active.roomId === room_id) {
          setActiveChat(null);
        }
      }),
    );
    unsubs.push(
      socketManager.onRoomAccessRevoked(({ room_id }) => {
        removeRoom(room_id);
        const active = getState().activeChat;
        if (
          (active?.type === "room" && active.roomId === room_id) ||
          (active?.type === "channel" && active.channelId === room_id)
        ) {
          setActiveChat(null);
        }
        clearTypingRoomMember(room_id);
      }),
    );
    unsubs.push(
      socketManager.onChannelDeleted(({ channel_id }) => {
        removeRoom(channel_id); // removeRoom handles serverChannels as well
        const active = getState().activeChat;
        if (active?.type === "channel" && active.channelId === channel_id) {
          setActiveChat(null);
        }
      }),
    );

    unsubs.push(
      socketManager.onServerMemberAdded(({ server }) => {
        if (server) {
          // ServerJSON.show wraps in { data: ... }
          const unwrapped = (server as any)?.data ?? server;
          upsertServer(unwrapped);
        }
      }),
    );

    unsubs.push(
      socketManager.onServerMemberRemoved(({ server_id, user_id }) => {
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
      }),
    );

    unsubs.push(
      socketManager.onRoomMemberAdded(({ user_id, room }) => {
        console.log("📥 room_member_added received", { user_id, room });
        if (user_id === currentUser.id && room) {
          upsertRoomPreview(room);
        }
      }),
    );

    unsubs.push(
      socketManager.onRoomMemberRemoved(({ room_id, user_id }) => {
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
            const updatedMembers = existing.members.filter(
              (m: any) => m.id !== user_id,
            );
            upsertRoomPreview({ id: room_id, members: updatedMembers });
          }
        }
      }),
    );

    unsubs.push(
      socketManager.onServerDeleted(({ server_id }) => {
        removeServer(server_id);
        const active = getState().activeChat;
        if (
          (active?.type === "server" && active.serverId === server_id) ||
          (active?.type === "channel" && active.serverId === server_id)
        ) {
          setActiveChat(null);
        }
      }),
    );
    unsubs.push(
      socketManager.onChannelCreated(({ server_id, channel }) =>
        addServerChannel(server_id, channel),
      ),
    );

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
    setActiveChat,
    setMessageReactions,
    updateMessagesStatus,
    setUnreadState,
    setRoomUnreadState,
  ]);
}
