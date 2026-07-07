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

describe("MessageList bubble layout", () => {
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

  it("renders date dividers while keeping messages in a vertical bubble list", () => {
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
    expect(screen.getAllByTestId("message-bubble-row")).toHaveLength(2);
    expect(screen.getByTestId("message-list-scroll")).toHaveClass("px-3");
    expect(screen.getByTestId("message-list-scroll")).toHaveClass("py-4");
    expect(screen.getAllByTestId("message-date-group")[0]).toHaveClass("max-w-[980px]");
    expect(screen.getByText("First day")).toBeInTheDocument();
    expect(screen.getByText("Second day")).toBeInTheDocument();
  });

  it("opens the existing context menu from a message bubble", () => {
    renderMessageList([makeMessage({ content: "Context menu message" })]);

    fireEvent.contextMenu(screen.getByTestId("message-bubble"));

    expect(screen.getByRole("button", { name: "Reply" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });

  it("uses tighter spacing between consecutive media/document messages from the same sender", () => {
    renderMessageList([
      makeMessage({
        id: 1,
        content: null,
        sender_id: 2,
        media_file_id: "file-1",
        media_mime_type: "application/pdf",
        attachment: {
          id: "file-1",
          url: "/api/v1/media/file-1",
          mime_type: "application/pdf",
          original_name: "agenda.pdf",
          file_size: 1024,
          kind: "file",
        },
      }),
      makeMessage({
        id: 2,
        content: null,
        sender_id: 2,
        media_file_id: "file-2",
        media_mime_type: "application/pdf",
        attachment: {
          id: "file-2",
          url: "/api/v1/media/file-2",
          mime_type: "application/pdf",
          original_name: "notes.pdf",
          file_size: 2048,
          kind: "file",
        },
      }),
    ]);

    const rows = screen.getAllByTestId("message-row-spacing");
    expect(rows[1]).toHaveAttribute("data-attachment-run", "true");
    expect(rows[1]).toHaveClass("mt-0.5");
  });

  it("uses the normal grouped spacing when a consecutive message has no attachment", () => {
    renderMessageList([
      makeMessage({ id: 1, sender_id: 2, content: "First" }),
      makeMessage({ id: 2, sender_id: 2, content: "Second" }),
    ]);

    const rows = screen.getAllByTestId("message-row-spacing");
    expect(rows[1]).toHaveAttribute("data-attachment-run", "false");
    expect(rows[1]).toHaveClass("mt-1");
  });

  it("keeps a dedicated bottom spacer so the last message clears the composer", () => {
    renderMessageList([makeMessage({ content: "Last message" })]);

    expect(screen.getByTestId("message-list-bottom-spacer")).toBeInTheDocument();
    expect(screen.getByTestId("message-list-bottom-spacer")).toHaveClass("h-3");
  });
});
