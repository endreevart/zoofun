/** Mounds on the shared lawn. A smash may hide a generation credit (D-030). */

export type PlazaMound = { id: string; x: number; z: number };
export type PlazaTicket = { id: string; x: number; z: number };

export const PLAZA_DIG_NEAR = 5.6;
/** Draw pad after the ticket has had a moment to float. */
export const PLAZA_FIND_MS = 2800;
export const PLAZA_TICKET = '/plaza/ticket.png';

export function localPlazaMounds(): PlazaMound[] {
  return [
    { id: 'm0', x: 34, z: 16 },
    { id: 'm1', x: -30, z: 38 },
    { id: 'm2', x: 42, z: -28 },
    { id: 'm3', x: -38, z: -20 },
  ];
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

export function ticketsFromRoom(raw: unknown): PlazaTicket[] {
  return moundsFromRoom(raw);
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
