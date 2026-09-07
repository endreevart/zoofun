import { API_BASE, authHeaders } from '../api';
import {
  checkoutFailFromStatus,
  type CheckoutFail,
  type Quota,
} from './commerceQuota';

export type { CheckoutFail, Quota };
export {
  applyRemaining,
  canStartCreation,
  checkoutFailFromStatus,
  creditEggCounts,
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
    };
    if (typeof body.remaining !== 'number') return null;
    return {
      remaining: body.remaining,
      quotaTotal: typeof body.quota_total === 'number' ? body.quota_total : body.remaining,
      used: typeof body.generation_used === 'number' ? body.generation_used : 0,
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

export type CheckoutResult =
  | { ok: true; url: string }
  | { ok: false; reason: CheckoutFail };

export async function startCheckout(packId: string): Promise<CheckoutResult> {
  try {
    const response = await fetch(`${API_BASE}/v1/commerce/checkout`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ pack_id: packId }),
    });
    if (!response.ok) return { ok: false, reason: checkoutFailFromStatus(response.status) };
    const body = (await response.json()) as { payment_url?: unknown };
    if (typeof body.payment_url === 'string' && /^https?:\/\//i.test(body.payment_url)) {
      return { ok: true, url: body.payment_url };
    }
    return { ok: false, reason: 'failed' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

export function formatRub(value: number): string {
  return `${value} ₽`;
}
