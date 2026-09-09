export const API_BASE = import.meta.env.VITE_API_URL ?? '';

// ⚠️ Auth is stored in localStorage so it survives page reloads. This is fine for a
// small internal app, but remember that any client-side script injection (XSS) can read
// these items. React escapes rendered values by default; avoid dangerouslySetInnerHTML
// with user-controlled data and keep dependencies patched.

const TOKEN_KEY = 'token';
const USER_KEY = 'user';
const ROLE_KEY = 'role';

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(ROLE_KEY);
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...(options.headers || {}),
    },
  });

  // Session lost (expired/invalid token or deleted account): reset to the login screen.
  if (res.status === 401) {
    clearAuth();
    if (window.location.pathname !== '/login') window.location.href = '/login';
  }

  return res;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Reads a response body as JSON, tolerating empty/non-JSON bodies.
 * Throws an ApiError when the HTTP status is not 2xx (using the server's message).
 */
export async function safeJson<T = unknown>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message =
      (data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : undefined) ||
      `Erreur serveur (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

/** Extracts a human-readable message from a fetch/API error thrown anywhere. */
export function apiErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return 'Erreur de connexion au serveur';
}