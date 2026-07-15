import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { EmptyPane } from "./EmptyPane";

describe("EmptyPane", () => {
  it("renders semantic content without decorative scaffolding", () => {
    render(<EmptyPane title="Nothing here" description="Try another place." />);
    expect(screen.getByRole("heading", { level: 2, name: "Nothing here" })).toBeInTheDocument();
    expect(screen.getByText("Try another place.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/kicker/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("supports density, alignment, level, attributes, action and refs", () => {
    const ref = { current: null } as React.RefObject<HTMLDivElement>;
    const onClick = vi.fn();
    render(
      <EmptyPane
        ref={ref}
        title="Compact"
        density="compact"
        align="start"
        titleLevel={3}
        data-testid="empty-pane"
        className="custom-empty"
        action={<button onClick={onClick}>Do it</button>}
      />,
    );
    const pane = screen.getByTestId("empty-pane");
    expect(ref.current).toBe(pane);
    expect(pane).toHaveAttribute("data-density", "compact");
    expect(pane).toHaveAttribute("data-align", "start");
    expect(pane).toHaveClass("custom-empty");
    expect(screen.getByRole("heading", { level: 3, name: "Compact" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Do it" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
