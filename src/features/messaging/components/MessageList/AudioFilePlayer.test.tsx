import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Attachment } from "@/shared/types";

const { useAppStoreMock, fetchAttachmentBlobMock, downloadAttachmentWithAuthMock } = vi.hoisted(() => ({
  useAppStoreMock: vi.fn(),
  fetchAttachmentBlobMock: vi.fn(),
  downloadAttachmentWithAuthMock: vi.fn(),
}));

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) => useAppStoreMock(selector),
}));

vi.mock("../../utils/attachmentDownloads", () => ({
  fetchAttachmentBlob: fetchAttachmentBlobMock,
  downloadAttachmentWithAuth: downloadAttachmentWithAuthMock,
}));

import { AudioFilePlayer } from "./AudioFilePlayer";

const audioAttachment: Attachment = {
  id: "audio-1",
  url: "/api/v1/media/audio-1",
  mime_type: "audio/mpeg",
  original_name: "track.mp3",
  file_size: 3200,
  kind: "audio",
  duration_ms: 3_000,
};

describe("AudioFilePlayer", () => {
  beforeEach(() => {
    useAppStoreMock.mockImplementation((selector: (state: unknown) => unknown) => selector({ authToken: "secret-token" }));
    fetchAttachmentBlobMock.mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])], { type: "audio/mpeg" }));
    downloadAttachmentWithAuthMock.mockResolvedValue(undefined);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:audio");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it("loads protected audio and supports play, seek, and original-name download", async () => {
    render(<AudioFilePlayer attachment={audioAttachment} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Play audio file" })).toBeInTheDocument());
    expect(fetchAttachmentBlobMock).toHaveBeenCalledWith(audioAttachment, "secret-token");
    expect(screen.getByText("track.mp3")).toBeInTheDocument();
    expect(screen.getByText("0:03")).toBeInTheDocument();
    expect(screen.queryByTestId("audio-seekline")).not.toBeInTheDocument();

    const player = screen.getByTestId("audio-file-player");
    const playButton = screen.getByRole("button", { name: "Play audio file" });
    expect(player).toHaveClass("h-[48px]", "w-full");
    expect(playButton).toHaveClass("h-[48px]", "w-[48px]", "mr-3", "rounded-full", "p-0");
    expect(screen.getByTestId("audio-icon-stage")).toHaveClass("absolute", "inset-0", "grid", "place-items-center");

    fireEvent.click(playButton);
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalled());

    const seek = screen.getByRole("slider", { name: "Seek audio file" });
    fireEvent.change(seek, { target: { value: "1.5" } });
    expect(seek).toHaveValue("1.5");

    fireEvent.click(screen.getByRole("button", { name: "Download audio file" }));
    await waitFor(() => expect(downloadAttachmentWithAuthMock).toHaveBeenCalledWith({
      attachment: audioAttachment,
      authToken: "secret-token",
    }));
  });

  it("keeps message metadata absolute without changing the centered player row", async () => {
    render(<AudioFilePlayer attachment={audioAttachment} messageMeta={<span data-testid="message-metadata">12:00</span>} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Play audio file" })).toBeInTheDocument());

    expect(screen.getByTestId("audio-file-player")).toHaveClass("h-[48px]", "items-center");
    expect(screen.getByTestId("message-metadata").parentElement).toHaveClass("absolute", "right-0", "bottom-0");
  });
});
