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
    <div className="bg-[#F8F8F8] border border-[#E1E1E1] rounded-[14px] p-8 w-full max-w-[400px]">
      <h2 className="text-[1.3rem] font-semibold mb-6">Create Account</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {error && (
          <div className="bg-[#E74C3C]/12 border border-[#E74C3C] rounded-lg p-2.5 px-3 text-[#E74C3C] text-[0.9rem]">
            <span>{error.message}</span>
            {error.details &&
              Object.entries(error.details).map(([field, msgs]: [string, string[]]) => (
                <div key={field} className="mt-1 text-[0.85rem]">
                  <strong>{field}:</strong> {msgs.join(", ")}
                </div>
              ))}
          </div>
        )}
        <label className="text-[0.78rem] font-semibold uppercase tracking-[0.06em] text-[#4A4A4A]" htmlFor="reg-username">Username</label>
        <input
          className="w-full px-3 py-2.5 bg-white border border-transparent rounded-lg text-[#0A0A0A] text-[0.95rem] font-inherit outline-none transition-colors duration-150 focus:border-[#5865F2]"
          id="reg-username" type="text" placeholder="Choose a username (2–32 chars)"
          value={username} onChange={(e) => { clearError(); setUsername(e.target.value); }}
          minLength={2} maxLength={32} required autoFocus
        />
        <label className="text-[0.78rem] font-semibold uppercase tracking-[0.06em] text-[#4A4A4A]" htmlFor="reg-password">Password</label>
        <input
          className="w-full px-3 py-2.5 bg-white border border-transparent rounded-lg text-[#0A0A0A] text-[0.95rem] font-inherit outline-none transition-colors duration-150 focus:border-[#5865F2]"
          id="reg-password" type="password" placeholder="Choose a password"
          value={password} onChange={(e) => { clearError(); setPassword(e.target.value); }}
          minLength={1} required
        />
        <button type="submit" disabled={isLoading} className="w-full px-4 py-2.5 bg-[#5865F2] text-white border-none rounded-lg text-[0.95rem] font-semibold font-inherit cursor-pointer transition-colors duration-150 mt-1 hover:bg-[#4752C4] disabled:opacity-50 disabled:cursor-not-allowed">
          {isLoading ? "Creating account…" : "Register"}
        </button>
      </form>
      <p className="mt-4 text-center text-[0.9rem] text-[#4A4A4A]">
        Already have an account?{" "}
        <button className="bg-none border-none text-[#5865F2] cursor-pointer text-inherit p-0 hover:underline" onClick={onSwitchToLogin}>Log in</button>
      </p>
    </div>
  );
}
