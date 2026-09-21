import { API_BASE, authHeaders, parentToken } from '../../api';
import { DIY_PROP_CAP, parseDiyProps, type AuthoredProp } from './layoutAuthored';
import { WORLD_DIY_SKU } from './gardens';

export const WORLD_DIY_GARDEN = WORLD_DIY_SKU;
export const DIY_LAYOUT_KEY = 'chudiki.diy.garden.v1';
export const DIY_LAYOUT_FETCH_MS = 2500;

export { DIY_PROP_CAP };

function layoutKey(worldId: string): string {
  if (worldId === WORLD_DIY_SKU) return DIY_LAYOUT_KEY;
  return `chudiki.diy.${worldId}.v1`;
}

export function loadDiyLayout(worldId: string = WORLD_DIY_SKU): AuthoredProp[] {
  try {
    const raw = localStorage.getItem(layoutKey(worldId));
    if (!raw) return [];
    return parseDiyProps(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveDiyLayout(props: AuthoredProp[], worldId: string = WORLD_DIY_SKU) {
  const cleaned = parseDiyProps({ props });
  try {
    localStorage.setItem(layoutKey(worldId), JSON.stringify({ version: 1, props: cleaned }));
  } catch {
    /* private mode */
  }
  return cleaned;
}

export async function fetchRemoteDiyLayout(
  worldId: string = WORLD_DIY_SKU,
  ms = DIY_LAYOUT_FETCH_MS,
): Promise<AuthoredProp[] | null> {
  if (!parentToken()) return null;
  const abort = new AbortController();
  const timer = window.setTimeout(() => abort.abort(), ms);
  try {
    const response = await fetch(
      `${API_BASE}/v1/zoo/layout?world_id=${encodeURIComponent(worldId)}`,
      { headers: authHeaders(), signal: abort.signal },
    );
    if (!response.ok) return null;
    return parseDiyProps(await response.json());
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function putRemoteDiyLayout(
  props: AuthoredProp[],
  worldId: string = WORLD_DIY_SKU,
): Promise<boolean> {
  if (!parentToken()) return false;
  try {
    const response = await fetch(`${API_BASE}/v1/zoo/layout`, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ world_id: worldId, props: parseDiyProps({ props }) }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
