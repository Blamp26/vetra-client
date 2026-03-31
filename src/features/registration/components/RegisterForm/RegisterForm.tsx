import { useState, type FormEvent } from "react";
import { useAuth } from "@/shared/hooks/useAuth";
import { Eye, EyeOff } from "lucide-react";

interface Props { onSwitchToLogin: () => void; }

export function RegisterForm({ onSwitchToLogin }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const { register, isLoading, error, clearError } = useAuth();

  const validateUsername = (v: string) => {
    if (!v.trim()) setUsernameError("Поле обязательно");
    else if (v.trim().length < 2) setUsernameError("Минимум 2 символа");
    else setUsernameError(null);
  };

  const validatePassword = (v: string) => {
    if (!v.trim()) setPasswordError("Поле обязательно");
    else if (v.trim().length < 6) setPasswordError("Минимум 6 символов");
    else setPasswordError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (usernameError || passwordError) return;
    await register(username, password);
  };

  const isInvalid = !!usernameError || !!passwordError || !username.trim() || !password.trim();

  return (
    <div className="bg-card border border-border rounded-xl p-8 w-full max-w-[400px]">
      <h2 className="text-[1.3rem] font-semibold mb-6 text-foreground">Create Account</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {error && (
          <div className="bg-destructive/10 border border-destructive rounded-lg p-2.5 px-3 text-destructive text-[0.9rem]">
            <span>{error.message}</span>
            {error.details &&
              Object.entries(error.details).map(([field, msgs]: [string, string[]]) => (
                <div key={field} className="mt-1 text-[0.85rem]">
                  <strong>{field}:</strong> {msgs.join(", ")}
                </div>
              ))}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-[0.78rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground" htmlFor="reg-username">
            Username
          </label>
          <input
            className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-foreground text-[0.95rem] font-inherit outline-none transition-all duration-150 focus:border-primary focus-visible:ring-1 focus-visible:ring-ring"
            id="reg-username" name="username" type="text" placeholder="Choose a username (2–32 chars)"
            value={username} 
            onChange={(e) => { clearError(); setUsername(e.target.value); }}
            onBlur={(e) => validateUsername(e.target.value)}
            minLength={2} maxLength={32} required autoFocus
          />
          {usernameError && <p className="text-destructive text-xs mt-1">{usernameError}</p>}
        </div>

        <div className="space-y-1.5">
          <label className="text-[0.78rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground" htmlFor="reg-password">
            Password
          </label>
          <div className="relative">
            <input
              className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-foreground text-[0.95rem] font-inherit outline-none transition-all duration-150 focus:border-primary focus-visible:ring-1 focus-visible:ring-ring"
              id="reg-password" name="password" type={showPassword ? "text" : "password"} placeholder="Choose a password"
              value={password} 
              onChange={(e) => { clearError(); setPassword(e.target.value); }}
              onBlur={(e) => validatePassword(e.target.value)}
              minLength={1} required
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
              aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {passwordError && <p className="text-destructive text-xs mt-1">{passwordError}</p>}
        </div>

        <button 
          type="submit" 
          disabled={isLoading || isInvalid} 
          className="w-full px-4 py-2.5 bg-primary text-primary-foreground border-none rounded-lg text-[0.95rem] font-semibold font-inherit cursor-pointer transition-colors duration-150 mt-1 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "Creating account…" : "Register"}
        </button>
      </form>
      <p className="mt-4 text-center text-[0.9rem] text-muted-foreground">
        Already have an account?{" "}
        <button className="bg-none border-none text-primary cursor-pointer text-inherit p-0 hover:underline" onClick={onSwitchToLogin}>Log in</button>
      </p>
    </div>
  );
}
