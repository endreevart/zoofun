import assert from 'node:assert/strict';
import { pinPropActions } from './propActionsPin.ts';

const screen = { left: 0, top: 0, width: 800, height: 600 };

assert.deepEqual(pinPropActions({ x: 400, y: 200 }, screen), { left: 400, top: 200 });
assert.equal(pinPropActions({ x: -40, y: 10 }, screen).left, 120);
assert.equal(pinPropActions({ x: -40, y: 10 }, screen).top, 72);
assert.equal(pinPropActions({ x: 900, y: 580 }, screen).left, 680);
assert.equal(pinPropActions({ x: 900, y: 580 }, screen).top, 440);
assert.equal(pinPropActions(null, screen).left, 400);
assert.equal(pinPropActions(null, screen).top, 140);

const offset = { left: 50, top: 20, width: 800, height: 600 };
assert.deepEqual(pinPropActions({ x: 250, y: 220 }, offset), { left: 200, top: 200 });
