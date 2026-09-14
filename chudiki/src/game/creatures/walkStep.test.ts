import assert from 'node:assert/strict';
import { SLIDE_YAWS, stepPoint } from './walkStep.ts';

assert.ok(SLIDE_YAWS.includes(0));
assert.ok(SLIDE_YAWS.length >= 5);

const ahead = stepPoint(0, 0, 0, 2);
assert.ok(Math.abs(ahead.x) < 1e-9);
assert.equal(ahead.z, 2);

const right = stepPoint(0, 0, Math.PI / 2, 2);
assert.ok(Math.abs(right.x - 2) < 1e-9);
assert.ok(Math.abs(right.z) < 1e-9);
