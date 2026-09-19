import assert from 'node:assert/strict';
import { asPlazaProp } from './plazaStamp.ts';

const stamp = asPlazaProp({
  id: 'ab12cd34',
  model: 'sunlit-canopy',
  x: 4,
  z: -2,
  height: 7.5,
  rotation_y: 0.4,
});

assert.equal(stamp.id, 'ab12cd34');
assert.equal(stamp.model, 'sunlit-canopy');
assert.equal(stamp.x, 4);
assert.equal(stamp.z, -2);
assert.equal(stamp.height, 7.5);
assert.equal(stamp.rotationY, 0.4);
assert.equal(stamp.y, 0);

const toy = asPlazaProp({
  id: 'toy1',
  model: 'toy_ab12',
  x: 1,
  z: 2,
  height: 2,
  rotation_y: 0,
  mine: false,
  still_url: '/v1/plaza/toys/ab12/still',
});
assert.equal(toy.mine, false);
assert.equal(toy.stillUrl, '/v1/plaza/toys/ab12/still');
assert.equal(
  asPlazaProp({
    id: 'own',
    model: 'sunlit-canopy',
    x: 0,
    z: 0,
    height: 1,
    rotation_y: 0,
    mine: true,
  }).mine,
  true,
);
