import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useAuthMock, loginMock, clearErrorMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  loginMock: vi.fn(),
  clearErrorMock: vi.fn(),
}));

vi.mock("@/shared/hooks/useAuth", () => ({
  useAuth: () => useAuthMock(),
}));

import { LoginForm } from "./LoginForm";

describe("LoginForm", () => {
  beforeEach(() => {
    loginMock.mockReset();
    clearErrorMock.mockReset();
    useAuthMock.mockReset();
    useAuthMock.mockReturnValue({
      login: loginMock,
      isLoading: false,
      error: null,
      clearError: clearErrorMock,
    });
  });

  it("uses username wording and username autocomplete instead of email", () => {
    render(<LoginForm onSwitchToRegister={vi.fn()} />);

    const usernameInput = screen.getByLabelText("Username");
    expect(usernameInput).toHaveAttribute("type", "text");
    expect(usernameInput).toHaveAttribute("placeholder", "Username");
    expect(usernameInput).toHaveAttribute("autocomplete", "username");
    expect(screen.queryByText(/email/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/email/i)).not.toBeInTheDocument();
  });

  it("submits username and password through the login action", async () => {
    loginMock.mockResolvedValue(null);
    render(<LoginForm onSwitchToRegister={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "tester" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret-pass" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log In" }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith("tester", "secret-pass");
    });
  });

  it("connects validation messages to invalid fields", () => {
    render(<LoginForm onSwitchToRegister={vi.fn()} />);

    const username = screen.getByLabelText("Username");
    const password = screen.getByLabelText("Password");
    fireEvent.blur(username);
    fireEvent.blur(password);

    expect(username).toHaveAttribute("aria-invalid", "true");
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById(username.getAttribute("aria-describedby")!)).toHaveTextContent("Required field");
    expect(document.getElementById(password.getAttribute("aria-describedby")!)).toHaveTextContent("Required field");
  });

  it("provides a keyboard-reachable password visibility toggle", () => {
    render(<LoginForm onSwitchToRegister={vi.fn()} />);

    const password = screen.getByLabelText("Password");
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle).not.toHaveAttribute("tabindex", "-1");
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(toggle);

    expect(password).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
  });

  it("uses the shared submit Button and prevents submission while incomplete or loading", () => {
    const { rerender } = render(<LoginForm onSwitchToRegister={vi.fn()} />);
    let submit = screen.getByRole("button", { name: "Log In" });
    expect(submit).toHaveClass("vt-button", "vt-button--primary");
    expect(submit).toHaveAttribute("type", "submit");
    expect(submit).toBeDisabled();

    useAuthMock.mockReturnValue({ login: loginMock, isLoading: true, error: null, clearError: clearErrorMock });
    rerender(<LoginForm onSwitchToRegister={vi.fn()} />);
    submit = screen.getByRole("button", { name: "Logging in..." });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute("aria-busy", "true");
  });

  it("renders backend login error text from the auth hook", () => {
    useAuthMock.mockReturnValue({
      login: loginMock,
      isLoading: false,
      error: {
        message: "Unknown username",
        details: { username: ["not found"] },
      },
      clearError: clearErrorMock,
    });

    render(<LoginForm onSwitchToRegister={vi.fn()} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Unknown username");
    expect(screen.getByText("username:")).toBeInTheDocument();
    expect(screen.getByText("not found")).toBeInTheDocument();
  });
});
