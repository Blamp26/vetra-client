import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useAppStoreMock, getStateMock, showNotificationMock } = vi.hoisted(() => ({
  useAppStoreMock: vi.fn(),
  getStateMock: vi.fn(),
  showNotificationMock: vi.fn(),
}));

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    useAppStoreMock(selector),
  getState: () => getStateMock(),
}));

vi.mock("@/services/notifications", () => ({
  showNotification: showNotificationMock,
}));

vi.mock("@/services/socket", () => ({
  markReadViaChannel: vi.fn(),
}));

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({
    isFocused: vi.fn().mockResolvedValue(true),
  }),
}));

import { useSocketEvents } from "./useSocketEvents";

function makeSocketManager(handlers: Record<string, ((payload: any) => void) | null>) {
  const subscribe =
    (key: string) =>
    (handler: (payload: any) => void): (() => void) => {
      handlers[key] = handler;
      return () => {
        handlers[key] = null;
      };
    };

  return {
    userChannel: { push: vi.fn() },
    onMessage: subscribe("message"),
    onStatusUpdate: subscribe("status"),
    onMessageEdited: subscribe("messageEdited"),
    onMessageDeleted: subscribe("messageDeleted"),
    onDirectReactionUpdated: subscribe("directReaction"),
    onPresenceState: subscribe("presenceState"),
    onPresenceDiff: subscribe("presenceDiff"),
    onTypingStart: subscribe("typingStart"),
    onTypingStop: subscribe("typingStop"),
    onLastSeen: subscribe("lastSeen"),
    onRoomMessageGlobal: subscribe("roomMessageGlobal"),
    onRoomMessageSummary: subscribe("roomMessageSummary"),
    onRoomCreated: subscribe("roomCreated"),
    onRoomDeleted: subscribe("roomDeleted"),
    onChannelDeleted: subscribe("channelDeleted"),
    onServerMemberAdded: subscribe("serverMemberAdded"),
    onServerMemberRemoved: subscribe("serverMemberRemoved"),
    onRoomMemberAdded: subscribe("roomMemberAdded"),
    onRoomMemberRemoved: subscribe("roomMemberRemoved"),
    onServerDeleted: subscribe("serverDeleted"),
    onChannelCreated: subscribe("channelCreated"),
  };
}

function makeState() {
  const handlers: Record<string, ((payload: any) => void) | null> = {};
  const socketManager = makeSocketManager(handlers);

  const state: any = {
    socketManager,
    currentUser: { id: 1 },
    activeChat: null,
    roomPreviews: {
      9: {
        id: 9,
        public_id: "room-public-id",
        name: "general",
        created_by: 1,
        server_id: 5,
        server_public_id: "server-public-id",
        inserted_at: "2026-06-28T00:00:00Z",
        unread_count: 0,
        last_message_at: null,
        last_message: null,
      },
    },
    appendMessage: vi.fn(),
    appendRoomMessage: vi.fn(),
    editMessage: vi.fn(),
    deleteMessage: vi.fn(),
    upsertPreview: vi.fn(),
    applyPresenceState: vi.fn(),
    applyPresenceDiff: vi.fn(),
    setLastSeenAt: vi.fn(),
    setTyping: vi.fn(),
    clearTyping: vi.fn(),
    editRoomMessage: vi.fn(),
    deleteRoomMessage: vi.fn(),
    upsertRoomPreview: vi.fn(),
    upsertServer: vi.fn(),
    removeServer: vi.fn(),
    addServerChannel: vi.fn(),
    removeRoom: vi.fn(),
    setActiveChat: vi.fn(),
    incrementChannelUnread: vi.fn(),
    incrementRoomUnread: vi.fn(),
    setMessageReactions: vi.fn(),
    resetUnread: vi.fn(),
    resetRoomUnread: vi.fn(),
    updateMessagesStatus: vi.fn(),
  };

  return { state, handlers };
}

describe("useSocketEvents", () => {
  beforeEach(() => {
    useAppStoreMock.mockReset();
    getStateMock.mockReset();
    showNotificationMock.mockReset();
  });

  it("uses room_message_summary for preview/unread updates without appending room messages", async () => {
    const { state, handlers } = makeState();

    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) =>
      selector(state),
    );
    getStateMock.mockImplementation(() => state);

    renderHook(() => useSocketEvents());

    handlers.roomMessageSummary?.({
      room_id: 9,
      room_public_id: "room-public-id",
      message_id: 101,
      sender_id: 2,
      sender_public_id: "sender-public-id",
      sender_display_name: "Alice",
      inserted_at: "2026-06-30T12:00:00Z",
      preview: "hello summary",
      message_type: "text",
      media_type: null,
      unread_delta: 1,
      mention: false,
    });

    await Promise.resolve();

    expect(state.upsertRoomPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 9,
        public_id: "room-public-id",
        last_message_at: "2026-06-30T12:00:00Z",
        last_message: expect.objectContaining({
          id: 101,
          content: "hello summary",
          sender_id: 2,
          media_mime_type: null,
        }),
      }),
    );
    expect(state.incrementChannelUnread).toHaveBeenCalledWith(9);
    expect(state.incrementRoomUnread).not.toHaveBeenCalled();
    expect(state.appendRoomMessage).not.toHaveBeenCalled();
  });

  it("keeps legacy user-channel new_room_message as preview/unread only", async () => {
    const { state, handlers } = makeState();

    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) =>
      selector(state),
    );
    getStateMock.mockImplementation(() => state);

    renderHook(() => useSocketEvents());

    handlers.roomMessageGlobal?.({
      id: 202,
      content: "legacy full message",
      sender_id: 2,
      sender_public_id: "sender-public-id",
      room_id: 9,
      room_public_id: "room-public-id",
      status: "sent",
      inserted_at: "2026-06-30T12:05:00Z",
      sender_display_name: "Alice",
      sender_username: "alice",
      media_file_id: null,
      media_mime_type: null,
    });

    await Promise.resolve();

    expect(state.upsertRoomPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 9,
        public_id: "room-public-id",
        last_message: expect.objectContaining({
          id: 202,
          content: "legacy full message",
          sender_id: 2,
        }),
      }),
    );
    expect(state.incrementChannelUnread).toHaveBeenCalledWith(9);
    expect(state.appendRoomMessage).not.toHaveBeenCalled();
  });
});
