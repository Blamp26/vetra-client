import { StateCreator } from 'zustand';
import { User } from '@/shared/types';
import { SocketManager } from '@/services/socket';

const USER_STORAGE_KEY  = "vetra_user";
const TOKEN_STORAGE_KEY = "vetra_token";

// ── Persistence helpers ───────────────────────────────────────────────────────

function getStoredUser(): User | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const s = localStorage.getItem(USER_STORAGE_KEY);
    return s ? (JSON.parse(s) as User) : null;
  } catch {
    return null;
  }
}

function getStoredToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

// ── Slice interface ───────────────────────────────────────────────────────────

export interface AuthSlice {
  currentUser:    User | null;
  authToken:      string | null;   // ← новое поле
  socketManager:  SocketManager | null;

  setCurrentUser:    (user: User | null) => void;
  setAuthToken:      (token: string | null) => void;   // ← новый метод
  /** Атомарно сохраняет и user, и token (при логине / регистрации) */
  setAuthSession:    (user: User, token: string) => void;
  updateCurrentUser: (updates: Partial<User>) => void;
  setSocketManager:  (manager: SocketManager | null) => void;
  logout:            () => void;
}

// ── Slice implementation ──────────────────────────────────────────────────────

export const createAuthSlice: StateCreator<AuthSlice> = (set, get) => ({
  currentUser:   getStoredUser(),
  authToken:     getStoredToken(),
  socketManager: null,

  setCurrentUser: (user) => {
    if (typeof localStorage !== "undefined") {
      if (user) localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
      else       localStorage.removeItem(USER_STORAGE_KEY);
    }
    set({ currentUser: user });
  },

  setAuthToken: (token) => {
    if (typeof localStorage !== "undefined") {
      if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
      else       localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
    set({ authToken: token });
  },

  setAuthSession: (user, token) => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    }
    set({ currentUser: user, authToken: token });
  },

  updateCurrentUser: (updates) => {
    const current = get().currentUser;
    if (!current) return;
    const updated = { ...current, ...updates };
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updated));
    }
    set({ currentUser: updated });
  },

  setSocketManager: (manager) => {
    get().socketManager?.disconnect();
    set({ socketManager: manager });
  },

  logout: () => {
    get().socketManager?.disconnect();
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(USER_STORAGE_KEY);
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
    set({ currentUser: null, authToken: null, socketManager: null });
  },
});
