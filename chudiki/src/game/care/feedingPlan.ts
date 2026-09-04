/**
 * Who goes to which harvest basket, and where they stand so two groups never
 * pile onto one bowl. Group k is the k-th animal at every feeder. Everyone
 * walks up; they take turns at the bowl.
 */

export const FEEDER_MODEL = 'harvest-cradle';
export const EAT_SECONDS = 2.4;
/** How close a chudik must get before it starts eating. */
export const ARRIVE_RADIUS = 0.5;
/** Everyone walks toward a basket so feeding is visible across the park. */
export const APPROACH_DEPTH = 64;
/** If the head of the queue cannot reach the bowl, snap and eat. */
export const ARRIVE_TIMEOUT = 18;

export type FeederSpot = {
  id: string;
  x: number;
  z: number;
  rotationY: number;
};

export type CreaturePose = {
  id: string;
  x: number;
  z: number;
};

export type Assignment = {
  creatureId: string;
  feederIndex: number;
  /** 0 eats now; later places stand in line behind. */
  place: number;
};

export type GroundSlot = { x: number; z: number };

/**
 * Each chudik walks to the nearest basket and queues there. An empty bowl
 * across the park is not worth a trek.
 */
export function assignToFeeders(
  creatures: readonly CreaturePose[],
  feeders: readonly FeederSpot[],
): Assignment[] {
  if (feeders.length === 0) return [];
  const counts = new Array<number>(feeders.length).fill(0);
  const assigned: Assignment[] = [];

  for (const creature of creatures) {
    let best = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let index = 0; index < feeders.length; index++) {
      const feeder = feeders[index];
      const distance = Math.hypot(creature.x - feeder.x, creature.z - feeder.z);
      if (distance < bestScore) {
        bestScore = distance;
        best = index;
      }
    }
    assigned.push({
      creatureId: creature.id,
      feederIndex: best,
      place: counts[best],
    });
    counts[best] += 1;
  }

  assigned.sort((a, b) => {
    if (a.feederIndex !== b.feederIndex) return a.feederIndex - b.feederIndex;
    const feeder = feeders[a.feederIndex];
    const poseA = creatures.find((row) => row.id === a.creatureId);
    const poseB = creatures.find((row) => row.id === b.creatureId);
    if (!poseA || !poseB) return 0;
    const da = Math.hypot(poseA.x - feeder.x, poseA.z - feeder.z);
    const db = Math.hypot(poseB.x - feeder.x, poseB.z - feeder.z);
    return da - db;
  });
  const seen = new Array<number>(feeders.length).fill(0);
  for (const row of assigned) {
    row.place = seen[row.feederIndex];
    seen[row.feederIndex] += 1;
  }

  return assigned;
}

/**
 * Stand in front of the basket, facing inward so the queue does not walk
 * off the cliff. `place` 0 is the eat spot; later places step back.
 */
export function slotBeside(
  feeder: FeederSpot,
  place: number,
  island: { x: number; z: number } = { x: 0, z: -5 },
): GroundSlot {
  const inwardX = island.x - feeder.x;
  const inwardZ = island.z - feeder.z;
  const length = Math.hypot(inwardX, inwardZ) || 1;
  const nx = inwardX / length;
  const nz = inwardZ / length;
  const sideX = -nz;
  const sideZ = nx;
  const back = 1.55 + place * 0.95;
  const side = place === 0 ? 0 : (place % 2 === 1 ? 0.55 : -0.55);
  return {
    x: feeder.x + nx * back + sideX * side,
    z: feeder.z + nz * back + sideZ * side,
  };
}

export function livePlace(
  assignments: readonly Assignment[],
  creatureId: string,
  finished: ReadonlySet<string>,
): number | null {
  const mine = assignments.find((row) => row.creatureId === creatureId);
  if (!mine || finished.has(creatureId)) return null;
  let ahead = 0;
  for (const row of assignments) {
    if (row.feederIndex !== mine.feederIndex) continue;
    if (finished.has(row.creatureId)) continue;
    if (row.place < mine.place) ahead += 1;
  }
  return ahead;
}
