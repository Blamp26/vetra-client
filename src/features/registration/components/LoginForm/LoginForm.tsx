import { useState, type FormEvent } from "react";
import { useAuth } from "@/shared/hooks/useAuth";
import { Eye, EyeOff } from "lucide-react";

interface Props { onSwitchToRegister: () => void; }

export function LoginForm({ onSwitchToRegister }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const { login, isLoading, error, clearError } = useAuth();

  const validateUsername = (v: string) => {
    if (!v.trim()) setUsernameError("Required field");
    else if (v.trim().length < 2) setUsernameError("Min 2 chars");
    else setUsernameError(null);
  };

  const validatePassword = (v: string) => {
    if (!v.trim()) setPasswordError("Required field");
    else setPasswordError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (usernameError || passwordError) return;
    await login(username, password);
  };

  const isInvalid = !!usernameError || !!passwordError || !username.trim() || !password.trim();

  return (
    <div className="vt-pane w-full px-6 py-7">
      <div className="mb-6 space-y-2">
        <span className="vt-kicker">Welcome back</span>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">Log in</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Continue to your desktop inbox.
          </p>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div className="rounded-[var(--radius-md)] border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error.message}
          </div>
        )}
        
        <div className="flex flex-col gap-1">
          <label className="vt-label" htmlFor="login-username">
            Username
          </label>
          <input
            className="vt-input"
            id="login-username" name="username" type="text" placeholder="Username"
            value={username} 
            onChange={(e) => { clearError(); setUsername(e.target.value); }}
            onBlur={(e) => validateUsername(e.target.value)}
            required autoFocus
          />
          {usernameError && <p className="text-[11px] text-destructive">{usernameError}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label className="vt-label" htmlFor="login-password">
            Password
          </label>
          <div className="relative">
            <input
              className="vt-input pr-10"
              id="login-password" name="password" type={showPassword ? "text" : "password"} placeholder="Password"
              value={password} 
              onChange={(e) => { clearError(); setPassword(e.target.value); }}
              onBlur={(e) => validatePassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {passwordError && <p className="text-[11px] text-destructive">{passwordError}</p>}
        </div>

        <button 
          type="submit" 
          disabled={isLoading || isInvalid} 
          className="vt-button vt-button--primary mt-2 w-full"
        >
          {isLoading ? "Logging in..." : "Log In"}
        </button>
      </form>
      <p className="mt-5 text-center text-xs text-muted-foreground">
        No account?{" "}
        <button className="font-semibold text-primary hover:underline" onClick={onSwitchToRegister}>Register</button>
      </p>
    </div>
  );
}
