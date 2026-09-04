/** How much one tap warms the egg. A few taps should feel like helping. */
export const HATCH_TAP = 0.2;
/** Taps can hatch as soon as the creature is ready. */
export const HATCH_TAP_READY = 0.35;
/** Seconds before a ready egg opens by itself if nobody taps. */
export const HATCH_WAIT = 2.4;

export function warmEgg(heat: number): number {
  return Math.min(1, heat + HATCH_TAP);
}

export function crackAmount(heat: number, ready: boolean): number {
  if (ready) return Math.min(1, 0.42 + heat);
  return heat * 0.72;
}

export function hatchFromTap(heat: number, ready: boolean): boolean {
  return ready && heat >= HATCH_TAP_READY;
}

export function hatchFromWait(wait: number, heat: number, ready: boolean): boolean {
  if (!ready) return false;
  return wait >= Math.max(0.35, HATCH_WAIT - heat * 2);
}
