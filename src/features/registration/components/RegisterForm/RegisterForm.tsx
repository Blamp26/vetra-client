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
    if (!v.trim()) setUsernameError("Required field");
    else if (v.trim().length < 2) setUsernameError("Min 2 chars");
    else setUsernameError(null);
  };

  const validatePassword = (v: string) => {
    if (!v.trim()) setPasswordError("Required field");
    else if (v.trim().length < 6) setPasswordError("Min 6 chars");
    else setPasswordError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (usernameError || passwordError) return;
    await register(username, password);
  };

  const isInvalid = !!usernameError || !!passwordError || !username.trim() || !password.trim();

  return (
    <div className="bg-card border border-border p-6 w-full">
      <h2 className="text-xl font-normal mb-6 text-foreground text-center">Register</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div className="bg-destructive/10 border border-destructive/20 p-2 text-destructive text-xs">
            <span>{error.message}</span>
            {error.details &&
              Object.entries(error.details).map(([field, msgs]: [string, string[]]) => (
                <div key={field} className="mt-1">
                  <strong>{field}:</strong> {msgs.join(", ")}
                </div>
              ))}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase text-muted-foreground" htmlFor="reg-username">
            Username
          </label>
          <input
            className="w-full px-2 py-2 bg-background border border-border text-sm outline-none"
            id="reg-username" name="username" type="text" placeholder="Username (2–32 chars)"
            value={username} 
            onChange={(e) => { clearError(); setUsername(e.target.value); }}
            onBlur={(e) => validateUsername(e.target.value)}
            minLength={2} maxLength={32} required autoFocus
          />
          {usernameError && <p className="text-destructive text-[10px]">{usernameError}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase text-muted-foreground" htmlFor="reg-password">
            Password
          </label>
          <div className="relative">
            <input
              className="w-full pl-2 pr-8 py-2 bg-background border border-border text-sm outline-none"
              id="reg-password" name="password" type={showPassword ? "text" : "password"} placeholder="Password (min 6 chars)"
              value={password} 
              onChange={(e) => { clearError(); setPassword(e.target.value); }}
              onBlur={(e) => validatePassword(e.target.value)}
              minLength={6} required
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {passwordError && <p className="text-destructive text-[10px]">{passwordError}</p>}
        </div>

        <button 
          type="submit" 
          disabled={isLoading || isInvalid} 
          className="w-full px-4 py-2 bg-primary text-primary-foreground text-sm border border-primary disabled:opacity-50 mt-2"
        >
          {isLoading ? "Creating..." : "Register"}
        </button>
      </form>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Already have an account?{" "}
        <button className="text-primary hover:underline" onClick={onSwitchToLogin}>Login</button>
      </p>
    </div>
  );
}
