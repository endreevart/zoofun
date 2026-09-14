import { API_BASE, authHeaders, forgetParentToken, parentToken, rememberParentToken } from './api';

const FROM_SITE_KEY = 'zoofun-from-site';
export const PAID_FLASH_KEY = 'zoofun-paid-flash';

export type ParentSession = {
  token: string | null;
  fromSite: boolean;
  paid: boolean;
};

/** Take a parent token from the site URL, then hide it from the address bar. */
export function bootstrapParentSession(): ParentSession {
  const params = new URLSearchParams(window.location.search);
  const incoming = params.get('token');
  const fromSite = params.get('from') === 'site';
  const paid = params.get('paid') === '1';
  let dirty = false;

  if (incoming) {
    rememberParentToken(incoming);
    params.delete('token');
    dirty = true;
  }
  if (paid) {
    params.delete('paid');
    dirty = true;
    try {
      sessionStorage.setItem(PAID_FLASH_KEY, '1');
    } catch {
      /* ignore */
    }
  }
  if (fromSite) {
    params.delete('from');
    dirty = true;
    sessionStorage.setItem(FROM_SITE_KEY, '1');
    try {
      localStorage.setItem(FROM_SITE_KEY, '1');
    } catch {
      /* private mode */
    }
  }
  if (dirty) {
    const query = params.toString();
    const next = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', next);
  }

  let paidFlash = paid;
  try {
    paidFlash = paid || sessionStorage.getItem(PAID_FLASH_KEY) === '1';
  } catch {
    /* ignore */
  }

  return {
    token: incoming ?? parentToken(),
    fromSite: fromSite || sessionStorage.getItem(FROM_SITE_KEY) === '1' || localStorage.getItem(FROM_SITE_KEY) === '1',
    paid: paidFlash,
  };
}

export function siteHomeUrl(): string {
  const configured = (import.meta.env.VITE_SITE_URL as string | undefined)?.trim();
  if (configured) return configured;
  if (window.location.pathname.startsWith('/island')) return '/';
  const { protocol, hostname } = window.location;
  if (hostname === '127.0.0.1' || hostname === 'localhost') {
    return `${protocol}//${hostname}:3000/`;
  }
  return '/';
}

export function siteAuthUrl(): string {
  return `${siteHomeUrl().replace(/\/$/, '')}/auth`;
}

/**
 * Unsigned /island is a free walk and, on the dev server, a free hatch.
 * Production (and a phone on the Vite LAN) must go to parent sign-in.
 * `?tv` is a display, not play. `?studio=1` on the dev server is authoring.
 */
export function shouldSendToAuth(
  token: string | null,
  search = typeof window === 'undefined' ? '' : window.location.search,
  dev = Boolean(import.meta.env?.DEV),
): boolean {
  if (token) return false;
  try {
    const query = search.startsWith('?') ? search.slice(1) : search;
    const params = new URLSearchParams(query);
    if (params.has('tv')) return false;
    if (dev && params.has('studio')) return false;
  } catch {
    /* ignore */
  }
  return true;
}

/** True after a redirect is scheduled, so the island does not mount. */
export function sendUnsignedVisitorToAuth(): boolean {
  const { token } = bootstrapParentSession();
  const search = typeof window === 'undefined' ? '' : window.location.search;
  if (!shouldSendToAuth(token, search)) return false;
  window.location.replace(siteAuthUrl());
  return true;
}

function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Drop the parent cookie-jar on this origin, including the website session. */
export function wipeParentStorage(): void {
  forgetParentToken();
  removeKey('zoofun-session');
  removeKey('zoofun-parent-ok');
  removeKey(FROM_SITE_KEY);
  removeKey(PAID_FLASH_KEY);
}

/** Close the server session, then send the adult back to sign-in. */
export async function endParentSession(): Promise<void> {
  const token = parentToken();
  if (token) {
    try {
      await fetch(`${API_BASE}/v1/auth/logout`, {
        method: 'POST',
        headers: authHeaders({ Authorization: `Bearer ${token}` }),
      });
    } catch {
      /* Local wipe still logs the device out. */
    }
  }
  wipeParentStorage();
  window.location.replace(siteAuthUrl());
}

export async function readParentProfile(token: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/v1/auth/me`, {
      headers: authHeaders({ Authorization: `Bearer ${token}` }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
