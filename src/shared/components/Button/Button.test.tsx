import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("defaults to a native button with type button", () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveAttribute("type", "button");
  });

  it("supports submit buttons and forwards refs", () => {
    const ref = { current: null } as React.RefObject<HTMLButtonElement>;
    render(
      <Button ref={ref} type="submit">
        Submit
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Submit" })).toHaveAttribute(
      "type",
      "submit",
    );
    expect(ref.current).toBe(screen.getByRole("button", { name: "Submit" }));
  });

  it("activates by click and does not activate while disabled or loading", () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <Button onClick={onClick} disabled>
        Save
      </Button>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <Button onClick={onClick} loading>
        Save
      </Button>,
    );
    const loadingButton = screen.getByRole("button", { name: "Save" });
    expect(loadingButton).toBeDisabled();
    expect(loadingButton).toHaveAttribute("aria-busy", "true");
    fireEvent.click(loadingButton);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("applies variants and sizes without removing accessible content while loading", () => {
    const { rerender } = render(
      <Button variant="primary" size="compact">
        Continue
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Continue" });
    expect(button).toHaveClass("vt-button--primary", "vt-button--compact");

    rerender(
      <Button variant="danger" loading>
        Delete
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass(
      "vt-button--danger",
    );
    expect(screen.getByText("Delete")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });
});
