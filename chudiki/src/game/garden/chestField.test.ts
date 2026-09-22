import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  CHEST_GLOW_OUTER,
  CHEST_GLOW_RADIUS,
  chestGlowDisc,
  chestGlowOuterDisc,
  chestLamp,
} from './chestGlow.ts';

const glow = chestGlowDisc();
assert.equal(glow.name, 'chest-glow');
assert.equal(glow.castShadow, false);
assert.equal((glow.material as THREE.MeshBasicMaterial).blending, THREE.AdditiveBlending);
assert.ok(glow.scale.x >= CHEST_GLOW_RADIUS);

const outer = chestGlowOuterDisc();
assert.equal(outer.name, 'chest-glow-outer');
assert.ok(outer.scale.x >= CHEST_GLOW_OUTER);
assert.ok(outer.scale.x > glow.scale.x);

const lamp = chestLamp();
assert.equal(lamp.name, 'chest-lamp');
assert.equal(lamp.castShadow, false);
assert.ok(lamp.intensity > 5);
assert.ok(lamp.distance > 12);
