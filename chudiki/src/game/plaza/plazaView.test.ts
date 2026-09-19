import assert from 'node:assert/strict';
import {
  nearPlazaProps,
  plazaCastsShadow,
  plazaViewCell,
  plazaLawnLocked,
  takePlazaStampRoom,
  PLAZA_STAMP_CAP,
} from './plazaView.ts';

assert.equal(PLAZA_STAMP_CAP, 400);
assert.equal(plazaViewCell(0, 0), plazaViewCell(4, -4));
assert.notEqual(plazaViewCell(0, 0), plazaViewCell(40, 0));

const rows = [
  { id: 'a', model: 'lp_tree_01', x: 0, z: 0 },
  { id: 'b', model: 'lp_tree_01', x: 100, z: 0 },
  { id: 'c', model: 'toy_ab', x: 2, z: 2 },
];
assert.deepEqual(
  nearPlazaProps(rows, 0, 0, 10).map((row) => row.id),
  ['a', 'c'],
);
assert.equal(plazaCastsShadow(0, 0, 0, 0), true);
assert.equal(plazaCastsShadow(80, 0, 0, 0), false);

const packed = Array.from({ length: 3 }, (_, i) => ({ model: 'lp_tree_01', i }));
packed.push({ model: 'toy_zz', i: 9 });
packed.push({ model: 'lp_pine_01', i: 4 });
const kept = takePlazaStampRoom(packed, 3);
assert.equal(kept.length, 3);
assert.equal(kept.some((row) => row.model === 'toy_zz'), true);
assert.equal(
  kept.filter((row) => row.model !== 'toy_zz').length,
  2,
);
assert.deepEqual(
  takePlazaStampRoom([{ model: 'lp_tree_01' }], 400),
  [{ model: 'lp_tree_01' }],
);

assert.equal(
  plazaLawnLocked(Array.from({ length: 3 }, () => ({ model: 'lp_tree_01' })), 3),
  false,
);
assert.equal(
  plazaLawnLocked(Array.from({ length: 3 }, () => ({ model: 'toy_aa' })), 3),
  true,
);
assert.equal(plazaLawnLocked([{ model: 'toy_aa' }, { model: 'lp_tree_01' }], 2), false);
