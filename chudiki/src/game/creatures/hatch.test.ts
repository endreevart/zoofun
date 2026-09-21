import assert from 'node:assert/strict';
import {
  crackAmount,
  cracksFromHeat,
  eggCanOpen,
  hatchFill,
  hatchFromTap,
  hatchFromWait,
  hatchMayOpen,
  drawingWaitsInEgg,
  eggMeshCooking,
  hatchRingVisible,
  staysInAlbum,
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
assert.equal(eggCanOpen('failed'), false);
assert.equal(eggCanOpen('skipped'), false);
assert.equal(eggCanOpen('failed', 'https://zooo.fun/model.glb'), true);
assert.equal(eggCanOpen('deferred'), false);
assert.equal(eggCanOpen('deferred', 'https://zooo.fun/model.glb'), true);

assert.equal(hatchMayOpen({ modelUrl: 'https://zooo.fun/model.glb' }), true);
assert.equal(hatchMayOpen({ meshDeferred: true }), false);
assert.equal(hatchMayOpen({ meshDeferred: false }), false);
assert.equal(hatchMayOpen({}), false);
assert.equal(hatchMayOpen(null), false);
assert.equal(drawingWaitsInEgg({}), true);
assert.equal(drawingWaitsInEgg({ modelUrl: 'https://zooo.fun/model.glb' }), false);
assert.equal(staysInAlbum({ meshDeferred: true }), true);
assert.equal(staysInAlbum({}), false);
assert.equal(staysInAlbum({ meshDeferred: true, modelUrl: 'https://zooo.fun/model.glb' }), false);
assert.equal(eggMeshCooking({}), true);
assert.equal(eggMeshCooking({ meshDeferred: true }), false);
assert.equal(eggMeshCooking({ meshDeferred: true, modelUrl: 'https://zooo.fun/model.glb' }), false);
assert.equal(hatchRingVisible(false, true), true);
assert.equal(hatchRingVisible(true, false), true);
assert.equal(hatchRingVisible(false, false), false);
