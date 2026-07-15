import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { Tab, TabList, TabPanel, Tabs } from "./Tabs";

function Demo({ orientation = "horizontal", includeDisabled = false }: { orientation?: "horizontal" | "vertical"; includeDisabled?: boolean }) {
  const [value, setValue] = React.useState("one");

  return (
    <Tabs value={value} onValueChange={setValue} orientation={orientation}>
      <TabList aria-label="Demo sections">
        <Tab value="one">One</Tab>
        {includeDisabled && <Tab value="disabled" disabled>Disabled</Tab>}
        <Tab value="two">Two</Tab>
        <Tab value="three">Three</Tab>
      </TabList>
      <TabPanel value="one">Panel one</TabPanel>
      <TabPanel value="two">Panel two</TabPanel>
      <TabPanel value="three">Panel three</TabPanel>
    </Tabs>
  );
}

describe("Tabs", () => {
  it("exposes tablist orientation, selection, and connected panels", () => {
    render(<Demo />);
    const tablist = screen.getByRole("tablist", { name: "Demo sections" });
    const one = screen.getByRole("tab", { name: "One" });
    const panel = screen.getByRole("tabpanel");

    expect(tablist).toHaveAttribute("aria-orientation", "horizontal");
    expect(one).toHaveAttribute("aria-selected", "true");
    expect(one).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Two" })).toHaveAttribute("tabindex", "-1");
    expect(one).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", one.id);
    expect(screen.getByText("Panel one")).toBeVisible();
    expect(screen.queryByText("Panel two")).not.toBeInTheDocument();
    expect(document.querySelector('[role="tabpanel"][hidden]')).toBeInTheDocument();
  });

  it("selects and focuses tabs with click, arrows, Home, End, and wrapping", () => {
    render(<Demo />);
    const one = screen.getByRole("tab", { name: "One" });
    const two = screen.getByRole("tab", { name: "Two" });
    const three = screen.getByRole("tab", { name: "Three" });

    fireEvent.click(two);
    expect(two).toHaveAttribute("aria-selected", "true");
    two.focus();
    expect(two).toHaveFocus();

    fireEvent.keyDown(two, { key: "ArrowRight" });
    expect(three).toHaveFocus();
    expect(three).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(three, { key: "ArrowRight" });
    expect(one).toHaveFocus();
    fireEvent.keyDown(one, { key: "ArrowLeft" });
    expect(three).toHaveFocus();

    fireEvent.keyDown(three, { key: "Home" });
    expect(one).toHaveFocus();
    fireEvent.keyDown(one, { key: "End" });
    expect(three).toHaveFocus();
  });

  it("uses vertical arrow keys and skips disabled tabs", () => {
    render(<Demo orientation="vertical" includeDisabled />);
    const one = screen.getByRole("tab", { name: "One" });
    const disabled = screen.getByRole("tab", { name: "Disabled" });
    const two = screen.getByRole("tab", { name: "Two" });

    expect(screen.getByRole("tablist")).toHaveAttribute("aria-orientation", "vertical");
    fireEvent.keyDown(one, { key: "ArrowDown" });
    expect(two).toHaveFocus();
    expect(disabled).toBeDisabled();

    fireEvent.keyDown(two, { key: "ArrowUp" });
    expect(one).toHaveFocus();

    fireEvent.keyDown(one, { key: "PageDown" });
    expect(one).toHaveFocus();
    expect(one).toHaveAttribute("aria-selected", "true");
  });

  it("forwards refs and generates unique relationships for multiple instances", () => {
    const firstRef = { current: null } as React.RefObject<HTMLButtonElement>;
    const secondRef = { current: null } as React.RefObject<HTMLButtonElement>;
    render(
      <>
        <Tabs value="one" onValueChange={vi.fn()}>
          <TabList aria-label="First"><Tab ref={firstRef} value="one">One</Tab></TabList>
          <TabPanel value="one">First panel</TabPanel>
        </Tabs>
        <Tabs value="one" onValueChange={vi.fn()}>
          <TabList aria-label="Second"><Tab ref={secondRef} value="one">One</Tab></TabList>
          <TabPanel value="one">Second panel</TabPanel>
        </Tabs>
      </>,
    );

    const tabs = screen.getAllByRole("tab", { name: "One" });
    expect(firstRef.current).toBe(tabs[0]);
    expect(secondRef.current).toBe(tabs[1]);
    expect(tabs[0].id).not.toBe(tabs[1].id);
  });
});
