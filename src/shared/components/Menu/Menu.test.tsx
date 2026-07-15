import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Menu, MenuItem, MenuSeparator } from "./Menu";

function Demo({ onEscape = vi.fn(), onRight = vi.fn(), onLeft = vi.fn() }: { onEscape?: () => void; onRight?: () => void; onLeft?: () => void }) {
  const [value, setValue] = useState("one");
  return (
    <Menu activeValue={value} onActiveValueChange={setValue} onEscape={onEscape} onArrowRight={onRight} onArrowLeft={onLeft} aria-label="Actions" autoFocus>
      <MenuItem value="one" onSelect={vi.fn()}>One</MenuItem>
      <MenuItem value="disabled" disabled>Disabled</MenuItem>
      <MenuSeparator />
      <MenuItem value="two" onSelect={vi.fn()}>Two</MenuItem>
      <MenuItem value="three" onSelect={vi.fn()} hasSubmenu expanded controls="submenu-id">Three</MenuItem>
    </Menu>
  );
}

describe("Menu", () => {
  it("exposes menu semantics, active roving tab index, and relationships", async () => {
    render(<Demo />);
    const menu = screen.getByRole("menu", { name: "Actions" });
    expect(menu).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "One" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("menuitem", { name: "Two" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("menuitem", { name: "Disabled" })).toBeDisabled();
    expect(screen.getByRole("separator")).not.toHaveAttribute("tabindex");
    expect(screen.getByRole("menuitem", { name: "Three" })).toHaveAttribute("aria-haspopup", "menu");
    expect(screen.getByRole("menuitem", { name: "Three" })).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "One" })).toHaveFocus());
  });

  it("navigates, wraps, skips disabled items, and activates once", () => {
    const select = vi.fn();
    function Harness() {
      const [value, setValue] = useState("one");
      return <Menu activeValue={value} onActiveValueChange={setValue} autoFocus>
        <MenuItem value="one" onSelect={select}>One</MenuItem>
        <MenuItem value="disabled" disabled>Disabled</MenuItem>
        <MenuItem value="two" onSelect={select}>Two</MenuItem>
        <MenuItem value="three" onSelect={select}>Three</MenuItem>
      </Menu>;
    }
    render(<Harness />);
    const menu = screen.getByRole("menu");
    const one = screen.getByRole("menuitem", { name: "One" });
    const two = screen.getByRole("menuitem", { name: "Two" });
    const three = screen.getByRole("menuitem", { name: "Three" });
    fireEvent.keyDown(one, { key: "ArrowDown" });
    expect(two).toHaveFocus();
    fireEvent.keyDown(two, { key: "ArrowDown" });
    expect(three).toHaveFocus();
    fireEvent.keyDown(three, { key: "ArrowDown" });
    expect(one).toHaveFocus();
    fireEvent.keyDown(one, { key: "ArrowUp" });
    expect(three).toHaveFocus();
    fireEvent.keyDown(three, { key: "Home" });
    expect(one).toHaveFocus();
    fireEvent.keyDown(one, { key: "End" });
    expect(three).toHaveFocus();
    fireEvent.keyDown(three, { key: "Enter" });
    expect(select).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(three, { key: " " });
    expect(select).toHaveBeenCalledTimes(2);
    expect(menu).toHaveAttribute("role", "menu");
  });

  it("updates active value from pointer and focus and handles directional callbacks", () => {
    const right = vi.fn();
    const left = vi.fn();
    render(<Demo onRight={right} onLeft={left} />);
    const two = screen.getByRole("menuitem", { name: "Two" });
    fireEvent.mouseEnter(two);
    expect(two).toHaveAttribute("data-highlighted", "true");
    fireEvent.focus(two);
    fireEvent.keyDown(two, { key: "ArrowRight" });
    fireEvent.keyDown(two, { key: "ArrowLeft" });
    expect(right).toHaveBeenCalledOnce();
    expect(left).toHaveBeenCalledOnce();
  });

  it("supports Escape, forwarded refs, and isolated instances", () => {
    const escape = vi.fn();
    function Refs() {
      const menuRef = useRef<HTMLDivElement>(null);
      const itemRef = useRef<HTMLButtonElement>(null);
      return <>
        <Menu ref={menuRef} activeValue="one" onActiveValueChange={vi.fn()} onEscape={escape}>
          <MenuItem ref={itemRef} value="one">One</MenuItem>
        </Menu>
        <Menu activeValue="two" onActiveValueChange={vi.fn()}><MenuItem value="two">Two</MenuItem></Menu>
        <output data-testid="refs">{String(Boolean(menuRef.current || itemRef.current))}</output>
      </>;
    }
    render(<Refs />);
    const one = screen.getByRole("menuitem", { name: "One" });
    fireEvent.keyDown(one, { key: "Escape" });
    expect(escape).toHaveBeenCalledOnce();
    expect(screen.getAllByRole("menu")).toHaveLength(2);
  });

  it("focuses the container when there are no enabled items", async () => {
    render(<Menu activeValue="none" onActiveValueChange={vi.fn()} autoFocus><MenuItem value="none" disabled>None</MenuItem></Menu>);
    await waitFor(() => expect(screen.getByRole("menu")).toHaveFocus());
  });

  it("falls back from an undefined active value without activating an item", async () => {
    const onActiveValueChange = vi.fn();
    const onSelect = vi.fn();
    render(
      <Menu activeValue={undefined} onActiveValueChange={onActiveValueChange} autoFocus>
        <MenuItem value="disabled" disabled onSelect={onSelect}>Disabled</MenuItem>
        <MenuItem value="first" onSelect={onSelect}>First</MenuItem>
        <MenuItem value="second" onSelect={onSelect}>Second</MenuItem>
      </Menu>,
    );
    const first = screen.getByRole("menuitem", { name: "First" });
    await waitFor(() => expect(first).toHaveFocus());
    expect(onActiveValueChange).toHaveBeenCalledWith("first");
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Second" })).toHaveFocus();
  });

  it("falls back from an invalid value while preserving a valid value", async () => {
    const onInvalidActiveChange = vi.fn();
    const onValidActiveChange = vi.fn();
    const { unmount } = render(
      <Menu activeValue="missing" onActiveValueChange={onInvalidActiveChange} autoFocus>
        <MenuItem value="first">First</MenuItem>
        <MenuItem value="second">Second</MenuItem>
      </Menu>,
    );
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "First" })).toHaveFocus());
    expect(onInvalidActiveChange).toHaveBeenCalledWith("first");

    unmount();
    render(
      <Menu activeValue="second" onActiveValueChange={onValidActiveChange} autoFocus>
        <MenuItem value="first">First</MenuItem>
        <MenuItem value="second">Second</MenuItem>
      </Menu>,
    );
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Second" })).toHaveFocus());
    expect(onValidActiveChange).toHaveBeenCalledWith("second");
  });

  it("removes an unmounted item from navigation", () => {
    function Harness() {
      const [show, setShow] = useState(true);
      const [value, setValue] = useState("one");
      return <><button onClick={() => setShow(false)}>Remove</button><Menu activeValue={value} onActiveValueChange={setValue}>
        <MenuItem value="one">One</MenuItem>
        {show && <MenuItem value="two">Two</MenuItem>}
      </Menu></>;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.queryByRole("menuitem", { name: "Two" })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "One" }), { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "One" })).toHaveFocus();
  });
});
