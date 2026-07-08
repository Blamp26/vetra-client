import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { within } from "@testing-library/react";
import type { ComponentProps } from "react";
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

vi.mock("@/shared/components/AuthenticatedImage", () => ({
  AuthenticatedImage: ({
    src,
    alt,
    className,
    ...props
  }: ComponentProps<"img"> & {
    src: string;
  }) => <img data-testid="authenticated-image" src={src} alt={alt} className={className} {...props} />,
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
    expect(rows[1]).toHaveAttribute("data-grouped-with-previous", "true");
    expect(rows[0]).toHaveAttribute("data-grouped-with-next", "true");
    expect(rows[1]).toHaveClass("mt-0.5");
  });

  it("applies mirrored group corners to consecutive incoming text bubbles", () => {
    renderMessageList([
      makeMessage({ id: 1, sender_id: 2, content: "First incoming" }),
      makeMessage({ id: 2, sender_id: 2, content: "Second incoming" }),
    ]);

    const bubbles = screen.getAllByTestId("message-bubble");
    expect(bubbles[0]).toHaveClass("rounded-bl-[8px]");
    expect(bubbles[1]).toHaveClass("rounded-tl-[8px]", "rounded-bl-[4px]");
  });

  it("applies outgoing group corners to consecutive own text bubbles", () => {
    renderMessageList([
      makeMessage({ id: 1, sender_id: 1, content: "One" }),
      makeMessage({ id: 2, sender_id: 1, content: "Two" }),
    ]);

    const bubbles = screen.getAllByTestId("message-bubble");
    expect(bubbles[0]).toHaveClass("rounded-br-[8px]");
    expect(bubbles[1]).toHaveClass("rounded-tr-[8px]", "rounded-br-[4px]");
  });

  it("keeps inline text metadata inside the bubble without turning it into a footer capsule", () => {
    renderMessageList([makeMessage({ sender_id: 1, content: "Ok" })]);

    const bubble = screen.getByTestId("message-bubble");
    const inlineMeta = within(bubble).getByTestId("message-text-inline-metadata");

    expect(inlineMeta).toHaveClass("float-right", "top-[6px]", "ml-[7px]", "mr-[-6px]", "px-[4px]");
    expect(within(bubble).getByTestId("message-metadata")).not.toHaveClass("rounded-full", "bg-black/[0.20]");
  });

  it("renders a nine-photo grouped message as one Telegram-like album bubble", () => {
    renderMessageList([
      makeMessage({
        id: 1,
        content: null,
        sender_id: 1,
        media_file_ids: Array.from({ length: 9 }, (_, index) => `photo-${index + 1}`),
        media_mime_types: Array.from({ length: 9 }, () => "image/jpeg"),
        attachments: Array.from({ length: 9 }, (_, index) => ({
          id: `photo-${index + 1}`,
          url: `/api/v1/media/photo-${index + 1}`,
          mime_type: "image/jpeg",
          original_name: `photo-${index + 1}.jpg`,
          file_size: 1024 + index,
          kind: "photo" as const,
          width: index % 2 === 0 ? 1600 : 900,
          height: index % 3 === 0 ? 900 : 1200,
        })),
      }),
    ]);

    const album = screen.getByTestId("message-photo-collage");
    expect(screen.getAllByTestId("message-bubble-row")).toHaveLength(1);
    expect(album).toBeInTheDocument();
    expect(album.getAttribute("style")).toContain("aspect-ratio");
    expect(screen.getAllByTestId("message-photo-collage-tile")).toHaveLength(9);
    expect(screen.getAllByTestId("message-metadata")).toHaveLength(1);
  });

  it("keeps grouped albums intact when history reload returns media_file_id plus media_file_ids", () => {
    renderMessageList([
      makeMessage({
        id: 1,
        content: null,
        sender_id: 1,
        media_file_id: "photo-1",
        media_file_ids: ["photo-1", "photo-2"],
        media_mime_type: "image/jpeg",
        attachment: {
          id: "photo-1",
          url: "/api/v1/media/photo-1",
          mime_type: "image/jpeg",
          original_name: "photo-1.jpg",
          file_size: 1024,
          kind: "photo" as const,
          width: 900,
          height: 1400,
        },
      }),
    ]);

    expect(screen.getByTestId("message-photo-collage")).toBeInTheDocument();
    expect(screen.getAllByTestId("message-photo-collage-tile")).toHaveLength(2);
    expect(screen.getAllByTestId("message-metadata")).toHaveLength(1);
  });

  it("keeps a dedicated bottom spacer so the last message clears the composer", () => {
    renderMessageList([makeMessage({ content: "Last message" })]);

    expect(screen.getByTestId("message-list-bottom-spacer")).toBeInTheDocument();
    expect(screen.getByTestId("message-list-bottom-spacer")).toHaveClass("h-3");
  });
});
