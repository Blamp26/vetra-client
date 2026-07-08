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

vi.mock("./AuthenticatedImage", () => ({
  AuthenticatedImage: ({
    src,
    alt,
    className,
    style,
    ...props
  }: ComponentProps<"img"> & { src: string }) => (
    <img
      data-testid="image-lightbox-image"
      src={src}
      alt={alt}
      className={className}
      style={style}
      {...props}
    />
  ),
}));

import { ImageLightbox } from "./ImageLightbox";

function renderLightbox(
  overrides: Partial<ComponentProps<typeof ImageLightbox>> = {},
) {
  return render(
    <ImageLightbox
      src="/api/v1/media/photo-1"
      authorName="Alice"
      createdAt="2026-07-06T10:59:10.235"
      onClose={vi.fn()}
      {...overrides}
    />,
  );
}

describe("ImageLightbox", () => {
  beforeEach(() => {
    useAppStoreMock.mockReset();
    useAppStoreMock.mockImplementation((selector: (state: unknown) => unknown) =>
      selector({ authToken: "secret-token" }),
    );
    vi.restoreAllMocks();
  });

  it("renders Telegram-like chrome without a footer panel", () => {
    renderLightbox();

    expect(screen.getByTestId("image-lightbox")).toBeInTheDocument();
    expect(screen.getByTestId("image-lightbox-stage")).toBeInTheDocument();
    expect(screen.getByTestId("image-lightbox-close")).toBeInTheDocument();
    expect(screen.getByTestId("image-lightbox-download")).toBeInTheDocument();
    expect(screen.getByTestId("image-lightbox-zoom")).toBeInTheDocument();
    expect(screen.queryByTestId("image-lightbox-footer")).not.toBeInTheDocument();
  });

  it("renders top-left metadata with avatar, author name, and formatted time", () => {
    renderLightbox({ avatarSrc: "/avatars/alice.png" });

    const meta = screen.getByTestId("image-lightbox-meta");
    expect(meta).toHaveTextContent("Alice");
    expect(meta).toHaveTextContent("6 Jul, 10:59");
    expect(meta.className).not.toContain("bg-");
    expect(meta.className).not.toContain("ring-");
  });

  it("uses frameless top-right action buttons", () => {
    renderLightbox();

    const closeButton = screen.getByTestId("image-lightbox-close");
    const downloadButton = screen.getByTestId("image-lightbox-download");
    const zoomButton = screen.getByTestId("image-lightbox-zoom");

    expect(closeButton.className).toContain("bg-transparent");
    expect(downloadButton.className).toContain("bg-transparent");
    expect(zoomButton.className).toContain("bg-transparent");
    expect(closeButton.className).not.toContain("border");
    expect(downloadButton.className).not.toContain("border");
    expect(zoomButton.className).not.toContain("border");
  });

  it("renders forward and delete actions only when handlers exist", () => {
    const { rerender } = render(
      <ImageLightbox
        src="/api/v1/media/photo-1"
        authorName="Alice"
        createdAt="2026-07-06T10:59:10.235"
        onForward={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId("image-lightbox-forward")).toBeInTheDocument();
    expect(screen.getByTestId("image-lightbox-delete")).toBeInTheDocument();

    rerender(
      <ImageLightbox
        src="/api/v1/media/photo-1"
        authorName="Alice"
        createdAt="2026-07-06T10:59:10.235"
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("image-lightbox-forward")).not.toBeInTheDocument();
    expect(screen.queryByTestId("image-lightbox-delete")).not.toBeInTheDocument();
  });

  it("toggles zoom mode from the top-right action", async () => {
    renderLightbox();
    const image = screen.getByTestId("image-lightbox-image");

    expect(image).toHaveStyle({ transform: "translate(0px, 0px) scale(1)" });

    fireEvent.click(screen.getByTestId("image-lightbox-zoom"));

    await waitFor(() =>
      expect(screen.getByTestId("image-lightbox-image")).toHaveStyle({
        transform: "translate(0px, 0px) scale(2)",
      }),
    );
  });

  it("closes from the close button and Escape", () => {
    const onClose = vi.fn();
    renderLightbox({ onClose });

    fireEvent.click(screen.getByTestId("image-lightbox-close"));
    expect(onClose).toHaveBeenCalled();

    const callCountAfterButton = onClose.mock.calls.length;
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose.mock.calls.length).toBe(callCountAfterButton + 1);
  });

  it("keeps download action available", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["image-bytes"], { type: "image/png" }),
    } as Response);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:download");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    renderLightbox({ src: "/api/v1/media/photo-download" });

    fireEvent.click(screen.getByTestId("image-lightbox-download"));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(clickSpy).toHaveBeenCalled();
  });
});
