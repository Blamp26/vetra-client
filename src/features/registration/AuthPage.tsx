import { useState } from "react";
import { RegisterForm } from "./components/RegisterForm/RegisterForm";
import { LoginForm } from "./components/LoginForm/LoginForm";

export function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  return (
    <div className="vt-workspace flex min-h-screen items-center justify-center px-5 py-8">
      <div className="grid w-full max-w-5xl gap-5 lg:grid-cols-[minmax(0,1.1fr)_420px]">
        <section className="vt-pane flex flex-col justify-between gap-8 bg-sidebar px-8 py-10">
          <div className="space-y-4">
            <span className="vt-kicker">Tauri-first messenger</span>
            <div className="space-y-3">
              <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-foreground lg:text-[2.75rem]">
                Calm desktop messaging for daily work.
              </h1>
              <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                Vetra keeps login, conversations, files, and calls in one dependable desktop surface without the noise of a generic SaaS skin.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="vt-panel bg-card/75 p-4">
              <div className="vt-kicker mb-2">Messages</div>
              <p className="text-sm text-muted-foreground">Direct chats, rooms, and server channels stay quick to scan.</p>
            </div>
            <div className="vt-panel bg-card/75 p-4">
              <div className="vt-kicker mb-2">Files</div>
              <p className="text-sm text-muted-foreground">Attachments and previews stay close to the conversation.</p>
            </div>
            <div className="vt-panel bg-card/75 p-4">
              <div className="vt-kicker mb-2">Calls</div>
              <p className="text-sm text-muted-foreground">Voice and screen sharing stay visible without taking over the app.</p>
            </div>
          </div>
        </section>

        <div className="flex items-center">
          <div className="w-full max-w-[420px] lg:ml-auto">
            {mode === "login" ? (
              <LoginForm onSwitchToRegister={() => setMode("register")} />
            ) : (
              <RegisterForm onSwitchToLogin={() => setMode("login")} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
