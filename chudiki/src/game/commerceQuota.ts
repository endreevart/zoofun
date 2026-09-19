import type { GardenWorld } from './world/gardens';

export type CheckoutFail = 'not_signed_in' | 'unavailable' | 'failed' | 'owned' | 'full' | 'promo';

export function checkoutFailFromStatus(status: number): CheckoutFail {
  if (status === 401) return 'not_signed_in';
  if (status === 409) return 'full';
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
  stillUsed: number;
  stillQuota: number;
  stillRemaining: number;
  plazaToyQuota: number;
  plazaToyUsed: number;
  plazaToyRemaining: number;
  plazaToyCap: number;
  ownedWorlds: string[];
  worlds: GardenWorld[];
};

export function stillQuotaOf(quotaTotal: number): number {
  return 10 + 10 * Math.max(0, Math.floor(quotaTotal) - 1);
}

function withDerivedStills(quota: Quota): Quota {
  const stillQuota = stillQuotaOf(quota.quotaTotal);
  return {
    ...quota,
    stillQuota,
    stillRemaining: Math.max(0, stillQuota - Math.max(0, quota.stillUsed)),
  };
}

function emptyWorlds(): Pick<
  Quota,
  'ownedWorlds' | 'worlds' | 'plazaToyQuota' | 'plazaToyUsed' | 'plazaToyRemaining' | 'plazaToyCap'
> {
  return {
    ownedWorlds: [],
    worlds: [],
    plazaToyQuota: 0,
    plazaToyUsed: 0,
    plazaToyRemaining: 0,
    plazaToyCap: 10,
  };
}

/** Server remaining is authoritative. Null remaining means local/unsigned play.
 *
 * An egg already in the garden must not block a new drawing — the mesh cooks
 * in the background on purpose. Only an in-flight submit (`pendingBirth`)
 * is locked, so a double-tap cannot spend two credits.
 *
 * After the free 3D, drawing spends a still credit. Local paper (D-026) only
 * when stills and 3D are both gone.
 */
export function canStartCreation(input: {
  remaining: number | null;
  pendingBirth: boolean;
  stillRemaining?: number | null;
  used?: number | null;
  /** Empty quota with a living Zufik: draw first, pay on «Оживить». */
  inviteFriend?: boolean;
}): boolean {
  if (input.pendingBirth) return false;
  if (input.remaining === null && (input.stillRemaining == null || input.stillRemaining === undefined)) {
    return true;
  }
  if ((input.used ?? 0) === 0 && (input.remaining ?? 0) > 0) return true;
  if ((input.stillRemaining ?? 0) > 0) return true;
  const stillsGone = input.stillRemaining != null && input.stillRemaining <= 0;
  const threedGone = input.remaining != null && input.remaining <= 0;
  if (input.inviteFriend && stillsGone && threedGone) return true;
  return false;
}

export function applyRemaining(quota: Quota | null, remaining: number): Quota | null {
  if (!quota) {
    return withDerivedStills({
      remaining,
      quotaTotal: remaining,
      used: 0,
      stillUsed: 0,
      stillQuota: stillQuotaOf(remaining),
      stillRemaining: stillQuotaOf(remaining),
      ...emptyWorlds(),
    });
  }
  return withDerivedStills({
    ...quota,
    remaining,
    used: Math.max(quota.used, quota.quotaTotal - remaining),
  });
}

export function applyStillRemaining(quota: Quota | null, stillRemaining: number): Quota | null {
  if (!quota) {
    const stillQuota = 10;
    const used = Math.max(0, stillQuota - stillRemaining);
    return withDerivedStills({
      remaining: 0,
      quotaTotal: 1,
      used: 1,
      stillUsed: used,
      stillQuota,
      stillRemaining,
      ...emptyWorlds(),
    });
  }
  return withDerivedStills({
    ...quota,
    stillUsed: Math.max(quota.stillUsed, quota.stillQuota - stillRemaining),
    stillRemaining,
  });
}

export function spendOneCredit(quota: Quota | null): Quota | null {
  if (!quota) return quota;
  return applyRemaining(quota, Math.max(0, quota.remaining - 1));
}

export function spendOneStill(quota: Quota | null): Quota | null {
  if (!quota) return quota;
  return applyStillRemaining(quota, Math.max(0, quota.stillRemaining - 1));
}
