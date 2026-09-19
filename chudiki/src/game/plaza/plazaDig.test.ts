import assert from 'node:assert/strict';
import {
  localPlazaMounds,
  moundsFromRoom,
  nearMound,
  refillPlazaMounds,
  ticketsFromRoom,
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
