import { visitorId } from './visitor';

const KEY = 'chudiki.hearts.v1';

type Store = {
  zoo: Record<string, number>;
  creatures: Record<string, Record<string, number>>;
  given: Record<string, true>;
};

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { zoo: {}, creatures: {}, given: {} };
    const parsed = JSON.parse(raw) as Store;
    return {
      zoo: parsed.zoo ?? {},
      creatures: parsed.creatures ?? {},
      given: parsed.given ?? {},
    };
  } catch {
    return { zoo: {}, creatures: {}, given: {} };
  }
}

function write(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* private mode */
  }
}

function stamp(shareId: string, creatureId: string): string {
  return `${visitorId()}:${shareId}:${creatureId || 'zoo'}`;
}

export function localCounts(shareId: string): { hearts: number; joy: number; creatures: Record<string, number> } {
  const store = read();
  const hearts = store.zoo[shareId] ?? 0;
  const creatures = store.creatures[shareId] ?? {};
  const joy = hearts + Object.values(creatures).reduce((sum, n) => sum + n, 0);
  return { hearts, joy, creatures };
}

export function alreadyGave(shareId: string, creatureId = ''): boolean {
  if (!shareId) return false;
  return Boolean(read().given[stamp(shareId, creatureId)]);
}

export function localLike(shareId: string, creatureId = ''): { hearts: number; joy: number; creatures: Record<string, number> } {
  const store = read();
  const key = stamp(shareId, creatureId);
  if (!store.given[key]) {
    store.given[key] = true;
    if (creatureId) {
      const bag = { ...(store.creatures[shareId] ?? {}) };
      bag[creatureId] = (bag[creatureId] ?? 0) + 1;
      store.creatures[shareId] = bag;
    } else {
      store.zoo[shareId] = (store.zoo[shareId] ?? 0) + 1;
    }
    write(store);
  }
  return localCounts(shareId);
}
