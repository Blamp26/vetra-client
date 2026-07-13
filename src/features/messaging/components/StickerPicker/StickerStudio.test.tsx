import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StickerStudio } from "./StickerStudio";

const file = new File([new Uint8Array([1, 2, 3])], "sticker.png", { type: "image/png" });
const pack = { id: "owned", owner_id: 7, title: "Owned", slug: "owned", visibility: "private" as const, stickers: [] };
const foreign = { ...pack, id: "foreign", owner_id: 8, title: "Installed" };

function selectImage() { fireEvent.change(screen.getByLabelText(/sticker studio/i).querySelector("input[type=file]")!, { target: { files: [file] } }); }

describe("StickerStudio first-pack destination", () => {
  it("starts in create-new-pack mode without an empty owned select", () => {
    render(<StickerStudio packs={[]} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByText("Create new pack")).toBeInTheDocument();
    expect(screen.getByLabelText("Pack title")).toBeInTheDocument();
    expect(screen.getByLabelText("Visibility")).toHaveValue("private");
    expect(screen.queryByLabelText("Destination")).not.toBeInTheDocument();
  });

  it("validates a blank title before submission", () => {
    const save = vi.fn(); render(<StickerStudio packs={[]} onClose={vi.fn()} onSave={save} />); selectImage();
    expect(screen.getByRole("button", { name: "Save and send" })).toBeDisabled();
    expect(screen.getByText("Pack title is required")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("preserves new-pack form state while switching destinations", () => {
    render(<StickerStudio packs={[pack]} onClose={vi.fn()} onSave={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "__new_pack__" } });
    fireEvent.change(screen.getByLabelText("Pack title"), { target: { value: "  My stickers  " } });
    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "owned" } });
    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "__new_pack__" } });
    expect(screen.getByLabelText("Pack title")).toHaveValue("  My stickers  ");
  });

  it("keeps the studio open and preserves fields after a save failure", async () => {
    const save = vi.fn().mockRejectedValue(new Error("network error")); const close = vi.fn();
    render(<StickerStudio packs={[]} onClose={close} onSave={save} />);
    fireEvent.change(screen.getByLabelText("Pack title"), { target: { value: "My stickers" } }); selectImage();
    fireEvent.click(screen.getByRole("button", { name: "Save and send" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("network error"));
    expect(close).not.toHaveBeenCalled(); expect(screen.getByLabelText("Pack title")).toHaveValue("My stickers");
    expect(screen.getByRole("button", { name: "Save and send" })).toBeEnabled();
  });

  it("closes only after a successful save", async () => {
    const save = vi.fn().mockResolvedValue(undefined); const close = vi.fn();
    render(<StickerStudio packs={[pack]} onClose={close} onSave={save} />); selectImage();
    fireEvent.click(screen.getByRole("button", { name: "Save and send" }));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith(file, { kind: "existing", packId: "owned" }, ["😀"]);
  });

  it("does not expose foreign packs when the caller supplies only owned destinations", () => {
    render(<StickerStudio packs={[pack]} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole("option", { name: "Owned" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Installed" })).not.toBeInTheDocument();
    void foreign;
  });
});
