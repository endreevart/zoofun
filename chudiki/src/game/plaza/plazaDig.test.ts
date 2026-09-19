import assert from 'node:assert/strict';
import { localPlazaMounds, moundsFromRoom, nearMound, ticketsFromRoom, PLAZA_FIND_MS } from './plazaDig.ts';

assert.ok(PLAZA_FIND_MS >= 2000);
const mounds = localPlazaMounds();
assert.equal(mounds.length, 4);
assert.equal(nearMound(34, 16, mounds), 'm0');
assert.equal(nearMound(0, 0, mounds), null);
assert.equal(nearMound(34, 16, mounds, 0.5), 'm0');
assert.deepEqual(
  moundsFromRoom([{ id: 'a', x: 1, z: 2 }, { id: 'bad' }, null]),
  [{ id: 'a', x: 1, z: 2 }],
);
assert.deepEqual(moundsFromRoom(undefined), []);
assert.deepEqual(ticketsFromRoom([{ id: 't1', x: 4, z: -2 }]), [{ id: 't1', x: 4, z: -2 }]);
assert.deepEqual(ticketsFromRoom(undefined), []);
