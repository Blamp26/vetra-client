import { useState } from "react";
import { RegisterForm } from "./components/RegisterForm/RegisterForm";
import { LoginForm } from "./components/LoginForm/LoginForm";

export function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  return (
    <div className="vt-workspace flex min-h-screen items-start justify-center overflow-y-auto px-5 py-8 sm:items-center sm:px-8 sm:py-10">
      <main className="grid w-full max-w-4xl items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] lg:gap-16">
        <section className="hidden px-4 lg:block" aria-label="Vetra desktop messenger">
          <div className="max-w-md">
            <div className="mb-3 text-2xl font-semibold tracking-tight text-foreground">Vetra</div>
            <p className="text-base leading-7 text-muted-foreground">Your conversations, files, and calls in one dependable desktop workspace.</p>
          </div>
        </section>
        <div className="w-full max-w-[420px] lg:justify-self-end">
          <div className="mb-5 text-center lg:hidden">
            <div className="text-lg font-semibold tracking-tight text-foreground">Vetra</div>
          </div>
          {mode === "login" ? (
            <LoginForm onSwitchToRegister={() => setMode("register")} />
          ) : (
            <RegisterForm onSwitchToLogin={() => setMode("login")} />
          )}
        </div>
      </main>
    </div>
  );
}
