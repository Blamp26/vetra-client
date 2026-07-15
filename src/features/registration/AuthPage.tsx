import { useState } from "react";
import { RegisterForm } from "./components/RegisterForm/RegisterForm";
import { LoginForm } from "./components/LoginForm/LoginForm";

export function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  return (
    <div data-testid="auth-workspace" className="vt-auth-workspace vt-workspace" style={{ position: "fixed", inset: 0, width: "100vw", height: "100dvh", minHeight: "100dvh", overflowY: "auto", overflowX: "hidden" }}>
      <div className="vt-auth-centering">
      <main data-testid="auth-composition" className="vt-auth-composition" style={{ width: "min(360px, calc(100vw - 40px))", maxWidth: "360px", marginInline: "auto", transform: "translateY(-24px)" }}>
        <div data-testid="auth-brand" className="mb-6 text-center text-xl font-semibold tracking-tight text-foreground">
          Vetra
        </div>
        {mode === "login" ? (
          <LoginForm onSwitchToRegister={() => setMode("register")} />
        ) : (
          <RegisterForm onSwitchToLogin={() => setMode("login")} />
        )}
      </main>
      </div>
    </div>
  );
}
