import { storage, STORAGE_KEYS } from "@/shared/utils/storage";

export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api/v1";

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public details?: Record<string, string[]>
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Возвращает текущий authToken из хранилища.
 * Используется внутри request() для автоматической подстановки заголовка.
 */
function getStoredToken(): string | null {
  return storage.getString(STORAGE_KEYS.TOKEN);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  // Автоматически добавляем Bearer-заголовок, если есть токен
  const token = getStoredToken();
  const authHeader: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};

  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...authHeader,
      ...options.headers,
    },
    ...options,
  });

  const data = await response.json();

  if (!response.ok) {
    // 401 — токен истёк или невалиден; очищаем хранилище
    if (response.status === 401) {
      storage.remove(STORAGE_KEYS.TOKEN);
      storage.remove(STORAGE_KEYS.USER);
      // Перезагрузка бросает ApiError, которую поймает useAuth
    }
    const message = data?.error || data?.message || `Request failed: ${response.status}`;
    throw new ApiError(message, response.status, data?.details);
  }

  return (data?.data !== undefined ? data.data : data) as T;
}

export function get<T>(path: string): Promise<T> {
  return request<T>(path, { method: "GET" });
}

export function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export function put<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "PUT", body: JSON.stringify(body) });
}

export function del<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "DELETE",
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Для multipart/form-data (загрузка файлов):
 * НЕ устанавливаем Content-Type — браузер сделает это сам с boundary.
 */
export function postFormData<T>(path: string, formData: FormData): Promise<T> {
  const token = getStoredToken();
  const authHeader: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};

  return request<T>(path, {
    method: "POST",
    headers: authHeader,
    body: formData,
  });
}
