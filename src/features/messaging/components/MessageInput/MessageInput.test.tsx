import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("accepts multiple files and shows queued file cards", () => {
    const { container } = render(<MessageInput onSend={vi.fn()} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const pdf = new File(["pdf"], "report.pdf", { type: "application/pdf" });
    const image = new File([new Uint8Array(1024)], "photo.png", { type: "image/png" });

    expect(input).toHaveAttribute(
      "accept",
      "image/png,image/jpeg,image/gif,application/pdf,video/mp4,video/webm,video/ogg",
    );
    expect(input).toHaveAttribute("multiple");

    fireEvent.change(input, { target: { files: [pdf, image] } });

    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByText("File · 3 B")).toBeInTheDocument();
    expect(screen.getByText("photo.png")).toBeInTheDocument();
    expect(screen.getByText("Photo · 1.0 KB")).toBeInTheDocument();
    expect(screen.getAllByTestId("attachment-queue-item")).toHaveLength(2);
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
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array(1024)], "photo.png", {
      type: "image/png",
    });

    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText("photo.png")).toBeInTheDocument();
    expect(screen.getByText("Photo · 1.0 KB")).toBeInTheDocument();
    expect(screen.getByAltText("preview")).toBeInTheDocument();
  });

  it("appends additional file selections to the existing queue", () => {
    const { container } = render(<MessageInput onSend={vi.fn()} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const first = new File(["pdf"], "report.pdf", { type: "application/pdf" });
    const second = new File([new Uint8Array(512)], "photo.png", { type: "image/png" });

    fireEvent.change(input, { target: { files: [first] } });
    fireEvent.change(input, { target: { files: [second] } });

    expect(screen.getAllByTestId("attachment-queue-item")).toHaveLength(2);
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByText("photo.png")).toBeInTheDocument();
  });

  it("removes one queued file without clearing the others", () => {
    const { container } = render(<MessageInput onSend={vi.fn()} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const first = new File(["pdf"], "report.pdf", { type: "application/pdf" });
    const second = new File([new Uint8Array(512)], "photo.png", { type: "image/png" });

    fireEvent.change(input, { target: { files: [first, second] } });
    fireEvent.click(screen.getByRole("button", { name: "Remove report.pdf" }));

    expect(screen.queryByText("report.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("photo.png")).toBeInTheDocument();
    expect(screen.getAllByTestId("attachment-queue-item")).toHaveLength(1);
  });

  it("sends a single attachment with the existing upload and send flow", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<MessageInput onSend={onSend} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["pdf"], "report.pdf", { type: "application/pdf" });

    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith(
        { content: null, mediaFileId: "media-report.pdf", mediaFileIds: null },
        undefined,
      );
    });
    expect(screen.queryByText("report.pdf")).not.toBeInTheDocument();
  });

  it("sends a single photo with the existing single-media behavior", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<MessageInput onSend={onSend} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array(1024)], "photo.png", { type: "image/png" });

    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith(
        { content: null, mediaFileId: "media-photo.png", mediaFileIds: null },
        undefined,
      );
    });
  });

  it("sends up to nine selected photos as one grouped photo message", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<MessageInput onSend={onSend} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const first = new File([new Uint8Array(512)], "photo-1.png", { type: "image/png" });
    const second = new File([new Uint8Array(512)], "photo-2.png", { type: "image/png" });
    const third = new File([new Uint8Array(512)], "photo-3.png", { type: "image/png" });

    fireEvent.change(input, { target: { files: [first, second, third] } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));

    expect(onSend).toHaveBeenCalledWith(
      {
        content: null,
        mediaFileId: "media-photo-1.png",
        mediaFileIds: ["media-photo-1.png", "media-photo-2.png", "media-photo-3.png"],
      },
      undefined,
    );
    expect(screen.queryAllByTestId("attachment-queue-item")).toHaveLength(0);
  });

  it("splits more than nine selected photos into multiple grouped messages in order", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<MessageInput onSend={onSend} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const photos = Array.from({ length: 10 }, (_, index) =>
      new File([new Uint8Array(256)], `photo-${index + 1}.png`, { type: "image/png" }),
    );

    fireEvent.change(input, { target: { files: photos } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

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

  it("sends text with the first grouped photo message only", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<MessageInput onSend={onSend} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const first = new File([new Uint8Array(512)], "photo-1.png", { type: "image/png" });
    const second = new File([new Uint8Array(512)], "photo-2.png", { type: "image/png" });
    const third = new File([new Uint8Array(512)], "photo-3.png", { type: "image/png" });
    const fourth = new File([new Uint8Array(512)], "photo-4.png", { type: "image/png" });
    const document = new File(["pdf"], "report.pdf", { type: "application/pdf" });

    fireEvent.change(screen.getByPlaceholderText("Message..."), {
      target: { value: "Album caption" },
    });
    fireEvent.change(input, { target: { files: [first, second, document, third, fourth] } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

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
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const document = new File(["pdf"], "report.pdf", { type: "application/pdf" });
    const first = new File([new Uint8Array(512)], "photo-1.png", { type: "image/png" });
    const second = new File([new Uint8Array(512)], "photo-2.png", { type: "image/png" });

    fireEvent.change(screen.getByPlaceholderText("Message..."), {
      target: { value: "Album caption" },
    });
    fireEvent.change(input, { target: { files: [document, first, second] } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

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

  it("prevents duplicate grouped-photo sends while pending", async () => {
    let releaseFirstSend!: () => void;
    const onSend = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseFirstSend = resolve;
        }),
    );
    const { container } = render(<MessageInput onSend={onSend} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const photos = Array.from({ length: 10 }, (_, index) =>
      new File([new Uint8Array(512)], `photo-${index + 1}.png`, { type: "image/png" }),
    );

    fireEvent.change(input, { target: { files: photos } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    fireEvent.click(screen.getByRole("button", { name: "Sending..." }));

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
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const first = new File([new Uint8Array(512)], "photo-1.png", { type: "image/png" });
    const second = new File([new Uint8Array(512)], "photo-2.png", { type: "image/png" });
    const third = new File(["pdf"], "report.pdf", { type: "application/pdf" });

    fireEvent.change(input, { target: { files: [first, second, third] } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(0));
    await waitFor(() => expect(screen.getByText("Upload failed")).toBeInTheDocument());

    expect(screen.getByText("photo-1.png")).toBeInTheDocument();
    expect(screen.getByText("photo-2.png")).toBeInTheDocument();
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.getAllByTestId("attachment-queue-item")).toHaveLength(3);
  });

  it("shows a send-specific error when grouped send rejects after uploads succeed", async () => {
    const onSend = vi.fn().mockRejectedValue(new Error("album payload rejected"));
    const { container } = render(<MessageInput onSend={onSend} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const first = new File([new Uint8Array(512)], "photo-1.png", { type: "image/png" });
    const second = new File([new Uint8Array(512)], "photo-2.png", { type: "image/png" });

    fireEvent.change(input, { target: { files: [first, second] } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText("Album send failed")).toBeInTheDocument());

    expect(screen.queryByText("Upload failed")).not.toBeInTheDocument();
    expect(screen.getByText("photo-1.png")).toBeInTheDocument();
    expect(screen.getByText("photo-2.png")).toBeInTheDocument();
    expect(screen.getAllByTestId("attachment-queue-item")).toHaveLength(2);
  });

  it("rejects unsupported file types before upload", () => {
    const { container } = render(<MessageInput onSend={vi.fn()} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["plain text"], "notes.txt", { type: "text/plain" });

    fireEvent.change(input, { target: { files: [file] } });

    expect(
      screen.getByText(
        "Unsupported file type. Allowed: PNG, JPG, GIF, PDF, MP4, WEBM, OGG.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("notes.txt")).not.toBeInTheDocument();
  });
});
