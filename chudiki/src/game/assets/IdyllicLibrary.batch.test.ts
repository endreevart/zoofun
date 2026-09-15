import assert from 'node:assert/strict';
import { isPackedFoliage } from './packFoliage.ts';
import { GLB_LOAD_BATCH } from './packModel.ts';

assert.equal(GLB_LOAD_BATCH, 2, 'parallel GLB loads stay at two to avoid first-frame hitch');
assert.equal(isPackedFoliage('whimsywood-tree'), true);
assert.equal(isPackedFoliage('giant-tree'), true);
assert.equal(isPackedFoliage('acorn-cottage'), false);
assert.equal(isPackedFoliage('whimsy-isle'), false);
assert.equal(isPackedFoliage('lotus-pond'), false);

