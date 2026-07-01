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
    try {
      if (typeof localStorage === "undefined") return null;
      const item = localStorage.getItem(key);
      if (!item) return null;
      return JSON.parse(item) as T;
    } catch {
      return null;
    }
  },

  set<T>(key: string, value: T): void {
    try {
      if (typeof localStorage === "undefined") return;
      const stringified = JSON.stringify(value);
      localStorage.setItem(key, stringified);
    } catch (error) {
      console.error(`Error saving to localStorage [${key}]:`, error);
    }
  },

  remove(key: string): void {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.removeItem(key);
    } catch {
      // ignore storage access errors
    }
  },

  getString(key: string): string | null {
    try {
      if (typeof localStorage === "undefined") return null;
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  setString(key: string, value: string): void {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(key, value);
    } catch (error) {
      console.error(`Error saving to localStorage [${key}]:`, error);
    }
  },

  clear(): void {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.clear();
    } catch {
      // ignore storage access errors
    }
  },
};
