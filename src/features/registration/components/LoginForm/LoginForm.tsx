import { useId, useState, type FormEvent } from "react";
import { useAuth } from "@/shared/hooks/useAuth";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/shared/components/Button";
import { IconButton } from "@/shared/components/IconButton";
import { TextInput } from "@/shared/components/Field";

interface Props { onSwitchToRegister: () => void; }

export function LoginForm({ onSwitchToRegister }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const usernameErrorId = useId();
  const passwordErrorId = useId();

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
          <div role="alert" className="rounded-[var(--radius-md)] border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
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
          <label className="vt-label" htmlFor="login-username">
            Username
          </label>
          <TextInput
            id="login-username" name="username" type="text" placeholder="Username" autoComplete="username"
            value={username} 
            onChange={(e) => { clearError(); setUsername(e.target.value); }}
            onBlur={(e) => validateUsername(e.target.value)}
            required autoFocus
            invalid={!!usernameError}
            aria-describedby={usernameError ? usernameErrorId : undefined}
          />
          {usernameError && <p id={usernameErrorId} className="text-[11px] text-destructive">{usernameError}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label className="vt-label" htmlFor="login-password">
            Password
          </label>
          <div className="relative">
            <TextInput
              className="pr-10"
              id="login-password" name="password" type={showPassword ? "text" : "password"} placeholder="Password" autoComplete="current-password"
              value={password} 
              onChange={(e) => { clearError(); setPassword(e.target.value); }}
              onBlur={(e) => validatePassword(e.target.value)}
              required
              invalid={!!passwordError}
              aria-describedby={passwordError ? passwordErrorId : undefined}
            />
            <IconButton
              label={showPassword ? "Hide password" : "Show password"}
              size="compact"
              pressed={showPassword}
              className="absolute right-1 top-1/2 -translate-y-1/2"
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
            </IconButton>
          </div>
          {passwordError && <p id={passwordErrorId} className="text-[11px] text-destructive">{passwordError}</p>}
        </div>

        <Button
          type="submit" 
          disabled={isInvalid}
          loading={isLoading}
          variant="primary"
          className="mt-2 w-full"
        >
          {isLoading ? "Logging in..." : "Log In"}
        </Button>
      </form>
      <p className="mt-5 text-center text-xs text-muted-foreground">
        No account?{" "}
        <button type="button" className="font-semibold text-primary hover:underline" onClick={onSwitchToRegister}>Register</button>
      </p>
    </div>
  );
}
