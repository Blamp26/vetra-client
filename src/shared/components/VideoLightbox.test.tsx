import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

vi.mock("./AuthenticatedVideo", () => ({
  AuthenticatedVideo: ({
    src,
    className,
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
      duration: number | null;
    }) => void;
  }) => (
    <video
      data-testid="video-lightbox-player"
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
      }}
    />
  ),
}));

import { VideoLightbox } from "./VideoLightbox";

describe("VideoLightbox", () => {
  beforeEach(() => {
    useAppStoreMock.mockReset();
    useAppStoreMock.mockImplementation((selector: (state: unknown) => unknown) =>
      selector({ authToken: "secret-token" }),
    );
    vi.restoreAllMocks();
  });

  it("renders without a separate footer panel and keeps floating actions", () => {
    render(
      <VideoLightbox
        src="/api/v1/media/video-1"
        author="Alice"
        time="12:00"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId("video-lightbox")).toBeInTheDocument();
    expect(screen.getByTestId("video-lightbox-stage")).toBeInTheDocument();
    expect(screen.getByTestId("video-lightbox-close")).toBeInTheDocument();
    expect(screen.getByTestId("video-lightbox-download")).toBeInTheDocument();
    expect(screen.queryByTestId("video-lightbox-footer")).not.toBeInTheDocument();
  });

  it("sizes portrait video as portrait after metadata loads", async () => {
    render(
      <VideoLightbox
        src="/api/v1/media/video-portrait"
        author="Alice"
        time="12:00"
        onClose={vi.fn()}
      />,
    );

    const player = screen.getByTestId("video-lightbox-player");
    Object.defineProperties(player, {
      videoWidth: { configurable: true, value: 720 },
      videoHeight: { configurable: true, value: 1280 },
      clientWidth: { configurable: true, value: 360 },
      clientHeight: { configurable: true, value: 640 },
      duration: { configurable: true, value: 41 },
    });

    fireEvent(player, new Event("loadedmetadata"));

    await waitFor(() => {
      const stage = screen.getByTestId("video-lightbox-stage");
      expect(parseFloat(stage.style.height)).toBeGreaterThan(parseFloat(stage.style.width));
    });
  });

  it("sizes landscape video as landscape after metadata loads", async () => {
    render(
      <VideoLightbox
        src="/api/v1/media/video-landscape"
        author="Alice"
        time="12:00"
        onClose={vi.fn()}
      />,
    );

    const player = screen.getByTestId("video-lightbox-player");
    Object.defineProperties(player, {
      videoWidth: { configurable: true, value: 1280 },
      videoHeight: { configurable: true, value: 720 },
      clientWidth: { configurable: true, value: 640 },
      clientHeight: { configurable: true, value: 360 },
      duration: { configurable: true, value: 41 },
    });

    fireEvent(player, new Event("loadedmetadata"));

    await waitFor(() => {
      const stage = screen.getByTestId("video-lightbox-stage");
      expect(parseFloat(stage.style.width)).toBeGreaterThan(parseFloat(stage.style.height));
    });
  });

  it("closes from the close button and Escape", () => {
    const onClose = vi.fn();
    render(
      <VideoLightbox
        src="/api/v1/media/video-close"
        author="Alice"
        time="12:00"
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByTestId("video-lightbox-close"));
    expect(onClose).toHaveBeenCalled();

    const callCountAfterButton = onClose.mock.calls.length;
    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose.mock.calls.length).toBe(callCountAfterButton + 1);
  });

  it("keeps download action available", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["video-bytes"], { type: "video/mp4" }),
    } as Response);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:download");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(
      <VideoLightbox
        src="/api/v1/media/video-download"
        author="Alice"
        time="12:00"
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("video-lightbox-download"));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(clickSpy).toHaveBeenCalled();
  });
});
