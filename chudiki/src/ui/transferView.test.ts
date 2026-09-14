import assert from 'node:assert/strict';
import { WORLD_AUTHORED, WORLD_DIY_SKU, type GardenWorld } from '../game/world/gardens.ts';
import { defaultMoveDestId, transferSummary, transferTitle } from './transferView.ts';

assert.equal(transferTitle('Жучок'), 'Переместить Жучок');
assert.equal(transferSummary('Жучок', 'Сад 2'), 'Жучок переедет в «Сад 2»');

const dests: GardenWorld[] = [
  { id: WORLD_AUTHORED, title: 'Волшебный остров' },
  { id: WORLD_DIY_SKU, title: 'Сад 2' },
];
assert.equal(defaultMoveDestId(dests), WORLD_AUTHORED);
assert.equal(defaultMoveDestId([]), null);
