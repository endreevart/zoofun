/**
 * Washing a chudik in the care room, the way kids' car-wash games do it:
 * soak with the watering can, scrub the mud into foam, rinse the foam off,
 * then towel the toy dry. Coordinates are 0..1 over the toy portrait.
 * The caller seeds the rng so the same chudik gets the same mud.
 */

export type WashSpot = { x: number; y: number; r: number; hp: number };
export type FoamBlob = { x: number; y: number; r: number; hp: number };

export type WashStage = 'soak' | 'scrub' | 'rinse' | 'dry' | 'done';
export type WashTool = 'shower' | 'sponge' | 'towel';

export type WashState = {
  stage: WashStage;
  /** 0..1, watering-can coverage before scrubbing may start. */
  soak: number;
  spots: WashSpot[];
  foam: FoamBlob[];
  /** Total foam hp when the rinse began, for the progress bar. */
  foamTotal: number;
  /** 0..1, towel coverage at the end. */
  dry: number;
};

/** Rubs to clear one spot. */
export const SPOT_HP = 4;
/** Pours to soak the toy. */
export const SOAK_HITS = 14;
/** Towel rubs to dry the toy. */
export const DRY_HITS = 14;
/** Pours to pop one foam blob. */
export const FOAM_HP = 2;
/** How many foam blobs the scrubbing leaves behind at most. */
export const FOAM_CAP = 10;

/** The one tool that works on each stage; the UI hands it to the child. */
export const STAGE_TOOL: Record<Exclude<WashStage, 'done'>, WashTool> = {
  soak: 'shower',
  scrub: 'sponge',
  rinse: 'shower',
  dry: 'towel',
};

const between = (rng: () => number, min: number, max: number) => min + rng() * (max - min);

/** Mud on the toy. */
export function makeDirt(rng: () => number, count = 7): WashSpot[] {
  const spots: WashSpot[] = [];
  for (let i = 0; i < count; i += 1) {
    spots.push({
      x: between(rng, 0.22, 0.78),
      y: between(rng, 0.24, 0.76),
      r: between(rng, 0.07, 0.13),
      hp: SPOT_HP,
    });
  }
  return spots;
}

/** One scrub at a point. Mutates hp; returns how many spots it touched. */
export function scrubAt(spots: WashSpot[], x: number, y: number, radius: number): number {
  let hits = 0;
  for (const spot of spots) {
    if (spot.hp <= 0) continue;
    if (Math.hypot(spot.x - x, spot.y - y) <= spot.r + radius) {
      spot.hp -= 1;
      hits += 1;
    }
  }
  return hits;
}

export function washProgress(spots: readonly WashSpot[]): number {
  const total = spots.length * SPOT_HP;
  if (total === 0) return 1;
  const left = spots.reduce((sum, spot) => sum + Math.max(0, spot.hp), 0);
  return 1 - left / total;
}

export function washDone(spots: readonly WashSpot[]): boolean {
  return spots.every((spot) => spot.hp <= 0);
}

/** A fresh muddy chudik waiting for the watering can. */
export function startWash(rng: () => number): WashState {
  return { stage: 'soak', soak: 0, spots: makeDirt(rng), foam: [], foamTotal: 0, dry: 0 };
}

/** N hits of 1/N must land exactly on 1 despite floating point. */
const clampFull = (value: number) => (value >= 1 - 1e-9 ? 1 : value);

/** The watering can and the towel only work aimed at the chudik itself. */
export function onToy(x: number, y: number): boolean {
  return x >= 0.04 && x <= 0.96 && y >= 0.04 && y <= 0.96;
}

/**
 * One tool touch at (x, y) in toy coordinates. Mutates the state and reports
 * whether anything reacted and whether the stage just advanced.
 */
export function applyWash(
  state: WashState,
  x: number,
  y: number,
  rng: () => number,
): { hit: boolean; advanced: boolean } {
  switch (state.stage) {
    case 'soak': {
      if (!onToy(x, y)) return { hit: false, advanced: false };
      state.soak = clampFull(state.soak + 1 / SOAK_HITS);
      if (state.soak >= 1) {
        state.stage = 'scrub';
        return { hit: true, advanced: true };
      }
      return { hit: true, advanced: false };
    }
    case 'scrub': {
      const hits = scrubAt(state.spots, x, y, 0.1);
      if (hits > 0 && state.foam.length < FOAM_CAP) {
        state.foam.push({
          x: x + (rng() - 0.5) * 0.06,
          y: y + (rng() - 0.5) * 0.06,
          r: between(rng, 0.08, 0.13),
          hp: FOAM_HP,
        });
      }
      if (washDone(state.spots)) {
        state.foamTotal = state.foam.reduce((sum, blob) => sum + blob.hp, 0);
        state.stage = state.foam.length > 0 ? 'rinse' : 'dry';
        return { hit: true, advanced: true };
      }
      return { hit: hits > 0, advanced: false };
    }
    case 'rinse': {
      let hit = false;
      for (const blob of state.foam) {
        if (blob.hp <= 0) continue;
        if (Math.hypot(blob.x - x, blob.y - y) <= blob.r + 0.18) {
          blob.hp -= 1;
          hit = true;
        }
      }
      state.foam = state.foam.filter((blob) => blob.hp > 0);
      if (state.foam.length === 0) {
        state.stage = 'dry';
        return { hit: true, advanced: true };
      }
      return { hit, advanced: false };
    }
    case 'dry': {
      if (!onToy(x, y)) return { hit: false, advanced: false };
      state.dry = clampFull(state.dry + 1 / DRY_HITS);
      if (state.dry >= 1) {
        state.stage = 'done';
        return { hit: true, advanced: true };
      }
      return { hit: true, advanced: false };
    }
    default:
      return { hit: false, advanced: false };
  }
}

/** Overall progress 0..1 across all four stages for the header bar. */
export function washTotal(state: WashState): number {
  const scrub = washProgress(state.spots);
  const rinse =
    state.stage === 'soak' || state.stage === 'scrub'
      ? 0
      : state.foamTotal === 0
        ? 1
        : 1 - state.foam.reduce((sum, blob) => sum + blob.hp, 0) / state.foamTotal;
  return Math.min(1, state.soak * 0.2 + scrub * 0.35 + rinse * 0.25 + state.dry * 0.2);
}
