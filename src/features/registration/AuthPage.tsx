import { useState } from "react";
import { RegisterForm } from "./components/RegisterForm/RegisterForm";
import { LoginForm } from "./components/LoginForm/LoginForm";

export function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  return (
    <div className="vt-workspace flex min-h-screen items-start justify-center overflow-y-auto px-5 py-8 sm:items-center">
      <main className="w-full max-w-[420px]">
        <div className="mb-5 text-center">
          <div className="text-lg font-semibold tracking-tight text-foreground">Vetra</div>
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
