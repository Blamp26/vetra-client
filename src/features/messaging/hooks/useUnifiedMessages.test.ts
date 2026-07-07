import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useAppStoreMock, markReadViaChannelMock, sendMessageViaChannelMock } = vi.hoisted(() => ({
  useAppStoreMock: vi.fn(),
  markReadViaChannelMock: vi.fn(),
  sendMessageViaChannelMock: vi.fn(),
}));

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    useAppStoreMock(selector),
}));

vi.mock("@/api/messages", () => ({
  messagesApi: {
    getConversation: vi.fn(),
  },
}));

vi.mock("@/api/rooms", () => ({
  roomsApi: {
    getMessages: vi.fn(),
  },
}));

vi.mock("@/services/socket", () => ({
  markReadViaChannel: markReadViaChannelMock,
  sendMessageViaChannel: sendMessageViaChannelMock,
}));

vi.mock("@/shared/hooks/useMessagePagination", () => ({
  useMessagePagination: () => ({
    messages: [],
    isLoading: false,
    hasMore: false,
    loadMore: vi.fn(),
  }),
}));

import { useUnifiedMessages } from "./useUnifiedMessages";

function makeState() {
  const resetUnread = vi.fn();

  return {
    currentUser: { id: 1 },
    socketManager: {
      userChannel: { push: vi.fn() },
      joinRoomChannel: vi.fn(() => Promise.resolve()),
      leaveRoomChannel: vi.fn(),
      setActiveRoom: vi.fn(() => Promise.resolve()),
      clearActiveRoom: vi.fn(() => Promise.resolve()),
      onRoomMessage: vi.fn(() => () => {}),
      onRoomMessageEdited: vi.fn(() => () => {}),
      onRoomMessageDeleted: vi.fn(() => () => {}),
      onRoomReactionUpdated: vi.fn(() => () => {}),
      sendRoomMessageViaChannel: vi.fn(),
    },
    conversations: {},
    conversationPreviews: {
      2: {
        partner_id: 2,
        partner_public_id: "user-public-id",
        unread_count: 1,
        partner_username: "alice",
        partner_display_name: "Alice",
        last_message: {
          id: 10,
          content: "hello",
          inserted_at: "2026-06-28T00:00:00Z",
          sender_id: 2,
          status: "sent",
        },
      },
    },
    roomConversations: {},
    roomPreviews: {} as Record<number, any>,
    initConversation: vi.fn(),
    setConversationMessages: vi.fn(),
    prependMessages: vi.fn(),
    appendMessage: vi.fn(),
    upsertPreview: vi.fn(),
    setConversationLoading: vi.fn(),
    setConversationHasMore: vi.fn(),
    resetUnread,
    initRoomConversation: vi.fn(),
    setRoomMessages: vi.fn(),
    prependRoomMessages: vi.fn(),
    appendRoomMessage: vi.fn(),
    upsertRoomPreview: vi.fn(),
    setRoomConversationLoading: vi.fn(),
    setRoomConversationHasMore: vi.fn(),
    editRoomMessage: vi.fn(),
    deleteRoomMessage: vi.fn(),
    toggleRoomReaction: vi.fn(),
    resetRoomUnread: vi.fn(),
    resetChannelUnread: vi.fn(),
  };
}

describe("useUnifiedMessages", () => {
  beforeEach(() => {
    useAppStoreMock.mockReset();
    markReadViaChannelMock.mockReset();
    sendMessageViaChannelMock.mockReset();
  });

  it("does not re-run direct chat read reset when preview unread_count changes only", () => {
    const state = makeState();

    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) =>
        selector(state),
    );

    const { rerender } = renderHook(
      ({ context }) => useUnifiedMessages(context),
      {
        initialProps: {
          context: { type: "direct" as const, partnerId: 2 },
        },
      },
    );

    expect(markReadViaChannelMock).toHaveBeenCalledTimes(1);
    expect(state.resetUnread).toHaveBeenCalledTimes(1);

    state.conversationPreviews = {
      ...state.conversationPreviews,
      2: {
        ...state.conversationPreviews[2],
        unread_count: 0,
      },
    };

    rerender({ context: { type: "direct" as const, partnerId: 2 } });

    expect(markReadViaChannelMock).toHaveBeenCalledTimes(1);
    expect(state.resetUnread).toHaveBeenCalledTimes(1);
  });

  it("does not re-join a room channel when the room preview map changes only", () => {
    const state = makeState();
    const joinRoomChannel = vi.fn(() => Promise.resolve());

    state.socketManager = {
      ...state.socketManager,
      joinRoomChannel,
    };
    state.roomPreviews = {
      9: {
        id: 9,
        public_id: "room-public-id",
        name: "general",
        created_by: 1,
        server_id: 5,
        inserted_at: "2026-06-28T00:00:00Z",
        unread_count: 0,
        last_message_at: null,
        last_message: null,
      },
    };

    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) =>
        selector(state),
    );

    const { rerender } = renderHook(
      ({ context }) => useUnifiedMessages(context),
      {
        initialProps: {
          context: {
            type: "room" as const,
            roomId: 9,
            roomRef: "room-public-id",
          },
        },
      },
    );

    expect(joinRoomChannel).toHaveBeenCalledTimes(1);

    state.roomPreviews = {
      ...state.roomPreviews,
      9: {
        ...state.roomPreviews[9],
        last_message_at: "2026-06-28T00:01:00Z",
      },
    };

    rerender({
      context: { type: "room" as const, roomId: 9, roomRef: "room-public-id" },
    });

    expect(joinRoomChannel).toHaveBeenCalledTimes(1);
  });

  it("uses room channel events as the active room append path and marks the room active", async () => {
    const state = makeState();
    const onRoomMessage = vi.fn(() => () => {});
    const setActiveRoom = vi.fn(() => Promise.resolve());

    state.socketManager = {
      ...state.socketManager,
      onRoomMessage,
      setActiveRoom,
    };
    state.roomPreviews = {
      9: {
        id: 9,
        public_id: "room-public-id",
        name: "general",
        created_by: 1,
        server_id: null,
        inserted_at: "2026-06-28T00:00:00Z",
        unread_count: 2,
        last_message_at: null,
        last_message: null,
      },
    };

    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) =>
        selector(state),
    );

    renderHook(() =>
      useUnifiedMessages({
        type: "room",
        roomId: 9,
        roomRef: "room-public-id",
      }),
    );

    expect(onRoomMessage).toHaveBeenCalledTimes(1);
    expect(onRoomMessage).toHaveBeenCalledWith(9, expect.any(Function));
    expect(state.resetRoomUnread).toHaveBeenCalledWith(9);

    await vi.waitFor(() => {
      expect(setActiveRoom).toHaveBeenCalledWith("room-public-id");
    });
  });

  it("updates the room preview immediately for a photo-only sent message", async () => {
    const state = makeState();
    const sentMessage = {
      id: 88,
      content: null,
      sender_id: 1,
      sender_public_id: "me-public-id",
      recipient_id: null,
      room_id: 9,
      room_public_id: "room-public-id",
      status: "sent" as const,
      inserted_at: "2026-06-30T12:30:00Z",
      media_file_id: "media-photo-1",
      media_mime_type: "image/jpeg",
      attachment: {
        id: "media-photo-1",
        url: "/api/v1/media/media-photo-1",
        mime_type: "image/jpeg",
        original_name: "photo.jpg",
        file_size: 2048,
        kind: "photo" as const,
      },
    };

    state.roomPreviews = {
      9: {
        id: 9,
        public_id: "room-public-id",
        name: "general",
        created_by: 1,
        server_id: null,
        inserted_at: "2026-06-28T00:00:00Z",
        unread_count: 0,
        last_message_at: "2026-06-30T12:00:00Z",
        last_message: {
          id: 10,
          content: "old text",
          inserted_at: "2026-06-30T12:00:00Z",
          sender_id: 1,
          status: "sent",
        },
      },
    };
    state.socketManager.sendRoomMessageViaChannel = vi
      .fn()
      .mockResolvedValue(sentMessage);

    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) =>
        selector(state),
    );

    const { result } = renderHook(() =>
      useUnifiedMessages({
        type: "room",
        roomId: 9,
        roomRef: "room-public-id",
      }),
    );

    await act(async () => {
      await result.current.sendMessage({ mediaFileId: "media-photo-1" });
    });

    expect(state.appendRoomMessage).toHaveBeenCalledWith(9, sentMessage);
    expect(state.upsertRoomPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 9,
        public_id: "room-public-id",
        last_message_at: "2026-06-30T12:30:00Z",
        last_message: expect.objectContaining({
          id: 88,
          preview: "Photo",
          media_file_id: "media-photo-1",
          attachment_kind: "photo",
        }),
      }),
    );
  });

  it("updates the room preview immediately for a grouped photo sent message", async () => {
    const state = makeState();
    const sentMessage = {
      id: 188,
      content: null,
      sender_id: 1,
      sender_public_id: "me-public-id",
      recipient_id: null,
      room_id: 9,
      room_public_id: "room-public-id",
      status: "sent" as const,
      inserted_at: "2026-06-30T12:30:30Z",
      media_file_ids: ["media-photo-1", "media-photo-2"],
      media_mime_types: ["image/jpeg", "image/png"],
      attachments: [
        {
          id: "media-photo-1",
          url: "/api/v1/media/media-photo-1",
          mime_type: "image/jpeg",
          original_name: "photo-1.jpg",
          file_size: 2048,
          kind: "photo" as const,
        },
        {
          id: "media-photo-2",
          url: "/api/v1/media/media-photo-2",
          mime_type: "image/png",
          original_name: "photo-2.png",
          file_size: 4096,
          kind: "photo" as const,
        },
      ],
    };

    state.roomPreviews = {
      9: {
        id: 9,
        public_id: "room-public-id",
        name: "general",
        created_by: 1,
        server_id: null,
        inserted_at: "2026-06-28T00:00:00Z",
        unread_count: 0,
        last_message_at: "2026-06-30T12:00:00Z",
        last_message: null,
      },
    };
    state.socketManager.sendRoomMessageViaChannel = vi
      .fn()
      .mockResolvedValue(sentMessage);

    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) =>
        selector(state),
    );

    const { result } = renderHook(() =>
      useUnifiedMessages({
        type: "room",
        roomId: 9,
        roomRef: "room-public-id",
      }),
    );

    await act(async () => {
      await result.current.sendMessage({ mediaFileIds: ["media-photo-1", "media-photo-2"] });
    });

    expect(state.socketManager.sendRoomMessageViaChannel).toHaveBeenCalledWith(
      9,
      expect.objectContaining({
        mediaFileIds: ["media-photo-1", "media-photo-2"],
      }),
    );
    expect(state.upsertRoomPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        last_message: expect.objectContaining({
          preview: "Photos",
          attachments: expect.arrayContaining([
            expect.objectContaining({ id: "media-photo-1" }),
            expect.objectContaining({ id: "media-photo-2" }),
          ]),
        }),
      }),
    );
  });

  it("updates the room preview immediately for a file-only sent message", async () => {
    const state = makeState();
    const sentMessage = {
      id: 89,
      content: null,
      sender_id: 1,
      sender_public_id: "me-public-id",
      recipient_id: null,
      room_id: 9,
      room_public_id: "room-public-id",
      status: "sent" as const,
      inserted_at: "2026-06-30T12:31:00Z",
      media_file_id: "media-file-1",
      media_mime_type: "application/pdf",
      attachment: {
        id: "media-file-1",
        url: "/api/v1/media/media-file-1",
        mime_type: "application/pdf",
        original_name: "report.pdf",
        file_size: 5678,
        kind: "file" as const,
      },
    };

    state.roomPreviews = {
      9: {
        id: 9,
        public_id: "room-public-id",
        name: "general",
        created_by: 1,
        server_id: null,
        inserted_at: "2026-06-28T00:00:00Z",
        unread_count: 0,
        last_message_at: "2026-06-30T12:00:00Z",
        last_message: {
          id: 10,
          content: "old text",
          inserted_at: "2026-06-30T12:00:00Z",
          sender_id: 1,
          status: "sent",
        },
      },
    };
    state.socketManager.sendRoomMessageViaChannel = vi
      .fn()
      .mockResolvedValue(sentMessage);

    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) =>
        selector(state),
    );

    const { result } = renderHook(() =>
      useUnifiedMessages({
        type: "room",
        roomId: 9,
        roomRef: "room-public-id",
      }),
    );

    await act(async () => {
      await result.current.sendMessage({ mediaFileId: "media-file-1" });
    });

    expect(state.upsertRoomPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        last_message: expect.objectContaining({
          preview: "File: report.pdf",
          attachment_kind: "file",
          attachment_name: "report.pdf",
        }),
      }),
    );
  });

  it("updates the room preview immediately for a text plus attachment sent message", async () => {
    const state = makeState();
    const sentMessage = {
      id: 90,
      content: "see report",
      sender_id: 1,
      sender_public_id: "me-public-id",
      recipient_id: null,
      room_id: 9,
      room_public_id: "room-public-id",
      status: "sent" as const,
      inserted_at: "2026-06-30T12:32:00Z",
      media_file_id: "media-file-2",
      media_mime_type: "application/pdf",
      attachment: {
        id: "media-file-2",
        url: "/api/v1/media/media-file-2",
        mime_type: "application/pdf",
        original_name: "report.pdf",
        file_size: 5678,
        kind: "file" as const,
      },
    };

    state.roomPreviews = {
      9: {
        id: 9,
        public_id: "room-public-id",
        name: "general",
        created_by: 1,
        server_id: null,
        inserted_at: "2026-06-28T00:00:00Z",
        unread_count: 0,
        last_message_at: "2026-06-30T12:00:00Z",
        last_message: {
          id: 10,
          content: "old text",
          inserted_at: "2026-06-30T12:00:00Z",
          sender_id: 1,
          status: "sent",
        },
      },
    };
    state.socketManager.sendRoomMessageViaChannel = vi
      .fn()
      .mockResolvedValue(sentMessage);

    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) =>
        selector(state),
    );

    const { result } = renderHook(() =>
      useUnifiedMessages({
        type: "room",
        roomId: 9,
        roomRef: "room-public-id",
      }),
    );

    await act(async () => {
      await result.current.sendMessage({
        content: "see report",
        mediaFileId: "media-file-2",
      });
    });

    expect(state.upsertRoomPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        last_message: expect.objectContaining({
          preview: "see report",
          content: "see report",
        }),
      }),
    );
  });

  it("updates the direct preview immediately for an attachment-only sent message", async () => {
    const state = makeState();
    const sentMessage = {
      id: 91,
      content: null,
      sender_id: 1,
      sender_public_id: "me-public-id",
      recipient_id: 2,
      recipient_public_id: "user-public-id",
      status: "sent" as const,
      inserted_at: "2026-06-30T12:33:00Z",
      media_file_id: "media-file-3",
      media_mime_type: "application/pdf",
      attachment: {
        id: "media-file-3",
        url: "/api/v1/media/media-file-3",
        mime_type: "application/pdf",
        original_name: "report.pdf",
        file_size: 5678,
        kind: "file" as const,
      },
    };

    sendMessageViaChannelMock.mockResolvedValue(sentMessage);

    useAppStoreMock.mockImplementation(
      (selector: (value: ReturnType<typeof makeState>) => unknown) =>
        selector(state),
    );

    const { result } = renderHook(() =>
      useUnifiedMessages({
        type: "direct",
        partnerId: 2,
        partnerRef: "user-public-id",
      }),
    );

    await act(async () => {
      await result.current.sendMessage({ mediaFileId: "media-file-3" });
    });

    expect(state.appendMessage).toHaveBeenCalledWith(2, sentMessage);
    expect(state.upsertPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        partner_id: 2,
        partner_public_id: "user-public-id",
        unread_count: 0,
        last_message: expect.objectContaining({
          id: 91,
          preview: "File: report.pdf",
          attachment_kind: "file",
          attachment_name: "report.pdf",
        }),
      }),
    );
  });
});
