import { useState } from "react";
import { RegisterForm } from "./components/RegisterForm/RegisterForm";
import { LoginForm } from "./components/LoginForm/LoginForm";

export function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  return (
    <div className="relative flex flex-col items-center justify-center flex-1 gap-10 p-6 bg-background min-h-screen overflow-hidden">
      {/* Ambient Radial Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/20 rounded-full blur-[100px] opacity-60 dark:opacity-20 pointer-events-none" />
      {/* Subtle Noise Texture */}
      <div className="absolute inset-0 pointer-events-none z-0 opacity-[0.035] dark:opacity-[0.025] mix-blend-overlay bg-noise" />
      
      <div className="text-center z-10 animate-in fade-in slide-in-from-bottom-4 duration-1000 ease-[cubic-bezier(0.32,0.72,0,1)]">
        <h1 className="text-[3rem] font-extrabold tracking-[-0.04em] text-transparent bg-clip-text bg-gradient-to-br from-foreground to-foreground/50 drop-shadow-sm mb-2 flex items-center justify-center gap-3">
          <span className="text-foreground drop-shadow-md">💬</span> Vetra
        </h1>
        <p className="text-[1.1rem] font-medium text-muted-foreground/80 tracking-wide mt-2">
          A premium self-hosted messenger
        </p>
      </div>

      <div className="relative z-10 w-full max-w-[420px] animate-in fade-in zoom-in-[0.98] slide-in-from-bottom-4 duration-1000 delay-150 fill-mode-both ease-[cubic-bezier(0.32,0.72,0,1)]">
        {mode === "login" ? (
          <LoginForm onSwitchToRegister={() => setMode("register")} />
        ) : (
          <RegisterForm onSwitchToLogin={() => setMode("login")} />
        )}
      </div>
    </div>
  );
}
