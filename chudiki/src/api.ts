const TOKEN_KEY = 'zoofun-parent-token';

const viteEnv = (import.meta as { env?: { VITE_API_BASE?: string } }).env;
export const API_BASE = viteEnv?.VITE_API_BASE?.replace(/\/$/, '') ?? '/api/zoo';

function readStoredToken(): string | null {
  try {
    const dedicated = localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
    if (dedicated) return dedicated;
    const raw = localStorage.getItem("zoofun-session") ?? sessionStorage.getItem("zoofun-session");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: unknown };
    return typeof parsed.token === "string" ? parsed.token : null;
  } catch {
    return null;
  }
}

export function parentToken(): string | null {
  return readStoredToken();
}

export function rememberParentToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* private mode */
  }
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function forgetParentToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function authHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  const token = parentToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return headers;
}
