import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import {
  Combobox,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxInput,
  ComboboxList,
  ComboboxOption,
} from "./Combobox";

function TestCombobox({
  initialActive,
  initialOpen = true,
  autoFocus = false,
}: { initialActive?: string; initialOpen?: boolean; autoFocus?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  const [activeValue, setActiveValue] = useState<string | undefined>(initialActive);
  return (
    <Combobox open={open} onOpenChange={setOpen} activeValue={activeValue} onActiveValueChange={setActiveValue} autoFocus={autoFocus}>
      <ComboboxInput aria-label="Search" />
      <ComboboxList aria-label="Results">
        <ComboboxOption value="one" onSelect={vi.fn()}>One</ComboboxOption>
        <ComboboxOption value="two" onSelect={vi.fn()}>Two</ComboboxOption>
        <ComboboxOption value="three" disabled onSelect={vi.fn()}>Three</ComboboxOption>
      </ComboboxList>
    </Combobox>
  );
}

describe("Combobox", () => {
  it("connects the input, listbox, and active option with combobox semantics", () => {
    render(<TestCombobox initialActive="one" />);
    const input = screen.getByRole("combobox", { name: "Search" });
    const list = screen.getByRole("listbox", { name: "Results" });
    const option = screen.getByRole("option", { name: "One" });

    expect(input).toHaveAttribute("aria-autocomplete", "list");
    expect(input).toHaveAttribute("aria-haspopup", "listbox");
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-controls", list.id);
    expect(input).toHaveAttribute("aria-activedescendant", option.id);
    expect(option).toHaveAttribute("aria-selected", "true");
  });

  it("opens and navigates enabled options with the input keyboard", () => {
    render(<TestCombobox initialOpen={false} />);
    const input = screen.getByRole("combobox");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-activedescendant", expect.stringContaining(""));
    expect(screen.getByRole("option", { name: "One" })).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: "Two" })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: "One" })).toHaveAttribute("aria-selected", "true");
  });

  it("skips disabled options and supports Home and End", () => {
    render(<TestCombobox initialActive="two" />);
    const input = screen.getByRole("combobox");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: "One" })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "End" });
    expect(screen.getByRole("option", { name: "Two" })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "Home" });
    expect(screen.getByRole("option", { name: "One" })).toHaveAttribute("aria-selected", "true");
  });

  it("selects once with Enter and Space, while Escape only closes suggestions", () => {
    const onSelect = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(true);
      const [active, setActive] = useState<string | undefined>("one");
      return (
        <Combobox open={open} onOpenChange={setOpen} activeValue={active} onActiveValueChange={setActive}>
          <ComboboxInput aria-label="Search" />
          <ComboboxList><ComboboxOption value="one" onSelect={onSelect}>One</ComboboxOption></ComboboxList>
        </Combobox>
      );
    }
    render(<Harness />);
    const input = screen.getByRole("combobox");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Escape" });
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("closes on Escape or outside pointer interaction without selecting", () => {
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    function Harness() {
      return (
        <Combobox open onOpenChange={onOpenChange} activeValue="one">
          <ComboboxInput aria-label="Search" />
          <ComboboxList><ComboboxOption value="one" onSelect={onSelect}>One</ComboboxOption></ComboboxList>
        </Combobox>
      );
    }
    render(<Harness />);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("focuses the first enabled option when autoFocus is enabled", () => {
    render(<TestCombobox autoFocus />);
    expect(screen.getByRole("option", { name: "One" })).toHaveFocus();
  });

  it("connects groups and labels, and preserves independent instances", () => {
    render(
      <>
        <Combobox open onOpenChange={vi.fn()}>
          <ComboboxInput aria-label="First" />
          <ComboboxList>
            <ComboboxGroup>
              <ComboboxGroupLabel>Users</ComboboxGroupLabel>
              <ComboboxOption value="user">User</ComboboxOption>
            </ComboboxGroup>
          </ComboboxList>
        </Combobox>
        <Combobox open onOpenChange={vi.fn()}>
          <ComboboxInput aria-label="Second" />
          <ComboboxList><ComboboxOption value="user">Other user</ComboboxOption></ComboboxList>
        </Combobox>
      </>,
    );
    expect(screen.getAllByRole("group")).toHaveLength(1);
    expect(screen.getByRole("group", { name: "Users" })).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(screen.getAllByRole("combobox")[0]).toHaveAttribute("aria-controls");
    expect(screen.getAllByRole("combobox")[0]).not.toHaveAttribute("aria-controls", screen.getAllByRole("combobox")[1].getAttribute("aria-controls"));
  });
});
