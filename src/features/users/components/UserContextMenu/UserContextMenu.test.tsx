import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { UserContextMenu } from "./UserContextMenu";

describe("UserContextMenu", () => {
  it("portals a remote menu and prevents outside placement overflow", () => {
    const onClose = vi.fn();
    render(<UserContextMenu target={{ id: "user-public", username: "Alice", kind: "remote" }} x={window.innerWidth - 2} y={window.innerHeight - 2} onClose={onClose} volume={100} muted={false} onVolumeChange={vi.fn()} onMutedChange={vi.fn()} />);
    const menu = screen.getByTestId("user-context-menu");
    expect(menu.parentElement).toBe(document.body);
    expect(menu).toHaveClass("vt-user-context-menu");
    fireEvent.contextMenu(document.body);
    expect(onClose).toHaveBeenCalled();
  });

  it("exposes only profile and copy actions for self", () => {
    render(<UserContextMenu target={{ id: "self", username: "Me", kind: "self" }} x={20} y={20} onClose={vi.fn()} volume={100} muted={false} onVolumeChange={vi.fn()} onMutedChange={vi.fn()} />);
    expect(screen.getByRole("menuitem", { name: "View profile" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Copy user ID" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Stop call" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("User volume")).not.toBeInTheDocument();
  });
});
