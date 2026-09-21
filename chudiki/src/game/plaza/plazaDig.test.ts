import assert from 'node:assert/strict';
import {
  gardenSmashId,
  localPlazaMounds,
  localGardenMounds,
  moundsFromRoom,
  nearMound,
  refillPlazaMounds,
  refillGardenMounds,
  ticketsFromRoom,
  GARDEN_CRYSTAL_COUNT,
  GARDEN_CRYSTAL_INNER,
  GARDEN_CRYSTAL_OUTER,
  GARDEN_DIG_MAX_CAMERA,
  GARDEN_DIG_NEAR,
  GARDEN_TICKETS_PER_DAY,
  PLAZA_CRYSTAL_COUNT,
  PLAZA_CRYSTAL_INNER,
  PLAZA_CRYSTAL_MAX,
  PLAZA_CRYSTAL_MIN,
  PLAZA_CRYSTAL_OUTER,
  PLAZA_FIND_MS,
  PLAZA_TICKET_CRYSTALS,
} from './plazaDig.ts';

assert.ok(PLAZA_FIND_MS >= 2000);
assert.equal(PLAZA_TICKET_CRYSTALS, 8);
assert.ok(PLAZA_CRYSTAL_COUNT >= PLAZA_CRYSTAL_MIN);
assert.ok(PLAZA_CRYSTAL_COUNT <= PLAZA_CRYSTAL_MAX);

const mounds = localPlazaMounds();
assert.equal(mounds.length, PLAZA_CRYSTAL_COUNT);
assert.equal(new Set(mounds.map((item) => item.id)).size, mounds.length);
for (const mound of mounds) {
  const radius = Math.hypot(mound.x, mound.z);
  assert.ok(radius >= PLAZA_CRYSTAL_INNER - 0.01);
  assert.ok(radius <= PLAZA_CRYSTAL_OUTER + 0.5);
}
assert.equal(nearMound(mounds[0].x, mounds[0].z, mounds), mounds[0].id);
assert.equal(nearMound(0, 0, mounds), null);
assert.equal(nearMound(mounds[0].x, mounds[0].z, mounds, 0.5), mounds[0].id);

const leftover = mounds.slice(0, 20);
const refilled = refillPlazaMounds(leftover);
assert.equal(refilled.length, PLAZA_CRYSTAL_COUNT);
assert.equal(new Set(refilled.map((item) => item.id)).size, refilled.length);

assert.deepEqual(
  moundsFromRoom([{ id: 'a', x: 1, z: 2 }, { id: 'bad' }, null]),
  [{ id: 'a', x: 1, z: 2 }],
);
assert.deepEqual(moundsFromRoom(undefined), []);
assert.deepEqual(ticketsFromRoom([{ id: 't1', x: 4, z: -2 }]), [{ id: 't1', x: 4, z: -2 }]);
assert.deepEqual(ticketsFromRoom(undefined), []);

assert.equal(GARDEN_TICKETS_PER_DAY, 2);
const garden = localGardenMounds();
assert.equal(garden.length, GARDEN_CRYSTAL_COUNT);
assert.equal(new Set(garden.map((item) => item.id)).size, garden.length);
for (const mound of garden) {
  const radius = Math.hypot(mound.x - 0, mound.z - -5);
  assert.ok(radius >= GARDEN_CRYSTAL_INNER - 0.01);
  assert.ok(radius <= GARDEN_CRYSTAL_OUTER + 0.5);
}
assert.equal(nearMound(garden[0].x, garden[0].z, garden), garden[0].id);
assert.equal(gardenSmashId(garden[0].x, garden[0].z, 8, garden), garden[0].id);
assert.equal(gardenSmashId(garden[0].x, garden[0].z, 46, garden), null, 'overview is not a smash');
assert.equal(gardenSmashId(0, -5, 8, garden), null, 'island centre is not next to a crystal');
assert.ok(GARDEN_DIG_NEAR <= 2.5);
assert.ok(GARDEN_DIG_MAX_CAMERA < 40);
const gardenLeft = garden.slice(0, 2);
assert.equal(refillGardenMounds(gardenLeft).length, GARDEN_CRYSTAL_COUNT);
