/**
 * Zones the adult paints in the layout editor to say where a new egg — and so
 * the chudik that hatches from it — may appear. With no zones painted an egg
 * lands on the main meadow, wherever the random generator likes.
 */

export type AuthoredSpawn = {
  id: string;
  x: number;
  z: number;
  radius: number;
};

export const DEFAULT_SPAWN_RADIUS = 2.4;
export const MIN_SPAWN_RADIUS = 0.6;
export const MAX_SPAWN_RADIUS = 9;

export function clampSpawnRadius(radius: number): number {
  if (!Number.isFinite(radius)) return DEFAULT_SPAWN_RADIUS;
  return Math.min(MAX_SPAWN_RADIUS, Math.max(MIN_SPAWN_RADIUS, radius));
}

export function isAuthoredSpawn(value: unknown): value is AuthoredSpawn {
  if (!value || typeof value !== 'object') return false;
  const zone = value as AuthoredSpawn;
  return (
    typeof zone.id === 'string' &&
    Number.isFinite(zone.x) &&
    Number.isFinite(zone.z) &&
    Number.isFinite(zone.radius) &&
    zone.radius > 0
  );
}

/** The zone under the finger, so a second tap edits it instead of stacking. */
export function nearestSpawnId(
  spawns: readonly AuthoredSpawn[],
  x: number,
  z: number,
  slack = 0.35,
): string | null {
  let best: { id: string; dist: number } | null = null;
  for (const zone of spawns) {
    const dist = Math.hypot(x - zone.x, z - zone.z);
    if (dist > zone.radius + slack) continue;
    if (!best || dist < best.dist) best = { id: zone.id, dist };
  }
  return best?.id ?? null;
}

/**
 * A point inside the painted zones, or null when nothing is painted and the
 * caller should keep its own default.
 *
 * Wider zones take proportionally more eggs, which is what painting one broad
 * lawn and one small nook looks like it should do. `walkable` keeps the egg out
 * of ponds and tree trunks even when a zone is drawn straight over them.
 */
export function sampleSpawnPoint(
  spawns: readonly AuthoredSpawn[],
  rng: () => number,
  walkable: (x: number, z: number) => boolean,
  tries = 240,
): { x: number; z: number } | null {
  const usable = spawns.filter(isAuthoredSpawn);
  if (usable.length === 0) return null;

  const weights = usable.map((zone) => zone.radius * zone.radius);
  const total = weights.reduce((sum, weight) => sum + weight, 0);

  for (let attempt = 0; attempt < tries; attempt++) {
    const zone = pickWeighted(usable, weights, total, rng());
    const angle = rng() * Math.PI * 2;
    // sqrt keeps the points spread evenly instead of crowding the centre.
    const radius = Math.sqrt(rng()) * zone.radius;
    const x = zone.x + Math.cos(angle) * radius;
    const z = zone.z + Math.sin(angle) * radius;
    if (walkable(x, z)) return { x, z };
  }

  // Every sample landed in water or a trunk. A zone's centre is the clearest
  // statement of where the adult wanted the egg, so it gets the last word.
  for (const zone of usable) {
    if (walkable(zone.x, zone.z)) return { x: zone.x, z: zone.z };
  }
  return null;
}

function pickWeighted(
  zones: readonly AuthoredSpawn[],
  weights: readonly number[],
  total: number,
  roll: number,
): AuthoredSpawn {
  let cursor = roll * total;
  for (let i = 0; i < zones.length; i++) {
    cursor -= weights[i];
    if (cursor <= 0) return zones[i];
  }
  return zones[zones.length - 1];
}
