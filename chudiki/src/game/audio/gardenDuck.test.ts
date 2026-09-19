import assert from 'node:assert/strict';
import { gardenElementVolume, gardenShouldPause, nextDuckCount } from './gardenDuck.ts';

assert.equal(nextDuckCount(0, true), 1);
assert.equal(nextDuckCount(1, true), 2);
assert.equal(nextDuckCount(1, false), 0);
assert.equal(nextDuckCount(0, false), 0);

assert.equal(gardenShouldPause(0), false);
assert.equal(gardenShouldPause(1), true);
assert.equal(gardenShouldPause(0, true), true);
assert.equal(gardenShouldPause(1, true), true);
assert.equal(gardenShouldPause(0, false, true), true);

assert.equal(gardenElementVolume(0), 0.11);
assert.equal(gardenElementVolume(1), 0);
assert.equal(gardenElementVolume(2), 0);
assert.equal(gardenElementVolume(0, 0.4), 0.4);
assert.equal(gardenElementVolume(0, 0.4, true), 0);
assert.equal(gardenElementVolume(0, 0.4, false, true), 0);
assert.equal(gardenElementVolume(1, 0.4, true), 0);
