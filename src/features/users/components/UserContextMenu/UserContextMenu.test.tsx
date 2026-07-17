import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { UserContextMenu } from "./UserContextMenu";

describe("UserContextMenu", () => {
  const remoteTarget = { profileId: "user-public" as const, copyId: "user-public", username: "Alice", kind: "remote" as const };
  const selfTarget = { profileId: "self" as const, copyId: "self", username: "Me", kind: "self" as const };

  function renderRemote(overrides: Partial<ComponentProps<typeof UserContextMenu>> = {}) {
    return render(<UserContextMenu target={remoteTarget} invocation={{ mode: "pointer", clientX: 100, clientY: 120 }} onClose={vi.fn()} volume={100} muted={false} onVolumeChange={vi.fn()} onMutedChange={vi.fn()} onCopyUsername={vi.fn()} onCopyId={vi.fn()} {...overrides} />);
  }

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
    renderRemote();
    const menu = screen.getByTestId("user-context-menu");
    vi.spyOn(menu, "getBoundingClientRect").mockReturnValue({ width: 200, height: 120, left: 0, top: 0, right: 200, bottom: 120, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    await waitFor(() => expect(menu).toHaveStyle({ left: "108px", top: "112px" }));
  });

  it("exposes only profile and copy actions for self", () => {
    render(<UserContextMenu target={selfTarget} invocation={{ mode: "keyboard", anchorRect: new DOMRect(20, 20, 100, 40) }} onClose={vi.fn()} volume={100} muted={false} onVolumeChange={vi.fn()} onMutedChange={vi.fn()} onCopyUsername={vi.fn()} onCopyId={vi.fn()} />);
    expect(screen.getByRole("menuitem", { name: "View profile" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Copy user ID" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Stop call" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("User volume")).not.toBeInTheDocument();
  });

  it("does not autofocus a pointer-opened menu", () => {
    renderRemote();
    const profile = screen.getByRole("menuitem", { name: "View profile" });
    expect(profile).not.toHaveFocus();
    expect(profile).toHaveAttribute("tabindex", "-1");
    expect(profile).not.toHaveAttribute("data-highlighted");
  });

  it("autofocuses the first action for keyboard invocation", async () => {
    render(<UserContextMenu target={selfTarget} invocation={{ mode: "keyboard", anchorRect: new DOMRect(20, 20, 100, 40) }} onClose={vi.fn()} volume={100} muted={false} onVolumeChange={vi.fn()} onMutedChange={vi.fn()} onCopyUsername={vi.fn()} onCopyId={vi.fn()} />);
    const profile = screen.getByRole("menuitem", { name: "View profile" });
    await waitFor(() => expect(profile).toHaveFocus());
    expect(profile).toHaveAttribute("data-highlighted", "true");
    expect(profile).toHaveAttribute("tabindex", "0");
  });

  it("closes pointer and keyboard menus from Escape exactly once", async () => {
    const pointerClose = vi.fn();
    renderRemote({ onClose: pointerClose });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(pointerClose).toHaveBeenCalledTimes(1);

    const keyboardClose = vi.fn();
    render(<UserContextMenu target={selfTarget} invocation={{ mode: "keyboard", anchorRect: new DOMRect(20, 20, 100, 40) }} onClose={keyboardClose} volume={100} muted={false} onVolumeChange={vi.fn()} onMutedChange={vi.fn()} onCopyUsername={vi.fn()} onCopyId={vi.fn()} />);
    const profiles = screen.getAllByRole("menuitem", { name: "View profile" });
    const profile = profiles[profiles.length - 1]!;
    await waitFor(() => expect(profile).toHaveFocus());
    fireEvent.keyDown(profile, { key: "Escape" });
    expect(keyboardClose).toHaveBeenCalledTimes(1);
  });

  it("updates the active row on hover", () => {
    renderRemote();
    const note = screen.getByRole("menuitem", { name: "Add note" });
    fireEvent.mouseEnter(note);
    expect(note).toHaveAttribute("data-highlighted", "true");
  });

  it("keeps the mute indicator slot stable and keeps the menu open", () => {
    const onMutedChange = vi.fn();
    const view = renderRemote({ onMutedChange });
    const mute = screen.getByRole("menuitem", { name: "Mute user" });
    const slot = mute.querySelector(".vt-user-context-menu__leading-icon")!;
    expect(slot).toBeInTheDocument();
    expect(slot).toBeEmptyDOMElement();
    expect(mute).toHaveAttribute("aria-checked", "false");
    fireEvent.click(mute);
    expect(onMutedChange).toHaveBeenCalledWith(true);
    expect(screen.getByTestId("user-context-menu")).toBeInTheDocument();

    view.rerender(<UserContextMenu target={remoteTarget} invocation={{ mode: "pointer", clientX: 100, clientY: 120 }} onClose={vi.fn()} volume={100} muted onVolumeChange={vi.fn()} onMutedChange={onMutedChange} onCopyUsername={vi.fn()} onCopyId={vi.fn()} />);
    const mutedRow = screen.getByRole("menuitem", { name: "Mute user" });
    expect(mutedRow).toHaveAttribute("aria-checked", "true");
    expect(mutedRow.querySelector(".vt-user-context-menu__leading-icon svg")).toBeInTheDocument();
    expect(mutedRow.querySelector(".vt-user-context-menu__label")).toHaveTextContent("Mute user");
  });

  it("keeps labels bounded and slider updates immediate", () => {
    const onVolumeChange = vi.fn();
    renderRemote({ onVolumeChange, volume: 37 });
    const menu = screen.getByTestId("user-context-menu");
    expect(menu).toHaveClass("vt-user-context-menu");
    expect(menu.querySelectorAll(".vt-user-context-menu__label")).toHaveLength(5);
    const slider = screen.getByRole("slider", { name: "User volume" });
    expect(slider).toHaveValue("37");
    fireEvent.change(slider, { target: { value: "42" } });
    expect(onVolumeChange).toHaveBeenCalledWith(42);
    expect(screen.getByTestId("user-context-menu")).toBeInTheDocument();
  });
});
