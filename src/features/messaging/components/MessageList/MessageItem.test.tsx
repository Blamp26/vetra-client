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

  it("renders photo attachments through AuthenticatedImage", () => {
    renderMessageItem({
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
    });

    expect(screen.getByTestId("authenticated-image").getAttribute("src")).toContain(
      "/api/v1/media/media-photo-1",
    );
    expect(screen.queryByText("Download")).not.toBeInTheDocument();
    expect(screen.getByText("12:00")).toBeInTheDocument();
  });

  it("renders PDF attachments as a file card with actions", () => {
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

    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByText("PDF · 5.5 KB")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Download" }),
    ).toBeInTheDocument();
    expect(screen.getByText("12:00")).toBeInTheDocument();
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
  });

  it("keeps metadata visible for image messages with captions", () => {
    renderMessageItem({
      content: "A short caption",
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
    });

    expect(screen.getByTestId("authenticated-image")).toBeInTheDocument();
    expect(screen.getByText("A short caption")).toBeInTheDocument();
    expect(screen.getByText("12:00")).toBeInTheDocument();
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
