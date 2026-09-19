import assert from 'node:assert/strict';
import {
  hatchCanDrawAnother,
  hatchGardenOpensShop,
  hatchGardenStartsPaidMesh,
  hatchMeshCooking,
  hatchPreviewMode,
  hatchPreviewSrc,
} from './hatchView.ts';

assert.equal(hatchPreviewSrc(null, null, false), null);
assert.equal(hatchPreviewSrc('toy.png', null, true), 'toy.png');
assert.equal(hatchPreviewSrc('toy.png', 'garden.png', false), 'toy.png');
assert.equal(hatchPreviewSrc('toy.png', 'garden.png', true), 'garden.png');

assert.equal(hatchPreviewMode(null, null, true), 'empty');
assert.equal(hatchPreviewMode('toy.png', null, true), 'toy');
assert.equal(hatchPreviewMode('toy.png', 'garden.png', false), 'toy');
assert.equal(hatchPreviewMode('toy.png', 'garden.png', true), 'garden');

assert.equal(hatchCanDrawAnother(10), true);
assert.equal(hatchCanDrawAnother(1), true);
assert.equal(hatchCanDrawAnother(null), true);
assert.equal(hatchCanDrawAnother(undefined), true);
assert.equal(hatchCanDrawAnother(0), false);
assert.equal(hatchCanDrawAnother(0, 1), false);
assert.equal(hatchCanDrawAnother(0, 0), false);

assert.equal(hatchGardenOpensShop(10, 0), true);
assert.equal(hatchGardenOpensShop(0, 3), false);
assert.equal(hatchGardenOpensShop(0, 0), true);
assert.equal(hatchGardenOpensShop(null, 0), true);
assert.equal(hatchGardenOpensShop(0, null), false);

assert.equal(hatchGardenStartsPaidMesh(1), true);
assert.equal(hatchGardenStartsPaidMesh(0), false);
assert.equal(hatchGardenStartsPaidMesh(null), false);

assert.equal(hatchMeshCooking('pending', undefined), true);
assert.equal(hatchMeshCooking(undefined, undefined), true);
assert.equal(hatchMeshCooking('deferred', undefined), false);
assert.equal(hatchMeshCooking('ready', '/mesh.glb'), false);
assert.equal(hatchMeshCooking('skipped', undefined), false);
assert.equal(hatchMeshCooking('pending', '/mesh.glb'), false);
