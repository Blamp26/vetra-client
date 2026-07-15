import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { CreatePickerModal } from "./CreatePickerModal";

describe("CreatePickerModal", () => {
  it("is a named dialog with safe initial focus and named close control", () => {
    render(<CreatePickerModal onPickServer={vi.fn()} onPickGroup={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Create" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create server/ })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Close create menu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create group/ })).toBeInTheDocument();
  });

  it("keeps actions and backdrop behavior separate", () => {
    const onPickServer = vi.fn();
    const onPickGroup = vi.fn();
    const onClose = vi.fn();
    render(<CreatePickerModal onPickServer={onPickServer} onPickGroup={onPickGroup} onClose={onClose} />);

    fireEvent.mouseDown(screen.getByTestId("dialog-panel"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Create server/ }));
    expect(onPickServer).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByTestId("dialog-backdrop"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
