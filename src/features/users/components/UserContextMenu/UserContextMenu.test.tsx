import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { UserContextMenu } from "./UserContextMenu";

describe("UserContextMenu", () => {
  it("portals a remote menu and prevents outside placement overflow", () => {
    const onClose = vi.fn();
    render(<UserContextMenu target={{ profileId: "user-public", copyId: "user-public", username: "Alice", kind: "remote" }} invocation={{ mode: "pointer", clientX: window.innerWidth - 2, clientY: window.innerHeight - 2 }} onClose={onClose} volume={100} muted={false} onVolumeChange={vi.fn()} onMutedChange={vi.fn()} onCopyUsername={vi.fn()} onCopyId={vi.fn()} />);
    const menu = screen.getByTestId("user-context-menu");
    expect(menu.parentElement).toBe(document.body);
    expect(menu).toHaveClass("vt-user-context-menu");
    fireEvent.contextMenu(document.body);
    expect(onClose).toHaveBeenCalled();
  });

  it("uses pointer coordinates and flips at the right edge", async () => {
    render(<UserContextMenu target={{ profileId: "u", copyId: "u", username: "Alice", kind: "remote" }} invocation={{ mode: "pointer", clientX: 100, clientY: 120 }} onClose={vi.fn()} volume={100} muted={false} onVolumeChange={vi.fn()} onMutedChange={vi.fn()} onCopyUsername={vi.fn()} onCopyId={vi.fn()} />);
    const menu = screen.getByTestId("user-context-menu");
    vi.spyOn(menu, "getBoundingClientRect").mockReturnValue({ width: 200, height: 120, left: 0, top: 0, right: 200, bottom: 120, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    await waitFor(() => expect(menu).toHaveStyle({ left: "108px", top: "112px" }));
  });

  it("exposes only profile and copy actions for self", () => {
    render(<UserContextMenu target={{ profileId: "self", copyId: "self", username: "Me", kind: "self" }} invocation={{ mode: "keyboard", anchorRect: new DOMRect(20, 20, 100, 40) }} onClose={vi.fn()} volume={100} muted={false} onVolumeChange={vi.fn()} onMutedChange={vi.fn()} onCopyUsername={vi.fn()} onCopyId={vi.fn()} />);
    expect(screen.getByRole("menuitem", { name: "View profile" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Copy user ID" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Stop call" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("User volume")).not.toBeInTheDocument();
  });
});
