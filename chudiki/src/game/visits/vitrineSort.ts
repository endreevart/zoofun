/** Hearts first. If nobody liked yet, fuller zoos stand in front. */
export function sortVitrine<T extends { joy: number; creatures: number; title?: string }>(
  cards: T[],
): T[] {
  return [...cards].sort((left, right) => {
    if (right.joy !== left.joy) return right.joy - left.joy;
    if (right.creatures !== left.creatures) return right.creatures - left.creatures;
    return (left.title ?? '').localeCompare(right.title ?? '', 'ru');
  });
}

export function mergeVitrinePage<T extends { id: string; joy: number; creatures: number; title?: string }>(
  mine: T[],
  remote: T[],
): T[] {
  const seen = new Set(mine.map((item) => item.id));
  return sortVitrine([...mine, ...remote.filter((item) => !seen.has(item.id))]);
}

export function appendVitrine<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !seen.has(item.id))];
}

export type VitrineFilter = 'all' | 'new' | 'living';

export function isMineCard(card: { id: string; mine?: boolean }, mineId?: string | null): boolean {
  return Boolean(card.mine || (mineId && card.id === mineId));
}

export function matchVitrineQuery(
  title: string,
  query: string,
  extra?: { code?: number; id?: string },
): boolean {
  const needle = query.trim().toLocaleLowerCase('ru');
  if (!needle) return true;
  const digits = needle.replace(/\D/g, '');
  if (digits && extra?.code && String(extra.code) === digits) return true;
  if (extra?.id && extra.id.toLocaleLowerCase('ru').includes(needle)) return true;
  return title.toLocaleLowerCase('ru').includes(needle);
}

export function isHereCard(card: { id: string }, hereId?: string | null): boolean {
  return Boolean(hereId && card.id === hereId);
}

/** Витрина сидит в том же слое, что и выбор миров. Пока она открыта, пикер не должен ловить тапы. */
export function vitrineCoversWorlds(screen: string): boolean {
  return screen === 'vitrine';
}

/** Own-vitrine tap must not remount the garden the child is already playing as owner. */
export function ownVitrineRemountsGarden(
  currentWorld: string | null,
  destWorld: string | null | undefined,
  guest: boolean,
): boolean {
  if (!destWorld) return Boolean(currentWorld);
  if (currentWorld !== destWorld) return true;
  return guest;
}

export function arrangeVitrine<
  T extends {
    id: string;
    title: string;
    joy: number;
    creatures: number;
    created?: number;
    code?: number;
    mine?: boolean;
  },
>(
  cards: T[],
  query: string,
  filter: VitrineFilter,
  mineId?: string | null,
  hereId?: string | null,
): T[] {
  let next = cards.filter((card) => matchVitrineQuery(card.title, query, card));
  if (filter === 'living') next = next.filter((card) => card.creatures > 0);
  if (filter === 'new') {
    next = [...next].sort((left, right) => (right.created ?? 0) - (left.created ?? 0));
  } else {
    next = sortVitrine(next);
  }
  const mine = next.filter((card) => isMineCard(card, mineId));
  const rest = next.filter((card) => !isMineCard(card, mineId));
  const here = rest.filter((card) => isHereCard(card, hereId));
  const other = rest.filter((card) => !isHereCard(card, hereId));
  return [...mine, ...here, ...other];
}
