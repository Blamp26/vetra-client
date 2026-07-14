import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportStickerFile, StickerStudio } from "./StickerStudio";

const file = new File([new Uint8Array([1, 2, 3])], "sticker.png", { type: "image/png" });
const pack = { id: "owned", owner_id: 7, title: "Owned", slug: "owned", visibility: "private" as const, stickers: [] };

function selectImage() {
  fireEvent.change(screen.getByLabelText("Sticker Studio").querySelector("input[type=file]")!, { target: { files: [file] } });
}

beforeEach(() => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:sticker");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { configurable: true, value: () => ({ clearRect: vi.fn(), drawImage: vi.fn() }) });
  Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", { configurable: true, value: (callback: BlobCallback, type?: string) => callback(new Blob(["normalized"], { type: type ?? "image/png" })) });
  class MockImage { naturalWidth = 827; naturalHeight = 786; onload: (() => void) | null = null; onerror: (() => void) | null = null; set src(_value: string) { queueMicrotask(() => this.onload?.()); } }
  vi.stubGlobal("Image", MockImage);
});

describe("StickerStudio locked destination", () => {
  it("exports a contained 512 by 512 WebP file", async () => {
    const exported = await exportStickerFile(file);
    expect(exported.width).toBe(512);
    expect(exported.height).toBe(512);
    expect(exported.format).toBe("webp");
    expect(exported.file.type).toBe("image/webp");
  });

  it("shows the selected image and only the locked pack destination", () => {
    render(<StickerStudio pack={pack} onClose={vi.fn()} onSave={vi.fn()} />);
    selectImage();
    expect(screen.getByAltText("Sticker preview")).toBeInTheDocument();
    expect(screen.getByText("Owned")).toBeInTheDocument();
    expect(screen.queryByLabelText("Destination")).not.toBeInTheDocument();
    expect(screen.queryByText("Create new pack")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Pack title")).not.toBeInTheDocument();
  });

  it("adds and sends through the exact locked pack", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<StickerStudio pack={pack} onClose={vi.fn()} onSave={save} />);
    selectImage();
    fireEvent.click(screen.getByRole("button", { name: "Save and send" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ name: "sticker.webp", type: "image/webp" }), { kind: "existing", packId: "owned" }, ["😀"]);
  });

  it("keeps the Studio open and preserves input after a failed save", async () => {
    const save = vi.fn().mockRejectedValue(new Error("sticker failed"));
    const close = vi.fn();
    render(<StickerStudio pack={pack} onClose={close} onSave={save} />);
    selectImage();
    fireEvent.click(screen.getByRole("button", { name: "Save and send" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("sticker failed"));
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save and send" })).toBeEnabled();
  });
});
