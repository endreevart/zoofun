import assert from 'node:assert/strict';
import { idleJump, JUMP_SPEED, stepJump } from './plazaJump.ts';

const rest = idleJump();
assert.equal(rest.grounded, true);
assert.equal(rest.y, 0);

const still = stepJump(rest, 0.016, false);
assert.equal(still.grounded, true);
assert.equal(still.y, 0);

const hop = stepJump(rest, 0.016, true);
assert.equal(hop.grounded, false);
assert.ok(hop.vy === JUMP_SPEED);
assert.ok(hop.y > 0);

let air = hop;
for (let i = 0; i < 80; i += 1) air = stepJump(air, 0.05, false);
assert.equal(air.grounded, true);
assert.equal(air.y, 0);
assert.equal(air.vy, 0);
