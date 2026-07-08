import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useAppStoreMock } = vi.hoisted(() => ({
  useAppStoreMock: vi.fn(),
}));

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    useAppStoreMock(selector),
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

vi.mock("../../utils/attachmentDownloads", () => ({
  downloadAttachmentWithAuth: vi.fn(),
  openAttachmentWithAuth: vi.fn(),
}));

import { MessageItem } from "./MessageItem";
import * as mediaAlbumLayout from "../../utils/mediaAlbumLayout";

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    content: null,
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

function renderMessageItem(
  messageOverrides: Record<string, unknown>,
  propOverrides: Partial<ComponentProps<typeof MessageItem>> = {},
) {
  return render(
    <MessageItem
      msg={makeMessage(messageOverrides)}
      isOwn={false}
      isConsecutive={false}
      isGroupedWithNext={false}
      isSelected={false}
      selectionMode={false}
      isRoom={false}
      messageReactions={[]}
      currentUserId={1}
      onContextMenu={vi.fn()}
      onToggleSelection={vi.fn()}
      onToggleReaction={vi.fn()}
      onLightbox={vi.fn()}
      renderReplyPreview={() => null}
      formatTime={() => "12:00"}
      {...propOverrides}
    />,
  );
}

describe("MessageItem bubble layout", () => {
  beforeEach(() => {
    useAppStoreMock.mockReset();
    useAppStoreMock.mockImplementation((selector: (state: unknown) => unknown) =>
      selector({ authToken: "secret-token" }),
    );
  });

  it("renders incoming direct messages as left-aligned bubbles without sender labels", () => {
    renderMessageItem({ content: "Hello from Alice" });

    const row = screen.getByTestId("message-bubble-row");
    const bubble = screen.getByTestId("message-bubble");
    const inlineMeta = screen.getByTestId("message-text-inline-metadata");

    expect(row).toHaveAttribute("data-own-message", "false");
    expect(row).toHaveClass("justify-start");
    expect(row).not.toHaveClass("justify-end");
    expect(bubble).toHaveClass("w-fit");
    expect(bubble).toHaveClass("max-w-[min(30rem,calc(100vw-6rem))]");
    expect(bubble).toHaveClass("rounded-[15px]");
    expect(bubble).toHaveClass("rounded-bl-[4px]");
    expect(bubble).toHaveClass("px-2");
    expect(bubble).toHaveClass("pt-[5px]");
    expect(bubble).toHaveClass("pb-[6px]");
    expect(bubble).toHaveClass("bg-bubble-incoming");
    expect(bubble).not.toHaveClass("flex-1");
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    expect(screen.getByText("12:00")).toBeInTheDocument();
    expect(screen.getByText("Hello from Alice")).toBeInTheDocument();
    expect(screen.getByTestId("message-metadata")).toBeInTheDocument();
    expect(inlineMeta).toHaveClass("float-right", "top-[6px]", "ml-[7px]", "mr-[-6px]", "px-[4px]");
    expect(screen.queryByLabelText(/Sent|Delivered|Read|Error sending/)).not.toBeInTheDocument();
  });

  it("renders own short messages as right-aligned bubbles with integrated metadata", () => {
    renderMessageItem(
      {
        content: "23",
        sender_id: 1,
        sender_username: "tester",
        sender_display_name: "Tester",
        status: "sent",
      },
      { isOwn: true },
    );

    const row = screen.getByTestId("message-bubble-row");
    const bubble = screen.getByTestId("message-bubble");
    const inlineMeta = screen.getByTestId("message-text-inline-metadata");

    expect(row).toHaveAttribute("data-own-message", "true");
    expect(row).toHaveClass("justify-end");
    expect(row).not.toHaveClass("justify-start");
    expect(bubble).toHaveClass("w-fit");
    expect(bubble).toHaveClass("min-w-[3.75rem]");
    expect(bubble).toHaveClass("max-w-[min(30rem,calc(100vw-6rem))]");
    expect(bubble).toHaveClass("bg-bubble-outgoing");
    expect(bubble).toHaveClass("rounded-br-[4px]");
    expect(bubble).not.toHaveClass("flex-1");
    expect(screen.queryByText("Tester")).not.toBeInTheDocument();
    expect(screen.getByText("23")).toBeInTheDocument();
    expect(screen.getByText("12:00")).toBeInTheDocument();
    expect(inlineMeta).toHaveClass("float-right", "top-[6px]", "ml-[7px]", "mr-[-6px]", "px-[4px]");
    expect(screen.getByTestId("message-inline-status")).toHaveClass("ml-[-3px]", "h-[19px]", "w-[19px]");
    expect(screen.getByLabelText("Sent")).toBeInTheDocument();
  });

  it("renders group sender labels only when useful", () => {
    renderMessageItem(
      { content: "Group hello" },
      { isRoom: true },
    );

    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("does not render Discord-style avatar/meta stream structure", () => {
    renderMessageItem({ content: "No stream row" });

    expect(screen.queryByTestId("message-stream-row")).not.toBeInTheDocument();
    expect(screen.queryByTestId("message-avatar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("message-meta")).not.toBeInTheDocument();
  });

  it("preserves the message context menu trigger", () => {
    const onContextMenu = vi.fn();
    renderMessageItem(
      { content: "Open menu" },
      { onContextMenu },
    );

    screen.getByTestId("message-bubble").dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
    );

    expect(onContextMenu).toHaveBeenCalledTimes(1);
    expect(onContextMenu.mock.calls[0][1]).toMatchObject({ id: 1, content: "Open menu" });
  });

  it("keeps metadata outside the content rect used for context menu positioning", () => {
    renderMessageItem(
      {
        content: "compact",
        sender_id: 1,
        sender_username: "tester",
        sender_display_name: "Tester",
        status: "read",
      },
      { isOwn: true },
    );

    const bubble = screen.getByTestId("message-bubble");
    const metadata = screen.getByTestId("message-metadata");
    const contentRect = bubble.querySelector("[data-message-content-rect]");

    expect(contentRect).not.toBeNull();
    expect(contentRect).not.toContain(metadata);
  });

  it("applies Telegram-like grouped corner geometry to outgoing text bubbles", () => {
    renderMessageItem(
      {
        content: "Grouped",
        sender_id: 1,
        sender_username: "tester",
        sender_display_name: "Tester",
        status: "delivered",
      },
      { isOwn: true, isConsecutive: true, isGroupedWithNext: true },
    );

    expect(screen.getByTestId("message-bubble")).toHaveClass("rounded-tr-[8px]", "rounded-br-[8px]");
  });

  it("uses a reduced tail-side corner on the last outgoing text bubble in a group", () => {
    renderMessageItem(
      {
        content: "Last",
        sender_id: 1,
        sender_username: "tester",
        sender_display_name: "Tester",
        status: "read",
      },
      { isOwn: true, isConsecutive: true, isGroupedWithNext: false },
    );

    expect(screen.getByTestId("message-bubble")).toHaveClass("rounded-tr-[8px]", "rounded-br-[4px]");
  });

  it("applies mirrored grouped corner geometry to incoming text bubbles", () => {
    renderMessageItem(
      { content: "Incoming grouped" },
      { isConsecutive: true, isGroupedWithNext: true },
    );

    expect(screen.getByTestId("message-bubble")).toHaveClass("rounded-tl-[8px]", "rounded-bl-[8px]");
    expect(screen.queryByTestId("message-inline-status")).not.toBeInTheDocument();
  });

  it("renders outgoing media-only messages as media-sized bubbles with overlay metadata", () => {
    renderMessageItem(
      {
        media_file_id: "media-photo-1",
        media_mime_type: "image/jpeg",
        attachment: {
          id: "media-photo-1",
          url: "/api/v1/media/media-photo-1",
          mime_type: "image/jpeg",
          original_name: "photo.jpg",
          file_size: 2048,
          kind: "photo",
          width: 900,
          height: 1600,
        },
        sender_id: 1,
        sender_username: "tester",
        sender_display_name: "Tester",
        status: "read",
      },
      { isOwn: true },
    );

    const bubble = screen.getByTestId("message-bubble");
    const overlay = screen.getByTestId("message-media-only-overlay");
    const metadata = screen.getByTestId("message-metadata");
    const mediaShell = screen.getByTestId("message-media-shell");

    expect(bubble).not.toHaveClass("bg-bubble-outgoing");
    expect(screen.getByTestId("authenticated-image").getAttribute("src")).toContain("/api/v1/media/media-photo-1");
    expect(mediaShell).toHaveStyle({ width: "270px", aspectRatio: "270 / 480" });
    expect(overlay).toHaveClass("absolute", "bottom-[4px]", "right-[4px]");
    expect(metadata).toHaveClass("h-[18px]", "rounded-[10px]", "bg-black/[0.20]", "py-0", "pl-[6px]", "pr-[5px]", "text-white");
    expect(metadata).not.toHaveClass("bg-black/40", "bg-black/60", "rounded-full", "backdrop-blur-[2px]", "shadow-[0_2px_10px_rgba(0,0,0,0.24)]");
    expect(screen.getByText("12:00")).toHaveClass("mr-[4px]", "text-[12px]", "leading-[12px]", "font-normal");
    expect(screen.getByTestId("message-media-only-status")).toHaveClass("ml-[-3px]", "h-[19px]", "w-[19px]");
    expect(screen.getByText("12:00")).toBeInTheDocument();
    expect(screen.getByLabelText("Read")).toBeInTheDocument();
    expect(screen.queryByText("Download")).not.toBeInTheDocument();
  });

  it("passes server width and height into the album layout helper", () => {
    const originalComputeMediaAlbumLayout = mediaAlbumLayout.computeMediaAlbumLayout;
    const layoutSpy = vi.spyOn(mediaAlbumLayout, "computeMediaAlbumLayout");
    layoutSpy.mockImplementation((...args) => originalComputeMediaAlbumLayout(...args));

    renderMessageItem(
      {
        attachments: [
          {
            id: "photo-server-1",
            url: "/api/v1/media/photo-server-1",
            mime_type: "image/jpeg",
            original_name: "photo-server-1.jpg",
            file_size: 2048,
            kind: "photo",
            width: 1800,
            height: 1200,
          },
          {
            id: "photo-server-2",
            url: "/api/v1/media/photo-server-2",
            mime_type: "image/jpeg",
            original_name: "photo-server-2.jpg",
            file_size: 2048,
            kind: "photo",
            width: 900,
            height: 1600,
          },
        ],
        media_file_ids: ["photo-server-1", "photo-server-2"],
        media_mime_types: ["image/jpeg", "image/jpeg"],
      },
      { isOwn: true },
    );

    expect(layoutSpy).toHaveBeenCalled();
    expect(layoutSpy.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ id: "photo-server-1", width: 1800, height: 1200 }),
      expect.objectContaining({ id: "photo-server-2", width: 900, height: 1600 }),
    ]);
    layoutSpy.mockRestore();
  });

  it("warns in dev when album attachments are still missing dimensions", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    renderMessageItem(
      {
        id: 99,
        attachments: [
          {
            id: "photo-missing-1",
            url: "/api/v1/media/photo-missing-1",
            mime_type: "image/jpeg",
            original_name: "photo-missing-1.jpg",
            file_size: 2048,
            kind: "photo",
          },
          {
            id: "photo-missing-2",
            url: "/api/v1/media/photo-missing-2",
            mime_type: "image/jpeg",
            original_name: "photo-missing-2.jpg",
            file_size: 2048,
            kind: "photo",
          },
        ],
        media_file_ids: ["photo-missing-1", "photo-missing-2"],
        media_mime_types: ["image/jpeg", "image/jpeg"],
      },
      { isOwn: true },
    );

    expect(
      warnSpy.mock.calls.some(([label, payload]) =>
        String(label).includes("[VETRA album-layout]") &&
        (payload as Record<string, unknown>).messageId === 99 &&
        (payload as Record<string, unknown>).attachmentId === "photo-missing-1",
      ),
    ).toBe(true);
    warnSpy.mockRestore();
  });

  it("renders a temporary fallback while client-side dimensions are pending and recomputes after load", () => {
    const originalComputeMediaAlbumLayout = mediaAlbumLayout.computeMediaAlbumLayout;
    const layoutSpy = vi.spyOn(mediaAlbumLayout, "computeMediaAlbumLayout");
    layoutSpy.mockImplementation((...args) => originalComputeMediaAlbumLayout(...args));

    renderMessageItem(
      {
        media_file_id: "photo-pending-1",
        media_mime_type: "image/jpeg",
        attachment: {
          id: "photo-pending-1",
          url: "/api/v1/media/photo-pending-1",
          mime_type: "image/jpeg",
          original_name: "photo-pending-1.jpg",
          file_size: 2048,
          kind: "photo",
        },
      },
      { isOwn: true },
    );

    const mediaShell = screen.getByTestId("message-media-shell");
    const image = screen.getByTestId("authenticated-image");

    expect(mediaShell).toHaveAttribute("data-photo-layout-state", "pending");
    expect(layoutSpy.mock.calls.at(-1)?.[0]).toEqual([
      expect.objectContaining({ id: "photo-pending-1", width: undefined, height: undefined }),
    ]);

    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 1600 },
      naturalHeight: { configurable: true, value: 900 },
    });
    fireEvent.load(image);

    expect(mediaShell).toHaveAttribute("data-photo-layout-state", "resolved");
    expect(layoutSpy.mock.calls.at(-1)?.[0]).toEqual([
      expect.objectContaining({ id: "photo-pending-1", width: 1600, height: 900 }),
    ]);
    layoutSpy.mockRestore();
  });

  it("uses display-quality image URLs in chat and original URLs in the lightbox", () => {
    const onLightbox = vi.fn();

    renderMessageItem(
      {
        media_file_id: "media-photo-rich",
        media_mime_type: "image/jpeg",
        attachment: {
          id: "media-photo-rich",
          url: "/api/v1/media/media-photo-rich",
          display_url: "/api/v1/media/media-photo-rich?variant=display",
          original_url: "/api/v1/media/media-photo-rich?variant=original",
          mime_type: "image/jpeg",
          original_name: "photo-rich.jpg",
          file_size: 2048,
          kind: "photo",
          width: 1600,
          height: 900,
        },
      },
      { isOwn: true, onLightbox },
    );

    expect(screen.getByTestId("authenticated-image").getAttribute("src")).toContain(
      "/api/v1/media/media-photo-rich?variant=display",
    );

    screen.getByTestId("message-media-shell").click();

    expect(onLightbox).toHaveBeenCalledWith({
      src: expect.stringContaining("/api/v1/media/media-photo-rich?variant=original"),
      author: "Alice",
      time: "2026-06-30T12:00:00Z",
    });
  });

  it("renders a nine-photo grouped message with aspect-aware album geometry", () => {
    renderMessageItem(
      {
        attachments: Array.from({ length: 9 }, (_, index) => ({
          id: `photo-${index + 1}`,
          url: `/api/v1/media/photo-${index + 1}`,
          mime_type: "image/jpeg",
          original_name: `photo-${index + 1}.jpg`,
          file_size: 2048 + index,
          kind: "photo" as const,
          width: index % 2 === 0 ? 1600 : 900,
          height: index % 3 === 0 ? 900 : 1200,
        })),
        media_file_ids: Array.from({ length: 9 }, (_, index) => `photo-${index + 1}`),
        media_mime_types: Array.from({ length: 9 }, () => "image/jpeg"),
        sender_id: 1,
        sender_username: "tester",
        sender_display_name: "Tester",
        status: "read",
      },
      { isOwn: true },
    );

    const album = screen.getByTestId("message-photo-collage");
    const tile0 = screen.getByTestId("message-photo-collage-tile-0");
    const tile4 = screen.getByTestId("message-photo-collage-tile-4");
    const tile7 = screen.getByTestId("message-photo-collage-tile-7");

    expect(album).toBeInTheDocument();
    expect(album.getAttribute("style")).toContain("aspect-ratio");
    expect(screen.getAllByTestId("message-photo-collage-tile")).toHaveLength(9);
    expect(screen.getAllByTestId("message-metadata")).toHaveLength(1);
    expect(screen.getByTestId("message-media-only-overlay")).toBeInTheDocument();
    expect(screen.queryAllByTestId("authenticated-image")).toHaveLength(9);
    expect(tile0.getAttribute("style")).toContain("left:");
    expect(tile4.getAttribute("style")).toContain("top:");
    expect(tile7.getAttribute("style")).toContain("width:");
  });

  it("renders a grouped photo album from compatibility payloads with media_file_id plus media_file_ids", () => {
    renderMessageItem(
      {
        media_file_id: "photo-1",
        media_file_ids: ["photo-1", "photo-2", "photo-3"],
        media_mime_type: "image/jpeg",
        attachment: {
          id: "photo-1",
          url: "/api/v1/media/photo-1",
          mime_type: "image/jpeg",
          original_name: "photo-1.jpg",
          file_size: 2048,
          kind: "photo",
          width: 900,
          height: 1400,
        },
      },
      { isOwn: true },
    );

    expect(screen.getByTestId("message-photo-collage")).toBeInTheDocument();
    expect(screen.getAllByTestId("message-photo-collage-tile")).toHaveLength(3);
    expect(screen.getAllByTestId("message-metadata")).toHaveLength(1);
  });

  it("renders a grouped photo album from socket-style media_file_ids without attachment objects", () => {
    renderMessageItem(
      {
        media_file_ids: ["photo-1", "photo-2"],
        media_mime_types: ["image/jpeg", "image/png"],
      },
      { isOwn: true },
    );

    expect(screen.getByTestId("message-photo-collage")).toBeInTheDocument();
    expect(screen.getAllByTestId("message-photo-collage-tile")).toHaveLength(2);
    expect(screen.getAllByTestId("authenticated-image")[0].getAttribute("src")).toContain("/api/v1/media/photo-1");
    expect(screen.getAllByTestId("message-metadata")).toHaveLength(1);
  });

  it("renders a three-item media album with three visible tiles", () => {
    renderMessageItem(
      {
        attachments: [
          {
            id: "photo-1",
            url: "/api/v1/media/photo-1",
            mime_type: "image/jpeg",
            original_name: "photo-1.jpg",
            file_size: 2048,
            kind: "photo",
            width: 900,
            height: 1400,
          },
          {
            id: "photo-2",
            url: "/api/v1/media/photo-2",
            mime_type: "image/png",
            original_name: "photo-2.png",
            file_size: 4096,
            kind: "photo",
            width: 1600,
            height: 900,
          },
          {
            id: "photo-3",
            url: "/api/v1/media/photo-3",
            mime_type: "image/webp",
            original_name: "photo-3.webp",
            file_size: 1024,
            kind: "photo",
            width: 1000,
            height: 900,
          },
        ],
        media_file_ids: ["photo-1", "photo-2", "photo-3"],
        media_mime_types: ["image/jpeg", "image/png", "image/webp"],
      },
      { isOwn: true },
    );

    expect(screen.getByTestId("message-photo-collage")).toBeInTheDocument();
    expect(screen.getAllByTestId("message-photo-collage-tile")).toHaveLength(3);
  });

  it("renders four attachments for a four-photo album message", () => {
    renderMessageItem(
      {
        attachments: [
          {
            id: "photo-1",
            url: "/api/v1/media/photo-1",
            mime_type: "image/jpeg",
            original_name: "photo-1.jpg",
            file_size: 2048,
            kind: "photo",
            width: 1200,
            height: 900,
          },
          {
            id: "photo-2",
            url: "/api/v1/media/photo-2",
            mime_type: "image/png",
            original_name: "photo-2.png",
            file_size: 2048,
            kind: "photo",
            width: 1180,
            height: 900,
          },
          {
            id: "photo-3",
            url: "/api/v1/media/photo-3",
            mime_type: "image/webp",
            original_name: "photo-3.webp",
            file_size: 2048,
            kind: "photo",
            width: 1150,
            height: 900,
          },
          {
            id: "photo-4",
            url: "/api/v1/media/photo-4",
            mime_type: "image/gif",
            original_name: "photo-4.gif",
            file_size: 2048,
            kind: "photo",
            width: 1170,
            height: 900,
          },
        ],
        media_file_ids: ["photo-1", "photo-2", "photo-3", "photo-4"],
        media_mime_types: ["image/jpeg", "image/png", "image/webp", "image/gif"],
      },
      { isOwn: true },
    );

    expect(screen.getByTestId("message-photo-collage")).toBeInTheDocument();
    expect(screen.getAllByTestId("message-photo-collage-tile")).toHaveLength(4);
    expect(screen.getAllByTestId("authenticated-image")).toHaveLength(4);
  });

  it("renders incoming media-only messages with overlay timestamp and no outgoing status", () => {
    renderMessageItem({
      media_file_id: "media-photo-2",
      media_mime_type: "image/jpeg",
      attachment: {
        id: "media-photo-2",
        url: "/api/v1/media/media-photo-2",
        mime_type: "image/jpeg",
        original_name: "portrait.jpg",
        file_size: 3200,
        kind: "photo",
        width: 1600,
        height: 900,
      },
    });

    expect(screen.getByTestId("message-media-only-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("message-metadata")).toHaveClass("h-[18px]", "rounded-[10px]", "bg-black/[0.20]");
    expect(screen.getByTestId("message-media-shell")).toBeInTheDocument();
    expect(screen.getByText("12:00")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Sent|Delivered|Read|Error sending/)).not.toBeInTheDocument();
  });

  it("renders image captions below media while keeping metadata visible", () => {
    renderMessageItem(
      {
        content: "A short caption",
        sender_id: 1,
        sender_username: "tester",
        sender_display_name: "Tester",
        status: "delivered",
        media_file_id: "media-photo-caption",
        media_mime_type: "image/jpeg",
        attachment: {
          id: "media-photo-caption",
          url: "/api/v1/media/media-photo-caption",
          mime_type: "image/jpeg",
          original_name: "captioned.jpg",
          file_size: 9999,
          kind: "photo",
          width: 1600,
          height: 900,
        },
      },
      { isOwn: true },
    );

    const contentRect = screen.getByTestId("message-bubble").querySelector("[data-message-content-rect]");
    const mediaShell = screen.getByTestId("message-media-shell");
    const textContent = screen.getByTestId("message-text-content");

    expect(contentRect).toContain(mediaShell);
    expect(contentRect).toContain(textContent);
    expect(screen.queryByTestId("message-media-only-overlay")).not.toBeInTheDocument();
    expect(screen.getByText("A short caption")).toBeInTheDocument();
    expect(screen.getByText("12:00")).toBeInTheDocument();
    expect(screen.getByLabelText("Delivered")).toBeInTheDocument();
  });

  it("renders grouped photo captions below the collage with one metadata block", () => {
    renderMessageItem(
      {
        content: "Album caption",
        sender_id: 1,
        sender_username: "tester",
        sender_display_name: "Tester",
        status: "delivered",
        attachments: [
          {
            id: "photo-1",
          url: "/api/v1/media/photo-1",
          mime_type: "image/jpeg",
          original_name: "photo-1.jpg",
          file_size: 2048,
          kind: "photo",
          width: 1600,
          height: 900,
        },
        {
          id: "photo-2",
          url: "/api/v1/media/photo-2",
          mime_type: "image/png",
          original_name: "photo-2.png",
          file_size: 4096,
          kind: "photo",
          width: 900,
          height: 1400,
        },
      ],
      media_file_ids: ["photo-1", "photo-2"],
      media_mime_types: ["image/jpeg", "image/png"],
      },
      { isOwn: true },
    );

    const contentRect = screen.getByTestId("message-bubble").querySelector("[data-message-content-rect]");
    expect(contentRect).toContainElement(screen.getByTestId("message-photo-collage"));
    expect(screen.getByText("Album caption")).toBeInTheDocument();
    expect(screen.queryByTestId("message-media-only-overlay")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("message-metadata")).toHaveLength(1);
  });

  it("renders a safe fallback layout when media dimensions are missing", () => {
    renderMessageItem(
      {
        attachments: [
          {
            id: "photo-1",
            url: "/api/v1/media/photo-1",
            mime_type: "image/jpeg",
            original_name: "photo-1.jpg",
            file_size: 2048,
            kind: "photo",
          },
          {
            id: "photo-2",
            url: "/api/v1/media/photo-2",
            mime_type: "image/jpeg",
            original_name: "photo-2.jpg",
            file_size: 2048,
            kind: "photo",
          },
        ],
        media_file_ids: ["photo-1", "photo-2"],
        media_mime_types: ["image/jpeg", "image/jpeg"],
      },
      { isOwn: true },
    );

    expect(screen.getByTestId("message-photo-collage")).toBeInTheDocument();
    expect(screen.getAllByTestId("message-photo-collage-tile")).toHaveLength(2);
  });

  it("renders video attachments through the existing file row path", () => {
    renderMessageItem(
      {
        media_file_id: "media-video-1",
        media_mime_type: "video/mp4",
        attachment: {
          id: "media-video-1",
          url: "/api/v1/media/media-video-1",
          mime_type: "video/mp4",
          original_name: "clip.mp4",
          file_size: 4096,
          kind: "video",
          width: 1920,
          height: 1080,
        },
      },
      { isOwn: true },
    );

    expect(screen.getByTestId("message-file-row")).toBeInTheDocument();
    expect(screen.getByText("clip.mp4")).toBeInTheDocument();
    expect(screen.getByText("Video · 4.0 KB")).toBeInTheDocument();
    expect(screen.queryByTestId("message-media-shell")).not.toBeInTheDocument();
  });

  it("renders PDF attachments as a compact file row with in-bubble metadata", () => {
    renderMessageItem({
      media_file_id: "media-file-1",
      media_mime_type: "application/pdf",
      attachment: {
        id: "media-file-1",
        url: "/api/v1/media/media-file-1",
        mime_type: "application/pdf",
        original_name: "report.pdf",
        file_size: 5678,
        kind: "file",
      },
    });

    const bubble = screen.getByTestId("message-bubble");

    expect(screen.getByTestId("message-file-row")).toBeInTheDocument();
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByText("PDF · 5.5 KB")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Download" }),
    ).toBeInTheDocument();
    expect(screen.getByText("12:00")).toBeInTheDocument();
    expect(bubble).toContainElement(screen.getByTestId("message-metadata"));
  });

  it("renders outgoing document bubbles with the same solid color as text bubbles, not a pale tint", () => {
    renderMessageItem(
      {
        media_file_id: "media-file-outgoing",
        media_mime_type: "application/pdf",
        attachment: {
          id: "media-file-outgoing",
          url: "/api/v1/media/media-file-outgoing",
          mime_type: "application/pdf",
          original_name: "invoice.pdf",
          file_size: 4096,
          kind: "file",
        },
        sender_id: 1,
        status: "sent",
      },
      { isOwn: true },
    );

    const bubble = screen.getByTestId("message-bubble");
    expect(bubble).toHaveClass("bg-bubble-outgoing");
    expect(bubble).toHaveClass("text-bubble-outgoing-text");
    expect(bubble).not.toHaveClass("bg-bubble-outgoing/12");
  });

  it("renders compact icon-only file actions with accessible names instead of labeled buttons", () => {
    renderMessageItem({
      media_file_id: "media-file-compact",
      media_mime_type: "application/pdf",
      attachment: {
        id: "media-file-compact",
        url: "/api/v1/media/media-file-compact",
        mime_type: "application/pdf",
        original_name: "contract.pdf",
        file_size: 8192,
        kind: "file",
      },
    });

    const openButton = screen.getByRole("button", { name: "Open" });
    const downloadButton = screen.getByRole("button", { name: "Download" });

    expect(screen.getByTestId("message-file-actions")).toBeInTheDocument();
    expect(openButton).toHaveClass("rounded-full");
    expect(downloadButton).toHaveClass("rounded-full");
    // Compact actions carry no separate visible text label; the accessible
    // name comes entirely from aria-label so the icon can stay minimal.
    expect(openButton.textContent).toBe("");
    expect(downloadButton.textContent).toBe("");
  });

  it("renders legacy photo attachments without an attachment object", () => {
    renderMessageItem({
      media_file_id: "legacy-photo-1",
      media_mime_type: "image/jpeg",
      attachment: null,
    });

    expect(screen.getByTestId("authenticated-image").getAttribute("src")).toContain(
      "/api/v1/media/legacy-photo-1",
    );
  });

  it("renders legacy file attachments without crashing", () => {
    renderMessageItem({
      media_file_id: "legacy-file-1",
      media_mime_type: "application/pdf",
      attachment: null,
    });

    expect(screen.getByText("File")).toBeInTheDocument();
    expect(screen.getByText("PDF · Unknown size")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Download" }),
    ).toBeInTheDocument();
    expect(screen.getByText("12:00")).toBeInTheDocument();
  });

  it("keeps long document filenames truncated instead of expanding the bubble", () => {
    renderMessageItem({
      media_file_id: "media-file-long",
      media_mime_type: "application/pdf",
      attachment: {
        id: "media-file-long",
        url: "/api/v1/media/media-file-long",
        mime_type: "application/pdf",
        original_name: "very-long-quarterly-financial-report-final-final-approved-version-2026.pdf",
        file_size: 12000000,
        kind: "file",
      },
    });

    expect(screen.getByTestId("message-file-name")).toHaveClass("truncate");
  });

  it("keeps timestamp and status visible for long outgoing text messages", () => {
    renderMessageItem(
      {
        content: "This is a long message ".repeat(20).trim(),
        sender_id: 1,
        sender_username: "tester",
        sender_display_name: "Tester",
        status: "read",
      },
      { isOwn: true },
    );

    expect(screen.getByText("12:00")).toBeInTheDocument();
    expect(screen.getByLabelText("Read")).toBeInTheDocument();
    expect(screen.getByTestId("message-metadata")).toBeInTheDocument();
    expect(screen.getByTestId("message-text-inline-metadata")).toBeInTheDocument();
    expect(screen.queryByTestId("message-media-only-overlay")).not.toBeInTheDocument();
  });

  it.each([
    ["sent", "Sent"],
    ["delivered", "Delivered"],
    ["read", "Read"],
    ["error", "Error sending"],
  ] as const)("renders the existing outgoing status icon for %s", (status, label) => {
    renderMessageItem(
      {
        content: `status ${status}`,
        sender_id: 1,
        sender_username: "tester",
        sender_display_name: "Tester",
        status,
      },
      { isOwn: true },
    );

    expect(screen.getByLabelText(label)).toBeInTheDocument();
  });
});
