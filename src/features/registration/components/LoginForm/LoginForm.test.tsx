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

    expect(screen.getByText("Unknown username")).toBeInTheDocument();
    expect(screen.getByText("username:")).toBeInTheDocument();
    expect(screen.getByText("not found")).toBeInTheDocument();
  });
});
