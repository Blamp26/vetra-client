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
  resolveVoiceCanvasColors,
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
    expect(player).toHaveStyle({
      "--voice-strong-foreground": "var(--bubble-outgoing-text)",
      "--voice-surface-color": "var(--bubble-outgoing)",
    });
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
    expect(screen.getByTestId("voice-message-duration")).toHaveClass("text-[color:var(--voice-strong-foreground)]");

    const playIcon = button.querySelector("svg");
    expect(playIcon).toHaveAttribute("viewBox", "0 0 26 26");
    expect(playIcon?.querySelector("path")).toHaveAttribute("fill", "currentColor");
    expect(playIcon?.querySelector("path")).toHaveAttribute("stroke", "none");
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

  it("resolves visible concrete semantic canvas colors instead of the outgoing surface", () => {
    const colors = resolveVoiceCanvasColors(
      "rgb(248, 250, 248)",
      "rgb(248, 250, 248)",
      "rgb(47, 107, 91)",
    );

    expect(colors.played).toBe("rgb(248, 250, 248)");
    expect(colors.unplayed).toBe("rgba(248, 250, 248, 0.32)");
    expect(colors.unplayed).not.toContain("var(");
    expect(colors.unplayed).not.toContain("color-mix");
    expect(colors.unplayed).not.toBe("rgb(47, 107, 91)");
  });

  it("falls back to the strong foreground when the semantic foreground matches the bubble", () => {
    const colors = resolveVoiceCanvasColors(
      "rgb(47, 107, 91)",
      "rgb(248, 250, 248)",
      "rgb(47, 107, 91)",
    );

    expect(colors.played).toBe("rgb(248, 250, 248)");
    expect(colors.unplayed).toMatch(/^rgba\(248, 250, 248, 0\.3/);
  });

  it("passes resolved rgb/rgba colors to the canvas instead of CSS variables", async () => {
    const fillStyles: string[] = [];
    const context = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      save: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      restore: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    Object.defineProperty(context, "fillStyle", {
      configurable: true,
      set(value: string) { fillStyles.push(value); },
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
    vi.spyOn(window, "getComputedStyle").mockImplementation((element) => ({
      color: element instanceof HTMLCanvasElement ? "rgb(248, 250, 248)" : "",
      backgroundColor: element instanceof HTMLButtonElement ? "rgb(248, 250, 248)" : "",
      getPropertyValue: () => "",
    } as unknown as CSSStyleDeclaration));

    render(<VoiceMessagePlayer attachment={voiceAttachment("voice-concrete-colors")} isOwn />);
    await waitFor(() => expect(fillStyles.length).toBeGreaterThan(0));

    expect(fillStyles[0]).toBe("rgba(248, 250, 248, 0.32)");
    expect(fillStyles.every((color) => !color.includes("var(") && !color.includes("color-mix"))).toBe(true);
  });

  it("uses filled pause bars without changing the button geometry", async () => {
    render(<VoiceMessagePlayer attachment={voiceAttachment("voice-pause")} isOwn />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Play voice message" })).toBeInTheDocument());

    const button = screen.getByRole("button", { name: "Play voice message" });
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole("button", { name: "Pause voice message" })).toBeInTheDocument());
    const pauseIcon = Array.from(screen.getByRole("button", { name: "Pause voice message" }).querySelectorAll("svg"))
      .find((icon) => icon.getAttribute("viewBox") === "0 0 25 25");

    expect(pauseIcon).toHaveAttribute("viewBox", "0 0 25 25");
    expect(pauseIcon?.querySelectorAll("rect")).toHaveLength(2);
    expect(pauseIcon?.querySelector("rect")).toHaveAttribute("fill", "currentColor");
    expect(pauseIcon?.querySelector("rect")).toHaveAttribute("stroke", "none");
    expect(button).toHaveClass("h-[48px]", "w-[48px]");
  });
});
