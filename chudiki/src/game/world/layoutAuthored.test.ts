import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CATALOG_MODELS,
  CHILD_CATALOG_MODELS,
  DIY_PROP_CAP,
  MEADOW_CATALOG_MODELS,
  GROVE_CATALOG_MODELS,
  catalogForShell,
  childCatalogForShell,
  plazaChildCatalog,
  catalogGroup,
} from './layoutCatalog.ts';

assert.ok(CATALOG_MODELS.includes('grass_a'));
assert.ok(CATALOG_MODELS.includes('grass_b'));
assert.equal(CHILD_CATALOG_MODELS.includes('grass_a'), false);
assert.equal(CHILD_CATALOG_MODELS.includes('grass_b'), false);
assert.ok(CHILD_CATALOG_MODELS.includes('sunlit-canopy'));
assert.ok(CHILD_CATALOG_MODELS.includes('mossy-burrow'));
assert.equal(DIY_PROP_CAP, 258);

assert.equal(catalogGroup('sunlit-canopy'), 'plants');
assert.equal(catalogGroup('mossy-burrow'), 'houses');
assert.equal(catalogGroup('harvest-cradle'), 'objects');

assert.ok(MEADOW_CATALOG_MODELS.includes('whimsywood-tree'));
assert.ok(MEADOW_CATALOG_MODELS.includes('acorn-cottage'));
assert.ok(MEADOW_CATALOG_MODELS.includes('rock_medium_01'));
assert.ok(MEADOW_CATALOG_MODELS.includes('lp_tree_01'));
assert.ok(MEADOW_CATALOG_MODELS.includes('lp_bush_01'));
assert.equal(MEADOW_CATALOG_MODELS.includes('grass_a'), false);
assert.equal(MEADOW_CATALOG_MODELS.includes('sunlit-canopy'), false);
assert.equal(catalogForShell('meadow'), MEADOW_CATALOG_MODELS);
assert.equal(catalogForShell('garden'), CATALOG_MODELS);
assert.equal(catalogForShell('grove'), GROVE_CATALOG_MODELS);
assert.ok(GROVE_CATALOG_MODELS.includes('voxel-tree'));
assert.ok(GROVE_CATALOG_MODELS.includes('voxel-verdant-garden'));
const plaza = plazaChildCatalog();
assert.equal(plaza.includes('grass_a'), false);
assert.ok(plaza.includes('sunlit-canopy'));
assert.ok(plaza.includes('acorn-cottage'));
assert.ok(plaza.includes('voxel-tree'));
assert.ok(plaza.includes('mossy-burrow'));
assert.equal(new Set(plaza).size, plaza.length);
assert.ok(GROVE_CATALOG_MODELS.includes('lp_tree_01'));
assert.ok(GROVE_CATALOG_MODELS.includes('lp_pine_01'));
assert.ok(GROVE_CATALOG_MODELS.includes('rustic-bench'));
assert.equal(GROVE_CATALOG_MODELS.includes('grass_a'), false);
assert.equal(GROVE_CATALOG_MODELS.includes('whimsywood-tree'), false);
assert.equal(childCatalogForShell('garden').includes('grass_a'), false);
assert.ok(childCatalogForShell('meadow').includes('whimsywood-tree'));
assert.ok(childCatalogForShell('meadow').includes('acorn-cottage'));
assert.equal(childCatalogForShell('meadow').includes('grass_a'), false);
assert.equal(catalogGroup('acorn-cottage'), 'houses');
assert.equal(catalogGroup('mushroom-lantern'), 'houses');
assert.equal(catalogGroup('pebble-blossom'), 'plants');

const meadowBaked = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../public/layout/meadow-layout.json'), 'utf8'),
);
assert.equal(meadowBaked.version, 2);
assert.ok(Array.isArray(meadowBaked.props) && meadowBaked.props.length >= 80);
assert.ok(meadowBaked.props.some((prop: { model: string }) => prop.model === 'spiral-garden'));
assert.ok(meadowBaked.props.some((prop: { model: string }) => prop.model === 'pebble-blossom'));

const groveBaked = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../public/layout/grove-layout.json'), 'utf8'),
);
assert.equal(groveBaked.version, 2);
assert.ok(Array.isArray(groveBaked.props) && groveBaked.props.length >= 90);
assert.ok(groveBaked.props.some((prop: { model: string }) => prop.model === 'voxel-tree'));
assert.ok(groveBaked.props.some((prop: { model: string }) => prop.model === 'lp_tree_01'));
assert.ok(groveBaked.props.some((prop: { model: string }) => prop.model === 'lp_pine_02'));
assert.ok(groveBaked.props.some((prop: { model: string }) => prop.model === 'rustic-bench'));
