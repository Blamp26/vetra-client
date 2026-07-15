import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { IconButton } from "./IconButton";

describe("IconButton", () => {
  it("renders a labeled native button and supports activation", () => {
    const onClick = vi.fn();
    render(
      <IconButton label="Open search" onClick={onClick}>
        <span aria-hidden="true">⌕</span>
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "Open search" });
    expect(button.tagName).toBe("BUTTON");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("supports pressed state, tones, sizes, and forwarded refs", () => {
    const ref = { current: null } as React.RefObject<HTMLButtonElement>;
    const { rerender } = render(
      <IconButton ref={ref} label="Mute" pressed size="large" tone="danger">
        <span aria-hidden="true">M</span>
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "Mute" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveClass("vt-icon-button--large", "vt-icon-button--danger");
    expect(ref.current).toBe(button);

    rerender(
      <IconButton label="Mute" size="compact">
        <span aria-hidden="true">M</span>
      </IconButton>,
    );
    expect(screen.getByRole("button", { name: "Mute" })).toHaveClass(
      "vt-icon-button--compact",
    );
    expect(screen.getByRole("button", { name: "Mute" })).not.toHaveAttribute(
      "aria-pressed",
    );
  });

  it("prevents activation while disabled or loading", () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <IconButton label="Share" disabled onClick={onClick}>
        <span aria-hidden="true">S</span>
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "Share" });
    expect(button).toBeDisabled();
    fireEvent.click(button);

    rerender(
      <IconButton label="Share" loading onClick={onClick}>
        <span aria-hidden="true">S</span>
      </IconButton>,
    );
    const loadingButton = screen.getByRole("button", { name: "Share" });
    expect(loadingButton).toBeDisabled();
    expect(loadingButton).toHaveAttribute("aria-busy", "true");
    fireEvent.click(loadingButton);
    expect(onClick).not.toHaveBeenCalled();
  });
});
