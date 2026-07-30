import { useState } from "react";
import { authApi } from "@/api/auth";
import { ApiError } from "@/api/base";
import { useAppStore } from "@/store";

interface AuthError {
  message: string;
  details?: Record<string, string[]>;
}

export function useAuth() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const setAuthSession = useAppStore((s) => s.setAuthSession);
  const logout = useAppStore((s) => s.logout);
  const setProtocolUpdateRequired = useAppStore(
    (s) => s.setProtocolUpdateRequired,
  );

  const clearError = () => setError(null);

  const register = async (username: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const { user, token } = await authApi.register({ username, password });
      setAuthSession(user, token);
      return user;
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "update_required") setProtocolUpdateRequired(true);
        setError({ message: err.message, details: err.details });
      } else {
        setError({ message: "Registration failed." });
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (username: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const { user, token } = await authApi.login({ username, password });
      setAuthSession(user, token);
      return user;
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "update_required") setProtocolUpdateRequired(true);
        setError({ message: err.message, details: err.details });
      } else {
        setError({ message: "Login failed." });
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return { register, login, logout, isLoading, error, clearError };
}
