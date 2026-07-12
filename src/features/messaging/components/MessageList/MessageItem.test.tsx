import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useAppStoreMock, getAttachmentLocalStateMock } = vi.hoisted(() => ({
  useAppStoreMock: vi.fn(),
  getAttachmentLocalStateMock: vi.fn(async () => false),
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

vi.mock("../../utils/attachmentDownloads", () => ({
  downloadAttachmentWithAuth: vi.fn(),
  openAttachmentWithAuth: vi.fn(),
  getAttachmentLocalState: getAttachmentLocalStateMock,
  fetchAttachmentBlob: vi.fn(async () => new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" })),
}));

import { MessageItem } from "./MessageItem";
import * as mediaAlbumLayout from "../../utils/mediaAlbumLayout";
import * as attachmentDownloads from "../../utils/attachmentDownloads";

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
    vi.mocked(attachmentDownloads.downloadAttachmentWithAuth).mockReset();
    vi.mocked(attachmentDownloads.openAttachmentWithAuth).mockReset();
    getAttachmentLocalStateMock.mockReset();
    getAttachmentLocalStateMock.mockResolvedValue(false);
    useAppStoreMock.mockImplementation((selector: (state: unknown) => unknown) =>
      selector({ authToken: "secret-token" }),
    );
    window.localStorage.removeItem("vetra.mediaDebug");
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
    expect(bubble).toHaveClass("max-w-[min(480px,calc(100vw-6rem))]");
    expect(bubble).toHaveClass("rounded-[15px]");
    expect(bubble).toHaveClass("rounded-bl-[0px]");
    expect(bubble).toHaveClass("px-2");
    expect(bubble).toHaveClass("pt-[5px]");
    expect(bubble).toHaveClass("pb-[6px]");
    expect(bubble).toHaveClass("bg-bubble-incoming");
    expect(bubble).toHaveClass("relative", "overflow-visible");
    expect(bubble).toHaveStyle({
      "--message-surface-color": "var(--bubble-incoming)",
      backgroundColor: "var(--message-surface-color)",
    });
    expect(bubble).not.toHaveClass("flex-1");
    expect(bubble.className).not.toMatch(/shadow|drop-shadow|filter/);
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    expect(screen.getByText("12:00")).toBeInTheDocument();
    expect(screen.getByText("Hello from Alice")).toBeInTheDocument();
    expect(screen.getByTestId("message-metadata")).toBeInTheDocument();
    const tail = screen.getByTestId("message-text-tail");
    expect(tail).toHaveClass(
      "left-[-9px]",
      "right-auto",
      "bottom-[-1px]",
      "block",
      "box-border",
      "h-[18px]",
      "w-[9px]",
      "m-0",
      "p-0",
      "overflow-hidden",
      "border-0",
      "rounded-none",
      "transform-none",
      "opacity-100",
    );
    expect(tail.parentElement).toBe(bubble);
    expect(tail).toHaveAttribute("width", "9");
    expect(tail).toHaveAttribute("height", "20");
    expect(tail).not.toHaveAttribute("viewBox");
    const paths = tail.querySelectorAll("path");
    expect(paths).toHaveLength(2);
    expect(paths[0]).toHaveAttribute("d", "M3 17h6V0c-.193 2.84-.876 5.767-2.05 8.782-.904 2.325-2.446 4.485-4.625 6.48A1 1 0 003 17z");
    expect(paths[0]).toHaveAttribute("fill", "#000");
    expect(paths[0]).toHaveAttribute("filter");
    expect(tail.querySelector("filter")).toMatchObject({
      id: expect.any(String),
    });
    expect(tail.querySelector("filter")).toHaveAttribute("x", "-50%");
    expect(tail.querySelector("filter")).toHaveAttribute("y", "-14.7%");
    expect(tail.querySelector("filter")).toHaveAttribute("width", "200%");
    expect(tail.querySelector("filter")).toHaveAttribute("height", "141.2%");
    expect(tail.querySelector("filter")).toHaveAttribute("filterUnits", "objectBoundingBox");
    expect(tail.querySelector("feOffset")).toHaveAttribute("dy", "1");
    expect(tail.querySelector("feGaussianBlur")).toHaveAttribute("stdDeviation", "1");
    expect(tail.querySelector("feColorMatrix")).toHaveAttribute("values", "0 0 0 0 0.0621962482 0 0 0 0 0.138574144 0 0 0 0 0.185037364 0 0 0 0.15 0");
    expect(paths[1]).toHaveAttribute("d", "M3 17h6V0c-.193 2.84-.876 5.767-2.05 8.782-.904 2.325-2.446 4.485-4.625 6.48A1 1 0 003 17z");
    expect(paths[1]).toHaveClass("corner");
    expect(paths[1]).toHaveAttribute("fill", "var(--message-surface-color)");
    expect(paths[1]).not.toHaveAttribute("fill", "currentColor");
    expect(inlineMeta).toHaveClass("float-right", "top-[6px]", "ml-[7px]", "mr-[-6px]", "px-[4px]");
    expect(screen.queryByLabelText(/Sent|Delivered|Read|Error sending/)).not.toBeInTheDocument();
  });

  it("renders hydrated voice attachments in the voice player, not as documents", async () => {
    renderMessageItem({
      content: null,
      media_file_id: "voice-1",
      attachment: {
        id: "voice-1",
        url: "/api/v1/media/voice-1",
        mime_type: "audio/webm",
        original_name: "voice-message.webm",
        file_size: 3210,
        kind: "voice",
        duration_ms: 2450,
      },
    });

    expect(screen.getByTestId("message-voice-attachment")).toBeInTheDocument();
    expect(screen.getByTestId("voice-message-player")).toBeInTheDocument();
    expect(screen.queryByTestId("message-file-row")).not.toBeInTheDocument();
    const bubble = screen.getByTestId("message-bubble");
    expect(bubble).toHaveClass("h-[69px]", "w-[337px]", "px-2", "pt-[5px]", "pb-[6px]");
    expect(screen.getByTestId("message-voice-attachment")).toHaveClass("relative", "h-[58px]");
    expect(screen.getByTestId("message-voice-inline-metadata")).toHaveClass("absolute", "right-0", "bottom-0", "h-[20px]");
    expect(screen.getByTestId("voice-message-waveform")).toHaveAttribute("role", "slider");
    expect(bubble).toHaveClass("overflow-visible");
    expect(bubble).toContainElement(screen.getByTestId("message-voice-tail"));
    await waitFor(() => expect(attachmentDownloads.fetchAttachmentBlob).toHaveBeenCalled());
  });

  it("renders an outgoing final voice message through the shared bubble shell", () => {
    renderMessageItem({
      content: null,
      media_file_id: "voice-outgoing",
      attachment: {
        id: "voice-outgoing",
        url: "/api/v1/media/voice-outgoing",
        mime_type: "audio/webm",
        original_name: "voice-outgoing.webm",
        file_size: 3210,
        kind: "voice",
        duration_ms: 2450,
      },
    }, { isOwn: true, isConsecutive: true, isGroupedWithNext: false });

    const bubble = screen.getByTestId("message-bubble");
    expect(bubble).toContainElement(screen.getByTestId("message-voice-tail"));
    expect(bubble).toHaveClass("rounded-br-[0px]");
  });

  it("suppresses the voice tail for a grouped continuation", () => {
    renderMessageItem({
      content: null,
      media_file_id: "voice-middle",
      attachment: {
        id: "voice-middle",
        url: "/api/v1/media/voice-middle",
        mime_type: "audio/webm",
        original_name: "voice-middle.webm",
        file_size: 3210,
        kind: "voice",
        duration_ms: 2450,
      },
    }, { isConsecutive: true, isGroupedWithNext: true });

    expect(screen.queryByTestId("message-voice-tail")).not.toBeInTheDocument();
    expect(screen.getByTestId("message-bubble")).toHaveClass("rounded-bl-[6px]");
  });

  it("shows the unread voice dot only for a known outgoing unread status", () => {
    renderMessageItem(
      {
        content: null,
        media_file_id: "voice-unread",
        status: "sent",
        attachment: {
          id: "voice-unread",
          url: "/api/v1/media/voice-unread",
          mime_type: "audio/webm",
          original_name: "voice-unread.webm",
          file_size: 3210,
          kind: "voice",
          duration_ms: 8_000,
        },
      },
      { isOwn: true },
    );

    expect(screen.getByTestId("voice-unread-dot")).toBeInTheDocument();
  });

  it("renders hydrated audio attachments in the dedicated audio player", async () => {
    renderMessageItem({
      content: null,
      media_file_id: "audio-1",
      attachment: {
        id: "audio-1",
        url: "/api/v1/media/audio-1",
        mime_type: "audio/mpeg",
        original_name: "track.mp3",
        file_size: 3210,
        kind: "audio",
        duration_ms: 2450,
      },
    });

    expect(screen.getByTestId("message-audio-attachment")).toBeInTheDocument();
    expect(screen.getByTestId("audio-file-player")).toBeInTheDocument();
    expect(screen.getByText("track.mp3")).toBeInTheDocument();
    expect(screen.queryByTestId("voice-message-player")).not.toBeInTheDocument();
    expect(screen.queryByTestId("message-file-row")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download audio file" })).not.toBeInTheDocument();
    expect(screen.getByTestId("message-bubble")).toHaveClass("min-h-[69px]", "w-[320px]", "items-center", "py-0");
    await waitFor(() => expect(attachmentDownloads.fetchAttachmentBlob).toHaveBeenCalled());
  });

  it("renders an outgoing final audio message through the shared bubble shell", () => {
    renderMessageItem({
      content: null,
      media_file_id: "audio-outgoing",
      attachment: {
        id: "audio-outgoing",
        url: "/api/v1/media/audio-outgoing",
        mime_type: "audio/mpeg",
        original_name: "track-outgoing.mp3",
        file_size: 3210,
        kind: "audio",
        duration_ms: 2450,
      },
    }, { isOwn: true, isConsecutive: true, isGroupedWithNext: false });

    const bubble = screen.getByTestId("message-bubble");
    expect(bubble).toContainElement(screen.getByTestId("message-audio-tail"));
    expect(bubble).toHaveClass("rounded-br-[0px]", "min-h-[69px]", "w-[320px]");
  });

  it("renders multiple audio attachments as one connected bubble with shared metadata and tail", async () => {
    renderMessageItem({
      content: null,
      media_file_id: "audio-1",
      media_file_ids: ["audio-1", "audio-2", "audio-3"],
      attachments: [1, 2, 3].map((index) => ({
        id: `audio-${index}`,
        url: `/api/v1/media/audio-${index}`,
        mime_type: "audio/mpeg",
        original_name: `track-${index}.mp3`,
        file_size: 3210,
        kind: "audio" as const,
        duration_ms: index * 1000,
      })),
    });

    const bubble = screen.getByTestId("message-bubble");
    expect(screen.getByTestId("message-audio-group")).toBeInTheDocument();
    expect(screen.getAllByTestId("message-audio-segment-first")).toHaveLength(1);
    expect(screen.getAllByTestId("message-audio-segment-middle")).toHaveLength(1);
    expect(screen.getAllByTestId("message-audio-segment-last")).toHaveLength(1);
    expect(screen.getAllByTestId("audio-file-player")).toHaveLength(3);
    expect(screen.getAllByTestId("message-metadata")).toHaveLength(1);
    expect(screen.getByTestId("message-audio-segment-last")).toContainElement(screen.getByTestId("message-metadata"));
    expect(screen.getByTestId("message-audio-segment-first")).not.toContainElement(screen.getByTestId("message-metadata"));
    expect(screen.getByTestId("message-audio-segment-middle")).not.toContainElement(screen.getByTestId("message-metadata"));
    expect(screen.getByTestId("message-audio-group-tail")).toBeInTheDocument();
    expect(screen.getByTestId("message-audio-segment-last")).toContainElement(screen.getByTestId("message-audio-group-tail"));
    expect(screen.getByTestId("message-audio-segment-first")).not.toContainElement(screen.getByTestId("message-audio-group-tail"));
    expect(screen.getByTestId("message-audio-segment-middle")).not.toContainElement(screen.getByTestId("message-audio-group-tail"));
    expect(screen.queryByTestId("message-audio-tail")).not.toBeInTheDocument();
    expect(bubble).toHaveClass("w-[320px]", "p-0", "rounded-none", "bg-transparent");
    expect(screen.getByTestId("message-audio-segment-first")).toHaveClass("rounded-tl-[15px]", "rounded-tr-[15px]");
    expect(screen.getByTestId("message-audio-segment-first")).toHaveClass("min-h-[69px]", "items-center", "py-0");
    expect(screen.getByTestId("message-audio-segment-middle")).toHaveClass("rounded-none", "min-h-[69px]", "items-center", "py-0");
    expect(screen.getByTestId("message-audio-segment-last")).toHaveClass("rounded-bl-[0px]", "min-h-[69px]", "items-center", "py-0");
    await waitFor(() => expect(attachmentDownloads.fetchAttachmentBlob.mock.calls.slice(-3)).toHaveLength(3));
  });

  it("renders a two-audio logical message as one first/last connected group", () => {
    renderMessageItem({
      content: null,
      media_file_id: "audio-two-1",
      media_file_ids: ["audio-two-1", "audio-two-2"],
      attachments: [1, 2].map((index) => ({
        id: `audio-two-${index}`,
        url: `/api/v1/media/audio-two-${index}`,
        mime_type: "audio/mpeg",
        original_name: `track-two-${index}.mp3`,
        file_size: 3210,
        kind: "audio" as const,
        duration_ms: index * 1000,
      })),
    });

    expect(screen.getByTestId("message-audio-group")).toBeInTheDocument();
    expect(screen.getByTestId("message-audio-segment-first")).toBeInTheDocument();
    expect(screen.getByTestId("message-audio-segment-last")).toBeInTheDocument();
    expect(screen.queryByTestId("message-audio-segment-middle")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("message-metadata")).toHaveLength(1);
    expect(screen.getByTestId("message-audio-group-tail")).toBeInTheDocument();
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
    expect(bubble).toHaveClass("min-w-0");
    expect(bubble).toHaveClass("max-w-[min(480px,calc(100vw-6rem))]");
    expect(bubble).toHaveClass("bg-bubble-outgoing");
    expect(bubble).toHaveClass("relative", "overflow-visible");
    expect(bubble).toHaveStyle({
      "--message-surface-color": "var(--bubble-outgoing)",
      backgroundColor: "var(--message-surface-color)",
    });
    expect(bubble).toHaveClass("rounded-br-[0px]");
    expect(bubble).not.toHaveClass("flex-1");
    expect(bubble.className).not.toMatch(/shadow|drop-shadow|filter/);
    expect(screen.queryByText("Tester")).not.toBeInTheDocument();
    expect(screen.getByText("23")).toBeInTheDocument();
    expect(screen.getByText("12:00")).toHaveClass("mr-[4px]", "text-[12px]", "leading-[16.2px]", "font-normal");
    expect(inlineMeta).toHaveClass("relative", "float-right", "top-[6px]", "h-[20px]", "ml-[7px]", "mr-[-6px]", "px-[4px]", "bg-transparent");
    expect(screen.getByTestId("message-inline-status")).toHaveClass("ml-[-3px]", "h-[19px]", "w-[19px]");
    const sentIcon = screen.getByLabelText("Sent");
    expect(sentIcon).toHaveClass("h-[19px]", "w-[19px]", "shrink-0");
    expect(sentIcon).toHaveAttribute("viewBox", "0 0 19 19");
    expect(sentIcon.querySelectorAll("path")).toHaveLength(1);
    const tail = screen.getByTestId("message-text-tail");
    expect(tail).toHaveClass("right-[-9px]", "left-auto", "bottom-[-1px]", "block", "box-border", "h-[18px]", "w-[9px]", "m-0", "p-0", "overflow-hidden", "border-0", "rounded-none", "transform-none", "opacity-100");
    expect(tail.parentElement).toBe(bubble);
    expect(tail).toHaveAttribute("width", "9");
    expect(tail).toHaveAttribute("height", "20");
    expect(tail).not.toHaveAttribute("viewBox");
    const paths = tail.querySelectorAll("path");
    expect(paths).toHaveLength(2);
    expect(paths[0]).toHaveAttribute("d", "M6 17H0V0c.193 2.84.876 5.767 2.05 8.782.904 2.325 2.446 4.485 4.625 6.48A1 1 0 016 17z");
    expect(paths[0]).toHaveAttribute("fill", "#000");
    expect(paths[0]).toHaveAttribute("filter");
    expect(paths[1]).toHaveAttribute("d", "M6 17H0V0c.193 2.84.876 5.767 2.05 8.782.904 2.325 2.446 4.485 4.625 6.48A1 1 0 016 17z");
    expect(paths[1]).toHaveAttribute("fill", "var(--message-surface-color)");
    expect(paths[1]).not.toHaveAttribute("fill", "currentColor");
    expect(screen.getByLabelText("Sent")).toBeInTheDocument();
  });

  it("keeps own message bubbles in the left reading column when requested by the parent list", () => {
    renderMessageItem(
      {
        content: "Wide column",
        sender_id: 1,
        sender_username: "tester",
        sender_display_name: "Tester",
        status: "sent",
      },
      { isOwn: true, alignmentMode: "left-column" },
    );

    const row = screen.getByTestId("message-bubble-row");
    const bubble = screen.getByTestId("message-bubble");

    expect(row).toHaveAttribute("data-own-message", "true");
    expect(row).toHaveAttribute("data-alignment-mode", "left-column");
    expect(row).toHaveClass("justify-start");
    expect(row).not.toHaveClass("justify-end");
    expect(bubble).toHaveClass("rounded-bl-[0px]");
    expect(bubble).not.toHaveClass("rounded-br-[0px]");
  });

  it("keeps multiline plain text and metadata in one flow", () => {
    renderMessageItem(
      {
        content: "First line\nSecond line\nThird line with a longer ending",
        sender_id: 1,
        status: "read",
      },
      { isOwn: true },
    );

    const bubble = screen.getByTestId("message-bubble");
    const textFlow = screen.getByTestId("message-text-flow");

    expect(bubble).toHaveClass("min-w-0", "max-w-[min(480px,calc(100vw-6rem))]");
    expect(textFlow).toHaveClass("text-[16px]", "leading-[21px]");
    expect(textFlow).toHaveClass("relative");
    expect(textFlow).toContainElement(screen.getByTestId("message-text-inline-metadata"));
    const readIcon = screen.getByLabelText("Read");
    expect(readIcon).toHaveAttribute("viewBox", "0 0 19 19");
    expect(readIcon).toHaveClass("h-[19px]", "w-[19px]", "shrink-0");
    expect(readIcon.querySelectorAll("path")).toHaveLength(2);
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

    expect(screen.getByTestId("message-bubble")).toHaveClass("rounded-tr-[6px]", "rounded-br-[6px]");
  });

  it("keeps the grouped top corner on the last outgoing text bubble while opening its tail corner", () => {
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

    expect(screen.getByTestId("message-bubble")).toHaveClass("rounded-tr-[6px]", "rounded-br-[0px]");
  });

  it("applies mirrored grouped corner geometry to incoming text bubbles", () => {
    renderMessageItem(
      { content: "Incoming grouped" },
      { isConsecutive: true, isGroupedWithNext: true },
    );

    expect(screen.getByTestId("message-bubble")).toHaveClass("rounded-tl-[6px]", "rounded-bl-[6px]");
    expect(screen.queryByTestId("message-inline-status")).not.toBeInTheDocument();
    expect(screen.queryByTestId("message-text-tail")).not.toBeInTheDocument();
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
          height: 1200,
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

    expect(bubble).toHaveClass("bg-bubble-outgoing", "overflow-visible");
    expect(bubble).toHaveStyle({ width: "324px" });
    expect(screen.getByTestId("authenticated-image").getAttribute("src")).toContain("/api/v1/media/media-photo-1");
    expect(mediaShell).toHaveStyle({ width: "324px", aspectRatio: "324 / 432" });
    expect(overlay).toHaveClass("absolute", "bottom-[4px]", "right-[4px]");
    expect(screen.getByTestId("message-media-tail")).toHaveClass("right-[-9px]", "bottom-[-1px]");
    expect(metadata).toHaveClass("h-[18px]", "rounded-[10px]", "bg-black/[0.20]", "py-0", "pl-[6px]", "pr-[5px]", "text-white");
    expect(metadata).not.toHaveClass("bg-black/40", "bg-black/60", "rounded-full", "backdrop-blur-[2px]", "shadow-[0_2px_10px_rgba(0,0,0,0.24)]");
    expect(screen.getByText("12:00")).toHaveClass("mr-[4px]", "text-[12px]", "leading-[12px]", "font-normal");
    expect(screen.getByTestId("message-media-only-status")).toHaveClass("ml-[-3px]", "h-[19px]", "w-[19px]");
    const overlayReadIcon = screen.getByLabelText("Read");
    expect(overlayReadIcon).toHaveClass("h-[19px]", "w-[19px]", "shrink-0");
    expect(overlayReadIcon.querySelectorAll("path")).toHaveLength(2);
    expect(screen.getByText("12:00")).toBeInTheDocument();
    expect(screen.getByLabelText("Read")).toBeInTheDocument();
    expect(screen.queryByText("Download")).not.toBeInTheDocument();
  });

  it("keeps the single-photo shell clipped to a fill image without an extra inner frame", () => {
    renderMessageItem({
      media_file_id: "media-photo-shell",
      media_mime_type: "image/jpeg",
      attachment: {
        id: "media-photo-shell",
        url: "/api/v1/media/media-photo-shell",
        mime_type: "image/jpeg",
        original_name: "shell.jpg",
        file_size: 2048,
        kind: "photo",
        width: 1600,
        height: 900,
      },
    });

    const bubble = screen.getByTestId("message-bubble");
    const mediaShell = screen.getByTestId("message-media-shell");
    const image = screen.getByTestId("authenticated-image");

    expect(bubble).toHaveClass("bg-bubble-incoming", "p-0", "overflow-visible");
    expect(bubble).not.toHaveClass("overflow-hidden");
    expect(bubble).not.toHaveClass("bg-[#111]");
    expect(mediaShell).toHaveClass("relative", "flex", "h-full", "w-full", "items-center", "justify-center", "overflow-hidden");
    expect(mediaShell).not.toHaveClass("rounded-[16px]");
    expect(image).toHaveClass("block", "h-full", "w-full", "object-cover");
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

  it("passes video dimensions into the layout helper for grouped visual media", () => {
    const originalComputeMediaAlbumLayout = mediaAlbumLayout.computeMediaAlbumLayout;
    const layoutSpy = vi.spyOn(mediaAlbumLayout, "computeMediaAlbumLayout");
    layoutSpy.mockImplementation((...args) => originalComputeMediaAlbumLayout(...args));

    renderMessageItem(
      {
        attachments: [
          {
            id: "photo-mixed-1",
            url: "/api/v1/media/photo-mixed-1",
            mime_type: "image/jpeg",
            original_name: "photo-mixed-1.jpg",
            file_size: 2048,
            kind: "photo",
            width: 1800,
            height: 1200,
          },
          {
            id: "video-mixed-2",
            url: "/api/v1/media/video-mixed-2",
            mime_type: "video/mp4",
            original_name: "video-mixed-2.mp4",
            file_size: 4096,
            kind: "video",
            width: 1280,
            height: 720,
          },
        ],
        media_file_ids: ["photo-mixed-1", "video-mixed-2"],
        media_mime_types: ["image/jpeg", "video/mp4"],
      },
      { isOwn: true },
    );

    expect(layoutSpy).toHaveBeenCalled();
    expect(layoutSpy.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ id: "photo-mixed-1", width: 1800, height: 1200, kind: "image" }),
      expect.objectContaining({ id: "video-mixed-2", width: 1280, height: 720, kind: "video" }),
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

  it("renders a dev-only media debug badge with server, natural, and rendered sizes", () => {
    window.localStorage.setItem("vetra.mediaDebug", "1");

    renderMessageItem(
      {
        media_file_id: "media-photo-debug",
        media_mime_type: "image/jpeg",
        attachment: {
          id: "media-photo-debug",
          url: "/api/v1/media/media-photo-debug",
          mime_type: "image/jpeg",
          original_name: "debug.jpg",
          file_size: 2048,
          kind: "photo",
          width: 1600,
          height: 900,
        },
      },
      { isOwn: true },
    );

    const image = screen.getByTestId("authenticated-image");
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 1600 },
      naturalHeight: { configurable: true, value: 900 },
      clientWidth: { configurable: true, value: 320 },
      clientHeight: { configurable: true, value: 180 },
    });
    fireEvent.load(image);

    expect(screen.getByTestId("message-media-debug-media-photo-debug")).toHaveTextContent("s:1600x900");
    expect(screen.getByTestId("message-media-debug-media-photo-debug")).toHaveTextContent("n:1600x900");
    expect(screen.getByTestId("message-media-debug-media-photo-debug")).toHaveTextContent("r:320x180");
  });

  it("warns in dev when the loaded source is smaller than the rendered tile", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    renderMessageItem(
      {
        id: 77,
        media_file_id: "media-photo-small-source",
        media_mime_type: "image/jpeg",
        attachment: {
          id: "media-photo-small-source",
          url: "/api/v1/media/media-photo-small-source",
          mime_type: "image/jpeg",
          original_name: "small.jpg",
          file_size: 2048,
          kind: "photo",
          width: 800,
          height: 600,
        },
      },
      { isOwn: true },
    );

    const image = screen.getByTestId("authenticated-image");
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 400 },
      naturalHeight: { configurable: true, value: 300 },
      clientWidth: { configurable: true, value: 420 },
      clientHeight: { configurable: true, value: 315 },
    });
    fireEvent.load(image);

    expect(
      warnSpy.mock.calls.some(([label, payload]) =>
        String(label).includes("[VETRA media-quality]") &&
        (payload as Record<string, unknown>).messageId === 77 &&
        (payload as Record<string, unknown>).attachmentId === "media-photo-small-source",
      ),
    ).toBe(true);
    warnSpy.mockRestore();
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

    expect(onLightbox).toHaveBeenCalledWith(expect.objectContaining({
      kind: "image",
      src: expect.stringContaining("/api/v1/media/media-photo-rich?variant=original"),
      authorName: "Alice",
      createdAt: "2026-06-30T12:00:00Z",
      avatarSrc: null,
      messageId: 1,
    }));
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
    expect(album).toHaveClass("relative", "overflow-hidden", "border-0", "p-0", "rounded-[15px]", "rounded-br-[0px]");
    expect(screen.getByTestId("message-bubble")).toHaveClass("bg-bubble-outgoing", "p-0", "rounded-br-[0px]");
    expect(screen.getByTestId("message-bubble").className).not.toMatch(/shadow|filter/);
    expect(album.getAttribute("style")).toContain("aspect-ratio");
    expect(screen.getAllByTestId("message-photo-collage-tile")).toHaveLength(9);
    expect(screen.getAllByTestId("message-metadata")).toHaveLength(1);
    expect(screen.getByTestId("message-media-only-overlay")).toBeInTheDocument();
    expect(screen.queryAllByTestId("authenticated-image")).toHaveLength(9);
    expect(tile0.getAttribute("style")).toContain("left:");
    expect(tile4.getAttribute("style")).toContain("top:");
    expect(tile7.getAttribute("style")).toContain("width:");
    expect(tile0).toHaveStyle({ borderRadius: "0px" });
    expect(tile0).toHaveClass("border-0", "p-0", "overflow-hidden");
    expect(screen.getByTestId("message-media-tail")).toBeInTheDocument();
    expect(screen.getByTestId("message-media-tail").parentElement).toBe(screen.getByTestId("message-bubble"));
  });

  it("restores the visible incoming album bubble surface", () => {
    renderMessageItem(
      {
        attachments: [
          {
            id: "incoming-album-1",
            url: "/api/v1/media/incoming-album-1",
            mime_type: "image/jpeg",
            original_name: "incoming-album-1.jpg",
            file_size: 2048,
            kind: "photo",
            width: 1600,
            height: 900,
          },
          {
            id: "incoming-album-2",
            url: "/api/v1/media/incoming-album-2",
            mime_type: "image/jpeg",
            original_name: "incoming-album-2.jpg",
            file_size: 2048,
            kind: "photo",
            width: 900,
            height: 1200,
          },
        ],
        media_file_ids: ["incoming-album-1", "incoming-album-2"],
        media_mime_types: ["image/jpeg", "image/jpeg"],
        sender_id: 2,
        sender_username: "alice",
        sender_display_name: "Alice",
        status: "read",
      },
      { isOwn: false },
    );

    const bubble = screen.getByTestId("message-bubble");
    const album = screen.getByTestId("message-photo-collage");

    expect(bubble).toHaveClass("bg-bubble-incoming", "p-0");
    expect(bubble).not.toHaveClass("bg-transparent", "rounded-none");
    expect(album).toHaveClass("overflow-hidden", "rounded-[15px]");
    expect(screen.getByTestId("message-media-tail")).toBeInTheDocument();
  });

  it("renders grouped photo and video attachments as one visual album", () => {
    renderMessageItem(
      {
        attachments: [
          {
            id: "visual-photo-1",
            url: "/api/v1/media/visual-photo-1",
            mime_type: "image/jpeg",
            original_name: "visual-photo-1.jpg",
            file_size: 2048,
            kind: "photo",
            width: 1600,
            height: 900,
          },
          {
            id: "visual-video-2",
            url: "/api/v1/media/visual-video-2",
            mime_type: "video/mp4",
            original_name: "visual-video-2.mp4",
            file_size: 4096,
            kind: "video",
            width: 1280,
            height: 720,
          },
          {
            id: "visual-photo-3",
            url: "/api/v1/media/visual-photo-3",
            mime_type: "image/png",
            original_name: "visual-photo-3.png",
            file_size: 1024,
            kind: "photo",
            width: 1200,
            height: 1200,
          },
        ],
        media_file_ids: ["visual-photo-1", "visual-video-2", "visual-photo-3"],
        media_mime_types: ["image/jpeg", "video/mp4", "image/png"],
      },
      { isOwn: true },
    );

    expect(screen.getByTestId("message-photo-collage")).toBeInTheDocument();
    expect(screen.getAllByTestId("message-photo-collage-tile")).toHaveLength(3);
    expect(screen.getByTestId("message-video-tile-visual-video-2")).toBeInTheDocument();
    expect(screen.getByLabelText("Open video visual-video-2.mp4")).toBeInTheDocument();
    expect(screen.queryByTestId("message-file-row")).not.toBeInTheDocument();
  });

  it("shows a compact duration badge for loaded grouped video tiles instead of a large Video label", () => {
    renderMessageItem(
      {
        attachments: [
          {
            id: "visual-video-duration",
            url: "/api/v1/media/visual-video-duration",
            mime_type: "video/mp4",
            original_name: "visual-video-duration.mp4",
            file_size: 4096,
            kind: "video",
            width: 1280,
            height: 720,
          },
          {
            id: "visual-photo-duration",
            url: "/api/v1/media/visual-photo-duration",
            mime_type: "image/jpeg",
            original_name: "visual-photo-duration.jpg",
            file_size: 2048,
            kind: "photo",
            width: 1200,
            height: 900,
          },
        ],
        media_file_ids: ["visual-video-duration", "visual-photo-duration"],
        media_mime_types: ["video/mp4", "image/jpeg"],
      },
      { isOwn: true },
    );

    const video = screen.getByTestId("message-video-tile-visual-video-duration");
    Object.defineProperties(video, {
      videoWidth: { configurable: true, value: 1280 },
      videoHeight: { configurable: true, value: 720 },
      clientWidth: { configurable: true, value: 187 },
      clientHeight: { configurable: true, value: 110 },
      duration: { configurable: true, value: 42 },
    });
    fireEvent(video, new Event("loadedmetadata"));

    expect(screen.getByTestId("message-video-duration-visual-video-duration")).toHaveTextContent("0:42");
    expect(screen.queryByText("Video")).not.toBeInTheDocument();
  });

  it("opens grouped video tiles in the in-app video viewer", async () => {
    const onLightbox = vi.fn();

    renderMessageItem(
      {
        attachments: [
          {
            id: "video-album-1",
            url: "/api/v1/media/video-album-1",
            mime_type: "video/mp4",
            original_name: "video-album-1.mp4",
            file_size: 4096,
            kind: "video",
            width: 1280,
            height: 720,
          },
          {
            id: "photo-album-2",
            url: "/api/v1/media/photo-album-2",
            mime_type: "image/jpeg",
            original_name: "photo-album-2.jpg",
            file_size: 2048,
            kind: "photo",
            width: 1200,
            height: 900,
          },
        ],
        media_file_ids: ["video-album-1", "photo-album-2"],
        media_mime_types: ["video/mp4", "image/jpeg"],
      },
      { isOwn: true, onLightbox },
    );

    fireEvent.click(screen.getByTestId("message-video-tile-video-album-1"));

    expect(onLightbox).toHaveBeenCalledWith(expect.objectContaining({
      kind: "video",
      src: expect.stringContaining("/api/v1/media/video-album-1"),
      authorName: "Alice",
      createdAt: "2026-06-30T12:00:00Z",
      avatarSrc: null,
      messageId: 1,
    }));
  });

  it("updates grouped video layout dimensions after metadata loads", () => {
    const originalComputeMediaAlbumLayout = mediaAlbumLayout.computeMediaAlbumLayout;
    const layoutSpy = vi.spyOn(mediaAlbumLayout, "computeMediaAlbumLayout");
    layoutSpy.mockImplementation((...args) => originalComputeMediaAlbumLayout(...args));

    renderMessageItem(
      {
        attachments: [
          {
            id: "video-fallback-1",
            url: "/api/v1/media/video-fallback-1",
            mime_type: "video/mp4",
            original_name: "video-fallback-1.mp4",
            file_size: 4096,
            kind: "video",
          },
          {
            id: "photo-known-2",
            url: "/api/v1/media/photo-known-2",
            mime_type: "image/jpeg",
            original_name: "photo-known-2.jpg",
            file_size: 2048,
            kind: "photo",
            width: 1200,
            height: 900,
          },
        ],
        media_file_ids: ["video-fallback-1", "photo-known-2"],
        media_mime_types: ["video/mp4", "image/jpeg"],
      },
      { isOwn: true },
    );

    const video = screen.getByTestId("message-video-tile-video-fallback-1");
    Object.defineProperties(video, {
      videoWidth: { configurable: true, value: 1920 },
      videoHeight: { configurable: true, value: 1080 },
      clientWidth: { configurable: true, value: 180 },
      clientHeight: { configurable: true, value: 101 },
      duration: { configurable: true, value: 15 },
    });
    fireEvent(video, new Event("loadedmetadata"));

    expect(layoutSpy.mock.calls.at(-1)?.[0]).toEqual([
      expect.objectContaining({ id: "video-fallback-1", width: 1920, height: 1080, kind: "video" }),
      expect.objectContaining({ id: "photo-known-2", width: 1200, height: 900, kind: "image" }),
    ]);
    expect(screen.getByTestId("message-video-duration-video-fallback-1")).toHaveTextContent("0:15");
    layoutSpy.mockRestore();
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

  it("keeps album tile media filling each tile boundary", () => {
    renderMessageItem(
      {
        attachments: [
          {
            id: "photo-fill-1",
            url: "/api/v1/media/photo-fill-1",
            mime_type: "image/jpeg",
            original_name: "photo-fill-1.jpg",
            file_size: 2048,
            kind: "photo",
            width: 1200,
            height: 900,
          },
          {
            id: "photo-fill-2",
            url: "/api/v1/media/photo-fill-2",
            mime_type: "image/jpeg",
            original_name: "photo-fill-2.jpg",
            file_size: 2048,
            kind: "photo",
            width: 900,
            height: 1400,
          },
        ],
        media_file_ids: ["photo-fill-1", "photo-fill-2"],
        media_mime_types: ["image/jpeg", "image/jpeg"],
      },
      { isOwn: true },
    );

    const tile = screen.getAllByTestId("message-photo-collage-tile")[0];
    const image = screen.getAllByTestId("authenticated-image")[0];

    expect(tile).toHaveClass("relative", "block", "h-full", "w-full", "overflow-hidden");
    expect(image).toHaveClass("block", "h-full", "w-full", "object-cover", "object-center");
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
    const mediaFrame = mediaShell.parentElement;

    expect(contentRect).toContain(mediaShell);
    expect(contentRect).toContain(textContent);
    expect(mediaFrame).toHaveClass("overflow-hidden", "rounded-[15px]", "rounded-tr-[15px]", "rounded-bl-[0px]", "rounded-br-[0px]");
    expect(mediaFrame).toHaveStyle({ width: "480px", aspectRatio: "480 / 270" });
    expect(screen.getByTestId("message-bubble")).toHaveStyle({ width: "480px" });
    expect(mediaShell).toHaveClass("relative", "flex", "h-full", "w-full", "items-center", "justify-center", "overflow-hidden");
    expect(mediaShell).not.toHaveClass("rounded-t-[15px]");
    expect(screen.queryByTestId("message-media-only-overlay")).not.toBeInTheDocument();
    expect(screen.getByTestId("message-media-tail")).toBeInTheDocument();
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
    expect(screen.getByTestId("message-photo-collage")).toHaveClass("relative", "overflow-hidden", "border-0", "rounded-[15px]");
    expect(screen.getByTestId("message-photo-collage")).toHaveClass("ml-[-8px]", "mr-[-8px]", "mt-[-5px]", "mb-[6px]");
    expect(screen.getByTestId("message-text-inline-metadata")).toHaveClass("float-right", "h-[20px]", "ml-[7px]", "mr-[-6px]");
    expect(screen.getByTestId("message-media-tail")).toBeInTheDocument();
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

  it("renders single video attachments as visual media instead of a file row", () => {
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

    expect(screen.queryByTestId("message-file-row")).not.toBeInTheDocument();
    expect(screen.getByTestId("message-media-shell")).toBeInTheDocument();
    expect(screen.getByTestId("message-video-tile-media-video-1")).toBeInTheDocument();
    expect(screen.getByTestId("message-media-shell")).toHaveStyle({ width: "480px", aspectRatio: "480 / 270" });
    expect(screen.getByTestId("message-bubble")).toHaveStyle({ width: "480px" });
    expect(screen.getByTestId("message-media-only-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("message-media-tail")).toBeInTheDocument();
    expect(screen.getByTestId("message-video-badge-media-video-1")).toHaveClass("left-1/2", "top-1/2", "-translate-x-1/2", "-translate-y-1/2");
  });

  it("renders a portrait video caption with inline metadata and media sizing", () => {
    renderMessageItem(
      {
        content: "First line\nSecond line\nThird line",
        sender_id: 1,
        status: "delivered",
        media_file_id: "media-video-caption",
        media_mime_type: "video/mp4",
        attachment: {
          id: "media-video-caption",
          url: "/api/v1/media/media-video-caption",
          mime_type: "video/mp4",
          original_name: "portrait.mp4",
          file_size: 4096,
          kind: "video",
          width: 900,
          height: 1200,
        },
      },
      { isOwn: true },
    );

    const mediaFrame = screen.getByTestId("message-media-shell").parentElement;

    expect(mediaFrame).toHaveStyle({ width: "324px", aspectRatio: "324 / 432" });
    expect(screen.getByTestId("message-bubble")).toHaveStyle({ width: "324px" });
    expect(screen.getByTestId("message-text-inline-metadata")).toBeInTheDocument();
    expect(screen.queryByTestId("message-media-only-overlay")).not.toBeInTheDocument();
    expect(screen.getByTestId("message-media-tail")).toBeInTheDocument();
    expect(screen.getByTestId("message-text-content")).toHaveTextContent("First line Second line Third line");
    expect(screen.getByTestId("message-video-badge-media-video-caption")).toHaveClass("left-1/2", "top-1/2");

    const video = screen.getByTestId("message-video-tile-media-video-caption");
    Object.defineProperties(video, {
      videoWidth: { configurable: true, value: 900 },
      videoHeight: { configurable: true, value: 1200 },
      clientWidth: { configurable: true, value: 324 },
      clientHeight: { configurable: true, value: 432 },
      duration: { configurable: true, value: 42 },
    });
    fireEvent(video, new Event("loadedmetadata"));

    expect(screen.getByTestId("message-video-duration-media-video-caption")).toHaveClass("left-[3px]", "top-[3px]", "rounded-[12px]");
  });

  it("opens single video visual bubbles in the in-app video viewer", () => {
    const onLightbox = vi.fn();

    renderMessageItem(
      {
        media_file_id: "media-video-open",
        media_mime_type: "video/mp4",
        attachment: {
          id: "media-video-open",
          url: "/api/v1/media/media-video-open",
          mime_type: "video/mp4",
          original_name: "open.mp4",
          file_size: 4096,
          kind: "video",
        },
      },
      { isOwn: true, onLightbox },
    );

    fireEvent.click(screen.getByTestId("message-video-tile-media-video-open"));

    expect(onLightbox).toHaveBeenCalledWith(expect.objectContaining({
      kind: "video",
      src: expect.stringContaining("/api/v1/media/media-video-open"),
      authorName: "Alice",
      createdAt: "2026-06-30T12:00:00Z",
      avatarSrc: null,
      messageId: 1,
    }));
    expect(attachmentDownloads.openAttachmentWithAuth).not.toHaveBeenCalled();
  });

  it("matches Telegram's compact outgoing PDF document geometry", () => {
    renderMessageItem({
      media_file_id: "media-file-1",
      media_mime_type: "application/pdf",
      attachment: {
        id: "media-file-1",
        url: "/api/v1/media/media-file-1",
        mime_type: "application/pdf",
        original_name: "Lection 3. JS (1).pdf",
        file_size: 12 * 1024 * 1024,
        kind: "file",
      },
      sender_id: 1,
      status: "sent",
    }, { isOwn: true });

    const bubble = screen.getByTestId("message-bubble");
    const fileRow = screen.getByTestId("message-file-row");
    const iconContainer = screen.getByTestId("message-file-icon-container");
    const fileIcon = screen.getByTestId("message-file-icon");
    const fileInfo = screen.getByTestId("message-file-info");
    const metadata = screen.getByTestId("message-document-inline-metadata");

    expect(bubble).toHaveClass("w-fit", "min-w-[268px]", "max-w-[min(430px,calc(100vw-6rem))]", "px-2", "pt-[5px]", "pb-[6px]");
    expect(bubble).not.toHaveClass("max-w-[min(480px,calc(100vw-6rem))]");
    expect(bubble).toHaveStyle({ minWidth: "268px", maxWidth: "min(430px, calc(100vw - 6rem))" });
    expect(bubble).toHaveClass("rounded-[15px]", "rounded-tr-[15px]", "rounded-br-[0px]");
    expect(bubble).not.toHaveClass("border", "border-transparent", "border-border");
    expect(bubble).toHaveStyle({
      "--message-surface-color": "var(--bubble-outgoing)",
      backgroundColor: "var(--message-surface-color)",
    });
    expect(fileRow).toHaveClass("relative", "flex", "items-center", "w-full", "max-w-full", "h-[54px]", "my-[3px]", "p-0", "bg-transparent");
    expect(fileRow).not.toHaveClass("min-w-[224px]", "w-[224px]");
    expect(fileRow).not.toHaveClass("w-[224px]");
    expect(fileRow).not.toHaveClass("border", "rounded-full", "rounded-[6px]");
    expect(iconContainer).toHaveClass("relative", "w-[54px]", "h-[54px]", "mr-[12px]", "shrink-0");
    expect(fileIcon).toHaveClass("w-[54px]", "h-[54px]", "flex", "items-center", "justify-center", "px-0", "py-0", "rounded-[6px]");
    expect(screen.getByText("pdf")).toHaveClass("text-[16px]", "font-medium", "leading-[24px]", "text-white", "opacity-0");
    expect(screen.getByTestId("message-file-name")).toHaveAttribute("title", "Lection 3. JS (1).pdf");
    expect(fileInfo).toHaveClass("flex-1", "min-w-0", "h-[39px]", "mt-[3px]", "mr-[2px]", "overflow-hidden", "whitespace-nowrap");
    expect(screen.getByTestId("message-file-name")).toHaveClass("block", "min-w-0", "flex-1", "overflow-hidden", "text-ellipsis", "whitespace-nowrap", "text-[16px]", "font-medium", "leading-[24px]");
    expect(screen.getByTestId("message-file-name")).toHaveAttribute("dir", "auto");
    expect(screen.getByTestId("message-file-name")).toHaveAttribute("aria-label", "Lection 3. JS (1).pdf");
    expect(screen.getAllByTestId("message-file-size")[0]).toHaveTextContent("12.0MB");
    expect(screen.getByTestId("message-file-size")).toHaveClass("max-w-full", "truncate", "text-[14px]", "font-normal", "leading-[15px]");
    const downloadButton = screen.getByRole("button", { name: /Download/ });
    expect(downloadButton).toHaveClass("absolute", "inset-0", "w-[54px]", "h-[54px]", "bg-transparent");
    expect(downloadButton).toHaveAccessibleName("Download Lection 3. JS (1).pdf");
    expect(screen.getByTestId("message-file-download-stage")).toBeInTheDocument();
    expect(fileRow).not.toHaveAttribute("role");
    expect(fileRow).not.toHaveAttribute("tabindex");
    expect(screen.getByText("12:00")).toBeInTheDocument();
    expect(bubble).toContainElement(screen.getByTestId("message-metadata"));
    expect(metadata).toHaveClass("relative", "flex", "items-center", "h-[20px]", "top-[8px]", "mt-[-20px]", "mr-[-6px]", "mb-0", "ml-[7px]", "px-[4px]", "bg-transparent");
    expect(screen.getAllByTestId("message-metadata")).toHaveLength(1);
    expect(screen.getByTestId("message-text-tail")).toBeInTheDocument();
  });

  it("uses the same compact document geometry for incoming files without outgoing status", () => {
    renderMessageItem({
      media_file_id: "incoming-document",
      media_mime_type: "application/pdf",
      attachment: {
        id: "incoming-document",
        url: "/api/v1/media/incoming-document",
        mime_type: "application/pdf",
        original_name: "incoming.pdf",
        file_size: 12 * 1024 * 1024,
        kind: "file",
      },
    });

    const bubble = screen.getByTestId("message-bubble");
    expect(bubble).toHaveClass("bg-bubble-incoming", "px-2", "pt-[5px]", "pb-[6px]");
    expect(screen.getByTestId("message-file-row")).toHaveClass("w-full", "max-w-full", "h-[54px]");
    expect(screen.getByTestId("message-file-row")).not.toHaveClass("min-w-[224px]", "w-[224px]");
    expect(screen.getByTestId("message-file-row")).not.toHaveClass("w-[224px]");
    expect(screen.getAllByTestId("message-file-size")[0]).toHaveTextContent("12.0MB");
    expect(screen.queryByLabelText(/Sent|Delivered|Read|Error sending/)).not.toBeInTheDocument();
    expect(screen.getByTestId("message-text-tail")).toHaveClass("left-[-9px]", "bottom-[-1px]");
  });

  it("initializes the downloaded visual state from the native local-path check", async () => {
    getAttachmentLocalStateMock.mockResolvedValue(true);

    renderMessageItem({
      media_file_id: "restored-document",
      media_mime_type: "application/pdf",
      attachment: {
        id: "restored-document",
        url: "/api/v1/media/restored-document",
        mime_type: "application/pdf",
        original_name: "restored.pdf",
        file_size: 1024,
        kind: "file",
      },
    });

    await waitFor(() => expect(screen.getByTestId("message-file-icon-container")).toHaveAttribute("data-download-state", "downloaded"));
    expect(screen.getByTestId("message-file-extension")).toHaveClass("opacity-100");
    expect(screen.queryByTestId("message-file-download-stage")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open restored.pdf" })).toBeInTheDocument();
  });

  it("downloads the clicked document through its own attachment and stops message selection", async () => {
    const onToggleSelection = vi.fn();

    renderMessageItem(
      {
        media_file_id: "download-document",
        media_mime_type: "application/pdf",
        attachment: {
          id: "download-document",
          url: "/api/v1/media/download-document",
          mime_type: "application/pdf",
          original_name: "download-me.pdf",
          file_size: 1024,
          kind: "file",
        },
      },
      { selectionMode: true, onToggleSelection },
    );

    const downloadButton = screen.getByRole("button", { name: "Download download-me.pdf" });
    const extension = screen.getByText("pdf");

    expect(extension).toHaveClass("opacity-0");
    expect(screen.getByTestId("message-file-download-stage")).toBeInTheDocument();
    act(() => downloadButton.focus());
    expect(downloadButton).toHaveFocus();
    fireEvent.click(downloadButton);

    await waitFor(() => expect(attachmentDownloads.downloadAttachmentWithAuth).toHaveBeenCalledWith(expect.objectContaining({
      attachment: expect.objectContaining({
        id: "download-document",
        url: expect.stringContaining("/api/v1/media/download-document"),
        original_name: "download-me.pdf",
      }),
      authToken: "secret-token",
      signal: expect.any(AbortSignal),
      onProgress: expect.any(Function),
    })));
    expect(onToggleSelection).not.toHaveBeenCalled();
  });

  it("shows streamed progress and cancels the active document from the same tile", async () => {
    vi.mocked(attachmentDownloads.downloadAttachmentWithAuth).mockReturnValue(
      new Promise<void>(() => {}),
    );

    renderMessageItem({
      media_file_id: "pending-document",
      media_mime_type: "application/pdf",
      attachment: {
        id: "pending-document",
        url: "/api/v1/media/pending-document",
        mime_type: "application/pdf",
        original_name: "pending.pdf",
        file_size: 1024,
        kind: "file",
      },
    });

    const downloadButton = screen.getByRole("button", { name: "Download pending.pdf" });
    fireEvent.click(downloadButton);

    expect(attachmentDownloads.downloadAttachmentWithAuth).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Cancel download of pending.pdf" })).toBeInTheDocument();
    expect(screen.getByTestId("message-file-icon-container")).toHaveAttribute("data-download-state", "downloading");
    expect(screen.getByTestId("message-file-progress")).toHaveAttribute("role", "progressbar");

    fireEvent.click(downloadButton);
    await waitFor(() => expect(screen.getByTestId("message-file-icon-container")).toHaveAttribute("data-download-state", "not-downloaded"));
    expect(screen.getByRole("button", { name: "Download pending.pdf" })).toBeInTheDocument();
  });

  it("restores a failed document download to a retryable state", async () => {
    vi.mocked(attachmentDownloads.downloadAttachmentWithAuth).mockRejectedValueOnce(new Error("network"));

    renderMessageItem({
      media_file_id: "failed-document",
      media_mime_type: "application/pdf",
      attachment: {
        id: "failed-document",
        url: "/api/v1/media/failed-document",
        mime_type: "application/pdf",
        original_name: "failed.pdf",
        file_size: 1024,
        kind: "file",
      },
    });

    const downloadButton = screen.getByRole("button", { name: "Download failed.pdf" });
    fireEvent.click(downloadButton);

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Download failed for failed.pdf"));
    expect(downloadButton).not.toBeDisabled();
    expect(screen.getByTestId("message-file-icon-container")).toHaveAttribute("data-download-state", "failed");
    expect(screen.getByTestId("message-file-download-stage")).toBeInTheDocument();

    vi.mocked(attachmentDownloads.downloadAttachmentWithAuth).mockResolvedValueOnce(undefined);
    fireEvent.click(downloadButton);
    await waitFor(() => expect(attachmentDownloads.downloadAttachmentWithAuth).toHaveBeenCalledTimes(2));
  });

  it("renders outgoing documents as connected first and last segments with attachment-specific downloads", async () => {
    const documents = [
      {
        id: "group-document-1",
        url: "/api/v1/media/group-document-1",
        mime_type: "application/pdf",
        original_name: "first-document.pdf",
        file_size: 12 * 1024 * 1024,
        kind: "file" as const,
      },
      {
        id: "group-document-2",
        url: "/api/v1/media/group-document-2",
        mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        original_name: "second-document-with-a-very-long-filename-that-must-truncate.docx",
        file_size: 8 * 1024 * 1024,
        kind: "file" as const,
      },
    ];

    renderMessageItem({ attachments: documents, sender_id: 1, status: "sent" }, { isOwn: true });

    const group = screen.getByTestId("message-document-group");
    const first = screen.getByTestId("message-document-segment-first");
    const last = screen.getByTestId("message-document-segment-last");
    const rows = screen.getAllByTestId("message-file-row");
    const downloadButtons = screen.getAllByRole("button", { name: /Download/ });

    expect(group).toHaveClass("flex", "w-[275px]", "gap-0", "row-gap-0", "p-0", "bg-transparent");
    expect(first).toHaveClass("w-[275px]", "h-[70px]", "px-2", "pt-[6px]", "pb-[4px]", "rounded-tl-[15px]", "rounded-tr-[15px]", "rounded-bl-[0px]", "rounded-br-[0px]");
    expect(last).toHaveClass("w-[275px]", "h-[72px]", "px-2", "pt-[4px]", "pb-[8px]", "rounded-tl-[0px]", "rounded-tr-[0px]", "rounded-bl-[15px]", "rounded-br-[0px]");
    expect(first.nextElementSibling).toBe(last);
    expect(group).not.toHaveClass("gap-1", "gap-2", "shadow", "rounded-[15px]");
    expect(rows).toHaveLength(2);
    rows.forEach((row) => {
      expect(row).toHaveClass("w-[259px]", "h-[54px]", "my-[3px]");
      expect(row).not.toHaveClass("min-w-[224px]");
    });
    expect(screen.getByText("first-document.pdf")).toBeInTheDocument();
    expect(screen.getAllByTestId("message-file-name")[1]).toHaveAttribute("title", "second-document-with-a-very-long-filename-that-must-truncate.docx");
    expect(screen.getByText("pdf")).toBeInTheDocument();
    expect(screen.getByText("docx")).toBeInTheDocument();
    expect(screen.getAllByTestId("message-file-size")[0]).toHaveTextContent("12.0MB");
    expect(screen.getAllByTestId("message-file-size")[1]).toHaveTextContent("8.0MB");
    expect(screen.getAllByTestId("message-file-name")[1]).toHaveClass("block", "min-w-0", "flex-1", "overflow-hidden", "text-ellipsis", "whitespace-nowrap");
    expect(screen.getAllByTestId("message-file-name")[1]).toHaveAttribute("title", "second-document-with-a-very-long-filename-that-must-truncate.docx");
    expect(within(first).queryByTestId("message-document-inline-metadata")).not.toBeInTheDocument();
    expect(within(first).queryByTestId("message-inline-status")).not.toBeInTheDocument();
    expect(within(first).queryByTestId("message-text-tail")).not.toBeInTheDocument();
    expect(within(last).getByTestId("message-document-inline-metadata")).toBeInTheDocument();
    expect(within(last).getByTestId("message-inline-status")).toBeInTheDocument();
    expect(within(last).getByTestId("message-text-tail")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(downloadButtons[0]);
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(downloadButtons[1]);
      await Promise.resolve();
    });

    expect(attachmentDownloads.downloadAttachmentWithAuth).toHaveBeenNthCalledWith(1, expect.objectContaining({
      attachment: expect.objectContaining({ id: "group-document-1" }),
      authToken: "secret-token",
      signal: expect.any(AbortSignal),
      onProgress: expect.any(Function),
    }));
    expect(attachmentDownloads.downloadAttachmentWithAuth).toHaveBeenNthCalledWith(2, expect.objectContaining({
      attachment: expect.objectContaining({ id: "group-document-2" }),
      authToken: "secret-token",
      signal: expect.any(AbortSignal),
      onProgress: expect.any(Function),
    }));
  });

  it("renders incoming three-document groups with square middle segments and time-only metadata", () => {
    renderMessageItem({
      attachments: [1, 2, 3].map((index) => ({
        id: `incoming-document-${index}`,
        url: `/api/v1/media/incoming-document-${index}`,
        mime_type: "application/pdf",
        original_name: `incoming-document-${index}.pdf`,
        file_size: index * 1024 * 1024,
        kind: "file" as const,
      })),
    });

    const group = screen.getByTestId("message-document-group");
    const first = screen.getByTestId("message-document-segment-first");
    const middle = screen.getByTestId("message-document-segment-middle");
    const last = screen.getByTestId("message-document-segment-last");

    expect(group).toHaveClass("w-[275px]", "gap-0", "row-gap-0");
    expect(first).toHaveClass("h-[70px]", "rounded-tl-[15px]", "rounded-tr-[15px]", "rounded-bl-[0px]", "rounded-br-[0px]");
    expect(middle).toHaveClass("rounded-none", "px-2", "py-[4px]");
    expect(last).toHaveClass("h-[72px]", "rounded-tl-[0px]", "rounded-tr-[0px]", "rounded-bl-[0px]", "rounded-br-[15px]");
    expect(within(first).queryByTestId("message-document-inline-metadata")).not.toBeInTheDocument();
    expect(within(middle).queryByTestId("message-document-inline-metadata")).not.toBeInTheDocument();
    expect(within(middle).queryByTestId("message-text-tail")).not.toBeInTheDocument();
    expect(within(last).getByTestId("message-document-inline-metadata")).toBeInTheDocument();
    expect(within(last).getByTestId("message-metadata")).toHaveTextContent("12:00");
    expect(within(last).queryByTestId("message-inline-status")).not.toBeInTheDocument();
    expect(within(last).getByTestId("message-text-tail")).toHaveClass("left-[-9px]", "bottom-[-1px]");
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

  it("keeps download inside the file tile and makes only the icon actionable", () => {
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

    const downloadButton = screen.getByRole("button", { name: /Download/ });
    const fileRow = screen.getByTestId("message-file-row");
    const iconContainer = screen.getByTestId("message-file-icon-container");

    expect(fileRow).not.toHaveAttribute("role");
    expect(fileRow).not.toHaveAttribute("tabindex");
    expect(downloadButton).toHaveClass("absolute", "inset-0", "w-[54px]", "h-[54px]", "bg-transparent");
    expect(downloadButton.textContent).toBe("");
    expect(iconContainer).toContainElement(downloadButton);
  });

  it("does not activate a document action from the filename, subtitle, or whitespace", async () => {
    renderMessageItem({
      media_file_id: "media-file-open-row",
      media_mime_type: "application/pdf",
      attachment: {
        id: "media-file-open-row",
        url: "/api/v1/media/media-file-open-row",
        mime_type: "application/pdf",
        original_name: "readme.pdf",
        file_size: 4096,
        kind: "file",
      },
    });

    fireEvent.click(screen.getByTestId("message-file-name"));
    fireEvent.click(screen.getByTestId("message-file-size"));
    fireEvent.click(screen.getByTestId("message-file-info"));
    expect(attachmentDownloads.downloadAttachmentWithAuth).not.toHaveBeenCalled();
    expect(attachmentDownloads.openAttachmentWithAuth).not.toHaveBeenCalled();
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
    expect(screen.getByText("Unknown size")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Download/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("12:00")).toBeInTheDocument();
  });

  it("uses CSS end ellipsis for long document filenames without changing the source name", () => {
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

    const filename = screen.getByTestId("message-file-name");
    expect(filename).toHaveClass("min-w-0", "overflow-hidden", "text-ellipsis", "whitespace-nowrap");
    expect(filename).toHaveAttribute(
      "title",
      "very-long-quarterly-financial-report-final-final-approved-version-2026.pdf",
    );
    expect(screen.queryByTestId("message-file-name-leading")).not.toBeInTheDocument();
    expect(screen.queryByTestId("message-file-name-trailing")).not.toBeInTheDocument();
    expect(screen.queryByText("…")).not.toBeInTheDocument();
    expect(screen.getByTestId("message-file-row")).toHaveClass("w-full", "max-w-full");
    expect(screen.getByTestId("message-file-row")).not.toHaveClass("min-w-[224px]", "w-[224px]");
  });

  it("preserves the basename ending and complete extension when rendered text overflows", async () => {
    const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({
      font: "",
      measureText: () => ({ width: 500 }),
    } as unknown as CanvasRenderingContext2D));
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 300 });

    try {
      renderMessageItem({
        media_file_id: "media-file-middle",
        media_mime_type: "application/pdf",
        attachment: {
          id: "media-file-middle",
          url: "/api/v1/media/media-file-middle",
          mime_type: "application/pdf",
          original_name: "asodjasoidsoajdsaoijdaosijdsaiodjasoidjaodjasidjaoidjaiosjdasiojdiaosdjjjjjjjjjjjjjasoijdsaoijdaoidjasiod.pdf",
          file_size: 12000000,
          kind: "file",
        },
      });

      await waitFor(() => expect(screen.getByTestId("message-file-name-trailing")).toHaveTextContent("daoidjasiod.pdf"));
      expect(screen.getByTestId("message-file-name-leading")).toHaveTextContent("asodjasoidsoajds");
      expect(screen.getByTestId("message-file-name")).toHaveAttribute("title", "asodjasoidsoajdsaoijdaosijdsaiodjasoidjaodjasidjaoidjaiosjdasiojdiaosdjjjjjjjjjjjjjasoijdsaoijdaoidjasiod.pdf");
    } finally {
      getContextSpy.mockRestore();
      if (originalClientWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClientWidth);
      else delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
    }
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

    const icon = screen.getByLabelText(label);
    expect(icon).toHaveAttribute("viewBox", "0 0 19 19");
    expect(icon).toHaveClass("h-[19px]", "w-[19px]", "shrink-0");
    if (status === "error") {
      expect(icon.querySelector("circle")).toBeNull();
    }
  });
});
