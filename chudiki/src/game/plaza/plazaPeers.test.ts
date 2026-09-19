import assert from 'node:assert/strict';
import { PLAZA_SEATS, peerModelPath, seatWorld } from './plazaPeers.ts';

assert.equal(PLAZA_SEATS.length, 8);
const keys = PLAZA_SEATS.map((item) => `${item.x}:${item.z}`);
assert.equal(new Set(keys).size, 8);
assert.deepEqual(seatWorld(0), PLAZA_SEATS[0]);
assert.deepEqual(seatWorld(7), PLAZA_SEATS[7]);
assert.deepEqual(seatWorld(8), PLAZA_SEATS[0]);
assert.notDeepEqual(seatWorld(0), seatWorld(7));
assert.equal(peerModelPath('spot-1'), '/v1/plaza/models/spot-1');
