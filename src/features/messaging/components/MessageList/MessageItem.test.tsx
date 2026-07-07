import { render, screen } from "@testing-library/react";
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
  }: {
    src: string;
    alt: string;
    className?: string;
  }) => <img data-testid="authenticated-image" src={src} alt={alt} className={className} />,
}));

vi.mock("../../utils/attachmentDownloads", () => ({
  downloadAttachmentWithAuth: vi.fn(),
  openAttachmentWithAuth: vi.fn(),
}));

import { MessageItem } from "./MessageItem";

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

    expect(row).toHaveAttribute("data-own-message", "false");
    expect(row).toHaveClass("justify-start");
    expect(row).not.toHaveClass("justify-end");
    expect(bubble).toHaveClass("w-fit");
    expect(bubble).toHaveClass("max-w-[min(66%,42rem)]");
    expect(bubble).toHaveClass("rounded-[18px]");
    expect(bubble).toHaveClass("bg-bubble-incoming");
    expect(bubble).not.toHaveClass("flex-1");
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    expect(screen.getByText("12:00")).toBeInTheDocument();
    expect(screen.getByText("Hello from Alice")).toBeInTheDocument();
    expect(screen.getByTestId("message-metadata")).toBeInTheDocument();
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

    expect(row).toHaveAttribute("data-own-message", "true");
    expect(row).toHaveClass("justify-end");
    expect(row).not.toHaveClass("justify-start");
    expect(bubble).toHaveClass("w-fit");
    expect(bubble).toHaveClass("min-w-[4.75rem]");
    expect(bubble).toHaveClass("max-w-[min(66%,42rem)]");
    expect(bubble).toHaveClass("bg-bubble-outgoing");
    expect(bubble).not.toHaveClass("flex-1");
    expect(screen.queryByText("Tester")).not.toBeInTheDocument();
    expect(screen.getByText("23")).toBeInTheDocument();
    expect(screen.getByText("12:00")).toBeInTheDocument();
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

    expect(bubble).not.toHaveClass("bg-bubble-outgoing");
    expect(screen.getByTestId("message-media-shell")).toHaveClass("max-w-[min(28rem,calc(100vw-6rem))]");
    expect(screen.getByTestId("authenticated-image").getAttribute("src")).toContain("/api/v1/media/media-photo-1");
    expect(overlay).toHaveClass("absolute", "bottom-[6px]", "right-[7px]");
    expect(metadata).toHaveClass("gap-[3px]", "text-white");
    expect(metadata).not.toHaveClass("bg-black/60", "rounded-full", "shadow-[0_2px_10px_rgba(0,0,0,0.24)]", "backdrop-blur-[2px]");
    expect(screen.getByText("12:00")).toBeInTheDocument();
    expect(screen.getByLabelText("Read")).toBeInTheDocument();
    expect(screen.queryByText("Download")).not.toBeInTheDocument();
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
      },
    });

    expect(screen.getByTestId("message-media-only-overlay")).toBeInTheDocument();
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
