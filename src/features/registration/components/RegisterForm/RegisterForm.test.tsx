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

    expect(screen.getByText("Username is already taken")).toBeInTheDocument();
    expect(screen.getByText("username:")).toBeInTheDocument();
    expect(screen.getByText("has already been taken")).toBeInTheDocument();
  });
});
