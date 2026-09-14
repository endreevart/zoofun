import assert from 'node:assert/strict';
import { gardenElementVolume, nextDuckCount } from './gardenDuck.ts';

assert.equal(nextDuckCount(0, true), 1);
assert.equal(nextDuckCount(1, true), 2);
assert.equal(nextDuckCount(1, false), 0);
assert.equal(nextDuckCount(0, false), 0);

assert.equal(gardenElementVolume(0), 0.11);
assert.equal(gardenElementVolume(1), 0);
assert.equal(gardenElementVolume(2), 0);
assert.equal(gardenElementVolume(0, 0.4), 0.4);
assert.ok(Math.abs(gardenElementVolume(0, 0.4, true) - 0.4 * 0.28) < 1e-12);
assert.equal(gardenElementVolume(1, 0.4, true), 0);
