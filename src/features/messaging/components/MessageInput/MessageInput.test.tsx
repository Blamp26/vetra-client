import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useAppStoreMock, uploadSendMock } = vi.hoisted(() => ({
  useAppStoreMock: vi.fn(),
  uploadSendMock: vi.fn(),
}));

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    useAppStoreMock(selector),
}));

import { MessageInput } from "./MessageInput";

class MockXMLHttpRequest {
  static DONE = 4;
  upload = { onprogress: null as ((event: ProgressEvent<EventTarget>) => void) | null };
  responseType = "";
  response: unknown = null;
  status = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  open = vi.fn();
  setRequestHeader = vi.fn();
  getResponseHeader = vi.fn(() => null);

  abort = vi.fn(() => {
    this.onabort?.();
  });

  send(formData: FormData) {
    uploadSendMock({ formData, xhr: this });
  }
}

class MockMediaRecorder {
  static isTypeSupported = vi.fn((mimeType: string) => mimeType === "audio/webm;codecs=opus");
  mimeType = "audio/webm;codecs=opus";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: (() => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(public stream: MediaStream, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? this.mimeType;
  }

  start = vi.fn();

  stop = vi.fn(() => {
    this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3])], { type: this.mimeType }) });
    this.onstop?.();
  });
}

function makeState() {
  return {
    editingMessage: null,
    cancelEditing: vi.fn(),
    socketManager: null,
    activeChat: null,
    conversationPreviews: {},
    currentUser: { id: 1 },
    authToken: "secret-token",
  };
}

function getMediaInput(container: HTMLElement) {
  return container.querySelector('[data-testid="attachment-input-media"]') as HTMLInputElement;
}

function getFileInput(container: HTMLElement) {
  return container.querySelector('[data-testid="attachment-input-file"]') as HTMLInputElement;
}

describe("MessageInput attachments", () => {
  beforeEach(() => {
    useAppStoreMock.mockReset();
    uploadSendMock.mockReset();
    useAppStoreMock.mockImplementation(
      (selector: (state: ReturnType<typeof makeState>) => unknown) =>
        selector(makeState()),
    );

    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    global.XMLHttpRequest = MockXMLHttpRequest as unknown as typeof XMLHttpRequest;
    uploadSendMock.mockImplementation(
      ({ formData, xhr }: { formData: FormData; xhr: MockXMLHttpRequest }) => {
        const file = formData.get("file") as File;
        xhr.upload.onprogress?.({
          lengthComputable: true,
          loaded: file.size || 1,
          total: file.size || 1,
        } as ProgressEvent<EventTarget>);
        xhr.status = 200;
        xhr.response = {
          data: {
            media_file_id: `media-${file.name}`,
          },
        };
        xhr.onload?.();
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function installVoiceMocks() {
    const stopTrack = vi.fn();
    const getUserMedia = vi.fn(async () => ({
      getTracks: () => [{ stop: stopTrack }],
    } as unknown as MediaStream));
    vi.stubGlobal("MediaRecorder", MockMediaRecorder);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    return { getUserMedia, stopTrack };
  }

  it("opens the attachment source menu from the attachment button", () => {
    render(<MessageInput onSend={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Attach" }));

    expect(screen.getByTestId("attachment-source-menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Photo or Video" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "File" })).toBeInTheDocument();
  });

  it("creates a custom text link from the selected composer text", async () => {
    const onSend = vi.fn(async () => undefined);
    render(<MessageInput onSend={onSend} />);
    const textarea = screen.getByTestId("message-input-textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Открыть сайт" } });
    textarea.setSelectionRange(0, textarea.value.length);
    fireEvent.keyDown(textarea, { key: "k", ctrlKey: true });
    expect(screen.getByTestId("message-link-editor")).toBeInTheDocument();
    expect(screen.getByTestId("message-link-url")).toHaveFocus();
    fireEvent.change(screen.getByTestId("message-link-url"), { target: { value: "https://example.com/" } });
    fireEvent.keyDown(screen.getByTestId("message-link-url"), { key: "Enter" });
    fireEvent.keyDown(textarea, { key: "Enter" });
    await waitFor(() => expect(onSend).toHaveBeenCalledWith({
      content: "Открыть сайт",
      entities: [{ type: "text_link", offset: 0, length: 12, url: "https://example.com/" }],
      mediaFileId: null,
    }, undefined));
  });

  it("records, cancels, and releases microphone tracks without sending", async () => {
    const { getUserMedia, stopTrack } = installVoiceMocks();
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} />);

    fireEvent.click(screen.getByRole("button", { name: "Record voice message" }));
    await waitFor(() => expect(screen.getByTestId("voice-recording-panel")).toBeInTheDocument());
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });

    fireEvent.click(screen.getByRole("button", { name: /Cancel/ }));

    await waitFor(() => expect(screen.queryByTestId("voice-recording-panel")).not.toBeInTheDocument());
    expect(stopTrack).toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("uploads the finished recording before sending one voice attachment", async () => {
    installVoiceMocks();
    const onSend = vi.fn(async () => undefined);
    render(<MessageInput onSend={onSend} />);

    fireEvent.click(screen.getByRole("button", { name: "Record voice message" }));
    await waitFor(() => expect(screen.getByTestId("voice-recording-panel")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Stop and send voice message" }));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        content: null,
        mediaFileId: expect.stringMatching(/^media-voice-message-/),
        mediaFileIds: null,
      }),
      undefined,
    );
    const [{ formData }] = uploadSendMock.mock.calls.map(([request]) => request as { formData: FormData });
    expect(formData.get("kind")).toBe("voice");
    expect(Number(formData.get("duration_ms"))).toBeGreaterThan(0);
  });

  it("restores the composer when microphone permission is denied", async () => {
    const getUserMedia = vi.fn(async () => {
      throw new DOMException("denied", "NotAllowedError");
    });
    vi.stubGlobal("MediaRecorder", MockMediaRecorder);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    render(<MessageInput onSend={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Record voice message" }));

    await waitFor(() => expect(screen.getByText(/Microphone permission was denied/)).toBeInTheDocument());
    expect(screen.queryByTestId("voice-recording-panel")).not.toBeInTheDocument();
  });

  it("closes the attachment source menu on outside click", async () => {
    render(<MessageInput onSend={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Attach" }));
    expect(screen.getByTestId("attachment-source-menu")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    await waitFor(() =>
      expect(screen.queryByTestId("attachment-source-menu")).not.toBeInTheDocument(),
    );
  });

  it("closes the attachment source menu on Escape", () => {
    render(<MessageInput onSend={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Attach" }));
    expect(screen.getByTestId("attachment-source-menu")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByTestId("attachment-source-menu")).not.toBeInTheDocument();
  });

  it("Photo or Video triggers the media input", () => {
    const { container } = render(<MessageInput onSend={vi.fn()} />);
    const mediaInput = getMediaInput(container);
    const mediaInputClick = vi.spyOn(mediaInput, "click");

    fireEvent.click(screen.getByRole("button", { name: "Attach" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Photo or Video" }));

    expect(mediaInputClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("attachment-source-menu")).not.toBeInTheDocument();
  });

  it("File triggers the generic file input", () => {
    const { container } = render(<MessageInput onSend={vi.fn()} />);
    const fileInput = getFileInput(container);
    const fileInputClick = vi.spyOn(fileInput, "click");

    fireEvent.click(screen.getByRole("button", { name: "Attach" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "File" }));

    expect(fileInputClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("attachment-source-menu")).not.toBeInTheDocument();
  });

  it("selecting attachments opens the attachment review modal without expanding the main composer", () => {
    const { container } = render(<MessageInput onSend={vi.fn()} />);
    const mediaInput = getMediaInput(container);
    const fileInput = getFileInput(container);
    const pdf = new File(["pdf"], "report.pdf", { type: "application/pdf" });
    const image = new File([new Uint8Array(1024)], "photo.png", { type: "image/png" });

    expect(mediaInput).toHaveAttribute(
      "accept",
      "image/png,image/jpeg,image/gif,image/webp,image/avif,image/heic,image/heif,video/mp4,video/quicktime,video/webm,video/ogg",
    );
    expect(fileInput).toHaveAttribute(
      "accept",
      "application/pdf,audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/opus,audio/wav,audio/flac,audio/webm,audio/x-wav,.mp3,.m4a,.aac,.ogg,.opus,.wav,.flac,.webm",
    );
    expect(mediaInput).toHaveAttribute("multiple");
    expect(fileInput).toHaveAttribute("multiple");

    fireEvent.change(fileInput, { target: { files: [pdf] } });
    fireEvent.change(mediaInput, { target: { files: [image] } });

    expect(screen.getByTestId("attachment-review-modal")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Send 2 Items" })).toBeInTheDocument();
    expect(within(screen.getByTestId("attachment-review-modal")).getByRole("button", { name: "Send" })).toBeEnabled();
    expect(screen.queryByTestId("attachment-queue")).not.toBeInTheDocument();
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByText("File · 3 B")).toBeInTheDocument();
    expect(screen.getByText("photo.png")).toBeInTheDocument();
    expect(screen.getByText("Photo · 1.0 KB")).toBeInTheDocument();
    expect(screen.getAllByTestId("attachment-review-item")).toHaveLength(2);
  });

  it("uploads a Files-selected audio attachment before sending it with audio metadata", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    class MockAudio {
      duration = 2.5;
      onloadedmetadata: (() => void) | null = null;
      onerror: (() => void) | null = null;
      preload = "";
      src = "";
      removeAttribute = vi.fn();
      load = vi.fn(() => this.onloadedmetadata?.());
    }
    vi.stubGlobal("Audio", MockAudio);

    const { container } = render(<MessageInput onSend={onSend} />);
    const fileInput = getFileInput(container);
    const audio = new File([new Uint8Array(2048)], "track.mp3", { type: "audio/mpeg" });

    fireEvent.change(fileInput, { target: { files: [audio] } });
    fireEvent.click(within(screen.getByTestId("attachment-review-modal")).getByRole("button", { name: "Send" }));

    await waitFor(() => expect(onSend).toHaveBeenCalledWith(expect.objectContaining({
      content: null,
      mediaFileId: "media-track.mp3",
      mediaFileIds: null,
    }), undefined));

    const [{ formData }] = uploadSendMock.mock.calls.map(
      ([request]) => request as { formData: FormData },
    );
    expect(formData.get("kind")).toBe("audio");
    expect(formData.get("duration_ms")).toBe("2500");
  });

  it("clears a reply after a successful attachment send", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const onCancelReply = vi.fn();
    const { container } = render(
      <MessageInput
        onSend={onSend}
        replyTo={{ id: 77, content: "Attached original", author: "Alice" }}
        onCancelReply={onCancelReply}
      />,
    );
    const fileInput = getFileInput(container);
    const pdf = new File(["pdf"], "reply.pdf", { type: "application/pdf" });

    fireEvent.change(fileInput, { target: { files: [pdf] } });
    fireEvent.click(within(screen.getByTestId("attachment-review-modal")).getByRole("button", { name: "Send" }));

    await waitFor(() => expect(onCancelReply).toHaveBeenCalledTimes(1));
    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({ content: null, mediaFileId: "media-reply.pdf" }),
      77,
    );
  });

  it("keeps composer controls aligned with simple button and input styling", () => {
    render(<MessageInput onSend={vi.fn()} />);

    expect(screen.getByTestId("message-composer-shell")).toHaveClass("border-t", "bg-[color:var(--vetra-shell-chat-bg,var(--color-card))]");
    expect(screen.getByTestId("message-composer-bar")).toHaveClass("min-h-[46px]", "items-center", "px-2", "py-0.5");
    expect(screen.getByRole("button", { name: "Attach" })).toHaveClass("h-8", "w-8");
    expect(screen.getByPlaceholderText("Message...")).toHaveClass("min-h-8", "bg-transparent", "border-0", "shadow-none", "ring-0");
    expect(screen.getByRole("button", { name: "Send" })).toHaveClass("h-8", "w-8");
  });

  it("hides the textarea internal scrollbar while keeping the composer compact", () => {
    render(<MessageInput onSend={vi.fn()} />);

    const textarea = screen.getByTestId("message-input-textarea");

    expect(textarea).toHaveStyle({ overflowY: "hidden" });
    expect(textarea).toHaveClass("min-h-8", "max-h-44", "resize-none");
  });

  it("auto-resizes the textarea from scrollHeight without changing keyboard send behavior", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<MessageInput onSend={onSend} />);

    const textarea = screen.getByTestId("message-input-textarea") as HTMLTextAreaElement;
    Object.defineProperty(textarea, "scrollHeight", {
      configurable: true,
      get: () => 132,
    });

    fireEvent.change(textarea, { target: { value: "First line\nSecond line" } });

    await waitFor(() => expect(textarea.style.height).toBe("132px"));

    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => expect(onSend).toHaveBeenCalledWith({ content: "First line\nSecond line", mediaFileId: null }, undefined));
  });

  it("keeps Shift+Enter as a newline instead of sending", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<MessageInput onSend={onSend} />);

    const textarea = screen.getByTestId("message-input-textarea");
    fireEvent.change(textarea, { target: { value: "Hello" } });

    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

    await waitFor(() => expect(onSend).not.toHaveBeenCalled());
  });

  it("sends typed text with the existing send action", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<MessageInput onSend={onSend} />);

    fireEvent.change(screen.getByPlaceholderText("Message..."), {
      target: { value: "Hello" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(onSend).toHaveBeenCalledWith({ content: "Hello", mediaFileId: null }, undefined);
  });

  it("clears a reply only after a successful send and omits it from the next message", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const onCancelReply = vi.fn();
    const { rerender } = render(
      <MessageInput
        onSend={onSend}
        replyTo={{ id: 42, content: "Original", author: "Alice" }}
        onCancelReply={onCancelReply}
      />,
    );

    fireEvent.change(screen.getByTestId("message-input-textarea"), { target: { value: "Reply" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(onCancelReply).toHaveBeenCalledTimes(1));
    expect(onSend).toHaveBeenNthCalledWith(1, { content: "Reply", mediaFileId: null }, 42);

    rerender(<MessageInput onSend={onSend} onCancelReply={onCancelReply} />);
    fireEvent.change(screen.getByTestId("message-input-textarea"), { target: { value: "Normal" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(2));
    expect(onSend).toHaveBeenNthCalledWith(2, { content: "Normal", mediaFileId: null }, undefined);
  });

  it("keeps the active reply when sending fails", async () => {
    const onSend = vi.fn().mockRejectedValue(new Error("offline"));
    const onCancelReply = vi.fn();
    render(
      <MessageInput
        onSend={onSend}
        replyTo={{ id: 42, content: "Original", author: "Alice" }}
        onCancelReply={onCancelReply}
      />,
    );

    fireEvent.change(screen.getByTestId("message-input-textarea"), { target: { value: "Retry me" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByText("Reply to Alice")).toBeInTheDocument());
    expect(onCancelReply).not.toHaveBeenCalled();
  });

  it("focuses the composer on chat open, reply changes, cancellation, and successful send", async () => {
    const state = { ...makeState(), activeChat: { type: "direct" as const, partnerId: 2 } };
    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));
    const onSend = vi.fn().mockResolvedValue(undefined);
    const onCancelReply = vi.fn();
    const focusSpy = vi.spyOn(HTMLElement.prototype, "focus");
    const { rerender } = render(
      <MessageInput
        onSend={onSend}
        replyTo={{ id: 42, content: "Original", author: "Alice" }}
        onCancelReply={onCancelReply}
      />,
    );
    const textarea = screen.getByTestId("message-input-textarea");

    await waitFor(() => expect(textarea).toHaveFocus());
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    state.activeChat = { type: "direct", partnerId: 3 };
    textarea.blur();
    rerender(
      <MessageInput
        onSend={onSend}
        replyTo={{ id: 42, content: "Original", author: "Alice" }}
        onCancelReply={onCancelReply}
      />,
    );
    await waitFor(() => expect(textarea).toHaveFocus());

    textarea.blur();
    rerender(
      <MessageInput
        onSend={onSend}
        replyTo={{ id: 43, content: "Another original", author: "Bob" }}
        onCancelReply={onCancelReply}
      />,
    );
    await waitFor(() => expect(textarea).toHaveFocus());

    textarea.blur();
    rerender(<MessageInput onSend={onSend} onCancelReply={onCancelReply} />);
    await waitFor(() => expect(textarea).toHaveFocus());

    textarea.blur();
    fireEvent.change(textarea, { target: { value: "Sent" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(textarea).toHaveFocus());
  });

  it("does not steal focus while a normal chat focus blocker is active", async () => {
    const state = { ...makeState(), activeChat: { type: "direct" as const, partnerId: 2 } };
    useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));
    const { rerender } = render(<MessageInput onSend={vi.fn()} focusBlocked />);
    const textarea = screen.getByTestId("message-input-textarea");

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(textarea).not.toHaveFocus();

    rerender(<MessageInput onSend={vi.fn()} />);
    await waitFor(() => expect(textarea).toHaveFocus());
  });

  it("accepts images and labels them as photos", () => {
    const { container } = render(<MessageInput onSend={vi.fn()} />);
    const input = getMediaInput(container);
    const file = new File([new Uint8Array(1024)], "photo.png", {
      type: "image/png",
    });

    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByRole("heading", { name: "Send 1 Photo" })).toBeInTheDocument();
    expect(screen.getByText("photo.png")).toBeInTheDocument();
    expect(screen.getByText("Photo · 1.0 KB")).toBeInTheDocument();
    expect(screen.getByAltText("photo.png")).toBeInTheDocument();
  });

  it("renders a real local video preview in the attachment review modal", () => {
    const { container } = render(<MessageInput onSend={vi.fn()} />);
    const input = getMediaInput(container);
    const file = new File([new Uint8Array(1024)], "clip.mp4", {
      type: "video/mp4",
    });

    fireEvent.change(input, { target: { files: [file] } });

    const preview = screen.getByTestId("attachment-review-video-preview-pending-attachment-0");
    expect(preview).toBeInTheDocument();
    expect(preview.tagName).toBe("VIDEO");

    Object.defineProperty(preview, "duration", {
      configurable: true,
      value: 42,
    });
    fireEvent(preview, new Event("loadedmetadata"));

    expect(screen.getByTestId("attachment-review-video-duration-pending-attachment-0")).toHaveTextContent("0:42");
    expect(screen.queryByTestId("attachment-review-video-fallback-pending-attachment-0")).not.toBeInTheDocument();
  });

  it("allows adding more files while the review modal is open and appends them to the queue", () => {
    const { container } = render(<MessageInput onSend={vi.fn()} />);
    const mediaInput = getMediaInput(container);
    const fileInput = getFileInput(container);
    const first = new File(["pdf"], "report.pdf", { type: "application/pdf" });
    const second = new File([new Uint8Array(512)], "photo.png", { type: "image/png" });

    fireEvent.change(fileInput, { target: { files: [first] } });
    fireEvent.click(screen.getByRole("button", { name: "Add attachments" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Photo or Video" }));
    fireEvent.change(mediaInput, { target: { files: [second] } });

    expect(screen.getAllByTestId("attachment-review-item")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Send 2 Items" })).toBeInTheDocument();
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByText("photo.png")).toBeInTheDocument();
  });

  it("removes one queued file without clearing the others", () => {
    const { container } = render(<MessageInput onSend={vi.fn()} />);
    const mediaInput = getMediaInput(container);
    const fileInput = getFileInput(container);
    const first = new File(["pdf"], "report.pdf", { type: "application/pdf" });
    const second = new File([new Uint8Array(512)], "photo.png", { type: "image/png" });

    fireEvent.change(fileInput, { target: { files: [first] } });
    fireEvent.change(mediaInput, { target: { files: [second] } });
    fireEvent.click(screen.getByRole("button", { name: "Remove report.pdf" }));

    expect(screen.queryByText("report.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("photo.png")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Send 1 Photo" })).toBeInTheDocument();
    expect(screen.getAllByTestId("attachment-review-item")).toHaveLength(1);
  });

  it("can review many attachments in a scrollable modal without moving the main composer", () => {
    const { container } = render(<MessageInput onSend={vi.fn()} />);
    const input = getMediaInput(container);
    const photos = Array.from({ length: 12 }, (_, index) =>
      new File([new Uint8Array(256)], `photo-${index + 1}.png`, { type: "image/png" }),
    );

    fireEvent.change(input, { target: { files: photos } });

    expect(screen.getByTestId("attachment-review-scroll")).toBeInTheDocument();
    expect(screen.getByTestId("attachment-review-footer")).toBeInTheDocument();
    expect(screen.getAllByTestId("attachment-review-item")).toHaveLength(12);
    expect(within(screen.getByTestId("attachment-review-modal")).getByRole("button", { name: "Send" })).toBeEnabled();
  });

  it("close clears the attachment queue and closes the review modal", () => {
    const { container } = render(<MessageInput onSend={vi.fn()} />);
    const mediaInput = getMediaInput(container);
    const fileInput = getFileInput(container);
    const first = new File(["pdf"], "report.pdf", { type: "application/pdf" });
    const second = new File([new Uint8Array(512)], "photo.png", { type: "image/png" });

    fireEvent.change(fileInput, { target: { files: [first] } });
    fireEvent.change(mediaInput, { target: { files: [second] } });
    fireEvent.click(screen.getByRole("button", { name: "Close attachment review" }));

    expect(screen.queryByTestId("attachment-review-modal")).not.toBeInTheDocument();
    expect(screen.queryByText("report.pdf")).not.toBeInTheDocument();
    expect(screen.queryByText("photo.png")).not.toBeInTheDocument();
  });

  it("sends a single attachment with the existing upload and send flow", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<MessageInput onSend={onSend} />);
    const input = getFileInput(container);
    const file = new File(["pdf"], "report.pdf", { type: "application/pdf" });

    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(within(screen.getByTestId("attachment-review-modal")).getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith(
        { content: null, mediaFileId: "media-report.pdf", mediaFileIds: null },
        undefined,
      );
    });
    expect(screen.queryByTestId("attachment-review-modal")).not.toBeInTheDocument();
    expect(screen.queryByText("report.pdf")).not.toBeInTheDocument();
  });

  it.each([2, 3])("sends %i selected documents as one ordered grouped message", async (documentCount) => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<MessageInput onSend={onSend} />);
    const input = getFileInput(container);
    const documents = Array.from({ length: documentCount }, (_, index) =>
      new File([`pdf-${index + 1}`], `document-${index + 1}.pdf`, { type: "application/pdf" }),
    );

    fireEvent.change(input, { target: { files: documents } });
    fireEvent.click(within(screen.getByTestId("attachment-review-modal")).getByRole("button", { name: "Send" }));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend).toHaveBeenCalledWith(
      {
        content: null,
        mediaFileId: "media-document-1.pdf",
        mediaFileIds: documents.map((document) => `media-${document.name}`),
      },
      undefined,
    );
    expect(uploadSendMock).toHaveBeenCalledTimes(documentCount);
  });

  it("includes document text once and waits for every document upload before sending", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const pendingUploads: Array<{ fileName: string; xhr: MockXMLHttpRequest }> = [];
    uploadSendMock.mockImplementation(
      ({ formData, xhr }: { formData: FormData; xhr: MockXMLHttpRequest }) => {
        pendingUploads.push({
          fileName: (formData.get("file") as File).name,
          xhr,
        });
      },
    );

    const { container } = render(<MessageInput onSend={onSend} />);
    fireEvent.change(screen.getByPlaceholderText("Message..."), {
      target: { value: "Document batch caption" },
    });
    fireEvent.change(getFileInput(container), {
      target: {
        files: [
          new File(["first"], "first.pdf", { type: "application/pdf" }),
          new File(["second"], "second.pdf", { type: "application/pdf" }),
        ],
      },
    });
    fireEvent.click(within(screen.getByTestId("attachment-review-modal")).getByRole("button", { name: "Send" }));

    await waitFor(() => expect(pendingUploads).toHaveLength(2));
    expect(onSend).not.toHaveBeenCalled();

    for (const upload of pendingUploads) {
      upload.xhr.status = 200;
      upload.xhr.response = { data: { media_file_id: `uploaded-${upload.fileName}` } };
      upload.xhr.onload?.();
    }

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend).toHaveBeenCalledWith(
      {
        content: "Document batch caption",
        mediaFileId: "uploaded-first.pdf",
        mediaFileIds: ["uploaded-first.pdf", "uploaded-second.pdf"],
      },
      undefined,
    );
  });

  it("does not send a partial document group when one upload fails", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    uploadSendMock.mockImplementation(
      ({ formData, xhr }: { formData: FormData; xhr: MockXMLHttpRequest }) => {
        const file = formData.get("file") as File;
        xhr.status = file.name === "failed.pdf" ? 500 : 200;
        xhr.response = xhr.status === 200
          ? { data: { media_file_id: `uploaded-${file.name}` } }
          : { errors: { content: ["upload failed"] } };
        xhr.onload?.();
      },
    );

    const { container } = render(<MessageInput onSend={onSend} />);
    fireEvent.change(getFileInput(container), {
      target: {
        files: [
          new File(["ok"], "ok.pdf", { type: "application/pdf" }),
          new File(["failed"], "failed.pdf", { type: "application/pdf" }),
        ],
      },
    });
    fireEvent.click(within(screen.getByTestId("attachment-review-modal")).getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByText("Upload failed")).toBeInTheDocument());
    expect(onSend).not.toHaveBeenCalled();
  });

  it("sends a single photo with the existing single-media behavior", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<MessageInput onSend={onSend} />);
    const input = getMediaInput(container);
    const file = new File([new Uint8Array(1024)], "photo.png", { type: "image/png" });

    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(within(screen.getByTestId("attachment-review-modal")).getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith(
        { content: null, mediaFileId: "media-photo.png", mediaFileIds: null },
        undefined,
      );
    });
  });

  it("sends two selected photos as one grouped photo payload", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<MessageInput onSend={onSend} />);
    const input = getMediaInput(container);
    const first = new File([new Uint8Array(512)], "photo-1.png", { type: "image/png" });
    const second = new File([new Uint8Array(512)], "photo-2.png", { type: "image/png" });

    fireEvent.change(input, { target: { files: [first, second] } });
    expect(screen.getByRole("heading", { name: "Send 2 Photos" })).toBeInTheDocument();
    expect(screen.getByTestId("attachment-review-grid")).toHaveClass("grid-cols-2", "auto-rows-[192px]");
    fireEvent.click(within(screen.getByTestId("attachment-review-modal")).getByRole("button", { name: "Send" }));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend).toHaveBeenCalledWith(
      {
        content: null,
        mediaFileId: "media-photo-1.png",
        mediaFileIds: ["media-photo-1.png", "media-photo-2.png"],
      },
      undefined,
    );
  });

  it("sends exactly nine selected photos as one grouped photo message", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<MessageInput onSend={onSend} />);
    const input = getMediaInput(container);
    const photos = Array.from({ length: 9 }, (_, index) =>
      new File([new Uint8Array(512)], `photo-${index + 1}.png`, { type: "image/png" }),
    );

    fireEvent.change(input, { target: { files: photos } });
    fireEvent.click(within(screen.getByTestId("attachment-review-modal")).getByRole("button", { name: "Send" }));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));

    expect(onSend).toHaveBeenCalledWith(
      {
        content: null,
        mediaFileId: "media-photo-1.png",
        mediaFileIds: [
          "media-photo-1.png",
          "media-photo-2.png",
          "media-photo-3.png",
          "media-photo-4.png",
          "media-photo-5.png",
          "media-photo-6.png",
          "media-photo-7.png",
          "media-photo-8.png",
          "media-photo-9.png",
        ],
      },
      undefined,
    );
    expect(screen.queryByTestId("attachment-review-modal")).not.toBeInTheDocument();
  });

  it("groups empty-mime images by extension without dropping any photo formats", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<MessageInput onSend={onSend} />);
    const input = getMediaInput(container);
    const photos = [
      new File([new Uint8Array(512)], "photo-1.jpg", { type: "" }),
      new File([new Uint8Array(512)], "photo-2.png", { type: "" }),
      new File([new Uint8Array(512)], "photo-3.webp", { type: "" }),
      new File([new Uint8Array(512)], "photo-4.heic", { type: "" }),
      new File([new Uint8Array(512)], "photo-5.heif", { type: "" }),
      new File([new Uint8Array(512)], "photo-6.gif", { type: "" }),
      new File([new Uint8Array(512)], "photo-7.avif", { type: "" }),
    ];

    fireEvent.change(input, { target: { files: photos } });
    fireEvent.click(within(screen.getByTestId("attachment-review-modal")).getByRole("button", { name: "Send" }));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));

    expect(onSend).toHaveBeenCalledWith(
      {
        content: null,
        mediaFileId: "media-photo-1.jpg",
        mediaFileIds: [
          "media-photo-1.jpg",
          "media-photo-2.png",
          "media-photo-3.webp",
          "media-photo-4.heic",
          "media-photo-5.heif",
          "media-photo-6.gif",
          "media-photo-7.avif",
        ],
      },
      undefined,
    );
  });

  it("accepts video MIME aliases and groups mixed visual media into one album payload", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<MessageInput onSend={onSend} />);
    const input = getMediaInput(container);
    const files = [
      new File([new Uint8Array(256)], "photo-1.png", { type: "image/png" }),
      new File([new Uint8Array(256)], "clip-2.mov", { type: "video/quicktime" }),
      new File([new Uint8Array(256)], "photo-3.jpg", { type: "" }),
    ];

    fireEvent.change(input, { target: { files } });
    fireEvent.click(within(screen.getByTestId("attachment-review-modal")).getByRole("button", { name: "Send" }));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend).toHaveBeenCalledWith(
      {
        content: null,
        mediaFileId: "media-photo-1.png",
        mediaFileIds: ["media-photo-1.png", "media-clip-2.mov", "media-photo-3.jpg"],
      },
      undefined,
    );
  });

  it("splits more than nine selected photos into multiple grouped messages in order", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<MessageInput onSend={onSend} />);
    const input = getMediaInput(container);
    const photos = Array.from({ length: 10 }, (_, index) =>
      new File([new Uint8Array(256)], `photo-${index + 1}.png`, { type: "image/png" }),
    );

    fireEvent.change(input, { target: { files: photos } });
    fireEvent.click(within(screen.getByTestId("attachment-review-modal")).getByRole("button", { name: "Send" }));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(2));

    expect(onSend.mock.calls).toEqual([
      [{
        content: null,
        mediaFileId: "media-photo-1.png",
        mediaFileIds: [
          "media-photo-1.png",
          "media-photo-2.png",
          "media-photo-3.png",
          "media-photo-4.png",
          "media-photo-5.png",
          "media-photo-6.png",
          "media-photo-7.png",
          "media-photo-8.png",
          "media-photo-9.png",
        ],
      }, undefined],
      [{
        content: null,
        mediaFileId: "media-photo-10.png",
        mediaFileIds: null,
      }, undefined],
    ]);
  });

  it("sends twelve photos as two photo-bearing units in order: 9 plus 3", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<MessageInput onSend={onSend} />);
    const input = getMediaInput(container);
    const photos = Array.from({ length: 12 }, (_, index) =>
      new File([new Uint8Array(256)], `photo-${index + 1}.png`, { type: "image/png" }),
    );

    fireEvent.change(input, { target: { files: photos } });
    fireEvent.click(within(screen.getByTestId("attachment-review-modal")).getByRole("button", { name: "Send" }));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(2));

    expect(onSend.mock.calls).toEqual([
      [{
        content: null,
        mediaFileId: "media-photo-1.png",
        mediaFileIds: [
          "media-photo-1.png",
          "media-photo-2.png",
          "media-photo-3.png",
          "media-photo-4.png",
          "media-photo-5.png",
          "media-photo-6.png",
          "media-photo-7.png",
          "media-photo-8.png",
          "media-photo-9.png",
        ],
      }, undefined],
      [{
        content: null,
        mediaFileId: "media-photo-10.png",
        mediaFileIds: [
          "media-photo-10.png",
          "media-photo-11.png",
          "media-photo-12.png",
        ],
      }, undefined],
    ]);
  });

  it("renders four selected photos in a compact 2x2 preview grid", () => {
    const { container } = render(<MessageInput onSend={vi.fn()} />);
    const input = getMediaInput(container);
    const photos = Array.from({ length: 4 }, (_, index) =>
      new File([new Uint8Array(256)], `photo-${index + 1}.png`, { type: "image/png" }),
    );

    fireEvent.change(input, { target: { files: photos } });

    expect(screen.getByRole("heading", { name: "Send 4 Photos" })).toBeInTheDocument();
    expect(screen.getByTestId("attachment-review-grid")).toHaveClass("grid-cols-2", "auto-rows-[120px]");
    expect(screen.getAllByTestId("attachment-review-item")).toHaveLength(4);
  });

  it("sends four selected photos as one grouped photo_album payload", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<MessageInput onSend={onSend} />);
    const input = getMediaInput(container);
    const photos = Array.from({ length: 4 }, (_, index) =>
      new File([new Uint8Array(256)], `photo-${index + 1}.png`, { type: "image/png" }),
    );

    fireEvent.change(input, { target: { files: photos } });
    fireEvent.click(within(screen.getByTestId("attachment-review-modal")).getByRole("button", { name: "Send" }));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend).toHaveBeenCalledWith(
      {
        content: null,
        mediaFileId: "media-photo-1.png",
        mediaFileIds: [
          "media-photo-1.png",
          "media-photo-2.png",
          "media-photo-3.png",
          "media-photo-4.png",
        ],
      },
      undefined,
    );
  });

  it("sends text with the final generated attachment message only", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<MessageInput onSend={onSend} />);
    const mediaInput = getMediaInput(container);
    const fileInput = getFileInput(container);
    const first = new File([new Uint8Array(512)], "photo-1.png", { type: "image/png" });
    const second = new File([new Uint8Array(512)], "photo-2.png", { type: "image/png" });
    const third = new File([new Uint8Array(512)], "photo-3.png", { type: "image/png" });
    const fourth = new File([new Uint8Array(512)], "photo-4.png", { type: "image/png" });
    const document = new File(["pdf"], "report.pdf", { type: "application/pdf" });

    fireEvent.change(screen.getByPlaceholderText("Message..."), {
      target: { value: "Album caption" },
    });
    fireEvent.change(mediaInput, { target: { files: [first, second] } });
    fireEvent.change(fileInput, { target: { files: [document] } });
    fireEvent.change(mediaInput, { target: { files: [third, fourth] } });
    fireEvent.change(screen.getByLabelText("Caption"), {
      target: { value: "Album caption" },
    });
    fireEvent.click(within(screen.getByTestId("attachment-review-modal")).getByRole("button", { name: "Send" }));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(3));

    expect(onSend.mock.calls).toEqual([
      [{
        content: null,
        mediaFileId: "media-photo-1.png",
        mediaFileIds: ["media-photo-1.png", "media-photo-2.png"],
      }, undefined],
      [{
        content: null,
        mediaFileId: "media-report.pdf",
        mediaFileIds: null,
      }, undefined],
      [{
        content: "Album caption",
        mediaFileId: "media-photo-3.png",
        mediaFileIds: ["media-photo-3.png", "media-photo-4.png"],
      }, undefined],
    ]);
  });

  it("keeps documents separate and preserves queue order around consecutive photo groups", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<MessageInput onSend={onSend} />);
    const mediaInput = getMediaInput(container);
    const fileInput = getFileInput(container);
    const document = new File(["pdf"], "report.pdf", { type: "application/pdf" });
    const first = new File([new Uint8Array(512)], "photo-1.png", { type: "image/png" });
    const second = new File([new Uint8Array(512)], "photo-2.png", { type: "image/png" });

    fireEvent.change(screen.getByPlaceholderText("Message..."), {
      target: { value: "Album caption" },
    });
    fireEvent.change(fileInput, { target: { files: [document] } });
    fireEvent.change(mediaInput, { target: { files: [first, second] } });
    fireEvent.change(screen.getByLabelText("Caption"), {
      target: { value: "Album caption" },
    });
    fireEvent.click(within(screen.getByTestId("attachment-review-modal")).getByRole("button", { name: "Send" }));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(2));

    expect(onSend.mock.calls).toEqual([
      [{
        content: null,
        mediaFileId: "media-report.pdf",
        mediaFileIds: null,
      }, undefined],
      [{
        content: "Album caption",
        mediaFileId: "media-photo-1.png",
        mediaFileIds: ["media-photo-1.png", "media-photo-2.png"],
      }, undefined],
    ]);
  });

  it("preserves queue order around mixed visual media and documents", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<MessageInput onSend={onSend} />);
    const mediaInput = getMediaInput(container);
    const fileInput = getFileInput(container);
    const photo = new File([new Uint8Array(512)], "photo-1.png", { type: "image/png" });
    const pdf = new File(["pdf"], "report.pdf", { type: "application/pdf" });
    const video = new File([new Uint8Array(512)], "clip-1.mp4", { type: "video/mp4" });

    fireEvent.change(mediaInput, { target: { files: [photo] } });
    fireEvent.change(fileInput, { target: { files: [pdf] } });
    fireEvent.change(mediaInput, { target: { files: [video] } });
    fireEvent.click(within(screen.getByTestId("attachment-review-modal")).getByRole("button", { name: "Send" }));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(3));
    expect(onSend.mock.calls).toEqual([
      [{
        content: null,
        mediaFileId: "media-photo-1.png",
        mediaFileIds: null,
      }, undefined],
      [{
        content: null,
        mediaFileId: "media-report.pdf",
        mediaFileIds: null,
      }, undefined],
      [{
        content: null,
        mediaFileId: "media-clip-1.mp4",
        mediaFileIds: null,
      }, undefined],
    ]);
  });

  it("prevents duplicate grouped-photo sends while pending", async () => {
    let releaseFirstSend!: () => void;
    const onSend = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseFirstSend = resolve;
        }),
    );
    const { container } = render(<MessageInput onSend={onSend} />);
    const input = getMediaInput(container);
    const photos = Array.from({ length: 10 }, (_, index) =>
      new File([new Uint8Array(512)], `photo-${index + 1}.png`, { type: "image/png" }),
    );

    fireEvent.change(input, { target: { files: photos } });
    fireEvent.click(within(screen.getByTestId("attachment-review-modal")).getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(
        within(screen.getByTestId("attachment-review-modal")).getByRole("button", { name: "Sending..." }),
      ).toBeDisabled(),
    );
    fireEvent.click(
      within(screen.getByTestId("attachment-review-modal")).getByRole("button", { name: "Sending..." }),
    );

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(uploadSendMock).toHaveBeenCalledTimes(10);

    releaseFirstSend();
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(2));
  });

  it("keeps unsent files queued when a grouped photo upload fails before send", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    let uploadCount = 0;
    uploadSendMock.mockImplementation(
      ({ formData, xhr }: { formData: FormData; xhr: MockXMLHttpRequest }) => {
        const file = formData.get("file") as File;
        uploadCount += 1;
        if (uploadCount === 2) {
          xhr.status = 500;
          xhr.onload?.();
          return;
        }

        xhr.status = 200;
        xhr.response = {
          data: {
            media_file_id: `media-${file.name}`,
          },
        };
        xhr.onload?.();
      },
    );

    const { container } = render(<MessageInput onSend={onSend} />);
    const mediaInput = getMediaInput(container);
    const fileInput = getFileInput(container);
    const first = new File([new Uint8Array(512)], "photo-1.png", { type: "image/png" });
    const second = new File([new Uint8Array(512)], "photo-2.png", { type: "image/png" });
    const third = new File(["pdf"], "report.pdf", { type: "application/pdf" });

    fireEvent.change(mediaInput, { target: { files: [first, second] } });
    fireEvent.change(fileInput, { target: { files: [third] } });
    fireEvent.click(within(screen.getByTestId("attachment-review-modal")).getByRole("button", { name: "Send" }));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(0));
    await waitFor(() => expect(screen.getByText("Upload failed")).toBeInTheDocument());

    expect(screen.getByText("photo-1.png")).toBeInTheDocument();
    expect(screen.getByText("photo-2.png")).toBeInTheDocument();
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.getAllByTestId("attachment-review-item")).toHaveLength(3);
  });

  it("shows a send-specific error when grouped send rejects after uploads succeed", async () => {
    const onSend = vi.fn().mockRejectedValue(new Error("album payload rejected"));
    const { container } = render(<MessageInput onSend={onSend} />);
    const input = getMediaInput(container);
    const first = new File([new Uint8Array(512)], "photo-1.png", { type: "image/png" });
    const second = new File([new Uint8Array(512)], "photo-2.png", { type: "image/png" });

    fireEvent.change(input, { target: { files: [first, second] } });
    fireEvent.click(within(screen.getByTestId("attachment-review-modal")).getByRole("button", { name: "Send" }));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText("Album send failed")).toBeInTheDocument());

    expect(screen.queryByText("Upload failed")).not.toBeInTheDocument();
    expect(screen.getByText("photo-1.png")).toBeInTheDocument();
    expect(screen.getByText("photo-2.png")).toBeInTheDocument();
    expect(screen.getAllByTestId("attachment-review-item")).toHaveLength(2);
  });

  it("disables modal controls while a send is pending", async () => {
    let releaseSend!: () => void;
    const onSend = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseSend = resolve;
        }),
    );
    const { container } = render(<MessageInput onSend={onSend} />);
    const input = getMediaInput(container);
    const first = new File([new Uint8Array(512)], "photo-1.png", { type: "image/png" });
    const second = new File([new Uint8Array(512)], "photo-2.png", { type: "image/png" });

    fireEvent.change(input, { target: { files: [first, second] } });
    fireEvent.click(within(screen.getByTestId("attachment-review-modal")).getByRole("button", { name: "Send" }));

    const modal = screen.getByTestId("attachment-review-modal");
    await waitFor(() =>
      expect(within(modal).getByRole("button", { name: "Sending..." })).toBeDisabled(),
    );
    expect(within(modal).getByRole("button", { name: "Add attachments" })).toBeDisabled();
    expect(within(modal).getByRole("button", { name: "Close attachment review" })).toBeDisabled();

    releaseSend();
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
  });

  it("rejects unsupported file types before upload", () => {
    const { container } = render(<MessageInput onSend={vi.fn()} />);
    const input = getFileInput(container);
    const file = new File(["plain text"], "notes.txt", { type: "text/plain" });

    fireEvent.change(input, { target: { files: [file] } });

    expect(
      screen.getByText(
        "Unsupported file type. Allowed: PNG, JPG, JPEG, GIF, WEBP, AVIF, HEIC, HEIF, PDF, MP3, M4A, AAC, OGG, OPUS, WAV, FLAC, MP4, M4V, MOV, WEBM.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("notes.txt")).not.toBeInTheDocument();
  });
});
