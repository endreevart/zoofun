import assert from 'node:assert/strict';
import { MOBILE_STICK_GAIN, clampStickTravel, shapeStick, stickWalk } from './walkStick.ts';

assert.deepEqual(clampStickTravel(0, 0, 40), { x: 0, y: 0 });
assert.deepEqual(clampStickTravel(10, 0, 40), { x: 10, y: 0 });
const clamped = clampStickTravel(80, 0, 40);
assert.equal(clamped.x, 40);
assert.equal(clamped.y, 0);

assert.equal(shapeStick(0), 0);
assert.equal(shapeStick(1), 1);
assert.equal(shapeStick(-1), -1);
assert.ok(Math.abs(shapeStick(0.5)) < 0.5);

const rest = stickWalk(0, 0, 40, MOBILE_STICK_GAIN);
assert.equal(rest.forward, 0);
assert.equal(rest.right, 0);

const nudge = stickWalk(4, 0, 40, MOBILE_STICK_GAIN);
assert.equal(nudge.right, 0);

const modest = stickWalk(16, 0, 40, MOBILE_STICK_GAIN);
assert.ok(modest.right > 0.2);

const full = stickWalk(40, 0, 40, MOBILE_STICK_GAIN);
assert.ok(full.right > 0.7);
assert.ok(full.right <= 1);
assert.equal(full.forward, 0);

const forward = stickWalk(0, -40, 40, MOBILE_STICK_GAIN);
assert.ok(forward.forward > 0);
assert.ok(forward.forward > 0.7);
