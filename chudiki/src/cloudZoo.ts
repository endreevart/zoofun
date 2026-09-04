import { API_BASE, authHeaders, parentToken } from './api';
import type { StoredCreature } from './game/persistence/zooStore';

type ZooResponse = {
  child_id: string;
  creatures: StoredCreature[];
};

const PULL_MS = 4000;

export async function pullCloudZoo(): Promise<StoredCreature[] | null> {
  if (!parentToken()) return null;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PULL_MS);
  try {
    const response = await fetch(`${API_BASE}/v1/zoo`, {
      headers: authHeaders(),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as ZooResponse;
    return Array.isArray(body.creatures) ? body.creatures : [];
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function pushCloudZoo(creatures: StoredCreature[]): Promise<void> {
  if (!parentToken()) return;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8000);
  try {
    await fetch(`${API_BASE}/v1/zoo`, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ creatures }),
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timer);
  }
}

export async function upsertCloudCreature(record: StoredCreature): Promise<void> {
  if (!parentToken()) return;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8000);
  try {
    await fetch(`${API_BASE}/v1/zoo/creatures/${encodeURIComponent(record.spec.id)}`, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(record),
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timer);
  }
}

export async function deleteCloudCreature(id: string): Promise<void> {
  if (!parentToken()) return;
  await fetch(`${API_BASE}/v1/zoo/creatures/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}
