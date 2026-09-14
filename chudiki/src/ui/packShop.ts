import type { Pack } from '../game/commerce';

export const FRIEND_PACK_ID = 'pack_1';
export const STARTER_PACK_ID = 'pack_5';

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

export function packShopTitle(remaining: number): string {
  return remaining > 0 ? 'Пополнить сад' : 'Ваш первый Зуфик ожил!';
}

export function packShopLead(remaining: number): string {
  return remaining > 0
    ? 'Пакет добавляет новых зуфунят. Удаление слот не возвращает.'
    : 'Теперь ему нужен друг. Оживите ещё один рисунок или сразу соберите маленькую компанию.';
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
