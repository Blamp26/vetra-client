/**
 * Utility for working with localStorage.
 * Centralizes all keys and provides safe methods for getting/setting data.
 */

export const STORAGE_KEYS = {
  USER: "vetra_user",
  TOKEN: "vetra_token",
  THEME: "vetra_theme",
  APP_STATE: "vetra-storage", // Zustand persist key
} as const;

export const storage = {
  get<T>(key: string): T | null {
    if (typeof localStorage === "undefined") return null;
    try {
      const item = localStorage.getItem(key);
      if (!item) return null;
      return JSON.parse(item) as T;
    } catch {
      return null;
    }
  },

  set<T>(key: string, value: T): void {
    if (typeof localStorage === "undefined") return;
    try {
      const stringified = JSON.stringify(value);
      localStorage.setItem(key, stringified);
    } catch (error) {
      console.error(`Error saving to localStorage [${key}]:`, error);
    }
  },

  remove(key: string): void {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(key);
  },

  getString(key: string): string | null {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(key);
  },

  setString(key: string, value: string): void {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, value);
  },

  clear(): void {
    if (typeof localStorage === "undefined") return;
    localStorage.clear();
  },
};
