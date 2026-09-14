import assert from 'node:assert/strict';
import { ISLAND } from './layout.ts';
import { isSolidGround, lawnHeightWindow, peakHeight } from './islandHeights.ts';

assert.equal(peakHeight([]), null);
assert.ok(Math.abs(peakHeight([-2, -2, -2, -2, -2, 0, 0, -29])! + 2) < 0.01);
assert.ok(Math.abs(peakHeight([0.04, 0.01, -0.02, 0.03, -5.4])!) < 0.26);

const window = lawnHeightWindow(-2);
assert.ok(window.min < -2);
assert.ok(window.max > -2);
assert.ok(-2 > window.min && -2 < window.max);
assert.equal(-29 < window.min, true);
assert.equal(0 > window.max, false);

assert.equal(isSolidGround(ISLAND.bed), false);
assert.equal(isSolidGround(-2), true);
assert.equal(isSolidGround(0.04), true);
