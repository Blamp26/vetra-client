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

  it("renders incoming messages as left-aligned bubbles", () => {
    renderMessageItem({ content: "Hello from Alice" });

    const row = screen.getByTestId("message-bubble-row");
    const bubble = screen.getByTestId("message-bubble");

    expect(row).toHaveAttribute("data-own-message", "false");
    expect(row).toHaveClass("justify-start");
    expect(row).not.toHaveClass("justify-end");
    expect(bubble).toHaveClass("max-w-[80%]");
    expect(bubble).toHaveClass("bg-bubble-incoming");
    expect(bubble).not.toHaveClass("flex-1");
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("12:00")).toBeInTheDocument();
    expect(screen.getByText("Hello from Alice")).toBeInTheDocument();
  });

  it("renders own messages as right-aligned bubbles at all widths", () => {
    renderMessageItem(
      {
        content: "My message",
        sender_id: 1,
        sender_username: "tester",
        sender_display_name: "Tester",
      },
      { isOwn: true },
    );

    const row = screen.getByTestId("message-bubble-row");
    const bubble = screen.getByTestId("message-bubble");

    expect(row).toHaveAttribute("data-own-message", "true");
    expect(row).toHaveClass("justify-end");
    expect(row).not.toHaveClass("justify-start");
    expect(bubble).toHaveClass("max-w-[80%]");
    expect(bubble).toHaveClass("bg-bubble-outgoing");
    expect(bubble).not.toHaveClass("flex-1");
    expect(screen.queryByText("Tester")).not.toBeInTheDocument();
    expect(screen.getByText("My message")).toBeInTheDocument();
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
  });
});
