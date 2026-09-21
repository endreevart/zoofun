import { upsertCloudCreature } from '../../cloudZoo';
import { API_BASE, authHeaders } from '../../api';
import { loadCreatures, type StoredCreature } from '../persistence/zooStore';
import { moundsFromRoom, ticketsFromRoom } from './plazaDig';
import {
  isPlazaReadySpec,
  mergePlazaToys,
  plazaToyStill,
  PLAZA_EMOTES,
  type PlazaEmoteId,
  type PlazaToyRow,
} from './plazaCopy';
import { readPlazaLawnToy } from './plazaToy';

export type PlazaToy = PlazaToyRow;

export type PlazaPeer = {
  seat: number;
  spec_id: string;
  name: string;
  portrait: string;
  model?: string;
  emote: string;
  self: boolean;
};

export type PlazaMound = { id: string; x: number; z: number };
export type PlazaTicket = { id: string; x: number; z: number };

export type PlazaRoom = {
  room_id: number;
  seat: number;
  online: number;
  peers: PlazaPeer[];
  stamps_rev?: number;
  mounds?: PlazaMound[];
  tickets?: PlazaTicket[];
};

export type PlazaDig = {
  found: boolean;
  remaining: number;
  mounds: PlazaMound[];
  ticket: PlazaTicket | null;
  tickets: PlazaTicket[];
};

export type PlazaStamp = {
  id: string;
  model: string;
  x: number;
  z: number;
  height: number;
  rotation_y: number;
  mine?: boolean;
  still_url?: string;
  model_url?: string;
  mesh_status?: string;
};

export type PlazaStamps = {
  rev: number;
  stamps: PlazaStamp[];
};

export type PlazaStampWrite = {
  rev: number;
  stamp: PlazaStamp;
};

export const PLAZA_GLB = '/plaza/plaza.glb';
export const PLAZA_CRYSTAL = '/plaza/crystal.glb?v=tex1';

async function readJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: authHeaders({
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      }),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchPlazaStatus(): Promise<number> {
  const body = await readJson<{ online?: number }>('/v1/plaza/status');
  return Math.max(0, Math.floor(body?.online ?? 0));
}

export function toysFromLocal(records: StoredCreature[]): PlazaToy[] {
  const toys: PlazaToy[] = [];
  for (const row of records) {
    if (!isPlazaReadySpec(row.spec)) continue;
    toys.push({
      spec_id: row.spec.id,
      name: row.spec.name.trim() || 'Зуфик',
      portrait: plazaToyStill(row.spec),
    });
  }
  return toys;
}

export async function fetchPlazaReady(): Promise<PlazaToy[]> {
  const body = await readJson<{ toys?: PlazaToy[] }>('/v1/plaza/ready');
  const remote = Array.isArray(body?.toys) ? body.toys : [];
  return mergePlazaToys(toysFromLocal(await loadCreatures()), remote);
}

export async function enterPlaza(specId: string): Promise<PlazaRoom | null> {
  void loadCreatures()
    .then((records) => {
      const record = records.find((row) => row.spec.id === specId);
      if (record) return upsertCloudCreature(record);
    })
    .catch(() => {
      /* local lawn still works */
    });
  return readJson<PlazaRoom>('/v1/plaza/enter', {
    method: 'POST',
    body: JSON.stringify({ spec_id: specId }),
  });
}

export async function beatPlaza(): Promise<PlazaRoom | null> {
  return readJson<PlazaRoom>('/v1/plaza/heartbeat', { method: 'POST' });
}

export async function emotePlaza(kind: PlazaEmoteId): Promise<PlazaRoom | null> {
  if (!PLAZA_EMOTES.some((item) => item.id === kind)) return null;
  return readJson<PlazaRoom>('/v1/plaza/emote', {
    method: 'POST',
    body: JSON.stringify({ kind }),
  });
}

export async function leavePlaza(): Promise<void> {
  await readJson<{ ok?: string }>('/v1/plaza/leave', { method: 'POST' });
}

export async function digPlaza(id: string): Promise<PlazaDig | null> {
  const body = await readJson<PlazaDig>('/v1/plaza/dig', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
  if (!body || !Array.isArray(body.mounds)) return null;
  return {
    found: Boolean(body.found),
    remaining: Math.max(0, Math.floor(body.remaining ?? 0)),
    mounds: moundsFromRoom(body.mounds),
    ticket: ticketsFromRoom(body.ticket ? [body.ticket] : [])[0] ?? null,
    tickets: ticketsFromRoom(body.tickets),
  };
}

export async function fetchPlazaStamps(): Promise<PlazaStamps | null> {
  const body = await readJson<PlazaStamps>('/v1/plaza/stamps');
  if (!body || !Array.isArray(body.stamps)) return null;
  return { rev: Math.max(0, Math.floor(body.rev ?? 0)), stamps: body.stamps };
}

export async function placePlazaStamp(
  model: string,
  x: number,
  z: number,
  height: number,
): Promise<PlazaStampWrite | null> {
  return readJson<PlazaStampWrite>('/v1/plaza/stamps', {
    method: 'POST',
    body: JSON.stringify({ model, x, z, height }),
  });
}

export async function patchPlazaStamp(
  id: string,
  patch: { x?: number; z?: number; height?: number; rotation_y?: number },
): Promise<PlazaStampWrite | null> {
  return readJson<PlazaStampWrite>(`/v1/plaza/stamps/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function deletePlazaStamp(id: string): Promise<{ rev: number; id: string } | null> {
  return readJson<{ rev: number; id: string }>(`/v1/plaza/stamps/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function fetchPlazaToys(): Promise<{
  toys: import('./plazaToy').PlazaLawnToy[];
  plaza_toy_remaining: number;
  plaza_toy_cap: number;
} | null> {
  const body = await readJson<{
    toys?: import('./plazaToy').PlazaLawnToy[];
    plaza_toy_remaining?: number;
    plaza_toy_cap?: number;
  }>('/v1/plaza/toys');
  if (!body || !Array.isArray(body.toys)) return null;
  return {
    toys: body.toys
      .map((row) => readPlazaLawnToy(row))
      .filter((row): row is import('./plazaToy').PlazaLawnToy => row !== null),
    plaza_toy_remaining: Math.max(0, Math.floor(body.plaza_toy_remaining ?? 0)),
    plaza_toy_cap: Math.max(0, Math.floor(body.plaza_toy_cap ?? 10)),
  };
}
