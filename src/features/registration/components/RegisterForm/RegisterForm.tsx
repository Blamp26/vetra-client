import { useId, useState, type FormEvent } from "react";
import { useAuth } from "@/shared/hooks/useAuth";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/shared/components/Button";
import { IconButton } from "@/shared/components/IconButton";
import { TextInput } from "@/shared/components/Field";

interface Props { onSwitchToLogin: () => void; }

export function RegisterForm({ onSwitchToLogin }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const usernameErrorId = useId();
  const passwordErrorId = useId();

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
    <div className="vt-pane w-full px-6 py-7">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Register</h1>
        <p className="mt-1 text-sm text-muted-foreground">Create your Vetra account.</p>
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
          <label className="vt-label" htmlFor="reg-username">
            Username
          </label>
          <TextInput
            id="reg-username" name="username" type="text" placeholder="Username (2–32 chars)" autoComplete="username"
            value={username} 
            onChange={(e) => { clearError(); setUsername(e.target.value); }}
            onBlur={(e) => validateUsername(e.target.value)}
            minLength={2} maxLength={32} required autoFocus
            invalid={!!usernameError}
            aria-describedby={usernameError ? usernameErrorId : undefined}
          />
          {usernameError && <p id={usernameErrorId} className="text-[11px] text-destructive">{usernameError}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label className="vt-label" htmlFor="reg-password">
            Password
          </label>
          <div className="relative">
            <TextInput
              className="pr-10"
              id="reg-password" name="password" type={showPassword ? "text" : "password"} placeholder="Password (min 6 chars)" autoComplete="new-password"
              value={password} 
              onChange={(e) => { clearError(); setPassword(e.target.value); }}
              onBlur={(e) => validatePassword(e.target.value)}
              minLength={6} required
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
          {isLoading ? "Creating..." : "Register"}
        </Button>
      </form>
      <p className="mt-5 text-center text-xs text-muted-foreground">
        Already have an account?{" "}
        <button type="button" className="font-semibold text-primary hover:underline" onClick={onSwitchToLogin}>Login</button>
      </p>
    </div>
  );
}
