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
import { formatVideoLightboxTimestamp } from "./videoLightboxDate";

function renderLightbox(
  overrides: Partial<ComponentProps<typeof VideoLightbox>> = {},
) {
  return render(
    <VideoLightbox
      src="/api/v1/media/video-1"
      authorName="Alice"
      createdAt="2026-07-06T10:59:10.235"
      onClose={vi.fn()}
      {...overrides}
    />,
  );
}

describe("VideoLightbox", () => {
  beforeEach(() => {
    useAppStoreMock.mockReset();
    useAppStoreMock.mockImplementation((selector: (state: unknown) => unknown) =>
      selector({ authToken: "secret-token" }),
    );
    vi.restoreAllMocks();
  });

  it("formats timestamps like Telegram for today, yesterday, and older dates", () => {
    const now = new Date("2026-07-08T15:00:00");
    expect(formatVideoLightboxTimestamp("2026-07-08T10:59:10.235", now)).toBe("Today, 10:59");
    expect(formatVideoLightboxTimestamp("2026-07-07T11:50:00", now)).toBe("Yesterday, 11:50");
    expect(formatVideoLightboxTimestamp("2026-07-06T12:21:00", now)).toBe("6 Jul, 12:21");
    expect(formatVideoLightboxTimestamp("2025-07-06T12:21:00", now)).toBe("6 Jul 2025, 12:21");
  });

  it("renders without a separate footer panel and keeps floating actions", () => {
    renderLightbox();

    expect(screen.getByTestId("video-lightbox")).toBeInTheDocument();
    expect(screen.getByTestId("video-lightbox-stage")).toBeInTheDocument();
    expect(screen.getByTestId("video-lightbox-close")).toBeInTheDocument();
    expect(screen.getByTestId("video-lightbox-download")).toBeInTheDocument();
    expect(screen.getByTestId("video-lightbox-zoom")).toBeInTheDocument();
    expect(screen.queryByTestId("video-lightbox-footer")).not.toBeInTheDocument();
  });

  it("renders top-left metadata with avatar, author name, and formatted time without a badge panel", () => {
    renderLightbox();

    const meta = screen.getByTestId("video-lightbox-meta");
    expect(meta).toHaveTextContent("Alice");
    expect(meta).toHaveTextContent("6 Jul, 10:59");
    expect(meta).not.toHaveTextContent("2026-07-06T10:59:10.235");
    expect(meta.className).not.toContain("rounded");
    expect(meta.className).not.toContain("bg-");
    expect(meta.className).not.toContain("ring-");
    expect(meta.className).not.toContain("border");
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("uses frameless top-right action buttons instead of bordered modal controls", () => {
    renderLightbox();

    const closeButton = screen.getByTestId("video-lightbox-close");
    const downloadButton = screen.getByTestId("video-lightbox-download");
    const zoomButton = screen.getByTestId("video-lightbox-zoom");

    expect(closeButton.className).toContain("bg-transparent");
    expect(downloadButton.className).toContain("bg-transparent");
    expect(zoomButton.className).toContain("bg-transparent");
    expect(closeButton.className).not.toContain("ring-");
    expect(downloadButton.className).not.toContain("ring-");
    expect(zoomButton.className).not.toContain("ring-");
    expect(closeButton.className).not.toContain("border");
    expect(downloadButton.className).not.toContain("border");
    expect(zoomButton.className).not.toContain("border");
    expect(closeButton.className).not.toContain("shadow");
    expect(downloadButton.className).not.toContain("shadow");
    expect(zoomButton.className).not.toContain("shadow");
  });

  it("renders forward and delete actions only when handlers are provided", () => {
    const onForward = vi.fn();
    const onDelete = vi.fn();
    const { rerender } = render(
      <VideoLightbox
        src="/api/v1/media/video-conditional"
        authorName="Alice"
        createdAt="2026-07-08T10:59:10.235"
        onForward={onForward}
        onDelete={onDelete}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId("video-lightbox-forward")).toBeInTheDocument();
    expect(screen.getByTestId("video-lightbox-delete")).toBeInTheDocument();

    rerender(
      <VideoLightbox
        src="/api/v1/media/video-conditional"
        authorName="Alice"
        createdAt="2026-07-08T10:59:10.235"
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("video-lightbox-forward")).not.toBeInTheDocument();
    expect(screen.queryByTestId("video-lightbox-delete")).not.toBeInTheDocument();
  });

  it("toggles zoom mode and expands the stage when metadata is known", async () => {
    renderLightbox();

    const player = screen.getByTestId("video-lightbox-player");
    Object.defineProperties(player, {
      videoWidth: { configurable: true, value: 1280 },
      videoHeight: { configurable: true, value: 720 },
      clientWidth: { configurable: true, value: 640 },
      clientHeight: { configurable: true, value: 360 },
      duration: { configurable: true, value: 41 },
    });

    fireEvent(player, new Event("loadedmetadata"));

    const stage = await screen.findByTestId("video-lightbox-stage");
    const widthBefore = parseFloat(stage.style.width);

    fireEvent.click(screen.getByTestId("video-lightbox-zoom"));

    await waitFor(() => {
      expect(parseFloat(screen.getByTestId("video-lightbox-stage").style.width)).toBeGreaterThan(widthBefore);
    });
  });

  it("sizes portrait video as portrait after metadata loads", async () => {
    renderLightbox({ src: "/api/v1/media/video-portrait" });

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
    renderLightbox({ src: "/api/v1/media/video-landscape" });

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
    renderLightbox({ src: "/api/v1/media/video-close", onClose });

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

    renderLightbox({ src: "/api/v1/media/video-download" });

    fireEvent.click(screen.getByTestId("video-lightbox-download"));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(clickSpy).toHaveBeenCalled();
  });
});
