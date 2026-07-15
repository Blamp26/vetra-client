import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmModal } from "./ConfirmModal";

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("ConfirmModal", () => {
  it("exposes the title and description through the shared dialog", () => {
    render(
      <ConfirmModal
        title="Delete room"
        message="This cannot be undone."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole("dialog", { name: "Delete room" })).toHaveAccessibleDescription(
      "This cannot be undone.",
    );
  });

  it("calls the appropriate actions and uses the danger variant", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmModal
        title="Delete room"
        message="This cannot be undone."
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Confirm" })).toHaveClass(
      "vt-button--danger",
    );
  });

  it("keeps focus contained and follows cancel semantics for Escape", () => {
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open</button>
          {open && (
            <ConfirmModal
              title="Confirm"
              message="Proceed?"
              onConfirm={vi.fn()}
              onCancel={() => setOpen(false)}
            />
          )}
        </>
      );
    }

    render(<Harness />);
    const invoker = screen.getByRole("button", { name: "Open" });
    invoker.focus();
    fireEvent.click(invoker);
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(document.activeElement).toBe(cancel);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(invoker);
  });

  it("prevents duplicate confirmation while loading", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmModal
        title="Confirm"
        message="Proceed?"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        isLoading
      />,
    );
    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAttribute("aria-busy", "true");
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
