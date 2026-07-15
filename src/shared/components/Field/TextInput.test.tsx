import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { RefObject } from "react";
import { describe, expect, it, vi } from "vitest";
import { TextInput } from "./TextInput";

describe("TextInput", () => {
  it("renders a native input and forwards its ref", () => {
    const ref = { current: null } as RefObject<HTMLInputElement>;
    render(<TextInput ref={ref} aria-label="Username" />);

    expect(screen.getByRole("textbox")).toBe(ref.current);
  });

  it("forwards native attributes and preserves input events", () => {
    const onChange = vi.fn();
    render(
      <TextInput
        aria-label="Password"
        type="password"
        autoComplete="current-password"
        required
        minLength={6}
        maxLength={32}
        aria-describedby="password-error"
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText("Password");

    fireEvent.change(input, { target: { value: "secret" } });

    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("autocomplete", "current-password");
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("minlength", "6");
    expect(input).toHaveAttribute("maxlength", "32");
    expect(input).toHaveAttribute("aria-describedby", "password-error");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("supports compact and default sizes and merges className", () => {
    const { rerender } = render(<TextInput aria-label="Username" size="compact" className="local-input" />);
    expect(screen.getByRole("textbox")).toHaveClass("vt-input--compact", "local-input");

    rerender(<TextInput aria-label="Username" size="default" />);
    expect(screen.getByRole("textbox")).not.toHaveClass("vt-input--compact");
  });

  it("exposes invalid state and native disabled semantics", () => {
    const { rerender } = render(<TextInput aria-label="Username" invalid disabled />);
    const input = screen.getByRole("textbox");

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toBeDisabled();

    rerender(<TextInput aria-label="Username" invalid={false} />);
    expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-invalid", "true");
  });
});
