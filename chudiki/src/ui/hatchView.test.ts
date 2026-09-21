import assert from 'node:assert/strict';
import {
  hatchCanDrawAnother,
  hatchGardenOpensFirstShop,
  hatchGardenOpensShop,
  hatchGardenStartsPaidMesh,
  hatchMeshCooking,
  hatchPreviewMode,
  hatchPreviewSrc,
  hatchStillLabel,
  HATCH_GO_GARDEN,
  HATCH_TAP_HINT,
} from './hatchView.ts';

assert.equal(HATCH_GO_GARDEN, 'В сад');
assert.ok(HATCH_TAP_HINT.includes('Зуфика'));
assert.equal(hatchStillLabel(3), 'Доступно: 3');
assert.equal(hatchStillLabel(-2), 'Доступно: 0');

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

assert.equal(hatchGardenOpensFirstShop(0, 1, 1), true);
assert.equal(hatchGardenOpensFirstShop(0, 1, 0), false);
assert.equal(hatchGardenOpensFirstShop(1, 0, 1), false);
assert.equal(hatchGardenOpensFirstShop(0, 0, 1), false);
assert.equal(hatchGardenOpensFirstShop(0, 2, 6), false);
assert.equal(hatchGardenOpensFirstShop(null, 1, 1), false);

assert.equal(hatchGardenStartsPaidMesh(1), true);
assert.equal(hatchGardenStartsPaidMesh(0), false);
assert.equal(hatchGardenStartsPaidMesh(null), false);

assert.equal(hatchMeshCooking('pending', undefined), true);
assert.equal(hatchMeshCooking(undefined, undefined), true);
assert.equal(hatchMeshCooking('deferred', undefined), false);
assert.equal(hatchMeshCooking('ready', '/mesh.glb'), false);
assert.equal(hatchMeshCooking('skipped', undefined), false);
assert.equal(hatchMeshCooking('pending', '/mesh.glb'), false);
