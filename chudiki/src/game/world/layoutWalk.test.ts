import assert from 'node:assert/strict';
import {
  TREE_TRUNK_RADIUS,
  isWalkFoliage,
  isWalkHouse,
  isWalkTree,
  placedWalkRadius,
  walkFootprint,
  walkThrough,
  stampGroundLift,
  authoredGroundY,
  type WalkStamp,
} from './layoutWalk.ts';

assert.equal(isWalkFoliage('blooming-bush'), true);
assert.equal(isWalkFoliage('garden-blooms'), true);
assert.equal(isWalkFoliage('lp_bush_01'), true);
assert.equal(isWalkFoliage('sunlit-canopy'), false);
assert.equal(isWalkTree('sunlit-canopy'), true);
assert.equal(isWalkTree('whimsywood-tree'), true);
assert.equal(isWalkTree('blossom-tree'), true);
assert.equal(isWalkTree('voxel-tree'), true);
assert.equal(isWalkTree('voxel-evergreen'), true);
assert.equal(isWalkTree('voxel-blossom-canopy'), true);
assert.equal(isWalkFoliage('voxel-bloom-garden'), true);
assert.equal(isWalkFoliage('voxel-verdant-garden'), true);
assert.equal(walkThrough('voxel-bloom-garden'), true);
assert.equal(walkThrough('voxel-tree'), false);
assert.equal(isWalkHouse('mossy-burrow'), true);
assert.equal(isWalkHouse('acorn-cottage'), true);
assert.equal(isWalkHouse('mushroom-lantern'), true);
assert.equal(isWalkHouse('garden-gate'), false);
assert.equal(walkThrough('luminous-canopy'), true);
assert.equal(walkThrough('pebble-blossom'), true);
assert.equal(walkThrough('whimsywood-tree'), false);
assert.equal(walkThrough('acorn-cottage'), false);
assert.ok(stampGroundLift('lp_tree_01') > stampGroundLift('lp_bush_01'));
assert.ok(stampGroundLift('whimsywood-tree') > 0.05);
assert.ok(stampGroundLift('acorn-cottage') > 0.05);
assert.equal(walkThrough('blooming-bush'), true);
assert.equal(walkThrough('garden-blooms'), true);
assert.equal(walkThrough('mosslit-stones'), true);
assert.equal(walkThrough('rock_medium_01'), true);
assert.equal(walkThrough('wooden-fence'), true);
assert.equal(walkThrough('sunlit-canopy'), false);
assert.equal(walkThrough('mossy-burrow'), false);
assert.equal(walkThrough('mossflower-hollow'), false);
assert.equal(walkThrough('lotus-pond'), true);
assert.equal(walkThrough('garden-gate'), true);

function stamp(model: string, height = 2): WalkStamp {
  return { model, height };
}

assert.equal(walkFootprint(stamp('blooming-bush')), 0);
assert.equal(walkFootprint(stamp('garden-blooms')), 0);
assert.equal(walkFootprint(stamp('mosslit-stones')), 0);
assert.equal(walkFootprint(stamp('sunlit-canopy')), TREE_TRUNK_RADIUS);
assert.equal(walkFootprint(stamp('sunlit-canopy', 18)), TREE_TRUNK_RADIUS);
assert.ok(walkFootprint(stamp('mossy-burrow')) > 0.6);
assert.equal(placedWalkRadius(stamp('blooming-bush'), { x: 2, y: 1, z: 2 }), 0);
assert.equal(placedWalkRadius(stamp('mosslit-stones'), { x: 2, y: 1, z: 2 }), 0);
assert.equal(
  placedWalkRadius(stamp('sunlit-canopy', 18), { x: 4, y: 8, z: 4 }),
  TREE_TRUNK_RADIUS,
);
assert.ok(placedWalkRadius(stamp('mossy-burrow'), { x: 3, y: 2, z: 3 }) > 0.6);
assert.ok(placedWalkRadius(stamp('mossy-burrow'), { x: 8, y: 2, z: 8 }) <= 1.2);

assert.equal(
  authoredGroundY({ y: -2.8 }, () => {
    throw new Error('stored click-Y must not ray the island');
  }),
  -2.8,
);
assert.equal(authoredGroundY({}, () => 1.5), 1.5);
assert.equal(authoredGroundY({ y: Number.NaN }, () => 4), 4);
