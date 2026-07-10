import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageList, WIDE_CHAT_LEFT_COLUMN_THRESHOLD } from "./MessageList";

const { useAppStoreMock } = vi.hoisted(() => ({
  useAppStoreMock: vi.fn(),
}));

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    useAppStoreMock(selector),
}));

vi.mock("@/shared/components/ImageLightbox", () => ({
  ImageLightbox: ({
    src,
    authorName,
    createdAt,
    avatarSrc,
    onDelete,
    onForward,
  }: {
    src: string;
    authorName: string;
    createdAt: string;
    avatarSrc?: string | null;
    onDelete?: () => void;
    onForward?: () => void;
  }) => (
    <div data-testid="image-lightbox-mock">
      <span>{src}</span>
      <span>{authorName}</span>
      <span>{createdAt}</span>
      <span>{avatarSrc ?? "no-avatar"}</span>
      <span>{onDelete ? "can-delete" : "cannot-delete"}</span>
      <span>{onForward ? "can-forward" : "cannot-forward"}</span>
    </div>
  ),
}));

vi.mock("@/shared/components/VideoLightbox", () => ({
  VideoLightbox: ({
    src,
    authorName,
    createdAt,
    avatarSrc,
    onDelete,
    onForward,
  }: {
    src: string;
    authorName: string;
    createdAt: string;
    avatarSrc?: string | null;
    onDelete?: () => void;
    onForward?: () => void;
  }) => (
    <div data-testid="video-lightbox-mock">
      <span>{src}</span>
      <span>{authorName}</span>
      <span>{createdAt}</span>
      <span>{avatarSrc ?? "no-avatar"}</span>
      <span>{onDelete ? "can-delete" : "cannot-delete"}</span>
      <span>{onForward ? "can-forward" : "cannot-forward"}</span>
    </div>
  ),
}));

vi.mock("@/shared/components/AuthenticatedImage", () => ({
  AuthenticatedImage: ({
    src,
    alt,
    className,
    onLoad,
    onMediaDiagnostics,
    ...props
  }: ComponentProps<"img"> & {
    src: string;
    onMediaDiagnostics?: (diagnostics: {
      naturalWidth: number;
      naturalHeight: number;
      renderedWidth: number;
      renderedHeight: number;
      devicePixelRatio: number;
      duration: number | null;
    }) => void;
  }) => (
    <img
      data-testid="authenticated-image"
      src={src}
      alt={alt}
      className={className}
      {...props}
      onLoad={(event) => {
        onMediaDiagnostics?.({
          naturalWidth: event.currentTarget.naturalWidth,
          naturalHeight: event.currentTarget.naturalHeight,
          renderedWidth: event.currentTarget.clientWidth,
          renderedHeight: event.currentTarget.clientHeight,
          devicePixelRatio: 1,
        });
        onLoad?.(event);
      }}
    />
  ),
}));

vi.mock("@/shared/components/AuthenticatedVideo", () => ({
  AuthenticatedVideo: ({
    src,
    className,
    onLoadedMetadata,
    onMediaDiagnostics,
    ...props
  }: ComponentProps<"video"> & {
    src: string;
    onMediaDiagnostics?: (diagnostics: {
      naturalWidth: number;
      naturalHeight: number;
      renderedWidth: number;
      renderedHeight: number;
      devicePixelRatio: number;
    }) => void;
  }) => (
    <video
      data-testid="authenticated-video"
      src={src}
      className={className}
      {...props}
      onLoadedMetadata={(event) => {
        onMediaDiagnostics?.({
          naturalWidth: event.currentTarget.videoWidth,
          naturalHeight: event.currentTarget.videoHeight,
          renderedWidth: event.currentTarget.clientWidth,
          renderedHeight: event.currentTarget.clientHeight,
          devicePixelRatio: 1,
          duration: Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : null,
        });
        onLoadedMetadata?.(event);
      }}
    />
  ),
}));

vi.mock("../ForwardModal", () => ({
  ForwardModal: () => null,
}));

vi.mock("../../utils/attachmentDownloads", () => ({
  downloadAttachmentWithAuth: vi.fn(),
}));

import * as attachmentDownloads from "../../utils/attachmentDownloads";

let mockViewportWidth = 900;

class ResizeObserverMock {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    this.callback([
      {
        target,
        contentRect: {
          width: mockViewportWidth,
          height: 0,
          x: 0,
          y: 0,
          top: 0,
          right: mockViewportWidth,
          bottom: 0,
          left: 0,
          toJSON: () => ({}),
        },
      } as ResizeObserverEntry,
    ], this);
  }

  disconnect() {}
  unobserve() {}
}

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

function makeAlbumMessage(id: number, content: string | null) {
  const mediaFileIds = [`album-${id}-1`, `album-${id}-2`];
  return makeMessage({
    id,
    content,
    media_file_ids: mediaFileIds,
    media_mime_types: ["image/jpeg", "image/jpeg"],
    attachments: mediaFileIds.map((mediaFileId) => ({
      id: mediaFileId,
      url: `/api/v1/media/${mediaFileId}`,
      mime_type: "image/jpeg",
      original_name: `${mediaFileId}.jpg`,
      file_size: 1024,
      kind: "photo" as const,
      width: 1600,
      height: 900,
    })),
  });
}

function renderMessageList(
  messages = [makeMessage()],
  propOverrides: Partial<ComponentProps<typeof MessageList>> = {},
) {
  return render(
    <MessageList
      messages={messages}
      currentUserId={1}
      isLoading={false}
      hasMore={false}
      onLoadMore={vi.fn()}
      chatContext={{ type: "direct", partnerId: 2 }}
      onReply={vi.fn()}
      {...propOverrides}
    />,
  );
}

describe("MessageList bubble layout", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    mockViewportWidth = 900;
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => mockViewportWidth);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn(),
      },
    });
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
    expect(screen.getByTestId("message-list-rail")).toHaveClass("max-w-[900px]");
    expect(screen.getAllByTestId("message-date-group")[0]).toHaveClass("w-full");
    expect(screen.getByText("First day")).toBeInTheDocument();
    expect(screen.getByText("Second day")).toBeInTheDocument();
  });

  it("keeps split alignment when the chat viewport is at or below the wide threshold", () => {
    mockViewportWidth = WIDE_CHAT_LEFT_COLUMN_THRESHOLD;

    renderMessageList([
      makeMessage({
        id: 1,
        content: "Incoming",
      }),
      makeMessage({
        id: 2,
        content: "Outgoing",
        sender_id: 1,
        sender_username: "tester",
        sender_display_name: "Tester",
      }),
    ]);

    const rows = screen.getAllByTestId("message-bubble-row");

    expect(screen.getByTestId("message-list-rail")).toHaveAttribute("data-alignment-mode", "split");
    expect(rows[0]).toHaveAttribute("data-alignment-mode", "split");
    expect(rows[0]).toHaveClass("justify-start");
    expect(rows[1]).toHaveClass("justify-end");
  });

  it("switches to a left-biased reading column when the chat viewport exceeds the wide threshold", () => {
    mockViewportWidth = WIDE_CHAT_LEFT_COLUMN_THRESHOLD + 1;

    renderMessageList([
      makeMessage({
        id: 1,
        content: "Incoming",
      }),
      makeMessage({
        id: 2,
        content: "Outgoing",
        sender_id: 1,
        sender_username: "tester",
        sender_display_name: "Tester",
      }),
    ]);

    const rows = screen.getAllByTestId("message-bubble-row");
    const rail = screen.getByTestId("message-list-rail");

    expect(rail).toHaveAttribute("data-alignment-mode", "left-column");
    expect(rail).toHaveClass("mr-auto");
    expect(rail).not.toHaveClass("mx-auto");
    expect(rows[0]).toHaveAttribute("data-alignment-mode", "left-column");
    expect(rows[0]).toHaveClass("justify-start");
    expect(rows[1]).toHaveClass("justify-start");
    expect(rows[1]).not.toHaveClass("justify-end");
  });

  it("opens the existing context menu from a message bubble", () => {
    renderMessageList([makeMessage({ content: "Context menu message" })]);

    fireEvent.contextMenu(screen.getByTestId("message-bubble"));

    expect(screen.getByTestId("message-context-menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Reply" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Copy Text" })).toBeInTheDocument();
  });

  it("positions the context popup outside the clicked own-message bubble", () => {
    renderMessageList([
      makeMessage({
        id: 1,
        content: "Context menu message",
        sender_id: 1,
        sender_username: "tester",
        sender_display_name: "Tester",
      }),
    ]);

    const bubble = screen.getByTestId("message-bubble") as HTMLDivElement;
    const contentRect = bubble.querySelector("[data-message-content-rect]") as HTMLElement;
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function getBoundingClientRect() {
      if (this === bubble) {
        return {
          x: 660,
          y: 220,
          left: 660,
          top: 220,
          right: 940,
          bottom: 320,
          width: 280,
          height: 100,
          toJSON: () => ({}),
        } as DOMRect;
      }

      if (this === contentRect) {
        return {
          x: 688,
          y: 232,
          left: 688,
          top: 232,
          right: 920,
          bottom: 300,
          width: 232,
          height: 68,
          toJSON: () => ({}),
        } as DOMRect;
      }

      if ((this as HTMLElement).dataset.testid === "message-context-menu") {
        return {
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          right: 216,
          bottom: 248,
          width: 216,
          height: 248,
          toJSON: () => ({}),
        } as DOMRect;
      }

      return originalGetBoundingClientRect.call(this);
    });

    fireEvent.contextMenu(bubble, { clientX: 900, clientY: 260 });

    const menu = screen.getByTestId("message-context-menu");
    expect(menu).toHaveStyle({ left: "436px" });
  });

  it("prevents the native context menu on right-click", () => {
    renderMessageList([makeMessage({ content: "Context menu message" })]);

    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 120,
      clientY: 140,
    });

    screen.getByTestId("message-bubble").dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("closes the popup on Escape and outside click", () => {
    renderMessageList([makeMessage({ content: "Context menu message" })]);

    fireEvent.contextMenu(screen.getByTestId("message-bubble"));
    expect(screen.getByTestId("message-context-menu")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("message-context-menu")).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getByTestId("message-bubble"));
    expect(screen.getByTestId("message-context-menu")).toBeInTheDocument();

    fireEvent.click(document.body);
    expect(screen.queryByTestId("message-context-menu")).not.toBeInTheDocument();
  });

  it("resets the reactions picker to collapsed on every new context menu open", () => {
    renderMessageList([
      makeMessage({ id: 1, content: "First message" }),
      makeMessage({ id: 2, content: "Second message" }),
    ]);

    const bubbles = screen.getAllByTestId("message-bubble");

    fireEvent.contextMenu(bubbles[0]);
    fireEvent.click(screen.getByTestId("message-context-reaction-more"));

    expect(screen.getByTestId("message-context-expanded-picker")).toBeInTheDocument();
    expect(screen.queryByTestId("message-context-reactions-surface")).not.toBeInTheDocument();

    fireEvent.click(document.body);
    expect(screen.queryByTestId("message-context-menu")).not.toBeInTheDocument();

    fireEvent.contextMenu(bubbles[0]);
    expect(screen.queryByTestId("message-context-expanded-picker")).not.toBeInTheDocument();
    expect(screen.getByTestId("message-context-reactions-surface")).toBeInTheDocument();
    expect(screen.getByTestId("message-context-reaction-more")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("message-context-reaction-more"));
    expect(screen.getByTestId("message-context-expanded-picker")).toBeInTheDocument();

    fireEvent.contextMenu(bubbles[1]);
    expect(screen.queryByTestId("message-context-expanded-picker")).not.toBeInTheDocument();
    expect(screen.getByTestId("message-context-reactions-surface")).toBeInTheDocument();
    expect(screen.getByTestId("message-context-reaction-more")).toBeInTheDocument();
  });

  it("keeps the popup positioned inside the viewport", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 248,
      right: 216,
      width: 216,
      height: 248,
      toJSON: () => ({}),
    }));
    renderMessageList([makeMessage({ content: "Context menu message" })]);

    fireEvent.contextMenu(screen.getByTestId("message-bubble"), {
      clientX: 990,
      clientY: 790,
    });

    const popup = screen.getByTestId("message-context-menu");
    expect(parseFloat(popup.style.left)).toBeGreaterThanOrEqual(90);
    expect(parseFloat(popup.style.top)).toBeGreaterThanOrEqual(56);
  });

  it("calls the existing reply handler from the popup", () => {
    const onReply = vi.fn();
    renderMessageList([makeMessage({ content: "Reply target" })], { onReply });

    fireEvent.contextMenu(screen.getByTestId("message-bubble"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Reply" }));

    expect(onReply).toHaveBeenCalledWith({
      id: 1,
      content: "Reply target",
      author: "Alice",
    });
  });

  it("shows download for attachments and calls the existing authenticated download path", () => {
    renderMessageList([
      makeMessage({
        id: 21,
        content: null,
        attachment: {
          id: "file-21",
          url: "/api/v1/media/file-21",
          mime_type: "application/pdf",
          original_name: "report.pdf",
          file_size: 2048,
          kind: "file",
        },
        media_file_id: "file-21",
        media_mime_type: "application/pdf",
      }),
    ]);

    fireEvent.contextMenu(screen.getByTestId("message-bubble"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Download" }));

    expect(attachmentDownloads.downloadAttachmentWithAuth).toHaveBeenCalledWith({
      attachment: expect.objectContaining({ id: "file-21" }),
      authToken: "secret-token",
    });
  });

  it("opens VideoLightbox when clicking a grouped video tile", () => {
    renderMessageList([
      makeMessage({
        id: 7,
        content: null,
        sender_id: 2,
        sender: {
          id: 2,
          username: "alice",
          display_name: "Alice",
          bio: null,
          avatar_url: "/avatars/alice.png",
          status: "online",
          last_seen_at: null,
        },
        attachments: [
          {
            id: "video-group-1",
            url: "/api/v1/media/video-group-1",
            mime_type: "video/mp4",
            original_name: "clip.mp4",
            file_size: 4096,
            kind: "video",
            width: 720,
            height: 1280,
          },
          {
            id: "photo-group-2",
            url: "/api/v1/media/photo-group-2",
            mime_type: "image/jpeg",
            original_name: "still.jpg",
            file_size: 2048,
            kind: "photo",
            width: 1200,
            height: 900,
          },
        ],
        media_file_ids: ["video-group-1", "photo-group-2"],
        media_mime_types: ["video/mp4", "image/jpeg"],
      }),
    ]);

    fireEvent.click(screen.getByTestId("message-video-tile-video-group-1"));

    expect(screen.getByTestId("video-lightbox-mock")).toBeInTheDocument();
    expect(screen.getByText(/video-group-1/)).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("2026-06-30T12:00:00Z")).toBeInTheDocument();
    expect(screen.getByText("/avatars/alice.png")).toBeInTheDocument();
    expect(screen.getByText("cannot-forward")).toBeInTheDocument();
    expect(screen.getByText("cannot-delete")).toBeInTheDocument();
  });

  it("opens ImageLightbox with rich metadata when clicking a photo tile", () => {
    renderMessageList([
      makeMessage({
        id: 9,
        content: null,
        sender_id: 2,
        sender: {
          id: 2,
          username: "alice",
          display_name: "Alice",
          bio: null,
          avatar_url: "/avatars/alice.png",
          status: "online",
          last_seen_at: null,
        },
        attachment: {
          id: "photo-lightbox-1",
          url: "/api/v1/media/photo-lightbox-1",
          original_url: "/api/v1/media/photo-lightbox-1/original",
          display_url: "/api/v1/media/photo-lightbox-1/display",
          mime_type: "image/jpeg",
          original_name: "still.jpg",
          file_size: 2048,
          kind: "photo",
          width: 1200,
          height: 900,
        },
        media_file_id: "photo-lightbox-1",
        media_mime_type: "image/jpeg",
      }),
    ]);

    fireEvent.click(screen.getByTestId("message-media-shell"));

    expect(screen.getByTestId("image-lightbox-mock")).toBeInTheDocument();
    expect(screen.getByText(/photo-lightbox-1\/original/)).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("2026-06-30T12:00:00Z")).toBeInTheDocument();
    expect(screen.getByText("/avatars/alice.png")).toBeInTheDocument();
  });

  it("opens VideoLightbox with delete capability for the current user's own grouped video message", () => {
    renderMessageList([
      makeMessage({
        id: 8,
        content: null,
        sender_id: 1,
        sender_display_name: "You",
        sender: {
          id: 1,
          username: "you",
          display_name: "You",
          bio: null,
          avatar_url: "/avatars/you.png",
          status: "online",
          last_seen_at: null,
        },
        attachments: [
          {
            id: "video-own-1",
            url: "/api/v1/media/video-own-1",
            mime_type: "video/mp4",
            original_name: "own.mp4",
            file_size: 2048,
            kind: "video",
            width: 1280,
            height: 720,
          },
          {
            id: "photo-own-2",
            url: "/api/v1/media/photo-own-2",
            mime_type: "image/jpeg",
            original_name: "own.jpg",
            file_size: 1024,
            kind: "photo",
            width: 1200,
            height: 900,
          },
        ],
        media_file_ids: ["video-own-1", "photo-own-2"],
        media_mime_types: ["video/mp4", "image/jpeg"],
      }),
    ]);

    fireEvent.click(screen.getByTestId("message-video-tile-video-own-1"));

    expect(screen.getByTestId("video-lightbox-mock")).toBeInTheDocument();
    expect(screen.getByText("can-delete")).toBeInTheDocument();
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

  it("uses six-pixel grouped spacing when a consecutive message has no attachment", () => {
    renderMessageList([
      makeMessage({ id: 1, sender_id: 2, content: "First" }),
      makeMessage({ id: 2, sender_id: 2, content: "Second" }),
    ]);

    const rows = screen.getAllByTestId("message-row-spacing");
    expect(rows[1]).toHaveAttribute("data-attachment-run", "false");
    expect(rows[1]).toHaveAttribute("data-grouped-with-previous", "true");
    expect(rows[0]).toHaveAttribute("data-grouped-with-next", "true");
    expect(rows[1]).toHaveClass("mt-1.5");
  });

  it("keeps grouped corners on the middle incoming bubble and full corners on its tail bubble", () => {
    renderMessageList([
      makeMessage({ id: 1, sender_id: 2, content: "First incoming" }),
      makeMessage({ id: 2, sender_id: 2, content: "Second incoming" }),
    ]);

    const bubbles = screen.getAllByTestId("message-bubble");
    expect(bubbles[0]).toHaveClass("rounded-bl-[6px]");
    expect(bubbles[1]).toHaveClass("rounded-tl-[15px]", "rounded-bl-[0px]");
    expect(bubbles[1]).not.toHaveClass("rounded-tl-[6px]");
  });

  it("keeps grouped corners on the middle outgoing bubble and full corners on its tail bubble", () => {
    renderMessageList([
      makeMessage({ id: 1, sender_id: 1, content: "One" }),
      makeMessage({ id: 2, sender_id: 1, content: "Two" }),
    ]);

    const bubbles = screen.getAllByTestId("message-bubble");
    expect(bubbles[0]).toHaveClass("rounded-br-[6px]");
    expect(bubbles[1]).toHaveClass("rounded-tr-[15px]", "rounded-br-[0px]");
    expect(bubbles[1]).not.toHaveClass("rounded-tr-[6px]");
  });

  it("uses middle group corners without rendering a tail", () => {
    renderMessageList([
      makeMessage({ id: 1, sender_id: 1, content: "One" }),
      makeMessage({ id: 2, sender_id: 1, content: "Two" }),
      makeMessage({ id: 3, sender_id: 1, content: "Three" }),
    ]);

    const bubbles = screen.getAllByTestId("message-bubble");
    expect(bubbles[1]).toHaveClass("rounded-tr-[6px]", "rounded-br-[6px]");
    expect(within(bubbles[1]).queryByTestId("message-text-tail")).not.toBeInTheDocument();
    expect(within(bubbles[2]).getByTestId("message-text-tail")).toBeInTheDocument();
  });

  it("keeps inline text metadata inside the bubble without turning it into a footer capsule", () => {
    renderMessageList([makeMessage({ sender_id: 1, content: "Ok" })]);

    const bubble = screen.getByTestId("message-bubble");
    const inlineMeta = within(bubble).getByTestId("message-text-inline-metadata");

    expect(inlineMeta).toHaveClass("float-right", "top-[6px]", "h-[20px]", "ml-[7px]", "mr-[-6px]", "px-[4px]");
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

  it("keeps normal spacing after a captioned album before the next album", () => {
    renderMessageList([
      makeAlbumMessage(1, "Album caption"),
      makeAlbumMessage(2, null),
    ]);

    const rows = screen.getAllByTestId("message-row-spacing");
    expect(rows[1]).toHaveAttribute("data-attachment-run", "false");
    expect(rows[1]).toHaveClass("mt-1.5");
  });

  it("keeps normal spacing after an album before the next captioned album", () => {
    renderMessageList([
      makeAlbumMessage(1, null),
      makeAlbumMessage(2, "Album caption"),
    ]);

    const rows = screen.getAllByTestId("message-row-spacing");
    expect(rows[1]).toHaveAttribute("data-attachment-run", "false");
    expect(rows[1]).toHaveClass("mt-1.5");
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
