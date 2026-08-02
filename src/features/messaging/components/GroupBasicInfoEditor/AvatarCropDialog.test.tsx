import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { AvatarCropDialog } from "./AvatarCropDialog";
import { APP_TITLE_BAR_HEIGHT } from "@/shared/components/DesktopTitleBar/DesktopTitleBar";

describe("AvatarCropDialog", () => {
  let createObjectUrl: ReturnType<typeof vi.spyOn>;
  let revokeObjectUrl: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    let serial = 0;
    createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation(() => `blob:test-${serial++}`);
    revokeObjectUrl = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
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
    const image = screen.getByTestId(
      "avatar-crop-image-bright",
    ) as HTMLImageElement;
    Object.defineProperty(image, "naturalWidth", {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(image, "naturalHeight", {
      configurable: true,
      value: 600,
    });
    fireEvent.load(image);
    return image;
  }

  it("keeps the URL alive through loading and renders a loaded image with a circular mask", () => {
    renderCrop();
    expect(screen.getByRole("status").textContent).toContain("Loading image…");
    expect(revokeObjectUrl).not.toHaveBeenCalled();
    const image = loadImage();
    expect(image.style.visibility).toBe("visible");
    expect(screen.getByTestId("avatar-crop-fullscreen")).toBeTruthy();
    expect(screen.getByTestId("dialog-overlay").style.top).toBe(
      `${APP_TITLE_BAR_HEIGHT}px`,
    );
    expect(screen.getByTestId("avatar-crop-fullscreen").className).toContain(
      "bg-neutral-950/85",
    );
    expect(screen.queryByText("Crop photo")).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel crop" })).toBeNull();
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.getByTestId("dialog-panel").className).toContain("!w-full");
    expect(screen.getByTestId("dialog-panel").className).toContain(
      "!rounded-none",
    );
    expect(screen.getByTestId("avatar-crop-stage")).toBeTruthy();
    expect(screen.getByTestId("avatar-crop-image-dim").style.filter).toContain(
      "brightness",
    );
    expect(screen.getByTestId("avatar-crop-image-dim").style.left).toBe(
      screen.getByTestId("avatar-crop-image-bright").style.left,
    );
    expect(screen.getByTestId("avatar-crop-image-surface").className).toContain(
      "overflow-hidden",
    );
    expect(image.style.clipPath).toContain("circle(");
    const circle = screen
      .getByTestId("avatar-crop-mask")
      .querySelector("circle");
    expect(Number(circle?.getAttribute("r"))).toBeGreaterThan(240);
    expect(circle?.getAttribute("stroke-width")).toBe("1");
    expect(
      screen.getByTestId("avatar-crop-corner-guides").children,
    ).toHaveLength(4);
    expect(screen.getByTestId("avatar-crop-toolbar").className).toContain(
      "h-[52px]",
    );
    expect(
      screen.getByRole("button", { name: "Reset crop framing" }),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Set photo" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("shows a failure and disables Set photo when decoding fails", () => {
    renderCrop();
    fireEvent.error(screen.getByTestId("avatar-crop-image-bright"));
    expect(screen.getByRole("alert").textContent).toContain(
      "could not be decoded",
    );
    expect(
      (screen.getByRole("button", { name: "Set photo" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
  });

  it("keeps the title bar clear and aligns the crop stage below it", () => {
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1920,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 1032,
    });

    try {
      renderCrop();
      loadImage();
      expect(screen.getByTestId("dialog-overlay").style.top).toBe(
        `${APP_TITLE_BAR_HEIGHT}px`,
      );
      expect(screen.getByTestId("avatar-crop-image-surface").style.top).toBe(
        "49px",
      );
      expect(screen.getByTestId("avatar-crop-toolbar").className).toContain(
        "bottom-5",
      );
    } finally {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: originalWidth,
      });
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: originalHeight,
      });
    }
  });

  it("bounds dragging and recalculates position when zoom changes", () => {
    renderCrop();
    const image = loadImage();
    const viewport = screen.getByTestId("avatar-crop-stage");
    const initialWidth = Number.parseFloat(image.style.width);
    const initialLeft = image.style.left;
    fireEvent.pointerDown(viewport, {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 0, clientY: 0 });
    expect(image.style.left).not.toBe(initialLeft);
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(Number.parseFloat(image.style.width)).toBeGreaterThan(initialWidth);
    fireEvent.click(screen.getByRole("button", { name: "Reset crop framing" }));
    expect(Number.parseFloat(image.style.width)).toBe(initialWidth);
    fireEvent.wheel(viewport, { deltaY: -100 });
    expect(Number.parseFloat(image.style.width)).toBeGreaterThan(initialWidth);
    fireEvent.keyDown(viewport, { key: "0" });
    expect(Number.parseFloat(image.style.width)).toBe(initialWidth);
  });

  it("resizes every corner around its diagonally opposite anchor", () => {
    renderCrop();
    loadImage();
    const stage = screen.getByTestId("avatar-crop-stage");
    const corners = [
      ["top-left", 40, 40, "bottom-right"],
      ["top-right", -40, 40, "bottom-left"],
      ["bottom-left", 40, -40, "top-right"],
      ["bottom-right", -40, -40, "top-left"],
    ] as const;

    for (const [corner, deltaX, deltaY, opposite] of corners) {
      const guides = screen.getByTestId("avatar-crop-corner-guides");
      const initialSize = Number.parseFloat(guides.style.width) - 24;
      const initialLeft = Number.parseFloat(guides.style.left) + 12;
      const initialTop = Number.parseFloat(guides.style.top) + 12;
      const initialOpposite = {
        x: opposite.includes("right") ? initialLeft + initialSize : initialLeft,
        y: opposite.includes("bottom") ? initialTop + initialSize : initialTop,
      };
      const handle = screen.getByRole("button", {
        name: `Resize crop ${corner.replace("-", " ")}`,
      });
      fireEvent.pointerDown(handle, {
        pointerId: 7,
        clientX: 100,
        clientY: 100,
      });
      fireEvent.pointerMove(stage, {
        pointerId: 7,
        clientX: 100 + deltaX,
        clientY: 100 + deltaY,
      });
      fireEvent.pointerUp(stage, { pointerId: 7 });

      const nextGuides = screen.getByTestId("avatar-crop-corner-guides");
      const nextSize = Number.parseFloat(nextGuides.style.width) - 24;
      const nextLeft = Number.parseFloat(nextGuides.style.left) + 12;
      const nextTop = Number.parseFloat(nextGuides.style.top) + 12;
      expect(nextSize).toBeLessThan(initialSize);
      expect(nextSize).toBe(Number.parseFloat(nextGuides.style.height) - 24);
      expect(
        opposite.includes("right") ? nextLeft + nextSize : nextLeft,
      ).toBeCloseTo(initialOpposite.x);
      expect(
        opposite.includes("bottom") ? nextTop + nextSize : nextTop,
      ).toBeCloseTo(initialOpposite.y);
      fireEvent.click(
        screen.getByRole("button", { name: "Reset crop framing" }),
      );
    }
  });

  it("enforces crop bounds and keyboard resizing without stretching", () => {
    renderCrop();
    loadImage();
    const stage = screen.getByTestId("avatar-crop-stage");
    const handle = screen.getByRole("button", {
      name: "Resize crop bottom right",
    });
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    const guides = screen.getByTestId("avatar-crop-corner-guides");
    const keyboardSize = Number.parseFloat(guides.style.width) - 24;
    expect(keyboardSize).toBe(Number.parseFloat(guides.style.height) - 24);
    fireEvent.pointerDown(handle, { pointerId: 8, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(stage, {
      pointerId: 8,
      clientX: -5000,
      clientY: -5000,
    });
    fireEvent.pointerUp(stage, { pointerId: 8 });
    const minimumSize = Number.parseFloat(guides.style.width) - 24;
    expect(minimumSize).toBeGreaterThanOrEqual(160);
    expect(minimumSize).toBe(Number.parseFloat(guides.style.height) - 24);
    const surface = screen.getByTestId("avatar-crop-image-surface");
    const surfaceRight =
      Number.parseFloat(surface.style.left) +
      Number.parseFloat(surface.style.width);
    expect(
      Number.parseFloat(guides.style.left) + minimumSize + 12,
    ).toBeLessThanOrEqual(surfaceRight + 0.01);
  });

  it("keeps the bright clip and circular outline synchronized with crop bounds", () => {
    renderCrop();
    const image = loadImage();
    const stage = screen.getByTestId("avatar-crop-stage");
    const readClip = () => {
      const match = image.style.clipPath.match(
        /circle\(([-\d.]+)px at ([-\d.]+)px ([-\d.]+)px\)/,
      );
      if (!match) throw new Error("Expected circular image clip");
      return {
        radius: Number(match[1]),
        x: Number(match[2]),
        y: Number(match[3]),
      };
    };
    const readOutline = () => {
      const circle = screen
        .getByTestId("avatar-crop-mask")
        .querySelector("circle");
      if (!circle) throw new Error("Expected circular crop outline");
      return {
        radius: Number(circle.getAttribute("r")),
        x: Number(circle.getAttribute("cx")),
        y: Number(circle.getAttribute("cy")),
      };
    };

    const initialClip = readClip();
    const initialOutline = readOutline();
    expect(initialOutline.x).toBeCloseTo(initialClip.x);
    expect(initialOutline.y).toBeCloseTo(initialClip.y);
    expect(initialOutline.radius).toBeCloseTo(initialClip.radius - 1);

    const handle = screen.getByRole("button", { name: "Resize crop top left" });
    fireEvent.pointerDown(handle, { pointerId: 9, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(stage, { pointerId: 9, clientX: 140, clientY: 140 });
    fireEvent.pointerUp(stage, { pointerId: 9 });

    const nextClip = readClip();
    const nextOutline = readOutline();
    expect(nextClip.x - initialClip.x).toBeCloseTo(20);
    expect(nextClip.y - initialClip.y).toBeCloseTo(20);
    expect(nextOutline.x).toBeCloseTo(nextClip.x);
    expect(nextOutline.y).toBeCloseTo(nextClip.y);
    expect(nextOutline.radius).toBeCloseTo(nextClip.radius - 1);
    expect(
      screen.getByTestId("avatar-crop-mask").querySelectorAll("circle"),
    ).toHaveLength(1);
  });

  it("creates a 512 by 512 PNG draft without uploading", async () => {
    const context = {
      clearRect: vi.fn(),
      save: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      clip: vi.fn(),
      drawImage: vi.fn(),
      restore: vi.fn(),
    };
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: () => context,
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
      configurable: true,
      value: (callback: BlobCallback, type?: string) =>
        callback(new Blob(["cropped"], { type: type ?? "image/png" })),
    });
    const { onSetPhoto } = renderCrop();
    const image = loadImage();
    fireEvent.click(screen.getByRole("button", { name: "Set photo" }));
    await waitFor(() => expect(onSetPhoto).toHaveBeenCalledOnce());
    const [blob] = onSetPhoto.mock.calls[0];
    expect(blob.type).toBe("image/png");
    expect(context.drawImage).toHaveBeenCalledOnce();
    const cropSize =
      Number.parseFloat(
        screen.getByTestId("avatar-crop-corner-guides").style.width,
      ) - 24;
    expect(context.drawImage.mock.calls[0][3]).toBeCloseTo(
      cropSize / (Number.parseFloat(image.style.width) / 800),
    );
  });

  it("releases the active URL once when cancelled or unmounted", () => {
    const { unmount } = renderCrop();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    unmount();
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
  });
});
