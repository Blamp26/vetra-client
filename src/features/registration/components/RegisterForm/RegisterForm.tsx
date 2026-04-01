import { useState, type FormEvent } from "react";
import { useAuth } from "@/shared/hooks/useAuth";
import { Eye, EyeOff, Loader2 } from "lucide-react";

interface Props { onSwitchToLogin: () => void; }

export function RegisterForm({ onSwitchToLogin }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const { register, isLoading, error, clearError } = useAuth();

  const validateUsername = (v: string) => {
    if (!v.trim()) setUsernameError("Required field");
    else if (v.trim().length < 2) setUsernameError("Minimum 2 characters");
    else setUsernameError(null);
  };

  const validatePassword = (v: string) => {
    if (!v.trim()) setPasswordError("Required field");
    else if (v.trim().length < 6) setPasswordError("Minimum 6 characters");
    else setPasswordError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (usernameError || passwordError) return;
    await register(username, password);
  };

  const isInvalid = !!usernameError || !!passwordError || !username.trim() || !password.trim();

  return (
    <div className="bg-card/60 backdrop-blur-3xl border border-white/5 dark:border-white/[0.02] rounded-[1.5rem] p-8 px-10 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.5)] w-full ring-1 ring-inset ring-white/10 dark:ring-white/5 relative z-10 transition-all duration-500">
      <h2 className="text-[1.4rem] font-bold mb-8 text-foreground tracking-tight text-center">Create Account</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 px-4 text-destructive text-[0.85rem] font-medium shadow-sm animate-in slide-in-from-top-1 fade-in duration-300">
            <span>{error.message}</span>
            {error.details &&
              Object.entries(error.details).map(([field, msgs]: [string, string[]]) => (
                <div key={field} className="mt-1 text-[0.85rem]">
                  <strong>{field}:</strong> {msgs.join(", ")}
                </div>
              ))}
          </div>
        )}

        <div className="space-y-2">
          <label className="text-[0.6875rem] font-bold uppercase tracking-widest text-muted-foreground ml-1" htmlFor="reg-username">
            Username
          </label>
          <input
            className="w-full px-4 py-3 bg-background/50 border border-transparent rounded-[1rem] text-foreground text-[0.95rem] outline-none transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus:bg-background/80 ring-1 ring-inset ring-border/30 dark:ring-white/5 focus:ring-primary/50 focus:border-primary/20 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)]"
            id="reg-username" name="username" type="text" placeholder="Choose a username (2–32 chars)"
            value={username} 
            onChange={(e) => { clearError(); setUsername(e.target.value); }}
            onBlur={(e) => validateUsername(e.target.value)}
            minLength={2} maxLength={32} required autoFocus
          />
          {usernameError && <p className="text-destructive text-xs mt-1 ml-1 animate-in fade-in slide-in-from-top-1">{usernameError}</p>}
        </div>

        <div className="space-y-2">
          <label className="text-[0.6875rem] font-bold uppercase tracking-widest text-muted-foreground ml-1" htmlFor="reg-password">
            Password
          </label>
          <div className="relative">
            <input
              className="w-full pl-4 pr-10 py-3 bg-background/50 border border-transparent rounded-[1rem] text-foreground text-[0.95rem] outline-none transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus:bg-background/80 ring-1 ring-inset ring-border/30 dark:ring-white/5 focus:ring-primary/50 focus:border-primary/20 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)]"
              id="reg-password" name="password" type={showPassword ? "text" : "password"} placeholder="Choose a password"
              value={password} 
              onChange={(e) => { clearError(); setPassword(e.target.value); }}
              onBlur={(e) => validatePassword(e.target.value)}
              minLength={1} required
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-all duration-300 hover:scale-[1.15] active:scale-95 ease-[cubic-bezier(0.32,0.72,0,1)]"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {passwordError && <p className="text-destructive text-xs mt-1 ml-1 animate-in fade-in slide-in-from-top-1">{passwordError}</p>}
        </div>

        <button 
          type="submit" 
          disabled={isLoading || isInvalid} 
          className="relative overflow-hidden w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-primary text-primary-foreground border-none rounded-[1rem] text-[0.95rem] font-bold tracking-wide mt-2 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-primary/95 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_8px_20px_-8px_var(--tw-shadow-color)] shadow-primary/40 ring-1 ring-inset ring-black/10 dark:ring-white/10"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin shrink-0 text-primary-foreground/80" />
              <span>Creating account...</span>
            </>
          ) : (
            "Register"
          )}
        </button>
      </form>
      <p className="mt-4 text-center text-[0.9rem] text-muted-foreground">
        Already have an account?{" "}
        <button className="bg-none border-none text-primary cursor-pointer text-inherit p-0 hover:underline" onClick={onSwitchToLogin}>Log in</button>
      </p>
    </div>
  );
}
