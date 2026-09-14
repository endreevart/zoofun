import assert from 'node:assert/strict';
import { cheapestDeal, moneyDeal } from './price.ts';

assert.deepEqual(moneyDeal(1190, 1190), { price: 1190, list: 0, from: false });
assert.deepEqual(moneyDeal(890, 1190), { price: 890, list: 1190, from: false });
assert.deepEqual(moneyDeal(0, 1190), { price: 0, list: 0, from: false });

const mixed = cheapestDeal([moneyDeal(890, 1190), moneyDeal(1190, 1190)]);
assert.equal(mixed.price, 890);
assert.equal(mixed.list, 1190);
assert.equal(mixed.from, true);

const sameSale = cheapestDeal([moneyDeal(890, 1190), moneyDeal(890, 1190)]);
assert.equal(sameSale.price, 890);
assert.equal(sameSale.list, 1190);
assert.equal(sameSale.from, false);

const full = cheapestDeal([moneyDeal(1190, 1190)]);
assert.equal(full.list, 0);
assert.equal(full.from, false);
