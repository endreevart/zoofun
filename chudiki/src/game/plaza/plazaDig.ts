/** Mounds on the shared lawn. A smash may hide a generation credit (D-030). */

export type PlazaMound = { id: string; x: number; z: number };
export type PlazaTicket = { id: string; x: number; z: number };

export const PLAZA_DIG_NEAR = 5.6;
/** Draw pad after the ticket has had a moment to float. */
export const PLAZA_FIND_MS = 2800;
export const PLAZA_TICKET = '/plaza/ticket.png';
export const PLAZA_CRYSTAL_MIN = 30;
export const PLAZA_CRYSTAL_MAX = 30;
export const PLAZA_CRYSTAL_COUNT = 30;
export const PLAZA_TICKET_CRYSTALS = 8;
export const PLAZA_CRYSTAL_INNER = 28;
export const PLAZA_CRYSTAL_OUTER = 265;
export const GARDEN_CRYSTAL_COUNT = 5;
export const GARDEN_TICKETS_PER_DAY = 2;
export const GARDEN_CRYSTAL_INNER = 6;
export const GARDEN_CRYSTAL_OUTER = 18;
export const GARDEN_DIG_NEAR = 2.5;
/** Bird's-eye of the whole lawn must not count as standing on a crystal. */
export const GARDEN_DIG_MAX_CAMERA = 18;
const MIN_R = PLAZA_CRYSTAL_INNER;
const MAX_R = PLAZA_CRYSTAL_OUTER;
const MIN_GAP = 16;
const GARDEN_GAP = 7;
const GARDEN_CX = 0;
const GARDEN_CZ = -5;

function mulberry(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function placeAway(from: readonly PlazaMound[], id: string, rand: () => number): PlazaMound {
  let gap = MIN_GAP;
  for (let attempt = 0; attempt < 96; attempt += 1) {
    const radius = Math.sqrt(MIN_R * MIN_R + rand() * (MAX_R * MAX_R - MIN_R * MIN_R));
    const angle = rand() * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (from.every((item) => Math.hypot(item.x - x, item.z - z) >= gap)) {
      return { id, x, z };
    }
    if (attempt === 32 || attempt === 64) gap *= 0.7;
  }
  const radius = MIN_R + rand() * (MAX_R - MIN_R);
  const angle = rand() * Math.PI * 2;
  return { id, x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
}

export function localPlazaMounds(count = PLAZA_CRYSTAL_COUNT, seed = 1): PlazaMound[] {
  const n = Math.min(PLAZA_CRYSTAL_MAX, Math.max(PLAZA_CRYSTAL_MIN, count));
  const rand = mulberry(seed);
  const mounds: PlazaMound[] = [];
  for (let i = 0; i < n; i += 1) {
    mounds.push(placeAway(mounds, `m${i}`, rand));
  }
  return mounds;
}

export function refillPlazaMounds(
  current: readonly PlazaMound[],
  target = PLAZA_CRYSTAL_COUNT,
): PlazaMound[] {
  const next = current.slice();
  let seq = next.length;
  const rand = Math.random;
  while (next.length < target) {
    seq += 1;
    next.push(placeAway(next, `m${seq}-${Math.floor(rand() * 1e9)}`, rand));
  }
  return next;
}

export function ticketsFromRoom(raw: unknown): PlazaTicket[] {
  return moundsFromRoom(raw);
}

export function moundsFromRoom(raw: unknown): PlazaMound[] {
  if (!Array.isArray(raw)) return [];
  const out: PlazaMound[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as { id?: unknown; x?: unknown; z?: unknown };
    if (typeof row.id !== 'string' || !row.id.trim()) continue;
    if (typeof row.x !== 'number' || !Number.isFinite(row.x)) continue;
    if (typeof row.z !== 'number' || !Number.isFinite(row.z)) continue;
    out.push({ id: row.id, x: row.x, z: row.z });
  }
  return out;
}

export function localGardenMounds(seed = 1): PlazaMound[] {
  const rand = mulberry(seed);
  const mounds: PlazaMound[] = [];
  let gap = GARDEN_GAP;
  for (let i = 0; i < GARDEN_CRYSTAL_COUNT; i += 1) {
    mounds.push(placeGarden(mounds, `g${i}`, rand, gap));
  }
  return mounds;
}

function placeGarden(
  from: readonly PlazaMound[],
  id: string,
  rand: () => number,
  startGap: number,
): PlazaMound {
  let gap = startGap;
  for (let attempt = 0; attempt < 96; attempt += 1) {
    const radius = Math.sqrt(
      GARDEN_CRYSTAL_INNER * GARDEN_CRYSTAL_INNER +
        rand() * (GARDEN_CRYSTAL_OUTER * GARDEN_CRYSTAL_OUTER - GARDEN_CRYSTAL_INNER * GARDEN_CRYSTAL_INNER),
    );
    const angle = rand() * Math.PI * 2;
    const x = GARDEN_CX + Math.cos(angle) * radius;
    const z = GARDEN_CZ + Math.sin(angle) * radius;
    if (from.every((item) => Math.hypot(item.x - x, item.z - z) >= gap)) {
      return { id, x, z };
    }
    if (attempt === 32 || attempt === 64) gap *= 0.7;
  }
  const radius = GARDEN_CRYSTAL_INNER + rand() * (GARDEN_CRYSTAL_OUTER - GARDEN_CRYSTAL_INNER);
  const angle = rand() * Math.PI * 2;
  return { id, x: GARDEN_CX + Math.cos(angle) * radius, z: GARDEN_CZ + Math.sin(angle) * radius };
}

export function refillGardenMounds(current: readonly PlazaMound[]): PlazaMound[] {
  const next = current.slice();
  let seq = next.length;
  const rand = Math.random;
  while (next.length < GARDEN_CRYSTAL_COUNT) {
    seq += 1;
    next.push(placeGarden(next, `g${seq}-${Math.floor(rand() * 1e9)}`, rand, GARDEN_GAP));
  }
  return next;
}

export function gardenSmashId(
  x: number,
  z: number,
  cameraDistance: number,
  mounds: readonly PlazaMound[],
): string | null {
  if (cameraDistance > GARDEN_DIG_MAX_CAMERA) return null;
  return nearMound(x, z, mounds, GARDEN_DIG_NEAR);
}

export function nearMound(
  x: number,
  z: number,
  mounds: readonly PlazaMound[],
  radius = PLAZA_DIG_NEAR,
): string | null {
  let best: string | null = null;
  let bestDist = radius;
  for (const mound of mounds) {
    const dist = Math.hypot(mound.x - x, mound.z - z);
    if (dist < bestDist) {
      bestDist = dist;
      best = mound.id;
    }
  }
  return best;
}
