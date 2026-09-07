import { API_BASE, authHeaders, parentToken, rememberParentToken } from './api';

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
