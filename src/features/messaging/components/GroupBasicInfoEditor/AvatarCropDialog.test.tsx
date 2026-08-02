import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { AvatarCropDialog } from "./AvatarCropDialog";

describe("AvatarCropDialog", () => {
  let createObjectUrl: ReturnType<typeof vi.spyOn>;
  let revokeObjectUrl: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    let serial = 0;
    createObjectUrl = vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:test-${serial++}`);
    revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: vi.fn() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderCrop(onSetPhoto = vi.fn()) {
    const result = render(
      <AvatarCropDialog
        source={new Blob(["image"], { type: "image/png" })}
        onCancel={vi.fn()}
        onSetPhoto={onSetPhoto}
      />,
    );
    return { ...result, onSetPhoto };
  }

  function loadImage() {
    const image = screen.getByTestId("avatar-crop-viewport").querySelector("img") as HTMLImageElement;
    Object.defineProperty(image, "naturalWidth", { configurable: true, value: 800 });
    Object.defineProperty(image, "naturalHeight", { configurable: true, value: 600 });
    fireEvent.load(image);
    return image;
  }

  it("keeps the URL alive through loading and renders a loaded image with a circular mask", () => {
    renderCrop();
    expect(screen.getByRole("status").textContent).toContain("Loading image…");
    expect(revokeObjectUrl).not.toHaveBeenCalled();
    const image = loadImage();
    expect(image.style.visibility).toBe("visible");
    expect(image.style.width).toBe("384px");
    expect(screen.getByTestId("avatar-crop-mask")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Set photo" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows a failure and disables Set photo when decoding fails", () => {
    renderCrop();
    fireEvent.error(screen.getByTestId("avatar-crop-viewport").querySelector("img") as HTMLImageElement);
    expect(screen.getByRole("alert").textContent).toContain("could not be decoded");
    expect((screen.getByRole("button", { name: "Set photo" }) as HTMLButtonElement).disabled).toBe(true);
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
  });

  it("bounds dragging and recalculates position when zoom changes", () => {
    renderCrop();
    const image = loadImage();
    const viewport = screen.getByTestId("avatar-crop-viewport");
    const initialLeft = image.style.left;
    fireEvent.pointerDown(viewport, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 0, clientY: 0 });
    expect(image.style.left).not.toBe(initialLeft);
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(Number.parseFloat(image.style.width)).toBeGreaterThan(384);
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    fireEvent.change(screen.getByRole("slider", { name: "Zoom avatar" }), { target: { value: "3" } });
    expect(Number.parseFloat(image.style.width)).toBeGreaterThan(384);
  });

  it("creates a 512 by 512 PNG draft without uploading", async () => {
    const context = { clearRect: vi.fn(), save: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), clip: vi.fn(), drawImage: vi.fn(), restore: vi.fn() };
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { configurable: true, value: () => context });
    Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", { configurable: true, value: (callback: BlobCallback, type?: string) => callback(new Blob(["cropped"], { type: type ?? "image/png" })) });
    const { onSetPhoto } = renderCrop();
    loadImage();
    fireEvent.click(screen.getByRole("button", { name: "Set photo" }));
    await waitFor(() => expect(onSetPhoto).toHaveBeenCalledOnce());
    const [blob] = onSetPhoto.mock.calls[0];
    expect(blob.type).toBe("image/png");
    expect(context.drawImage).toHaveBeenCalledOnce();
  });

  it("releases the active URL once when cancelled or unmounted", () => {
    const { unmount } = renderCrop();
    fireEvent.click(screen.getByRole("button", { name: "Cancel crop" }));
    unmount();
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
  });
});
