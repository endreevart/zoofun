/** Quiet bed under voices — children hold tablets close. */
export const GARDEN_BED_VOLUME = 0.11;

/** How far the bed drops while a narrator clip plays (still audible). */
export const GARDEN_CUE_DUCK = 0.28;

export function nextDuckCount(count: number, on: boolean): number {
  return Math.max(0, count + (on ? 1 : -1));
}

export function gardenElementVolume(
  duckCount: number,
  music = GARDEN_BED_VOLUME,
  cueDuck = false,
): number {
  if (duckCount > 0) return 0;
  const level = Number.isFinite(music) ? Math.min(1, Math.max(0, music)) : GARDEN_BED_VOLUME;
  return cueDuck ? level * GARDEN_CUE_DUCK : level;
}
