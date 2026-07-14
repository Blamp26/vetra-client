import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { listMock, addMock, postFormDataMock, useAppStoreMock } = vi.hoisted(() => ({ listMock: vi.fn(), addMock: vi.fn(), postFormDataMock: vi.fn(), useAppStoreMock: vi.fn() }));
vi.mock("@/api/stickers", () => ({ stickersApi: { list: listMock, createPack: vi.fn(), add: addMock } }));
vi.mock("@/api/base", () => ({ API_BASE_URL: "", postFormData: postFormDataMock }));
vi.mock("@/store", () => ({ useAppStore: (selector: (state: unknown) => unknown) => useAppStoreMock(selector) }));

import { StickerPicker } from "./StickerPicker";

const owned = { id: "owned", owner_id: 7, title: "Mine", slug: "mine", visibility: "private" as const, stickers: [] };
const foreign = { id: "foreign", owner_id: 8, title: "Installed", slug: "installed", visibility: "public" as const, stickers: [] };

describe("StickerPicker ownership and geometry", () => {
  beforeEach(() => { listMock.mockReset(); addMock.mockReset(); postFormDataMock.mockReset(); useAppStoreMock.mockReset(); });
  it("uses currentUser.id rather than positive owner ids for studio destinations", async () => {
    listMock.mockResolvedValue([owned, foreign]); useAppStoreMock.mockImplementation((selector: (state: unknown) => unknown) => selector({ currentUser: { id: 7 } }));
    render(<StickerPicker onSend={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText("Create sticker")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("Create sticker"));
    expect(screen.getByRole("option", { name: "Mine" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Installed" })).not.toBeInTheDocument();
  });

  it("keeps the picker geometry contract", async () => {
    listMock.mockResolvedValue([]); useAppStoreMock.mockImplementation((selector: (state: unknown) => unknown) => selector({ currentUser: { id: 7 } }));
    render(<StickerPicker onSend={vi.fn()} onClose={vi.fn()} />);
    const picker = await screen.findByTestId("sticker-picker");
    expect(picker).toHaveClass("w-[292px]");
    expect(screen.getByLabelText("Create sticker")).toBeInTheDocument();
  });

  it("uploads the normalized file and sends the canonical sticker exactly once", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const sticker = { id: "sticker", pack_id: "owned", media_file_id: "media", width: 512, height: 512, format: "webp", emoji_tags: ["😀"] };
    listMock.mockResolvedValueOnce([owned]).mockResolvedValueOnce([{ ...owned, stickers: [sticker] }]);
    addMock.mockResolvedValue(sticker); postFormDataMock.mockResolvedValue({ media_file_id: "media" }); useAppStoreMock.mockImplementation((selector: (state: unknown) => unknown) => selector({ currentUser: { id: 7 } }));
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { configurable: true, value: () => ({ clearRect: vi.fn(), drawImage: vi.fn() }) });
    Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", { configurable: true, value: (callback: BlobCallback, type?: string) => callback(new Blob(["normalized"], { type: type ?? "image/png" })) });
    class MockImage { naturalWidth = 827; naturalHeight = 786; onload: (() => void) | null = null; onerror: (() => void) | null = null; set src(_value: string) { queueMicrotask(() => this.onload?.()); } }
    vi.stubGlobal("Image", MockImage);
    render(<StickerPicker onSend={send} onClose={vi.fn()} />); await waitFor(() => expect(screen.getByLabelText("Create sticker")).toBeInTheDocument()); fireEvent.click(screen.getByLabelText("Create sticker"));
    const source = new File(["source"], "source.png", { type: "image/png" }); fireEvent.change(screen.getByLabelText(/sticker studio/i).querySelector("input[type=file]")!, { target: { files: [source] } }); fireEvent.click(screen.getByRole("button", { name: "Save and send" }));
    await waitFor(() => expect(send).toHaveBeenCalledWith("sticker"));
    expect(postFormDataMock).toHaveBeenCalledTimes(1); expect(postFormDataMock.mock.calls[0][1].get("file")).not.toBe(source); expect(addMock).toHaveBeenCalledWith("owned", expect.objectContaining({ media_file_id: "media", width: 512, height: 512, format: "webp" })); expect(send).toHaveBeenCalledTimes(1);
  });
});
