import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

  open = vi.fn();
  setRequestHeader = vi.fn();

  send(formData: FormData) {
    uploadSendMock({ formData, xhr: this });
  }
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

  it("opens the attachment source menu from the attachment button", () => {
    render(<MessageInput onSend={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Attach" }));

    expect(screen.getByTestId("attachment-source-menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Photo or Video" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "File" })).toBeInTheDocument();
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
    expect(fileInput).toHaveAttribute("accept", "application/pdf");
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

  it("keeps composer controls aligned with simple button and input styling", () => {
    render(<MessageInput onSend={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Attach" })).toHaveClass("min-h-11");
    expect(screen.getByPlaceholderText("Message...")).toHaveClass("min-h-11");
    expect(screen.getByRole("button", { name: "Send" })).toHaveClass("min-h-11");
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

  it("sends text with the first grouped photo message only", async () => {
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
        content: "Album caption",
        mediaFileId: "media-photo-1.png",
        mediaFileIds: ["media-photo-1.png", "media-photo-2.png"],
      }, undefined],
      [{
        content: null,
        mediaFileId: "media-report.pdf",
        mediaFileIds: null,
      }, undefined],
      [{
        content: null,
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
    expect(uploadSendMock).toHaveBeenCalledTimes(9);

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
        "Unsupported file type. Allowed: PNG, JPG, JPEG, GIF, WEBP, AVIF, HEIC, HEIF, PDF, MP4, M4V, MOV, WEBM, OGG.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("notes.txt")).not.toBeInTheDocument();
  });
});
