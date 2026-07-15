import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";

vi.mock("./components/LoginForm/LoginForm", () => ({
  LoginForm: ({ onSwitchToRegister }: { onSwitchToRegister: () => void }) => (
    <section>
      <h1>Log in</h1>
      <label htmlFor="login-username">Username</label>
      <input id="login-username" />
      <label htmlFor="login-password">Password</label>
      <input id="login-password" type="password" />
      <button type="button" onClick={onSwitchToRegister}>Register</button>
    </section>
  ),
}));

vi.mock("./components/RegisterForm/RegisterForm", () => ({
  RegisterForm: ({ onSwitchToLogin }: { onSwitchToLogin: () => void }) => (
    <section>
      <h1>Register</h1>
      <label htmlFor="register-username">Username</label>
      <input id="register-username" />
      <label htmlFor="register-password">Password</label>
      <input id="register-password" type="password" />
      <button type="button" onClick={onSwitchToLogin}>Login</button>
    </section>
  ),
}));

import { AuthPage } from "./AuthPage";

describe("AuthPage", () => {
  it("renders one centered, cardless auth composition without promotional content", () => {
    render(<AuthPage />);

    expect(screen.getByRole("heading", { name: "Log in" })).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getAllByText("Vetra")).toHaveLength(1);
    expect(screen.getByTestId("auth-workspace")).toHaveStyle({
      position: "fixed",
      inset: "0px",
      width: "100vw",
      height: "100dvh",
      minHeight: "100dvh",
      overflowY: "auto",
    });
    expect(screen.getByTestId("auth-composition")).toHaveStyle({
      width: "min(360px, calc(100vw - 40px))",
      maxWidth: "360px",
      marginInline: "auto",
      transform: "translateY(-24px)",
    });
    expect(screen.getByTestId("auth-workspace")).toHaveClass("vt-auth-workspace");
    expect(screen.getByTestId("auth-composition")).toHaveClass("vt-auth-composition");
    expect(screen.getByTestId("auth-brand")).toBeInTheDocument();
    expect(screen.getByRole("main")).not.toHaveClass("lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]");
    expect(screen.getByRole("main").querySelector(".vt-pane")).not.toBeInTheDocument();
    for (const text of [
      "Tauri-first messenger",
      "Calm desktop messaging for daily work.",
      "Messages",
      "Files",
      "Calls",
    ]) {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    }
  });

  it("switches between login and registration", () => {
    render(<AuthPage />);

    fireEvent.click(screen.getByRole("button", { name: "Register" }));
    expect(screen.getByRole("heading", { name: "Register" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Login" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Login" }));
    expect(screen.getByRole("heading", { name: "Log in" })).toBeInTheDocument();
  });
});
