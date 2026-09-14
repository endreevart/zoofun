import assert from 'node:assert/strict';
import {
  adoptUntrackedPointer,
  isPinch,
  pointerMayOrbit,
  skipPlaceFinger,
  touchesOn,
  zoomFromPinch,
} from './cameraPinch.ts';

const min = 3.2;
const max = 52;
const start = 12;

// Spread fingers: span grows → camera moves in.
assert.ok(zoomFromPinch(200, 100, start, min, max) < start);
// Pinch together: span shrinks → camera pulls back.
assert.ok(zoomFromPinch(100, 200, start, min, max) > start);
assert.equal(zoomFromPinch(0, 100, start, min, max), start);
assert.equal(zoomFromPinch(100, 0, start, min, max), start);

assert.equal(isPinch(0), false);
assert.equal(isPinch(1), false);
assert.equal(isPinch(2), true);

assert.equal(skipPlaceFinger('touch', false, 2), true);
assert.equal(skipPlaceFinger('touch', false, 1), false);
assert.equal(skipPlaceFinger('touch', true, 1), false);
assert.equal(skipPlaceFinger('mouse', false, 2), false);

const canvas = { id: 'canvas' };
const stick = { id: 'stick' };
const garden = {
  contains(node: { id: string }) {
    return node.id === 'canvas';
  },
};
assert.equal(touchesOn(null, []), 0);
assert.equal(
  touchesOn(garden as never, [{ target: canvas }, { target: stick }] as never),
  1,
);
assert.equal(
  touchesOn(garden as never, [{ target: canvas }, { target: canvas }] as never),
  2,
);

assert.equal(pointerMayOrbit('mouse', 0), false);
assert.equal(pointerMayOrbit('mouse', 1), true);
assert.equal(pointerMayOrbit('pen', 0), false);
assert.equal(pointerMayOrbit('touch', 0), true);
assert.equal(adoptUntrackedPointer('mouse', 1), false);
assert.equal(adoptUntrackedPointer('touch', 0), false);
assert.equal(adoptUntrackedPointer('touch', 1), true);
