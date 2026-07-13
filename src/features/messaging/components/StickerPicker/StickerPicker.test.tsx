import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { listMock, useAppStoreMock } = vi.hoisted(() => ({ listMock: vi.fn(), useAppStoreMock: vi.fn() }));
vi.mock("@/api/stickers", () => ({ stickersApi: { list: listMock, createPack: vi.fn(), add: vi.fn() } }));
vi.mock("@/api/base", () => ({ API_BASE_URL: "", postFormData: vi.fn() }));
vi.mock("@/store", () => ({ useAppStore: (selector: (state: unknown) => unknown) => useAppStoreMock(selector) }));

import { StickerPicker } from "./StickerPicker";

const owned = { id: "owned", owner_id: 7, title: "Mine", slug: "mine", visibility: "private" as const, stickers: [] };
const foreign = { id: "foreign", owner_id: 8, title: "Installed", slug: "installed", visibility: "public" as const, stickers: [] };

describe("StickerPicker ownership and geometry", () => {
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
});
