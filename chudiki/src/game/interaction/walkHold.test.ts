import assert from 'node:assert/strict';
import {
  canBeginWalkHold,
  COMPACT_WALK,
  ignoreWalkCancel,
  isHeldPointer,
  shouldCaptureWalkPointer,
  touchStillHeld,
} from './walkHold.ts';

assert.equal(canBeginWalkHold({ pointerType: 'touch', button: 0 }), true);
assert.equal(canBeginWalkHold({ pointerType: 'pen', button: 0 }), true);
assert.equal(canBeginWalkHold({ pointerType: 'mouse', button: 0 }), true);
assert.equal(canBeginWalkHold({ pointerType: 'mouse', button: 2 }), false);

assert.equal(isHeldPointer(null, 1), false);
assert.equal(isHeldPointer(7, 7), true);
assert.equal(isHeldPointer(7, 8), false);

assert.equal(shouldCaptureWalkPointer('mouse'), true);
assert.equal(shouldCaptureWalkPointer('pen'), true);
assert.equal(shouldCaptureWalkPointer('touch'), false);

assert.equal(ignoreWalkCancel({ type: 'pointercancel', pointerType: 'touch' }), true);
assert.equal(ignoreWalkCancel({ type: 'lostpointercapture', pointerType: 'touch' }), true);
assert.equal(ignoreWalkCancel({ type: 'touchcancel' }), true);
assert.equal(ignoreWalkCancel({ type: 'pointerup', pointerType: 'touch' }), false);
assert.equal(ignoreWalkCancel({ type: 'pointercancel', pointerType: 'mouse' }), false);

assert.equal(touchStillHeld([{ identifier: 3 }], 3), true);
assert.equal(touchStillHeld([{ identifier: 1 }], 3), false);
assert.equal(touchStillHeld([], 3), false);
assert.equal(touchStillHeld([{ identifier: 3 }], null), false);

assert.match(COMPACT_WALK, /pointer: coarse/);
