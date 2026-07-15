import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

function TestDialog({
  onClose = vi.fn(),
  closeOnBackdrop = true,
  closeOnEscape = true,
  initialFocusRef,
}: {
  onClose?: () => void;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement>;
}) {
  return (
    <Dialog
      open
      onClose={onClose}
      labelledBy="dialog-title"
      describedBy="dialog-description"
      closeOnBackdrop={closeOnBackdrop}
      closeOnEscape={closeOnEscape}
      initialFocusRef={initialFocusRef}
    >
      <h2 id="dialog-title">Dialog title</h2>
      <p id="dialog-description">Dialog description</p>
      <button type="button">First</button>
      <button type="button">Last</button>
    </Dialog>
  );
}

describe("Dialog", () => {
  it("renders the accessible dialog through a portal and locks body scroll", () => {
    render(<TestDialog />);
    const dialog = screen.getByRole("dialog", { name: "Dialog title" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "dialog-title");
    expect(dialog).toHaveAttribute("aria-describedby", "dialog-description");
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("focuses the first control by default and keeps Tab within the dialog", () => {
    render(<TestDialog />);
    const first = screen.getByRole("button", { name: "First" });
    const last = screen.getByRole("button", { name: "Last" });
    expect(document.activeElement).toBe(first);

    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("uses the provided initial focus target", () => {
    const initialFocusRef = { current: null } as React.RefObject<HTMLElement>;
    function Harness() {
      return (
        <Dialog
          open
          onClose={vi.fn()}
          labelledBy="title"
          initialFocusRef={initialFocusRef}
        >
          <h2 id="title">Focus dialog</h2>
          <button ref={initialFocusRef as React.RefObject<HTMLButtonElement>}>
            Preferred
          </button>
          <button>Other</button>
        </Dialog>
      );
    }
    render(<Harness />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Preferred" }));
  });

  it("handles Escape and backdrop policy", () => {
    const onClose = vi.fn();
    render(<TestDialog onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.mouseDown(screen.getByTestId("dialog-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(2);

    onClose.mockClear();
    cleanup();
    render(<TestDialog onClose={onClose} closeOnBackdrop={false} closeOnEscape={false} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fireEvent.mouseDown(screen.getByTestId("dialog-backdrop"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("restores focus and body scroll when the dialog closes", () => {
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open</button>
          {open && (
            <Dialog
              open
              onClose={() => setOpen(false)}
              labelledBy="title"
            >
              <h2 id="title">Closable</h2>
              <button onClick={() => setOpen(false)}>Close</button>
            </Dialog>
          )}
        </>
      );
    }

    render(<Harness />);
    const invoker = screen.getByRole("button", { name: "Open" });
    invoker.focus();
    fireEvent.click(invoker);
    const closeButton = screen.getByRole("button", { name: "Close" });
    fireEvent.click(closeButton);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(invoker);
    expect(document.body.style.overflow).toBe("");
  });

  it("gives nested dialogs exclusive Escape and focus ownership", () => {
    function NestedHarness() {
      const [childOpen, setChildOpen] = React.useState(false);
      const [parentOpen, setParentOpen] = React.useState(true);
      return (
        <>
          <button>Outside</button>
          {parentOpen && (
            <Dialog open onClose={() => setParentOpen(false)} labelledBy="parent-title">
              <h2 id="parent-title">Parent</h2>
              <button onClick={() => setChildOpen(true)}>Open child</button>
              {childOpen && (
                <Dialog open onClose={() => setChildOpen(false)} labelledBy="child-title">
                  <h2 id="child-title">Child</h2>
                  <button>Child action</button>
                </Dialog>
              )}
            </Dialog>
          )}
        </>
      );
    }

    render(<NestedHarness />);
    const openChild = screen.getByRole("button", { name: "Open child" });
    openChild.focus();
    fireEvent.click(openChild);
    const child = screen.getByRole("dialog", { name: "Child" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Child action" }));
    fireEvent.keyDown(child, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Child" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Parent" })).toBeInTheDocument();
    expect(document.activeElement).toBe(openChild);
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(screen.getByRole("dialog", { name: "Parent" }), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Parent" })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
  });
});
