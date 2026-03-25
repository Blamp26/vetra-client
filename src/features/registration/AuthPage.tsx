import { useState } from "react";
import { RegisterForm } from "./components/RegisterForm/RegisterForm";
import { LoginForm } from "./components/LoginForm/LoginForm";

export function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-6 p-6 bg-[#FAFAFA] min-h-screen">
      <div className="text-center">
        <h1 className="text-[2rem] font-bold tracking-[-0.5px]">💬 Vetra</h1>
        <p className="text-[#4A4A4A] mt-1">A self-hosted direct messaging app</p>
      </div>
      {mode === "login" ? (
        <LoginForm onSwitchToRegister={() => setMode("register")} />
      ) : (
        <RegisterForm onSwitchToLogin={() => setMode("login")} />
      )}
    </div>
  );
}
