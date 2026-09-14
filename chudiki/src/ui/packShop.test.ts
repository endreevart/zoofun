import assert from 'node:assert/strict';
import type { Pack } from '../game/commerce.ts';
import {
  FRIEND_PACK_ID,
  packAnimalLabel,
  packShopLead,
  packShopTitle,
  packShopView,
  packsForShop,
  packTileBadge,
  packTileLabel,
  STARTER_PACK_ID,
} from './packShop.ts';

const catalog: Pack[] = [
  { id: 'pack_1', animals: 1, price_rub: 99, featured: false, buyable: true },
  { id: 'pack_5', animals: 5, price_rub: 399, featured: false, buyable: true },
  { id: 'pack_10', animals: 10, price_rub: 3490, featured: true, buyable: true },
  { id: 'pack_15', animals: 15, price_rub: 4690, featured: false, buyable: true },
  { id: 'pack_20', animals: 20, price_rub: 5790, featured: false, buyable: true },
];

assert.equal(packShopTitle(3), 'Пополнить сад');
assert.equal(packShopTitle(0), 'Ваш первый Зуфик ожил!');
assert.match(packShopLead(0), /друг/);
assert.equal(packAnimalLabel(1), '1 зверь');
assert.equal(packAnimalLabel(5), '5 зверей');

const withCredits = packsForShop(catalog, 3);
assert.equal(withCredits.length, 5);
assert.equal(withCredits[2]?.featured, true);

const empty = packsForShop(catalog, 0);
assert.equal(empty.length, 2);
assert.equal(empty[0]?.id, FRIEND_PACK_ID);
assert.equal(empty[1]?.id, STARTER_PACK_ID);
assert.equal(empty[0]?.featured, false);
assert.equal(empty[1]?.featured, true);
assert.equal(packTileLabel(empty[0]!, 0), 'Оживить ещё одного');
assert.equal(packTileLabel(empty[1]!, 0), 'Позвать 5 друзей');
assert.equal(packTileBadge(empty[1]!, 0), 'Выгоднее');

const expanded = packsForShop(catalog, 0, true);
assert.equal(expanded.length, 5);
assert.equal(expanded[2]?.id, 'pack_10');

const view = packShopView(catalog, 0);
assert.equal(view.more.length, 3);

const noFriend = packsForShop(
  catalog.filter((pack) => pack.id !== FRIEND_PACK_ID),
  0,
);
assert.equal(noFriend.length, 1);
assert.equal(noFriend[0]?.id, STARTER_PACK_ID);

const noStarter = packsForShop(
  catalog.filter((pack) => pack.id !== STARTER_PACK_ID && pack.id !== FRIEND_PACK_ID),
  0,
);
assert.equal(noStarter.length, 1);
assert.equal(noStarter[0]?.id, 'pack_10');
assert.equal(noStarter[0]?.featured, false);

assert.deepEqual(packsForShop([], 0), []);
