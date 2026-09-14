import assert from 'node:assert/strict';
import {
  AUTHORED_TITLE,
  WORLD_AUTHORED,
  WORLD_CREATURE_CAP,
  WORLD_DIY_SKU,
  countOnWorld,
  creatureVisibleOnWorld,
  creatureWorldId,
  gardenById,
  gardenTitle,
  idsThatFit,
  isDiyWorld,
  moveDestinations,
  nextGardenTitle,
  worldIsFull,
} from './gardens.ts';

assert.equal(isDiyWorld(WORLD_AUTHORED), false);
assert.equal(isDiyWorld(WORLD_DIY_SKU), true);
assert.equal(isDiyWorld('world_diy_ab12cd'), true);
assert.equal(creatureWorldId(undefined), WORLD_AUTHORED);
assert.equal(creatureWorldId(WORLD_DIY_SKU), WORLD_DIY_SKU);
assert.equal(creatureVisibleOnWorld(WORLD_DIY_SKU, WORLD_AUTHORED), false);
assert.equal(creatureVisibleOnWorld(undefined, WORLD_AUTHORED), true);
assert.equal(creatureVisibleOnWorld(WORLD_AUTHORED, WORLD_DIY_SKU), false);
assert.equal(creatureVisibleOnWorld(WORLD_DIY_SKU, WORLD_DIY_SKU), true);
assert.equal(creatureVisibleOnWorld(WORLD_DIY_SKU, 'world_diy_other'), false);
assert.equal(nextGardenTitle([]), 'Сад 1');
assert.equal(nextGardenTitle(['Сад 1']), 'Сад 2');
assert.equal(nextGardenTitle(['Сад 1', 'Сад 3']), 'Сад 2');

const records = [
  { spec: { id: 'ch_1' } },
  { spec: { id: 'ch_2', worldId: WORLD_DIY_SKU } },
  { spec: { id: 'resident_cypa' } },
];
assert.equal(countOnWorld(records, WORLD_AUTHORED), 1);
assert.equal(countOnWorld(records, WORLD_DIY_SKU), 1);
assert.equal(worldIsFull(WORLD_CREATURE_CAP - 1), false);
assert.equal(worldIsFull(WORLD_CREATURE_CAP), true);

assert.deepEqual(moveDestinations(WORLD_AUTHORED, [{ id: WORLD_DIY_SKU, title: 'Сад 1' }]), [
  { id: 'authored_meadow', title: 'Висячий луг' },
  { id: 'authored_grove', title: 'Куболесье' },
  { id: WORLD_DIY_SKU, title: 'Сад 1' },
]);
assert.deepEqual(moveDestinations(WORLD_DIY_SKU, [{ id: WORLD_DIY_SKU, title: 'Сад 1' }]), [
  { id: WORLD_AUTHORED, title: AUTHORED_TITLE },
  { id: 'authored_meadow', title: 'Висячий луг' },
  { id: 'authored_grove', title: 'Куболесье' },
]);
assert.equal(gardenTitle(WORLD_AUTHORED, []), AUTHORED_TITLE);
assert.equal(gardenTitle(WORLD_DIY_SKU, [{ id: WORLD_DIY_SKU, title: 'Сад 1' }]), 'Сад 1');
assert.deepEqual(gardenById(WORLD_AUTHORED, [{ id: WORLD_DIY_SKU, title: 'Сад 1' }]), {
  id: WORLD_AUTHORED,
  title: AUTHORED_TITLE,
});
assert.deepEqual(
  gardenById(WORLD_DIY_SKU, [{ id: WORLD_DIY_SKU, title: 'Сад 1', sku: WORLD_DIY_SKU }]),
  { id: WORLD_DIY_SKU, title: 'Сад 1', sku: WORLD_DIY_SKU },
);
assert.equal(gardenById('world_diy_gone', []).title, 'Сад');

assert.deepEqual(idsThatFit(['ch_1', 'resident_x'], records, WORLD_DIY_SKU), ['ch_1']);
const packed = Array.from({ length: WORLD_CREATURE_CAP }, (_, i) => ({
  spec: { id: `full_${i}`, worldId: WORLD_DIY_SKU },
}));
assert.deepEqual(idsThatFit(['ch_1'], packed, WORLD_DIY_SKU), []);
assert.deepEqual(
  idsThatFit(['a', 'b'], packed.slice(0, WORLD_CREATURE_CAP - 1), WORLD_DIY_SKU),
  ['a'],
);
