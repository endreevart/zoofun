import assert from 'node:assert/strict';
import {
  crackAmount,
  cracksFromHeat,
  eggCanOpen,
  hatchFill,
  hatchFromTap,
  hatchFromWait,
  warmEgg,
} from './hatch.ts';

assert.equal(warmEgg(0), 0.2);
assert.equal(warmEgg(0.9), 1);
assert.equal(hatchFromTap(0.2, true), false);
assert.equal(hatchFromTap(0.4, true), true);
assert.equal(hatchFromTap(1, false), false);
assert.ok(crackAmount(1, false) < 0.8);
assert.ok(crackAmount(0.2, true) > crackAmount(0.2, false));
assert.equal(cracksFromHeat(0, false), 0);
assert.equal(cracksFromHeat(0.2, false), 1);
assert.equal(cracksFromHeat(0.4, false), 2);
assert.ok(cracksFromHeat(0.2, true) >= 4);
assert.equal(hatchFill(0, false, true), 1);
assert.ok(hatchFill(2, false, false) < hatchFill(2, true, false));
assert.equal(hatchFromWait(0.2, 0, true), false);
assert.equal(hatchFromWait(2.5, 0, true), true);
assert.equal(hatchFromWait(0.5, 1, true), true);
assert.equal(hatchFromWait(10, 1, false), false);
assert.equal(eggCanOpen('pending'), false);
assert.equal(eggCanOpen('pending', 'https://zooo.fun/model.glb'), true);
assert.equal(eggCanOpen('ready', 'https://zooo.fun/model.glb'), true);
assert.equal(eggCanOpen('failed'), true);
assert.equal(eggCanOpen('skipped'), true);
