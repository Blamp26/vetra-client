import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { listMock, createPackMock, updatePackMock, addMock, postFormDataMock, useAppStoreMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  createPackMock: vi.fn(),
  updatePackMock: vi.fn(),
  addMock: vi.fn(),
  postFormDataMock: vi.fn(),
  useAppStoreMock: vi.fn(),
}));

vi.mock("@/api/stickers", () => ({ stickersApi: { list: listMock, createPack: createPackMock, updatePack: updatePackMock, add: addMock } }));
vi.mock("@/api/base", () => ({ API_BASE_URL: "", postFormData: postFormDataMock }));
vi.mock("@/store", () => ({ useAppStore: (selector: (state: unknown) => unknown) => useAppStoreMock(selector) }));

import { StickerPicker } from "./StickerPicker";

const sticker = { id: "sticker", pack_id: "owned", media_file_id: "media", width: 512, height: 512, format: "webp", emoji_tags: ["😀"] };
const secondSticker = { ...sticker, id: "second-sticker", pack_id: "second", emoji_tags: ["🐧"] };
const owned = { id: "owned", owner_id: 7, title: "Mine", slug: "mine", visibility: "private" as const, stickers: [sticker] };
const emptyOwned = { ...owned, id: "empty-owned", title: "Empty owned", stickers: [] };
const foreign = { id: "foreign", owner_id: 8, title: "Installed", slug: "installed", visibility: "public" as const, stickers: [secondSticker] };

describe("StickerPicker pack and sticker creation", () => {
  beforeEach(() => {
    listMock.mockReset();
    createPackMock.mockReset();
    updatePackMock.mockReset();
    addMock.mockReset();
    postFormDataMock.mockReset();
    useAppStoreMock.mockImplementation((selector: (state: unknown) => unknown) => selector({ currentUser: { id: 7 }, authToken: "token" }));
  });

  it("keeps the 292px picker geometry and opens only pack creation from the toolbar plus", async () => {
    listMock.mockResolvedValue([owned]);
    render(<StickerPicker onSend={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByTestId("sticker-picker")).toHaveClass("w-[292px]");
    const button = screen.getByLabelText("Create sticker pack");
    expect(button).toHaveAttribute("title", "Create sticker pack");
    expect(button).toHaveClass("vt-icon-button", "vt-icon-button--compact");
    fireEvent.click(button);
    expect(screen.getByRole("dialog", { name: "Create sticker pack" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Sticker Studio" })).not.toBeInTheDocument();
  });

  it("uses the shared compact search field with tab-specific placeholders and clear action", async () => {
    listMock.mockResolvedValue([owned]);
    render(<StickerPicker onSend={vi.fn()} onClose={vi.fn()} />);

    const stickersInput = await screen.findByRole("textbox", { name: "Search stickers" });
    expect(stickersInput).toHaveAttribute("placeholder", "Search stickers");
    expect(stickersInput).toHaveClass("vt-input", "vt-input--compact", "w-full");
    expect(stickersInput.parentElement).toHaveClass("min-w-0", "flex-1");
    fireEvent.change(stickersInput, { target: { value: "cats" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear sticker search" }));
    expect(stickersInput).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: "Emoji" }));
    const emojiInput = await screen.findByRole("textbox", { name: "Search emoji" });
    expect(emojiInput).toHaveAttribute("placeholder", "Search emoji");
    fireEvent.change(emojiInput, { target: { value: "smile" } });
    expect(screen.getByRole("button", { name: "Clear emoji search" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "GIFs" }));
    const gifInput = await screen.findByRole("textbox", { name: "Search GIFs" });
    expect(gifInput).toHaveAttribute("placeholder", "Search GIFs");
    fireEvent.change(gifInput, { target: { value: "cats" } });
    expect(screen.getByRole("button", { name: "Clear GIF search" })).toBeInTheDocument();
  });

  it("creates one empty pack, refreshes it by canonical id, selects it, and clears search", async () => {
    const created = { id: "new-pack", owner_id: 7, title: "New pack", slug: "new-pack", visibility: "private" as const, stickers: [] };
    listMock.mockResolvedValueOnce([owned]).mockResolvedValueOnce([owned, created]);
    createPackMock.mockResolvedValue(created);
    render(<StickerPicker onSend={vi.fn()} onClose={vi.fn()} />);
    await screen.findByText("Mine");
    fireEvent.change(screen.getByLabelText("Search stickers"), { target: { value: "query" } });
    fireEvent.click(screen.getByLabelText("Create sticker pack"));
    fireEvent.change(screen.getByLabelText("Pack title"), { target: { value: "  New pack  " } });
    fireEvent.click(screen.getByLabelText("Visibility"));
    fireEvent.change(screen.getByLabelText("Visibility"), { target: { value: "private" } });
    fireEvent.click(screen.getByRole("button", { name: "Create pack" }));
    await waitFor(() => expect(createPackMock).toHaveBeenCalledWith("New pack", "private"));
    expect(createPackMock).toHaveBeenCalledTimes(1);
    expect(postFormDataMock).not.toHaveBeenCalled();
    expect(addMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Create sticker pack" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("New pack")).toBeInTheDocument());
    expect(screen.getByLabelText("Search stickers")).toHaveValue("");
  });

  it("keeps pack creation open on failure and prevents duplicate clicks while busy", async () => {
    let rejectCreation!: (reason: Error) => void;
    createPackMock.mockReturnValue(new Promise((_resolve, reject) => { rejectCreation = reject; }));
    listMock.mockResolvedValue([owned]);
    render(<StickerPicker onSend={vi.fn()} onClose={vi.fn()} />);
    await screen.findByText("Mine");
    fireEvent.click(screen.getByLabelText("Create sticker pack"));
    fireEvent.change(screen.getByLabelText("Pack title"), { target: { value: "Keep me" } });
    fireEvent.click(screen.getByRole("button", { name: "Create pack" }));
    fireEvent.click(screen.getByRole("button", { name: "Creating pack…" }));
    expect(createPackMock).toHaveBeenCalledTimes(1);
    rejectCreation(new Error("pack failed"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("pack failed"));
    expect(screen.getByLabelText("Pack title")).toHaveValue("Keep me");
  });

  it("renders only the active pack, with an owned creation tile first", async () => {
    listMock.mockResolvedValue([owned, foreign]);
    render(<StickerPicker onSend={vi.fn()} onClose={vi.fn()} />);
    await screen.findByRole("button", { name: "Add sticker to Mine" });
    expect(screen.getByRole("button", { name: "Sticker 😀" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Installed" }));
    expect(screen.queryByRole("button", { name: "Add sticker to Installed" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sticker 🐧" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sticker 😀" })).not.toBeInTheDocument();
  });

  it("removes the dock gear and edits an owned pack inline", async () => {
    const updated = { ...owned, title: "Renamed", visibility: "unlisted" as const };
    listMock.mockResolvedValueOnce([owned]).mockResolvedValueOnce([updated]);
    updatePackMock.mockResolvedValue(updated);
    render(<StickerPicker onSend={vi.fn()} onClose={vi.fn()} />);
    await screen.findByRole("button", { name: "Add sticker to Mine" });
    expect(screen.queryByLabelText("Manage sticker packs")).not.toBeInTheDocument();
    const edit = screen.getByRole("button", { name: "Edit Mine" });
    expect(edit.previousElementSibling).toHaveTextContent("Mine");
    fireEvent.click(edit);
    expect(screen.getByRole("dialog", { name: "Edit Mine" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Pack title"), { target: { value: "  Renamed  " } });
    fireEvent.change(screen.getByLabelText("Visibility"), { target: { value: "unlisted" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updatePackMock).toHaveBeenCalledWith("owned", { title: "Renamed", visibility: "unlisted" }));
    expect(updatePackMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText("Renamed")).toBeInTheDocument());
  });

  it("does not show edit for a foreign active pack", async () => {
    listMock.mockResolvedValue([foreign]);
    render(<StickerPicker onSend={vi.fn()} onClose={vi.fn()} />);
    await screen.findByText("Installed");
    expect(screen.queryByRole("button", { name: /Edit/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Manage sticker packs")).not.toBeInTheDocument();
  });

  it("does not show the creation tile for a foreign pack or in search results", async () => {
    listMock.mockResolvedValue([owned, foreign]);
    render(<StickerPicker onSend={vi.fn()} onClose={vi.fn()} />);
    await screen.findByRole("button", { name: "Add sticker to Mine" });
    fireEvent.change(screen.getByLabelText("Search stickers"), { target: { value: "🐧" } });
    expect(screen.queryByRole("button", { name: /Add sticker/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sticker 🐧" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search stickers"), { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Add sticker to Mine" })).toBeInTheDocument();
  });

  it("selects a requested pack by id and clears search when opened from preview", async () => {
    const handled = vi.fn();
    listMock.mockResolvedValue([owned, foreign]);
    render(<StickerPicker selectionRequest={{ packId: "foreign", stickerId: "second-sticker", revision: 4 }} onSelectionHandled={handled} onSend={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Installed")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Sticker 🐧" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add sticker to Installed" })).not.toBeInTheDocument();
    expect(handled).toHaveBeenCalledWith(4);
  });

  it("shows an owned empty-pack tile and a normal foreign empty-pack state", async () => {
    listMock.mockResolvedValue([emptyOwned, { ...foreign, stickers: [] }]);
    render(<StickerPicker onSend={vi.fn()} onClose={vi.fn()} />);
    await screen.findByRole("button", { name: "Add sticker to Empty owned" });
    fireEvent.click(screen.getByRole("button", { name: "Installed" }));
    expect(screen.queryByRole("button", { name: "Add sticker to Installed" })).not.toBeInTheDocument();
    expect(screen.getByText("No stickers in this pack")).toBeInTheDocument();
  });

  it("opens locked Sticker Studio from the active owned pack tile and saves to that pack", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const added = { ...sticker, id: "created-sticker" };
    listMock.mockResolvedValueOnce([owned]).mockResolvedValueOnce([{ ...owned, stickers: [sticker, added] }]);
    postFormDataMock.mockResolvedValue({ media_file_id: "media" });
    addMock.mockResolvedValue(added);
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { configurable: true, value: () => ({ clearRect: vi.fn(), drawImage: vi.fn() }) });
    Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", { configurable: true, value: (callback: BlobCallback, type?: string) => callback(new Blob(["normalized"], { type: type ?? "image/png" })) });
    class MockImage { naturalWidth = 827; naturalHeight = 786; onload: (() => void) | null = null; onerror: (() => void) | null = null; set src(_value: string) { queueMicrotask(() => this.onload?.()); } }
    vi.stubGlobal("Image", MockImage);
    render(<StickerPicker onSend={send} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add sticker to Mine" }));
    const studio = screen.getByRole("dialog", { name: "Sticker Studio" });
    expect(within(studio).getByText("Mine")).toBeInTheDocument();
    expect(within(studio).queryByLabelText("Destination")).not.toBeInTheDocument();
    expect(within(studio).queryByText("Create new pack")).not.toBeInTheDocument();
    const source = new File(["source"], "source.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Sticker Studio").querySelector("input[type=file]")!, { target: { files: [source] } });
    fireEvent.click(screen.getByRole("button", { name: "Save and send" }));
    await waitFor(() => expect(addMock).toHaveBeenCalledWith("owned", expect.any(Object)));
    expect(send).toHaveBeenCalledWith("created-sticker");
    expect(send).toHaveBeenCalledTimes(1);
  });
});
