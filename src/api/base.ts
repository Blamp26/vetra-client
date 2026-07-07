import { storage, STORAGE_KEYS } from "@/shared/utils/storage";

export function getDefaultApiBaseUrl(location: Pick<Location, "origin"> = window.location): string {
  return `${location.origin}/api/v1`;
}

export const API_BASE_URL = import.meta.env.VITE_API_URL || getDefaultApiBaseUrl();

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

type ErrorPayload = {
  error?: string;
  message?: string;
  details?: Record<string, string[]>;
  errors?: Record<string, string[] | string> | string[] | string;
};

export function unwrapApiResponse<T>(data: unknown): T {
  if (typeof data === "object" && data !== null && "data" in data) {
    return (data as { data: T }).data;
  }

  return data as T;
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

  const rawText = await response.text();
  let data: unknown = null;

  if (rawText.trim()) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = rawText;
    }
  }

  if (!response.ok) {
    // 401 — токен истёк или невалиден; очищаем хранилище
    if (response.status === 401) {
      storage.remove(STORAGE_KEYS.TOKEN);
      storage.remove(STORAGE_KEYS.USER);
      // Перезагрузка бросает ApiError, которую поймает useAuth
    }
    const payload = typeof data === "object" && data !== null ? (data as ErrorPayload) : null;
    const details =
      payload?.details && typeof payload.details === "object"
        ? payload.details
        : undefined;
    const validationErrors =
      payload?.errors && typeof payload.errors === "object" && !Array.isArray(payload.errors)
        ? Object.fromEntries(
            Object.entries(payload.errors).map(([field, value]) => [
              field,
              Array.isArray(value) ? value : [String(value)],
            ]),
          )
        : undefined;
    const fallbackErrors =
      Array.isArray(payload?.errors) && payload.errors.length > 0
        ? payload.errors.join(", ")
        : typeof payload?.errors === "string"
          ? payload.errors
          : null;
    const message =
      payload?.error ||
      payload?.message ||
      fallbackErrors ||
      (typeof data === "string" && data.trim() ? data : null) ||
      `Request failed: ${response.status}`;

    throw new ApiError(message, response.status, details ?? validationErrors);
  }

  return unwrapApiResponse<T>(data);
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
