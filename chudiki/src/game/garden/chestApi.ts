import { API_BASE, authHeaders, parentToken } from '../../api';

export type GardenChest = { id: string; x: number; z: number };

export type GardenChestHunt = {
  chest: GardenChest | null;
  opened: number;
  total: number;
};

export type GardenChestFact = {
  title: string;
  body: string;
  opened: number;
  total: number;
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

export async function fetchGardenChest(worldId: string): Promise<GardenChestHunt | null> {
  const body = await readJson<GardenChestHunt>(
    `/v1/zoo/chest?world_id=${encodeURIComponent(worldId)}`,
  );
  if (!body || typeof body.total !== 'number') return null;
  const raw = body.chest;
  const chest =
    raw &&
    typeof raw === 'object' &&
    typeof raw.id === 'string' &&
    raw.id.trim() &&
    typeof raw.x === 'number' &&
    typeof raw.z === 'number'
      ? { id: raw.id, x: raw.x, z: raw.z }
      : null;
  return {
    chest,
    opened: Math.max(0, Math.floor(body.opened ?? 0)),
    total: Math.max(0, Math.floor(body.total ?? 0)),
  };
}

export async function openGardenChest(worldId: string, id: string): Promise<GardenChestFact | null> {
  const body = await readJson<GardenChestFact>('/v1/zoo/chest/open', {
    method: 'POST',
    body: JSON.stringify({ world_id: worldId, id }),
  });
  if (!body || typeof body.title !== 'string' || typeof body.body !== 'string') return null;
  if (!body.title.trim() || !body.body.trim()) return null;
  return {
    title: body.title.trim(),
    body: body.body.trim(),
    opened: Math.max(0, Math.floor(body.opened ?? 0)),
    total: Math.max(0, Math.floor(body.total ?? 0)),
  };
}
