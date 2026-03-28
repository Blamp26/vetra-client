import { StateCreator } from 'zustand';
import { User } from '@/shared/types';
import { SocketManager } from '@/services/socket';
import { storage, STORAGE_KEYS } from '@/shared/utils/storage';

// ── Persistence helpers ───────────────────────────────────────────────────────

function getStoredUser(): User | null {
  return storage.get<User>(STORAGE_KEYS.USER);
}

function getStoredToken(): string | null {
  return storage.getString(STORAGE_KEYS.TOKEN);
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
    if (user) storage.set(STORAGE_KEYS.USER, user);
    else      storage.remove(STORAGE_KEYS.USER);
    set({ currentUser: user });
  },

  setAuthToken: (token) => {
    if (token) storage.setString(STORAGE_KEYS.TOKEN, token);
    else       storage.remove(STORAGE_KEYS.TOKEN);
    set({ authToken: token });
  },

  setAuthSession: (user, token) => {
    storage.set(STORAGE_KEYS.USER, user);
    storage.setString(STORAGE_KEYS.TOKEN, token);
    set({ currentUser: user, authToken: token });
  },

  updateCurrentUser: (updates) => {
    const current = get().currentUser;
    if (!current) return;
    const updated = { ...current, ...updates };
    storage.set(STORAGE_KEYS.USER, updated);
    set({ currentUser: updated });
  },

  setSocketManager: (manager) => {
    get().socketManager?.disconnect();
    set({ socketManager: manager });
  },

  logout: () => {
    get().socketManager?.disconnect();
    storage.remove(STORAGE_KEYS.USER);
    storage.remove(STORAGE_KEYS.TOKEN);
    set({ currentUser: null, authToken: null, socketManager: null });
  },
});
