import { useState } from "react";
import { RegisterForm } from "./components/RegisterForm/RegisterForm";
import { LoginForm } from "./components/LoginForm/LoginForm";

export function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-8 p-4 bg-background min-h-screen">
      <div className="text-center">
        <h1 className="text-4xl font-normal text-foreground mb-1">
          Vetra
        </h1>
        <p className="text-sm text-muted-foreground">
          Self-hosted messenger
        </p>
      </div>

      <div className="w-full max-w-[400px]">
        {mode === "login" ? (
          <LoginForm onSwitchToRegister={() => setMode("register")} />
        ) : (
          <RegisterForm onSwitchToLogin={() => setMode("login")} />
        )}
      </div>
    </div>
  );
}
