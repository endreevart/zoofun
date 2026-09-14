import type { GardenWorld } from './world/gardens';

export type CheckoutFail = 'not_signed_in' | 'unavailable' | 'failed' | 'owned' | 'promo';

export function checkoutFailFromStatus(status: number): CheckoutFail {
  if (status === 401) return 'not_signed_in';
  if (status === 503) return 'unavailable';
  return 'failed';
}

export function checkoutFailFromDetail(detail: unknown): CheckoutFail | null {
  if (typeof detail !== 'string') return null;
  if (detail.startsWith('promo_')) return 'promo';
  return null;
}

export type Quota = {
  remaining: number;
  quotaTotal: number;
  used: number;
  ownedWorlds: string[];
  worlds: GardenWorld[];
};

/** Server remaining is authoritative. Null remaining means local/unsigned play.
 *
 * An egg already in the garden must not block a new drawing — the mesh cooks
 * in the background on purpose. Only an in-flight submit (`pendingBirth`)
 * is locked, so a double-tap cannot spend two credits.
 */
export function canStartCreation(input: {
  remaining: number | null;
  pendingBirth: boolean;
}): boolean {
  if (input.pendingBirth) return false;
  if (input.remaining !== null && input.remaining <= 0) return false;
  return true;
}

export function applyRemaining(quota: Quota | null, remaining: number): Quota | null {
  if (!quota) {
    return { remaining, quotaTotal: remaining, used: 0, ownedWorlds: [], worlds: [] };
  }
  return {
    ...quota,
    remaining,
    used: Math.max(quota.used, quota.quotaTotal - remaining),
  };
}

export function spendOneCredit(quota: Quota | null): Quota | null {
  if (!quota) return quota;
  return applyRemaining(quota, Math.max(0, quota.remaining - 1));
}
