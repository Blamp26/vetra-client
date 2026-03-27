import { useState } from "react";
import { RegisterForm } from "./components/RegisterForm/RegisterForm";
import { LoginForm } from "./components/LoginForm/LoginForm";

export function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-6 p-6 bg-background min-h-screen">
      <div className="text-center">
        <h1 className="text-[2rem] font-bold tracking-[-0.5px] text-foreground">💬 Vetra</h1>
        <p className="text-muted-foreground mt-1">A self-hosted direct messaging app</p>
      </div>
      {mode === "login" ? (
        <LoginForm onSwitchToRegister={() => setMode("register")} />
      ) : (
        <RegisterForm onSwitchToLogin={() => setMode("login")} />
      )}
    </div>
  );
}
