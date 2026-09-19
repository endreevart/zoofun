import assert from 'node:assert/strict';
import { airSpawnChance, heartRainCount, joyFromHearts, joyTier } from './joy.ts';

assert.equal(joyTier(0), 0);
assert.equal(joyFromHearts(0), 0);
assert.equal(joyTier(3), 1);
assert.equal(joyTier(12), 2);
assert.equal(joyTier(20), 3);
assert.equal(joyTier(50), 4);
assert.equal(joyTier(120), 5);
assert.ok(joyFromHearts(120) > joyFromHearts(3));
assert.ok(heartRainCount(0) >= 6);
assert.ok(heartRainCount(90) <= 28);
assert.ok(airSpawnChance(80) > airSpawnChance(0));
