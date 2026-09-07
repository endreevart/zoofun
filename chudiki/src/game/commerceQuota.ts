export type CheckoutFail = 'not_signed_in' | 'unavailable' | 'failed';

export function checkoutFailFromStatus(status: number): CheckoutFail {
  if (status === 401) return 'not_signed_in';
  if (status === 503) return 'unavailable';
  return 'failed';
}

export type Quota = {
  remaining: number;
  quotaTotal: number;
  used: number;
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
    return { remaining, quotaTotal: remaining, used: 0 };
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

/** How many egg tokens to draw for a remaining credit count. */
export const CREDIT_EGG_MAX = 8;

export function creditEggCounts(remaining: number): { filled: number; extra: number } {
  const n = Math.max(0, Math.floor(remaining));
  if (n <= CREDIT_EGG_MAX) return { filled: n, extra: 0 };
  return { filled: CREDIT_EGG_MAX, extra: n - CREDIT_EGG_MAX };
}
