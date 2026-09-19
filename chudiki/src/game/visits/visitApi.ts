import { API_BASE, authHeaders, parentToken } from '../../api';
import { assetUrl } from '../../assetUrl';
import { gardenArt } from '../world/kinds';
import { localCounts, localLike } from './heartLocal';
import { visitorId } from './visitor';

export type VitrineCard = {
  id: string;
  world_id: string;
  title: string;
  postcard: string;
  hearts: number;
  joy: number;
  creatures: number;
  created?: number;
  code?: number;
  mine?: boolean;
};

export type GuestCreature = {
  spec: {
    id: string;
    name: string;
    kindId?: string;
    worldId?: string;
    origin?: string;
    drawing?: { portraitUrl?: string; postcardUrl?: string; modelUrl?: string };
  };
  lastPosition?: { x: number; z: number } | null;
  hearts: number;
};

export type VisitSnapshot = {
  id: string;
  code?: number;
  world_id: string;
  title: string;
  diy: boolean;
  props: Array<Record<string, unknown>>;
  postcard: string;
  hearts: number;
  joy: number;
  creatures: GuestCreature[];
};

function visitHeaders(): HeadersInit {
  return { ...authHeaders(), 'X-Visitor-Id': visitorId() };
}

export function visitLink(shareId: string, code?: number): string {
  const url = new URL(window.location.href);
  url.searchParams.set('visit', code && code >= 1000 ? String(code) : shareId);
  url.searchParams.delete('token');
  return url.toString();
}

export const VITRINE_PAGE = 24;

export type VitrinePage = {
  items: VitrineCard[];
  total: number;
  offset: number;
  limit: number;
};

export async function listVitrine(
  offset = 0,
  limit = VITRINE_PAGE,
  query = '',
): Promise<VitrinePage> {
  const skip = Math.max(0, Math.floor(offset));
  const take = Math.max(1, Math.min(48, Math.floor(limit)));
  const q = query.trim() ? `&q=${encodeURIComponent(query.trim())}` : '';
  try {
    const response = await fetch(`${API_BASE}/v1/public/zoos?offset=${skip}&limit=${take}${q}`, {
      headers: visitHeaders(),
    });
    if (response.ok) {
      const body = (await response.json()) as Partial<VitrinePage>;
      const items = Array.isArray(body.items) ? body.items : [];
      return {
        items,
        total: typeof body.total === 'number' ? body.total : items.length,
        offset: typeof body.offset === 'number' ? body.offset : skip,
        limit: typeof body.limit === 'number' ? body.limit : take,
      };
    }
  } catch {
    /* local island */
  }
  return { items: [], total: 0, offset: skip, limit: take };
}

export async function loadVisit(shareId: string): Promise<VisitSnapshot | null> {
  try {
    const response = await fetch(`${API_BASE}/v1/public/zoos/${encodeURIComponent(shareId)}`, {
      headers: visitHeaders(),
    });
    if (response.ok) return (await response.json()) as VisitSnapshot;
  } catch {
    /* local island */
  }
  return null;
}

export async function likeVisit(shareId: string, creatureId?: string): Promise<VisitSnapshot | null> {
  const local = localLike(shareId, creatureId ?? '');
  try {
    const response = await fetch(`${API_BASE}/v1/public/zoos/${encodeURIComponent(shareId)}/hearts`, {
      method: 'POST',
      headers: { ...visitHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitor_id: visitorId(), creature_id: creatureId || null }),
    });
    if (response.ok) return (await response.json()) as VisitSnapshot;
  } catch {
    /* keep local */
  }
  return {
    id: shareId,
    world_id: shareId,
    title: '',
    diy: false,
    props: [],
    postcard: '',
    hearts: local.hearts,
    joy: local.joy,
    creatures: Object.entries(local.creatures).map(([id, hearts]) => ({
      spec: { id, name: '' },
      hearts,
    })),
  };
}

export async function ownerShareMeta(
  worldId: string,
): Promise<{ id: string; code: number } | null> {
  const token = parentToken();
  if (!token) return { id: `local:${worldId}`, code: 0 };
  try {
    const response = await fetch(
      `${API_BASE}/v1/zoo/share?world_id=${encodeURIComponent(worldId)}`,
      { headers: authHeaders({ Authorization: `Bearer ${token}` }) },
    );
    if (response.ok) {
      const body = (await response.json()) as { id?: string; code?: number };
      if (body.id) return { id: body.id, code: Number(body.code) || 0 };
    }
  } catch {
    /* local */
  }
  return { id: `local:${worldId}`, code: 0 };
}

export async function ownerShare(worldId: string): Promise<string | null> {
  const meta = await ownerShareMeta(worldId);
  return meta?.id ?? null;
}

export async function ownerHearts(worldId: string): Promise<{
  id: string;
  code?: number;
  hearts: number;
  joy: number;
  creatures: Record<string, number>;
} | null> {
  const token = parentToken();
  if (token) {
    try {
      const response = await fetch(
        `${API_BASE}/v1/zoo/hearts?world_id=${encodeURIComponent(worldId)}`,
        { headers: authHeaders({ Authorization: `Bearer ${token}` }) },
      );
      if (response.ok) {
        return (await response.json()) as {
          id: string;
          hearts: number;
          joy: number;
          creatures: Record<string, number>;
        };
      }
    } catch {
      /* local */
    }
  }
  const share = await ownerShare(worldId);
  if (!share) return null;
  const local = localCounts(share);
  return { id: share, ...local };
}

export function cardArt(card: Pick<VitrineCard, 'world_id' | 'postcard'>): string {
  const cover = card.postcard.startsWith('/ui/') ? card.postcard : gardenArt(card.world_id);
  return assetUrl(cover);
}

export { appendVitrine, mergeVitrinePage, sortVitrine } from './vitrineSort';
