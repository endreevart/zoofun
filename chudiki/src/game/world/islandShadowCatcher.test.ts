import assert from 'node:assert/strict';
import {
  createFlatShadowCatcher,
  createShadowCatcher,
  shadowCatcherGeometry,
  type HeightField,
} from './islandShadowCatcher.ts';

const empty: HeightField = {
  minX: 0,
  minZ: 0,
  step: 1,
  cols: 3,
  rows: 3,
  heights: new Float32Array(9).fill(Number.NaN),
};
assert.equal(shadowCatcherGeometry(empty), null);

const flat = new Float32Array(9).fill(2);
const surface: HeightField = { minX: -1, minZ: -1, step: 1, cols: 3, rows: 3, heights: flat };
const geometry = shadowCatcherGeometry(surface, 1, 0.05);
assert.ok(geometry);
const count = geometry.getAttribute('position').count;
assert.ok(count >= 24);
assert.ok(count <= 48);
const y = geometry.getAttribute('position').getY(0);
assert.ok(Math.abs(y - 2.05) < 1e-5);
geometry.dispose();

const catcher = createShadowCatcher(surface);
assert.ok(catcher);
assert.equal(catcher.name, 'lawn-shadows');
assert.equal(catcher.castShadow, false);
assert.equal(catcher.receiveShadow, true);
catcher.geometry.dispose();
(catcher.material as { dispose(): void }).dispose();

const flush = shadowCatcherGeometry(surface, 1, 0);
assert.ok(flush);
assert.ok(Math.abs(flush.getAttribute('position').getY(0) - 2) < 1e-5);
flush.dispose();

const disc = createFlatShadowCatcher(0, 0.26, -5, 28);
assert.equal(disc.name, 'lawn-shadows');
assert.equal(disc.receiveShadow, true);
assert.equal(disc.castShadow, false);
assert.equal((disc.material as { type: string; transparent: boolean }).type, 'MeshStandardMaterial');
assert.equal((disc.material as { transparent: boolean }).transparent, true);
assert.ok(Math.abs(disc.position.y - 0.26) < 1e-5);
disc.geometry.dispose();
(disc.material as { dispose(): void }).dispose();
