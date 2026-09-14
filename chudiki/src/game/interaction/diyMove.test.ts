import assert from 'node:assert/strict';
import { holdDragOffset } from './diyMove.ts';

const origin = { x: 10, z: 4 };
const start = { x: 2, z: 8 };

assert.deepEqual(holdDragOffset(origin, start, origin), start);

const moved = holdDragOffset(origin, start, { x: 13, z: 1 });
assert.equal(moved.x, 5);
assert.equal(moved.z, 5);
