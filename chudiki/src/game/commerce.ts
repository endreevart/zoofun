import { API_BASE, authHeaders } from '../api';
import {
  checkoutFailFromStatus,
  checkoutFailFromDetail,
  type CheckoutFail,
  type Quota,
} from './commerceQuota';
import type { GardenWorld } from './world/gardens';
import { skuFromWorldId } from './world/kinds';

export type { CheckoutFail, Quota };
export {
  applyRemaining,
  canStartCreation,
  checkoutFailFromStatus,
  checkoutFailFromDetail,
  spendOneCredit,
} from './commerceQuota';

export type Pack = {
  id: string;
  animals: number;
  price_rub: number;
  list_price_rub?: number;
  featured: boolean;
  buyable: boolean;
};

export type WorldOffer = {
  id: string;
  title?: string;
  price_rub: number;
  list_price_rub?: number;
  buyable: boolean;
  kind_id?: string;
};

export const CHECKOUT_SKU_KEY = 'zoofun-checkout-sku';
const WORLDS_BEFORE_KEY = 'zoofun-worlds-before';

function rememberCheckoutSku(packId: string) {
  try {
    sessionStorage.setItem(CHECKOUT_SKU_KEY, packId);
  } catch {
    /* ignore */
  }
}

export function rememberOwnedWorlds(ids: string[]) {
  try {
    sessionStorage.setItem(WORLDS_BEFORE_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export function takeOwnedWorldsBefore(): string[] {
  try {
    const raw = sessionStorage.getItem(WORLDS_BEFORE_KEY);
    if (raw) sessionStorage.removeItem(WORLDS_BEFORE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function takeCheckoutSku(): string | null {
  try {
    const value = sessionStorage.getItem(CHECKOUT_SKU_KEY);
    if (value) sessionStorage.removeItem(CHECKOUT_SKU_KEY);
    return value;
  } catch {
    return null;
  }
}

function asWorlds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function asGardenWorlds(value: unknown, ownedIds: string[]): GardenWorld[] {
  if (Array.isArray(value)) {
    const parsed = value.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const row = item as { id?: unknown; title?: unknown; sku?: unknown };
      if (typeof row.id !== 'string' || !row.id) return [];
      return [
        {
          id: row.id,
          title: typeof row.title === 'string' && row.title ? row.title : row.id,
          sku: typeof row.sku === 'string' && row.sku ? row.sku : undefined,
        },
      ];
    });
    if (parsed.length) return parsed;
  }
  return ownedIds.map((id, index) => ({
    id,
    title: `Сад ${index + 1}`,
    sku: skuFromWorldId(id) || undefined,
  }));
}

export async function readQuota(token: string): Promise<Quota | null> {
  try {
    const response = await fetch(`${API_BASE}/v1/auth/me`, {
      headers: authHeaders({ Authorization: `Bearer ${token}` }),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      remaining?: unknown;
      quota_total?: unknown;
      generation_used?: unknown;
      owned_worlds?: unknown;
      worlds?: unknown;
    };
    if (typeof body.remaining !== 'number') return null;
    const ownedWorlds = asWorlds(body.owned_worlds);
    return {
      remaining: body.remaining,
      quotaTotal: typeof body.quota_total === 'number' ? body.quota_total : body.remaining,
      used: typeof body.generation_used === 'number' ? body.generation_used : 0,
      ownedWorlds,
      worlds: asGardenWorlds(body.worlds, ownedWorlds),
    };
  } catch {
    return null;
  }
}

export type Reconciled = {
  /** Credits granted by this call, i.e. a notification that never arrived. */
  credited: number;
  /** Payments still waiting for an answer from the bank. */
  pending: number;
  remaining: number;
  ownedWorlds: string[];
  worlds: GardenWorld[];
};

/** Ask the backend to settle this parent's payments against T-Bank. */
export async function reconcilePayments(): Promise<Reconciled | null> {
  try {
    const response = await fetch(`${API_BASE}/v1/commerce/reconcile`, {
      method: 'POST',
      headers: authHeaders(),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      credited?: unknown;
      pending?: unknown;
      remaining?: unknown;
      owned_worlds?: unknown;
      worlds?: unknown;
    };
    if (typeof body.remaining !== 'number') return null;
    const ownedWorlds = asWorlds(body.owned_worlds);
    return {
      credited: typeof body.credited === 'number' ? body.credited : 0,
      pending: typeof body.pending === 'number' ? body.pending : 0,
      remaining: body.remaining,
      ownedWorlds,
      worlds: asGardenWorlds(body.worlds, ownedWorlds),
    };
  } catch {
    return null;
  }
}

export async function fetchPacks(): Promise<Pack[]> {
  const response = await fetch(`${API_BASE}/v1/commerce/catalog`);
  if (!response.ok) return [];
  const body = (await response.json()) as { packs?: Pack[] };
  return Array.isArray(body.packs) ? body.packs : [];
}

export async function fetchWorlds(): Promise<WorldOffer[]> {
  const response = await fetch(`${API_BASE}/v1/commerce/catalog`);
  if (!response.ok) return [];
  const body = (await response.json()) as { worlds?: WorldOffer[] };
  return Array.isArray(body.worlds) ? body.worlds : [];
}

export type CheckoutResult =
  | { ok: true; url: string }
  | { ok: false; reason: CheckoutFail };

export type Quote = {
  pack_id: string;
  animals: number;
  amount_rub: number;
  discount_rub: number;
  promo_code: string;
  list_price_rub: number;
};

export async function quotePack(packId: string, promo?: string): Promise<Quote | { ok: false; reason: CheckoutFail }> {
  try {
    const response = await fetch(`${API_BASE}/v1/commerce/quote`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ pack_id: packId, promo_code: promo?.trim() || '' }),
    });
    const payload = (await response.json().catch(() => ({}))) as Quote & { detail?: unknown };
    const promoFail = checkoutFailFromDetail(payload.detail);
    if (promoFail) return { ok: false, reason: promoFail };
    if (!response.ok) return { ok: false, reason: checkoutFailFromStatus(response.status) };
    if (typeof payload.amount_rub !== 'number') return { ok: false, reason: 'failed' };
    return {
      pack_id: packId,
      animals: typeof payload.animals === 'number' ? payload.animals : 0,
      amount_rub: payload.amount_rub,
      discount_rub: typeof payload.discount_rub === 'number' ? payload.discount_rub : 0,
      promo_code: typeof payload.promo_code === 'string' ? payload.promo_code : '',
      list_price_rub: typeof payload.list_price_rub === 'number' ? payload.list_price_rub : 0,
    };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

export async function startCheckout(packId: string, promo?: string): Promise<CheckoutResult> {
  try {
    rememberCheckoutSku(packId);
    const response = await fetch(`${API_BASE}/v1/commerce/checkout`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ pack_id: packId, promo_code: promo?.trim() || '' }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      payment_url?: unknown;
      detail?: unknown;
    };
    if (payload.detail === 'world_owned') return { ok: false, reason: 'owned' };
    const promoFail = checkoutFailFromDetail(payload.detail);
    if (promoFail) return { ok: false, reason: promoFail };
    if (!response.ok) return { ok: false, reason: checkoutFailFromStatus(response.status) };
    if (typeof payload.payment_url === 'string' && /^https?:\/\//i.test(payload.payment_url)) {
      return { ok: true, url: payload.payment_url };
    }
    return { ok: false, reason: 'failed' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

export function formatRub(value: number): string {
  return `${new Intl.NumberFormat('ru-RU').format(value)}\u00a0₽`;
}
