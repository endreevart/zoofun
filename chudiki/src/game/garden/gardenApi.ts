import { API_BASE, authHeaders, parentToken } from '../../api';
import { moundsFromRoom, ticketsFromRoom, type PlazaMound, type PlazaTicket } from '../plaza/plazaDig';

export type GardenHunt = {
  mounds: PlazaMound[];
  tickets_left: number;
};

export type GardenDig = {
  found: boolean;
  remaining: number;
  mounds: PlazaMound[];
  ticket: PlazaTicket | null;
  tickets_left: number;
};

async function readJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (!parentToken()) return null;
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: authHeaders({
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      }),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchGardenCrystals(worldId: string): Promise<GardenHunt | null> {
  const body = await readJson<GardenHunt>(
    `/v1/zoo/crystals?world_id=${encodeURIComponent(worldId)}`,
  );
  if (!body || !Array.isArray(body.mounds)) return null;
  return {
    mounds: moundsFromRoom(body.mounds),
    tickets_left: Math.max(0, Math.floor(body.tickets_left ?? 0)),
  };
}

export async function digGardenCrystal(worldId: string, id: string): Promise<GardenDig | null> {
  const body = await readJson<GardenDig>('/v1/zoo/crystals/dig', {
    method: 'POST',
    body: JSON.stringify({ world_id: worldId, id }),
  });
  if (!body || !Array.isArray(body.mounds)) return null;
  return {
    found: Boolean(body.found),
    remaining: Math.max(0, Math.floor(body.remaining ?? 0)),
    mounds: moundsFromRoom(body.mounds),
    ticket: ticketsFromRoom(body.ticket ? [body.ticket] : [])[0] ?? null,
    tickets_left: Math.max(0, Math.floor(body.tickets_left ?? 0)),
  };
}
