import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { UserNoteDialog } from "./UserNoteDialog";

describe("UserNoteDialog", () => {
  it("prefills and saves a private note with the length limit", () => {
    const onSave = vi.fn();
    render(<UserNoteDialog initialNote="Existing note" onSave={onSave} onClose={vi.fn()} />);
    const input = screen.getByLabelText("Only visible to you");
    expect(input).toHaveValue("Existing note");
    fireEvent.change(input, { target: { value: "x".repeat(600) } });
    fireEvent.submit(input.closest("form")!);
    expect(onSave).toHaveBeenCalledWith("x".repeat(500));
  });
});
