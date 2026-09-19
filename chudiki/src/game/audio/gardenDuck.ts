/** Quiet bed under voices — children hold tablets close. */
export const GARDEN_BED_VOLUME = 0.11;

export function nextDuckCount(count: number, on: boolean): number {
  return Math.max(0, count + (on ? 1 : -1));
}

/** Pause the bed for a mic duck, a narrator clip, or a held intro chain. */
export function gardenShouldPause(duckCount: number, cueDuck = false, bedHeld = false): boolean {
  return duckCount > 0 || cueDuck || bedHeld;
}

export function gardenElementVolume(
  duckCount: number,
  music = GARDEN_BED_VOLUME,
  cueDuck = false,
  bedHeld = false,
): number {
  if (gardenShouldPause(duckCount, cueDuck, bedHeld)) return 0;
  const level = Number.isFinite(music) ? Math.min(1, Math.max(0, music)) : GARDEN_BED_VOLUME;
  return level;
}
