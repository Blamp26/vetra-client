import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageList } from "./MessageList";

const { useAppStoreMock } = vi.hoisted(() => ({
  useAppStoreMock: vi.fn(),
}));

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    useAppStoreMock(selector),
}));

vi.mock("@/shared/components/ImageLightbox", () => ({
  ImageLightbox: () => null,
}));

vi.mock("../ForwardModal", () => ({
  ForwardModal: () => null,
}));

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    content: "Hello",
    sender_id: 2,
    sender_public_id: "sender-public-id",
    recipient_id: 1,
    recipient_public_id: "recipient-public-id",
    room_id: null,
    status: "sent" as const,
    inserted_at: "2026-06-30T12:00:00Z",
    sender_username: "alice",
    sender_display_name: "Alice",
    media_file_id: null,
    media_mime_type: null,
    reactions: [],
    ...overrides,
  };
}

function renderMessageList(messages = [makeMessage()]) {
  return render(
    <MessageList
      messages={messages}
      currentUserId={1}
      isLoading={false}
      hasMore={false}
      onLoadMore={vi.fn()}
      chatContext={{ type: "direct", partnerId: 2 }}
    />,
  );
}

describe("MessageList stream layout", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    useAppStoreMock.mockReset();
    useAppStoreMock.mockImplementation((selector: (state: unknown) => unknown) =>
      selector({
        selectionMode: false,
        selectedMessageIds: [],
        setSelectionMode: vi.fn(),
        toggleMessageSelection: vi.fn(),
        clearSelection: vi.fn(),
        forwardingMessageIds: null,
        setForwardingMessages: vi.fn(),
        setActiveChat: vi.fn(),
        socketManager: null,
        deleteMessage: vi.fn(),
        deleteRoomMessage: vi.fn(),
        messageReactions: {},
        startEditing: vi.fn(),
        conversationPreviews: {},
        roomPreviews: {},
        authToken: "secret-token",
      }),
    );
  });

  it("renders date dividers while keeping messages in a vertical stream", () => {
    renderMessageList([
      makeMessage({
        id: 1,
        content: "First day",
        inserted_at: "2026-06-30T12:00:00Z",
      }),
      makeMessage({
        id: 2,
        content: "Second day",
        inserted_at: "2026-07-01T12:00:00Z",
      }),
    ]);

    expect(screen.getByText(new Date("2026-06-30T12:00:00Z").toLocaleDateString())).toBeInTheDocument();
    expect(screen.getByText(new Date("2026-07-01T12:00:00Z").toLocaleDateString())).toBeInTheDocument();
    expect(screen.getAllByTestId("message-stream-row")).toHaveLength(2);
    expect(screen.getByText("First day")).toBeInTheDocument();
    expect(screen.getByText("Second day")).toBeInTheDocument();
  });

  it("opens the existing context menu from a stream row", () => {
    renderMessageList([makeMessage({ content: "Context menu message" })]);

    fireEvent.contextMenu(screen.getByTestId("message-body"));

    expect(screen.getByRole("button", { name: "Reply" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });
});
