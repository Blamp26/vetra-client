import { useEffect, useCallback, useMemo, useRef } from "react";
import { useAppStore, type RootState } from "@/store";
import { messagesApi } from "@/api/messages";
import { roomsApi } from "@/api/rooms";
import { markReadViaChannel, sendMessageViaChannel } from "@/services/socket";
import { useMessagePagination } from "@/shared/hooks/useMessagePagination";
import { withFallbackRef } from "@/shared/utils/refs";
import { buildPreviewMessage, getMessageAttachments } from "../utils/attachments";
import { logAttachmentDebug, summarizeMessageMedia } from "../utils/attachmentDebug";
import type { MessageTextEntity } from "@/shared/types";

export type ChatContext =
  | { type: "direct"; partnerId: number; partnerRef?: string | number }
  | { type: "room"; roomId: number; roomRef?: string | number };

/**
 * Unified hook for handling both direct messages and room messages.
 * Replaces useMessages and useRoomMessages.
 */
export function useUnifiedMessages(context: ChatContext | null) {
  const currentUser = useAppStore((s: RootState) => s.currentUser);
  const socketManager = useAppStore((s: RootState) => s.socketManager);

  // Slices
  const conversations = useAppStore((s: RootState) => s.conversations);
  const conversationPreviews = useAppStore(
    (s: RootState) => s.conversationPreviews,
  );
  const roomConversations = useAppStore((s: RootState) => s.roomConversations);
  const roomPreviews = useAppStore((s: RootState) => s.roomPreviews);

  // Actions
  const initConversation = useAppStore((s: RootState) => s.initConversation);
  const setConversationMessages = useAppStore(
    (s: RootState) => s.setConversationMessages,
  );
  const prependMessages = useAppStore((s: RootState) => s.prependMessages);
  const appendMessage = useAppStore((s: RootState) => s.appendMessage);
  const setConversationLoading = useAppStore(
    (s: RootState) => s.setConversationLoading,
  );
  const setConversationHasMore = useAppStore(
    (s: RootState) => s.setConversationHasMore,
  );
  const resetUnread = useAppStore((s: RootState) => s.resetUnread);
  const upsertPreview = useAppStore((s: RootState) => s.upsertPreview);

  const initRoomConversation = useAppStore(
    (s: RootState) => s.initRoomConversation,
  );
  const setRoomMessages = useAppStore((s: RootState) => s.setRoomMessages);
  const prependRoomMessages = useAppStore(
    (s: RootState) => s.prependRoomMessages,
  );
  const appendRoomMessage = useAppStore((s: RootState) => s.appendRoomMessage);
  const setRoomLoading = useAppStore(
    (s: RootState) => s.setRoomConversationLoading,
  );
  const setRoomHasMore = useAppStore(
    (s: RootState) => s.setRoomConversationHasMore,
  );
  const editRoomMessage = useAppStore((s: RootState) => s.editRoomMessage);
  const deleteRoomMessage = useAppStore((s: RootState) => s.deleteRoomMessage);
  const toggleRoomReaction = useAppStore(
    (s: RootState) => s.toggleRoomReaction,
  );
  const upsertRoomPreview = useAppStore((s: RootState) => s.upsertRoomPreview);
  const resetRoomUnread = useAppStore((s: RootState) => s.resetRoomUnread);
  const resetChannelUnread = useAppStore((s: RootState) => s.resetChannelUnread);

  const isRoom = context?.type === "room";
  const id = context ? (isRoom ? context.roomId : context.partnerId) : null;
  const contextType = context?.type ?? null;
  const directPartnerId = context?.type === "direct" ? context.partnerId : null;
  const directPartnerExplicitRef =
    context?.type === "direct" ? context.partnerRef : undefined;
  const roomId = context?.type === "room" ? context.roomId : null;
  const roomExplicitRef =
    context?.type === "room" ? context.roomRef : undefined;
  const directPreviewPublicId =
    directPartnerId !== null
      ? conversationPreviews[directPartnerId]?.partner_public_id
      : undefined;
  const roomPreviewPublicId =
    roomId !== null ? roomPreviews[roomId]?.public_id : undefined;
  const roomIsServer = roomId !== null ? roomPreviews[roomId]?.server_id != null : false;

  const directTargetRef = useMemo(
    () =>
      directPartnerId !== null
        ? withFallbackRef(
            directPartnerId,
            directPartnerExplicitRef,
            directPreviewPublicId
              ? { id: directPartnerId, public_id: directPreviewPublicId }
              : undefined,
          )
        : null,
    [directPartnerId, directPartnerExplicitRef, directPreviewPublicId],
  );

  const roomTargetRef = useMemo(
    () =>
      roomId !== null
        ? withFallbackRef(
            roomId,
            roomExplicitRef,
            roomPreviewPublicId
              ? { id: roomId, public_id: roomPreviewPublicId }
              : undefined,
          )
        : null,
    [roomId, roomExplicitRef, roomPreviewPublicId],
  );

  const conversation = useMemo(() => {
    if (contextType === "room" && roomId !== null) {
      return roomConversations[roomId] ?? null;
    }

    if (contextType === "direct" && directPartnerId !== null) {
      return conversations[directPartnerId] ?? null;
    }

    return null;
  }, [contextType, roomId, directPartnerId, roomConversations, conversations]);

  const fetchPage = useCallback(
    (limit: number, beforeId?: number, signal?: AbortSignal) => {
      if (!id || !currentUser || !contextType) return Promise.resolve([]);
      if (contextType === "room" && roomId !== null) {
        return roomsApi.getMessages(roomTargetRef ?? roomId, limit, beforeId, signal);
      } else {
        return messagesApi.getConversation(
          directTargetRef ?? directPartnerId!,
          {
            limit,
            beforeId,
            signal,
          },
        );
      }
    },
    [
      id,
      currentUser,
      contextType,
      roomId,
      roomTargetRef,
      directTargetRef,
      directPartnerId,
    ],
  );

  const actions = useMemo(() => {
    if (!contextType) return null;
    if (contextType === "room" && roomId !== null) {
      return {
        init: () => initRoomConversation(roomId),
        setLoading: (l: boolean) => setRoomLoading(roomId, l),
        setMessages: (msgs: any) => setRoomMessages(roomId, msgs),
        setHasMore: (h: boolean) => setRoomHasMore(roomId, h),
        prepend: (msgs: any) => prependRoomMessages(roomId, msgs),
      };
    } else {
      const partnerId = directPartnerId!;
      return {
        init: () => initConversation(partnerId),
        setLoading: (l: boolean) => setConversationLoading(partnerId, l),
        setMessages: (msgs: any) => setConversationMessages(partnerId, msgs),
        setHasMore: (h: boolean) => setConversationHasMore(partnerId, h),
        prepend: (msgs: any) => prependMessages(partnerId, msgs),
      };
    }
  }, [
    contextType,
    roomId,
    directPartnerId,
    initRoomConversation,
    setRoomLoading,
    setRoomMessages,
    setRoomHasMore,
    prependRoomMessages,
    initConversation,
    setConversationLoading,
    setConversationMessages,
    setConversationHasMore,
    prependMessages,
  ]);

  const conversationKey =
    contextType && id ? `${contextType}:${id}` : null;

  const { messages, isLoading, hasMore, loadMore, initialHistoryLoaded } = useMessagePagination(
    id,
    currentUser?.id ?? null,
    conversation,
    fetchPage,
    actions!,
    conversationKey,
  );

  const markedReadKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (contextType !== "direct" || directPartnerId === null) return;
    const readKey = `direct:${directPartnerId}`;

    return () => {
      markedReadKeysRef.current.delete(readKey);
    };
  }, [contextType, directPartnerId]);

  // Effect for read status and joining room channels
  useEffect(() => {
    if (!id || !socketManager || !contextType) return;

    if (contextType === "direct" && directPartnerId !== null) {
      const readKey = `direct:${directPartnerId}`;
      if (isLoading || messages.length === 0 || markedReadKeysRef.current.has(readKey)) {
        return;
      }

      markedReadKeysRef.current.add(readKey);
      markReadViaChannel(
        socketManager.userChannel,
        directTargetRef ?? directPartnerId,
      );
      resetUnread(directPartnerId);
    } else {
      if (roomId === null) return;
      let cancelled = false;

      const unsubMessage = socketManager.onRoomMessage(roomId, (message) =>
        appendRoomMessage(roomId, message),
      );
      void socketManager
        .joinRoomChannel(roomId, roomTargetRef ?? roomId)
        .then(() => {
          if (cancelled) return;
          void socketManager.setActiveRoom(roomTargetRef ?? roomId);
        })
        .catch(() => {
          // Room join errors are already surfaced by message send/load failures.
        });

      if (roomIsServer) {
        resetChannelUnread(roomId);
      } else {
        resetRoomUnread(roomId);
      }

      // Local room events that aren't global (edited, deleted, reactions)
      const unsubEdited = socketManager.onRoomMessageEdited(roomId, (p) =>
        editRoomMessage(p),
      );
      const unsubDeleted = socketManager.onRoomMessageDeleted(roomId, (p) =>
        deleteRoomMessage(p),
      );
      const unsubReaction = socketManager.onRoomReactionUpdated(roomId, (p) =>
        toggleRoomReaction(p),
      );

      return () => {
        cancelled = true;
        void socketManager.clearActiveRoom();
        unsubMessage();
        unsubEdited();
        unsubDeleted();
        unsubReaction();
        socketManager.leaveRoomChannel(roomId);
      };
    }
  }, [
    id,
    socketManager,
    contextType,
    directPartnerId,
    roomId,
    directTargetRef,
    isLoading,
    messages.length,
    roomTargetRef,
    roomIsServer,
    resetUnread,
    resetRoomUnread,
    resetChannelUnread,
    appendRoomMessage,
    editRoomMessage,
    deleteRoomMessage,
    toggleRoomReaction,
  ]);

  const sendMessage = useCallback(
    async (
      payload: {
        content?: string | null;
        mediaFileId?: string | null;
        mediaFileIds?: string[] | null;
        entities?: MessageTextEntity[];
        __attachmentDebug?: {
          batchId: string;
          sendUnitId?: string | null;
          localAttachmentIds?: string[];
        } | null;
        stickerId?: string | null;
        gif?: import("@/shared/types").GifMessage | null;
      },
      replyToId?: number,
    ) => {
      if (!id || !socketManager || !currentUser || !contextType) return;
      const trimmed = payload.content?.trim() ?? "";
      const content = trimmed.length > 0 ? trimmed : null;
      const mediaFileIds = payload.mediaFileIds?.filter((mediaFileId): mediaFileId is string => Boolean(mediaFileId)) ?? [];
      const primaryMediaFileId = payload.mediaFileId ?? mediaFileIds[0] ?? null;
      const debugMeta = payload.__attachmentDebug ?? null;
      if (!content && !primaryMediaFileId && mediaFileIds.length === 0 && !payload.stickerId && !payload.gif) return;

      logAttachmentDebug("sendMessage.prepare", {
        contextType,
        targetId: id,
        replyToId: replyToId ?? null,
        contentPresent: Boolean(content),
        mediaFileId: primaryMediaFileId,
        mediaFileIds,
      }, {
        batchId: debugMeta?.batchId,
        sendUnitId: debugMeta?.sendUnitId,
      });

      if (contextType === "room" && roomId !== null) {
        const message = await socketManager.sendRoomMessageViaChannel(roomId, {
          content,
          entities: payload.entities ?? [],
          mediaFileId: primaryMediaFileId,
          mediaFileIds,
          replyToId: replyToId ?? null,
          __attachmentDebug: debugMeta,
          stickerId: payload.stickerId,
          gif: payload.gif,
        });
        const normalizedAttachments = getMessageAttachments(message);
        const rawGroupedMediaIdsLength =
          (Array.isArray(message.media_file_ids) ? message.media_file_ids.length : 0) ||
          (Array.isArray(message.mediaFileIds) ? message.mediaFileIds.length : 0);
        logAttachmentDebug("sendMessage.response", {
          contextType,
          targetId: roomId,
          ...summarizeMessageMedia(message as Record<string, unknown>),
          normalizedAttachmentsLength: normalizedAttachments.length,
        }, {
          batchId: debugMeta?.batchId,
          sendUnitId: debugMeta?.sendUnitId,
        });
        if ((debugMeta?.localAttachmentIds?.length ?? 0) > 1 && rawGroupedMediaIdsLength <= 1) {
          logAttachmentDebug("warning.raw-response-single-media-id", {
            contextType,
            targetId: roomId,
            localAttachmentIds: debugMeta?.localAttachmentIds ?? [],
            response: summarizeMessageMedia(message as Record<string, unknown>),
          }, {
            batchId: debugMeta?.batchId,
            sendUnitId: debugMeta?.sendUnitId,
            level: "warn",
          });
        }
        if ((debugMeta?.localAttachmentIds?.length ?? 0) > 1 && normalizedAttachments.length <= 1) {
          logAttachmentDebug("warning.socket-response-missing-album", {
            contextType,
            targetId: roomId,
            localAttachmentIds: debugMeta?.localAttachmentIds ?? [],
            response: summarizeMessageMedia(message as Record<string, unknown>),
            normalizedAttachmentsLength: normalizedAttachments.length,
          }, {
            batchId: debugMeta?.batchId,
            sendUnitId: debugMeta?.sendUnitId,
            level: "warn",
          });
        }
        appendRoomMessage(roomId, message);
        upsertRoomPreview({
          id: roomId,
          public_id: message.room_public_id ?? roomPreviewPublicId ?? roomId,
          last_message_at: message.inserted_at,
          last_message: buildPreviewMessage(message),
        });
      } else {
        const message = await sendMessageViaChannel(
          socketManager.userChannel,
          directTargetRef ?? directPartnerId!,
          {
            content,
            entities: payload.entities ?? [],
            mediaFileId: primaryMediaFileId,
            mediaFileIds,
            replyToId: replyToId ?? null,
            __attachmentDebug: debugMeta,
            stickerId: payload.stickerId,
            gif: payload.gif,
          },
        );
        const normalizedAttachments = getMessageAttachments(message);
        const rawGroupedMediaIdsLength =
          (Array.isArray(message.media_file_ids) ? message.media_file_ids.length : 0) ||
          (Array.isArray(message.mediaFileIds) ? message.mediaFileIds.length : 0);
        logAttachmentDebug("sendMessage.response", {
          contextType,
          targetId: directPartnerId,
          ...summarizeMessageMedia(message as Record<string, unknown>),
          normalizedAttachmentsLength: normalizedAttachments.length,
        }, {
          batchId: debugMeta?.batchId,
          sendUnitId: debugMeta?.sendUnitId,
        });
        if ((debugMeta?.localAttachmentIds?.length ?? 0) > 1 && rawGroupedMediaIdsLength <= 1) {
          logAttachmentDebug("warning.raw-response-single-media-id", {
            contextType,
            targetId: directPartnerId,
            localAttachmentIds: debugMeta?.localAttachmentIds ?? [],
            response: summarizeMessageMedia(message as Record<string, unknown>),
          }, {
            batchId: debugMeta?.batchId,
            sendUnitId: debugMeta?.sendUnitId,
            level: "warn",
          });
        }
        if ((debugMeta?.localAttachmentIds?.length ?? 0) > 1 && normalizedAttachments.length <= 1) {
          logAttachmentDebug("warning.socket-response-missing-album", {
            contextType,
            targetId: directPartnerId,
            localAttachmentIds: debugMeta?.localAttachmentIds ?? [],
            response: summarizeMessageMedia(message as Record<string, unknown>),
            normalizedAttachmentsLength: normalizedAttachments.length,
          }, {
            batchId: debugMeta?.batchId,
            sendUnitId: debugMeta?.sendUnitId,
            level: "warn",
          });
        }
        appendMessage(directPartnerId!, message);
        upsertPreview({
          partner_id: directPartnerId!,
          partner_public_id:
            message.recipient_public_id ??
            directPreviewPublicId ??
            (typeof directPartnerExplicitRef === "string"
              ? directPartnerExplicitRef
              : null),
          partner_username:
            message.recipient_username ??
            conversationPreviews[directPartnerId!]?.partner_username ??
            "Unknown",
          partner_display_name:
            message.recipient_display_name ??
            conversationPreviews[directPartnerId!]?.partner_display_name ??
            null,
          unread_count: 0,
          last_message: buildPreviewMessage(message),
        });
      }
    },
    [
      id,
      socketManager,
      currentUser,
      contextType,
      roomId,
      directPartnerId,
      directTargetRef,
      directPartnerExplicitRef,
      directPreviewPublicId,
      roomPreviewPublicId,
      conversationPreviews,
      appendRoomMessage,
      appendMessage,
      upsertPreview,
      upsertRoomPreview,
    ],
  );

  return { messages, isLoading, hasMore, loadMore, initialHistoryLoaded, sendMessage };
}
