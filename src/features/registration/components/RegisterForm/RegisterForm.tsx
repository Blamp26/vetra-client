import { useState, type FormEvent } from "react";
import { useAuth } from "@/shared/hooks/useAuth";

interface Props { onSwitchToLogin: () => void; }

export function RegisterForm({ onSwitchToLogin }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { register, isLoading, error, clearError } = useAuth();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await register(username, password);
  };

  return (
    <div className="auth-card">
      <h2>Create Account</h2>
      <form onSubmit={handleSubmit} className="auth-form">
        {error && (
          <div className="error-banner">
            <span>{error.message}</span>
            {error.details &&
              Object.entries(error.details).map(([field, msgs]: [string, string[]]) => (
                <div key={field} className="error-detail">
                  <strong>{field}:</strong> {msgs.join(", ")}
                </div>
              ))}
          </div>
        )}
        <label htmlFor="reg-username">Username</label>
        <input
          id="reg-username" type="text" placeholder="Choose a username (2–32 chars)"
          value={username} onChange={(e) => { clearError(); setUsername(e.target.value); }}
          minLength={2} maxLength={32} required autoFocus
        />
        <label htmlFor="reg-password">Password</label>
        <input
          id="reg-password" type="password" placeholder="Choose a password"
          value={password} onChange={(e) => { clearError(); setPassword(e.target.value); }}
          minLength={1} required
        />
        <button type="submit" disabled={isLoading} className="btn-primary">
          {isLoading ? "Creating account…" : "Register"}
        </button>
      </form>
      <p className="auth-switch">
        Already have an account?{" "}
        <button className="link-btn" onClick={onSwitchToLogin}>Log in</button>
      </p>
    </div>
  );
}
