import assert from 'node:assert/strict';
import { cellAt, isRightCell, makePieces, shuffledOrder } from './puzzle.ts';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pieces = makePieces(3, 2);
assert.equal(pieces.length, 6);
assert.deepEqual(pieces[0], { index: 0, row: 0, col: 0 });
assert.deepEqual(pieces[5], { index: 5, row: 1, col: 2 });

for (const seed of [1, 7, 42, 1234]) {
  const order = shuffledOrder(4, mulberry32(seed));
  assert.equal(order.length, 4);
  assert.deepEqual([...order].sort(), [0, 1, 2, 3]);
  assert.ok(order.some((value, index) => value !== index), `seed ${seed} left the puzzle solved`);
}
assert.deepEqual(shuffledOrder(1, mulberry32(5)), [0]);

assert.deepEqual(cellAt(10, 10, 300, 200, 3, 2), { row: 0, col: 0 });
assert.deepEqual(cellAt(299, 199, 300, 200, 3, 2), { row: 1, col: 2 });
assert.equal(cellAt(-1, 10, 300, 200, 3, 2), null);
assert.equal(cellAt(10, 250, 300, 200, 3, 2), null);
assert.equal(cellAt(10, 10, 0, 0, 3, 2), null);

assert.equal(isRightCell(pieces[4], { row: 1, col: 1 }), true);
assert.equal(isRightCell(pieces[4], { row: 0, col: 1 }), false);
assert.equal(isRightCell(pieces[4], null), false);
