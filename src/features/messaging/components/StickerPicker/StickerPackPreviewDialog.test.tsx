import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMock, listMock, installMock, useAppStoreMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  listMock: vi.fn(),
  installMock: vi.fn(),
  useAppStoreMock: vi.fn(),
}));

vi.mock("@/api/stickers", () => ({ stickersApi: { get: getMock, list: listMock, install: installMock } }));
vi.mock("@/api/base", () => ({ API_BASE_URL: "/api/v1" }));
vi.mock("@/store", () => ({ useAppStore: (selector: (state: unknown) => unknown) => useAppStoreMock(selector) }));
vi.mock("@/shared/components/AuthenticatedImage", () => ({
  AuthenticatedImage: ({ alt }: { alt?: string }) => <div data-testid="authenticated-sticker-image" aria-label={alt} />,
}));

import { StickerPackPreviewDialog } from "./StickerPackPreviewDialog";

const sticker = { id: "sticker-1", pack_id: "foreign", media_file_id: "media-1", width: 512, height: 512, format: "webp", emoji_tags: ["😀"] };
const pack = { id: "foreign", owner_id: 8, title: "Foreign pack", slug: "foreign", visibility: "public" as const, stickers: [sticker] };
const request = { packId: "foreign", stickerId: "sticker-1", revision: 1 };

describe("StickerPackPreviewDialog", () => {
  beforeEach(() => {
    getMock.mockReset();
    listMock.mockReset();
    installMock.mockReset();
    useAppStoreMock.mockImplementation((selector: (state: unknown) => unknown) => selector({ currentUser: { id: 7 } }));
  });

  it("loads the canonical pack once, uses authenticated tiles, highlights the clicked sticker, and offers installation", async () => {
    getMock.mockResolvedValue(pack);
    listMock.mockResolvedValue([]);
    render(<StickerPackPreviewDialog request={request} onClose={vi.fn()} onOpenPack={vi.fn()} />);
    expect(screen.getByText("Loading sticker pack…")).toBeInTheDocument();
    expect(await screen.findByText("Foreign pack")).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(listMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("sticker-pack-preview-grid")).toHaveClass("grid-cols-5");
    expect(screen.getByTestId("authenticated-sticker-image")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add stickers" })).toBeInTheDocument();
  });

  it("installs exactly once, refreshes, and opens the selected pack", async () => {
    const onOpenPack = vi.fn();
    getMock.mockResolvedValue(pack);
    listMock.mockResolvedValueOnce([]).mockResolvedValueOnce([pack]);
    installMock.mockResolvedValue({});
    render(<StickerPackPreviewDialog request={request} onClose={vi.fn()} onOpenPack={onOpenPack} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add stickers" }));
    fireEvent.click(screen.getByRole("button", { name: "Adding…" }));
    await waitFor(() => expect(installMock).toHaveBeenCalledWith("foreign"));
    expect(installMock).toHaveBeenCalledTimes(1);
    expect(listMock).toHaveBeenCalledTimes(2);
    expect(onOpenPack).toHaveBeenCalledWith("foreign");
  });

  it("shows Open pack for owned or installed packs and only Close for unavailable packs", async () => {
    getMock.mockResolvedValue({ ...pack, owner_id: 7 });
    listMock.mockResolvedValue([pack]);
    const onOpenPack = vi.fn();
    render(<StickerPackPreviewDialog request={request} onClose={vi.fn()} onOpenPack={onOpenPack} />);
    fireEvent.click(await screen.findByRole("button", { name: "Open pack" }));
    expect(onOpenPack).toHaveBeenCalledWith("foreign");
    expect(screen.queryByRole("button", { name: "Add stickers" })).not.toBeInTheDocument();

    cleanup();
    getMock.mockRejectedValueOnce(new Error("forbidden"));
    const onClose = vi.fn();
    render(<StickerPackPreviewDialog request={{ ...request, revision: 2 }} onClose={onClose} onOpenPack={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Sticker pack is unavailable");
    expect(screen.queryByRole("button", { name: "Add stickers" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });
});
