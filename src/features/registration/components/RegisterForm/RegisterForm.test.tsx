import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useAuthMock, registerMock, clearErrorMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  registerMock: vi.fn(),
  clearErrorMock: vi.fn(),
}));

vi.mock("@/shared/hooks/useAuth", () => ({
  useAuth: () => useAuthMock(),
}));

import { RegisterForm } from "./RegisterForm";

describe("RegisterForm", () => {
  beforeEach(() => {
    registerMock.mockReset();
    clearErrorMock.mockReset();
    useAuthMock.mockReset();
    useAuthMock.mockReturnValue({
      register: registerMock,
      isLoading: false,
      error: null,
      clearError: clearErrorMock,
    });
  });

  it("uses username wording and username autocomplete instead of email", () => {
    render(<RegisterForm onSwitchToLogin={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Register", level: 1 })).toBeInTheDocument();
    expect(screen.queryByText("Create account")).not.toBeInTheDocument();
    const usernameInput = screen.getByLabelText("Username");
    expect(usernameInput).toHaveAttribute("type", "text");
    expect(usernameInput).toHaveAttribute("placeholder", "Username (2–32 chars)");
    expect(usernameInput).toHaveAttribute("autocomplete", "username");
    expect(screen.queryByText(/email/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/email/i)).not.toBeInTheDocument();
  });

  it("submits username and password through the register action", async () => {
    registerMock.mockResolvedValue(null);
    render(<RegisterForm onSwitchToLogin={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "newuser" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret-pass" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    await waitFor(() => {
      expect(registerMock).toHaveBeenCalledWith("newuser", "secret-pass");
    });
  });

  it("connects validation messages and preserves register constraints", () => {
    render(<RegisterForm onSwitchToLogin={vi.fn()} />);

    const username = screen.getByLabelText("Username");
    const password = screen.getByLabelText("Password");
    fireEvent.blur(username);
    fireEvent.blur(password);

    expect(username).toHaveAttribute("minlength", "2");
    expect(username).toHaveAttribute("maxlength", "32");
    expect(username).toHaveAttribute("aria-invalid", "true");
    expect(password).toHaveAttribute("minlength", "6");
    expect(password).toHaveAttribute("autocomplete", "new-password");
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById(username.getAttribute("aria-describedby")!)).toHaveTextContent("Required field");
    expect(document.getElementById(password.getAttribute("aria-describedby")!)).toHaveTextContent("Required field");
  });

  it("provides a keyboard-reachable password visibility toggle", () => {
    render(<RegisterForm onSwitchToLogin={vi.fn()} />);

    const password = screen.getByLabelText("Password");
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle).not.toHaveAttribute("tabindex", "-1");
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(toggle);

    expect(password).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
  });

  it("uses the shared submit Button and exposes loading semantics", () => {
    const { rerender } = render(<RegisterForm onSwitchToLogin={vi.fn()} />);
    const submit = screen.getByRole("button", { name: "Register" });
    expect(submit).toHaveClass("vt-button", "vt-button--primary");
    expect(submit).toHaveAttribute("type", "submit");
    expect(submit).toBeDisabled();

    useAuthMock.mockReturnValue({ register: registerMock, isLoading: true, error: null, clearError: clearErrorMock });
    rerender(<RegisterForm onSwitchToLogin={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Creating..." })).toHaveAttribute("aria-busy", "true");
  });

  it("renders backend register error text and field details", () => {
    useAuthMock.mockReturnValue({
      register: registerMock,
      isLoading: false,
      error: {
        message: "Username is already taken",
        details: { username: ["has already been taken"] },
      },
      clearError: clearErrorMock,
    });

    render(<RegisterForm onSwitchToLogin={vi.fn()} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Username is already taken");
    expect(screen.getByText("username:")).toBeInTheDocument();
    expect(screen.getByText("has already been taken")).toBeInTheDocument();
  });
});
