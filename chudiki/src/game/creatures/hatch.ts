/** How much one tap warms the egg. A few taps should feel like helping. */
export const HATCH_TAP = 0.2;
/** Taps can hatch as soon as the creature is ready. */
export const HATCH_TAP_READY = 0.35;
/** Seconds before a ready egg opens by itself if nobody taps. */
export const HATCH_WAIT = 2.4;
/** How many cracks the shell can show. */
export const HATCH_CRACKS = 8;

export type HatchLook = {
  cracks: number;
  fill: number;
  spin: number;
  ready: boolean;
};

export function warmEgg(heat: number): number {
  return Math.min(1, heat + HATCH_TAP);
}

export function crackAmount(heat: number, ready: boolean): number {
  if (ready) return Math.min(1, 0.42 + heat);
  return heat * 0.72;
}

/** One tap, one new crack. A ready egg already has a few splits. */
export function cracksFromHeat(heat: number, ready: boolean): number {
  const taps = Math.round(heat / HATCH_TAP);
  if (ready) return Math.min(HATCH_CRACKS, Math.max(taps, 4));
  return Math.min(HATCH_CRACKS, taps);
}

export function hatchFill(age: number, painted: boolean, ready: boolean): number {
  if (ready) return 1;
  if (painted) return Math.min(0.92, 0.55 + age / 50);
  return Math.min(0.5, 0.1 + age / 28);
}

export function hatchFromTap(heat: number, ready: boolean): boolean {
  return ready && heat >= HATCH_TAP_READY;
}

export function hatchFromWait(wait: number, heat: number, ready: boolean): boolean {
  if (!ready) return false;
  return wait >= Math.max(0.35, HATCH_WAIT - heat * 2);
}

/** The egg stays shut until Meshy finishes or gives up. A still is not a puppet. */
export function eggCanOpen(
  mesh: 'pending' | 'ready' | 'skipped' | 'failed',
  modelUrl?: string,
): boolean {
  return Boolean(modelUrl) || mesh !== 'pending';
}
