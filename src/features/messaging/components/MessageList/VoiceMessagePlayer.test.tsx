import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { Attachment } from "@/shared/types";

const { useAppStoreMock, fetchAttachmentBlobMock } = vi.hoisted(() => ({
  useAppStoreMock: vi.fn(),
  fetchAttachmentBlobMock: vi.fn(),
}));

vi.mock("@/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) => useAppStoreMock(selector),
}));

vi.mock("../../utils/attachmentDownloads", () => ({
  fetchAttachmentBlob: fetchAttachmentBlobMock,
}));

import { VoiceMessagePlayer } from "./VoiceMessagePlayer";

const voiceAttachment = (id: string): Attachment => ({
  id,
  url: `/api/v1/media/${id}`,
  mime_type: "audio/webm",
  original_name: `${id}.webm`,
  file_size: 3200,
  kind: "voice",
  duration_ms: 3_000,
});

describe("VoiceMessagePlayer", () => {
  beforeEach(() => {
    useAppStoreMock.mockImplementation((selector: (state: unknown) => unknown) =>
      selector({ authToken: "secret-token" }),
    );
    fetchAttachmentBlobMock.mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }));
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:voice");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads protected audio and supports play, pause, and seek", async () => {
    const { container } = render(<VoiceMessagePlayer attachment={voiceAttachment("voice-1")} />);
    await waitFor(() => expect(fetchAttachmentBlobMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "voice-1" }),
      "secret-token",
    ));

    const playButton = screen.getByRole("button", { name: "Play voice message" });
    fireEvent.click(playButton);
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalled());

    fireEvent.loadedMetadata(container.querySelector("audio") as HTMLAudioElement);
    const progress = screen.getByTestId("voice-message-progress") as HTMLInputElement;
    fireEvent.change(progress, { target: { value: "1.5" } });
    expect(progress.value).toBe("1.5");
  });

  it("pauses the previous voice message when another starts", async () => {
    render(
      <>
        <VoiceMessagePlayer attachment={voiceAttachment("voice-1")} />
        <VoiceMessagePlayer attachment={voiceAttachment("voice-2")} />
      </>,
    );
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Play voice message" })).toHaveLength(2));
    const playButtons = screen.getAllByRole("button", { name: "Play voice message" });
    fireEvent.click(playButtons[0]);
    fireEvent.click(playButtons[1]);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });
});
