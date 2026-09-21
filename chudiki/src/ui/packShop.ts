import type { Pack } from '../game/commerce';

export const FRIEND_PACK_ID = 'pack_1';
export const STARTER_PACK_ID = 'pack_5';
export const PACK_SHOP_MORE = 'Посмотреть все пакеты';
export const PACK_SHOP_SKIP = 'Пропустить';

export type PackShopView = {
  offers: Pack[];
  more: Pack[];
};

export function packShopView(packs: Pack[], remaining: number): PackShopView {
  const generation = packs
    .filter((pack) => pack.buyable && pack.animals > 0)
    .sort((a, b) => a.animals - b.animals);
  if (remaining > 0) {
    return { offers: packs, more: [] };
  }
  const one = generation.find((pack) => pack.id === FRIEND_PACK_ID || pack.animals === 1);
  const five = generation.find((pack) => pack.id === STARTER_PACK_ID);
  const offers: Pack[] = [];
  if (one) offers.push({ ...one, featured: false });
  if (five) offers.push({ ...five, featured: true });
  const shown = new Set(offers.map((pack) => pack.id));
  const more = generation.filter((pack) => !shown.has(pack.id));
  if (offers.length) return { offers, more };
  const fallback = generation[0];
  return {
    offers: fallback ? [{ ...fallback, featured: false }] : [],
    more: generation.slice(1),
  };
}

/** Empty quota: 1 + 5. Restock: the full catalog. */
export function packsForShop(packs: Pack[], remaining: number, expanded = false): Pack[] {
  const view = packShopView(packs, remaining);
  if (remaining > 0 || expanded) return [...view.offers, ...view.more];
  return view.offers;
}

export function packShopTitle(remaining: number, forFriend = false): string {
  if (forFriend && remaining <= 0) return 'Оживите этого друга';
  return remaining > 0 ? 'Пополнить сад' : 'Ваш первый Зуфик ожил!';
}

/** Quiet skip under the first-free offers. Not on restock or a waiting friend. */
export function packShopShowsSkip(remaining: number, forFriend = false): boolean {
  return remaining <= 0 && !forFriend;
}

/** First-free sheet: only «Пропустить», no ✕. */
export function packShopShowsClose(remaining: number, forFriend = false): boolean {
  return !packShopShowsSkip(remaining, forFriend);
}

export function packShopRemainLabel(remaining: number): string {
  const n = Math.max(0, Math.floor(remaining));
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `Осталось ${n} оживление`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `Осталось ${n} оживления`;
  return `Осталось ${n} оживлений`;
}

export function packShopLead(remaining: number, forFriend = false): string {
  if (remaining > 0) {
    return 'Каждый зуфик — 10 картинок. Удаление не возвращает оживление.';
  }
  if (forFriend) {
    return 'Этот рисунок ждёт. Оживите его или сразу соберите маленькую компанию.';
  }
  return 'Каждый зуфик — 10 картинок. Оживите ещё один рисунок или сразу соберите маленькую компанию.';
}

export function packAnimalLabel(animals: number): string {
  return animals === 1 ? '1 зверь' : `${animals} зверей`;
}

export function packTileLabel(pack: Pack, remaining: number): string {
  if (remaining <= 0 && (pack.id === FRIEND_PACK_ID || pack.animals === 1)) {
    return 'Оживить ещё одного';
  }
  if (remaining <= 0 && pack.id === STARTER_PACK_ID) {
    return 'Позвать 5 друзей';
  }
  return packAnimalLabel(pack.animals);
}

export function packTileBadge(pack: Pack, remaining: number): string {
  if (remaining <= 0 && pack.id === STARTER_PACK_ID) return 'Выгоднее';
  if (pack.featured) return 'часто берут';
  return '';
}
