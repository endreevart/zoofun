/** Garden joy from hearts. Numbers stay visible; the lawn shows the mood. */

export type JoyTier = 0 | 1 | 2 | 3 | 4 | 5;

export function joyFromHearts(hearts: number): number {
  const n = Math.max(0, hearts);
  if (n <= 0) return 0;
  if (n < 5) return 0.22;
  if (n < 15) return 0.42;
  if (n < 40) return 0.62;
  if (n < 100) return 0.82;
  return 1;
}

export function joyTier(hearts: number): JoyTier {
  const n = Math.max(0, hearts);
  if (n <= 0) return 0;
  if (n < 5) return 1;
  if (n < 15) return 2;
  if (n < 40) return 3;
  if (n < 100) return 4;
  return 5;
}

export function heartRainCount(hearts: number): number {
  return Math.min(28, 6 + Math.floor(Math.max(0, hearts) / 3));
}

export function airSpawnChance(hearts: number): number {
  return 0.04 + joyFromHearts(hearts) * 0.18;
}
