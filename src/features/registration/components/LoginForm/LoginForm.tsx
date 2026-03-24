import { useState, type FormEvent } from "react";
import { useAuth } from "@/shared/hooks/useAuth";

interface Props { onSwitchToRegister: () => void; }

export function LoginForm({ onSwitchToRegister }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { login, isLoading, error, clearError } = useAuth();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await login(username, password);
  };

  return (
    <div className="auth-card">
      <h2>Welcome Back</h2>
      <form onSubmit={handleSubmit} className="auth-form">
        {error && <div className="error-banner">{error.message}</div>}
        <label htmlFor="login-username">Username</label>
        <input
          id="login-username" type="text" placeholder="Your username"
          value={username} onChange={(e) => { clearError(); setUsername(e.target.value); }}
          required autoFocus
        />
        <label htmlFor="login-password">Password</label>
        <input
          id="login-password" type="password" placeholder="Your password"
          value={password} onChange={(e) => { clearError(); setPassword(e.target.value); }}
          required
        />
        <button type="submit" disabled={isLoading} className="btn-primary">
          {isLoading ? "Logging in…" : "Log In"}
        </button>
      </form>
      <p className="auth-switch">
        Don't have an account?{" "}
        <button className="link-btn" onClick={onSwitchToRegister}>Register</button>
      </p>
    </div>
  );
}
