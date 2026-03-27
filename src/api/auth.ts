import { get, post, put } from './base';
import { User, Server } from '@/shared/types';

export interface RegisterPayload { username: string; password: string; }
export interface LoginPayload    { username: string; password: string; }

// Сервер теперь возвращает { user, token }
export interface AuthResponse {
  user:  User;
  token: string;
}

export interface UpdateProfilePayload {
  username?:     string;
  display_name?: string | null;
  bio?:          string | null;
  avatar_url?:   string | null;
  status?:       'online' | 'away' | 'dnd' | 'offline';
}

export interface GlobalSearchResult {
  users:   User[];
  servers: Server[];
}

export const authApi = {
  register(payload: RegisterPayload): Promise<AuthResponse> {
    return post<AuthResponse>("/users/register", payload);
  },

  login(payload: LoginPayload): Promise<AuthResponse> {
    return post<AuthResponse>("/users/login", payload);
  },

  // current_user_id больше не нужен — сервер знает его из токена
  searchUsers(query: string): Promise<GlobalSearchResult> {
    const params = new URLSearchParams({ q: query });
    return get<GlobalSearchResult>(`/users/search?${params}`);
  },

  getUser(userId: number): Promise<User> {
    return get<User>(`/users/${userId}`);
  },

  // id в URL остаётся для корректного REST-маршрута
  updateProfile(userId: number, payload: UpdateProfilePayload): Promise<User> {
    return put<User>(`/users/${userId}/profile`, payload);
  },
};
