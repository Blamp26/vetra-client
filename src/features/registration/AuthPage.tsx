import { useState } from "react";
import { RegisterForm } from "./components/RegisterForm/RegisterForm";
import { LoginForm } from "./components/LoginForm/LoginForm";

export function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  return (
    <div className="vt-workspace flex min-h-screen items-center justify-center overflow-y-auto px-5 py-8 sm:px-8 sm:py-10">
      <main data-testid="auth-composition" className="w-full max-w-[360px] -translate-y-3 sm:-translate-y-6">
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
  );
}
