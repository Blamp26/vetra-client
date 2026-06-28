import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useAppStoreMock, markReadViaChannelMock } = vi.hoisted(() => ({
  useAppStoreMock: vi.fn(),
  markReadViaChannelMock: vi.fn(),
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
  sendMessageViaChannel: vi.fn(),
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
      joinRoomChannel: vi.fn(),
      leaveRoomChannel: vi.fn(),
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
    roomPreviews: {},
    initConversation: vi.fn(),
    setConversationMessages: vi.fn(),
    prependMessages: vi.fn(),
    appendMessage: vi.fn(),
    setConversationLoading: vi.fn(),
    setConversationHasMore: vi.fn(),
    resetUnread,
    initRoomConversation: vi.fn(),
    setRoomMessages: vi.fn(),
    prependRoomMessages: vi.fn(),
    appendRoomMessage: vi.fn(),
    setRoomConversationLoading: vi.fn(),
    setRoomConversationHasMore: vi.fn(),
    editRoomMessage: vi.fn(),
    deleteRoomMessage: vi.fn(),
    toggleRoomReaction: vi.fn(),
  };
}

describe("useUnifiedMessages", () => {
  beforeEach(() => {
    useAppStoreMock.mockReset();
    markReadViaChannelMock.mockReset();
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
});
