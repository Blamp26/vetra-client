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

import {
  buildWaveformFromAudioBuffer,
  createFallbackWaveform,
  VoiceMessagePlayer,
  WAVEFORM_BAR_COUNT,
} from "./VoiceMessagePlayer";

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
    const progress = screen.getByTestId("voice-message-waveform");
    vi.spyOn(progress, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 260,
      bottom: 23,
      width: 260,
      height: 23,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    fireEvent.pointerDown(progress, { clientX: 130, pointerId: 1 });
    expect(progress).toHaveAttribute("aria-valuenow", "1.5");
    fireEvent.keyDown(progress, { key: "ArrowRight" });
    expect(progress).toHaveAttribute("aria-valuenow", "2.5");
    expect(screen.getByTestId("voice-message-duration")).not.toHaveTextContent("/");
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

  it("uses the Telegram voice geometry and a 2x 65-bar canvas", async () => {
    render(<VoiceMessagePlayer attachment={voiceAttachment("voice-geometry")} isOwn />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Play voice message" })).toBeInTheDocument());

    const player = screen.getByTestId("voice-message-player");
    const button = screen.getByRole("button", { name: "Play voice message" });
    const content = screen.getByTestId("voice-message-content");
    const waveform = screen.getByTestId("voice-message-waveform");
    const canvas = waveform.querySelector("canvas");

    expect(player).toHaveClass("h-[48px]", "mt-[3px]", "mb-[7px]");
    expect(button).toHaveClass("h-[48px]", "w-[48px]", "rounded-full", "p-[5px]");
    expect(button.parentElement).toHaveClass("h-[48px]", "w-[60px]");
    expect(content).toHaveClass("h-[48px]");
    expect(waveform).toHaveClass("h-[23px]", "max-w-[260px]");
    expect(waveform).toHaveAttribute("data-bar-count", String(WAVEFORM_BAR_COUNT));
    expect(waveform).toHaveAttribute("data-bar-width", "2");
    expect(waveform).toHaveAttribute("data-bar-gap", "2");
    expect(canvas).toHaveClass("h-[23px]", "w-[260px]", "ml-[1px]");
    expect(canvas).toHaveAttribute("width", "520");
    expect(canvas).toHaveAttribute("height", "46");
    expect(screen.getByTestId("voice-message-duration")).toHaveTextContent("0:03");
  });

  it("derives stable bar heights from decoded audio and keeps a deterministic fallback", () => {
    const channel = Float32Array.from([0, 0.2, 0.5, 1, 0.1, 0.4, 0.8, 0]);
    const waveform = buildWaveformFromAudioBuffer({
      length: channel.length,
      numberOfChannels: 1,
      getChannelData: () => channel,
    }, 4);

    expect(waveform).toHaveLength(4);
    expect(waveform.every((height) => height >= 2 && height <= 23)).toBe(true);
    expect(new Set(waveform).size).toBeGreaterThan(1);
    expect(createFallbackWaveform(4)).toEqual([2, 2, 2, 2]);
  });
});
