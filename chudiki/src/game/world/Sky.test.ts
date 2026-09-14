import assert from 'node:assert/strict';
import {
  fogDensityForShell,
  usesPuffyClouds,
  HAZE_RGB,
  MEADOW_HAZE_RGB,
  cloudSoftEdges,
} from './skyLook.ts';

assert.equal(usesPuffyClouds('meadow'), true);
assert.equal(usesPuffyClouds('garden'), true);
assert.equal(usesPuffyClouds('grove'), true);
assert.equal(fogDensityForShell('meadow') < fogDensityForShell('garden'), true);
assert.equal(fogDensityForShell('grove') < fogDensityForShell('garden'), true);
assert.ok(MEADOW_HAZE_RGB.b > HAZE_RGB.b);
assert.ok(MEADOW_HAZE_RGB.b - MEADOW_HAZE_RGB.r > HAZE_RGB.b - HAZE_RGB.r);
const soft = cloudSoftEdges(1);
const hard = cloudSoftEdges(0);
assert.ok(soft.inner < hard.inner);
assert.ok(soft.outer > hard.outer);
