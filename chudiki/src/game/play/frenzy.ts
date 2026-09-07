/**
 * Feeding arcade: snacks rain down, the child slides the chudik's bowl to
 * catch them. Socks and stars are not food: catching one costs a point
 * (never below zero) and makes the toy sneeze — dodge them!
 * Two waves keep it interesting: after WAVE2_AT points the sky speeds up,
 * golden apples are worth three, and five catches in a row make a combo.
 * The caller seeds the rng.
 */

export type SnackKind = 'apple' | 'berry' | 'star' | 'golden' | 'sock';
export type PlannedSnack = { at: number; kind: SnackKind; x: number };

/** Points to finish. Long enough to be a game, short enough for age three. */
export const FEED_GOAL = 16;
/** Points at which the second, faster wave begins. */
export const WAVE2_AT = 8;
/** Catches in a row that trigger the combo celebration. */
export const STREAK_BURST = 5;
/** Bowl half-width in 0..1 screen coords. Generous: nobody loses. */
export const CATCH_HALF = 0.13;
/** Vertical band (0..1, top-down) where the bowl can catch. */
export const CATCH_BAND: [number, number] = [0.7, 0.94];
/** Base fall speed in screen heights per second. */
export const FALL_SPEED = 0.24;

const FOOD: SnackKind[] = ['apple', 'berry'];
const JUNK: SnackKind[] = ['sock', 'star'];

export function isFood(kind: SnackKind): boolean {
  return !JUNK.includes(kind);
}

/** Points for one catch: junk costs a point, golden pays three. */
export function snackValue(kind: SnackKind): number {
  if (!isFood(kind)) return -1;
  return kind === 'golden' ? 3 : 1;
}

/** The score never goes below zero: it stings, it never ruins. */
export function scoreAfterCatch(score: number, kind: SnackKind): number {
  return Math.max(0, score + snackValue(kind));
}

export function waveOf(score: number): 1 | 2 {
  return score >= WAVE2_AT ? 2 : 1;
}

/** Wave two rains faster: the spawn clock and the snacks both hurry up. */
export function clockRate(wave: 1 | 2): number {
  return wave === 2 ? 1.35 : 1;
}

export function fallSpeed(kind: SnackKind, wave: 1 | 2): number {
  const base = kind === 'golden' ? FALL_SPEED * 1.3 : FALL_SPEED;
  return wave === 2 ? base * 1.25 : base;
}

/**
 * Streak of clean food catches. Missing food or catching junk resets it;
 * dodging junk keeps it alive.
 */
export function nextStreak(streak: number, kind: SnackKind, wasCaught: boolean): number {
  if (!isFood(kind)) return wasCaught ? 0 : streak;
  return wasCaught ? streak + 1 : 0;
}

const between = (rng: () => number, min: number, max: number) => min + rng() * (max - min);

/** Seeded rain: mostly food, junk to dodge, the rare golden apple. */
export function spawnPlan(rng: () => number, count = 48): PlannedSnack[] {
  const plan: PlannedSnack[] = [];
  let at = 0.7;
  for (let i = 0; i < count; i += 1) {
    at += between(rng, 0.55, 1.05);
    const junk = i > 2 && rng() < 0.22;
    const golden = !junk && i > 4 && rng() < 0.09;
    plan.push({
      at,
      kind: junk
        ? JUNK[Math.floor(rng() * JUNK.length)]
        : golden
          ? 'golden'
          : FOOD[Math.floor(rng() * FOOD.length)],
      x: between(rng, 0.1, 0.9),
    });
  }
  return plan;
}

/** A snack in the catch band close enough to the bowl. */
export function caught(x: number, y: number, bowlX: number): boolean {
  return y >= CATCH_BAND[0] && y <= CATCH_BAND[1] && Math.abs(x - bowlX) <= CATCH_HALF;
}
