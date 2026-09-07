import assert from 'node:assert/strict';
import {
  CATCH_BAND,
  CATCH_HALF,
  FALL_SPEED,
  FEED_GOAL,
  WAVE2_AT,
  caught,
  clockRate,
  fallSpeed,
  isFood,
  nextStreak,
  scoreAfterCatch,
  snackValue,
  spawnPlan,
  waveOf,
} from './frenzy.ts';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const plan = spawnPlan(mulberry32(7));
assert.equal(plan.length, 48);
let previous = 0;
let foodPoints = 0;
let junk = 0;
for (const snack of plan) {
  assert.ok(snack.at > previous, 'spawns move forward in time');
  previous = snack.at;
  assert.ok(snack.x >= 0.1 && snack.x <= 0.9);
  if (isFood(snack.kind)) foodPoints += snackValue(snack.kind);
  else junk += 1;
}
assert.ok(foodPoints >= FEED_GOAL + 4, 'enough food falls to finish even with slips');
assert.ok(junk >= 3, 'there is junk to dodge');
assert.ok(plan.slice(0, 3).every((snack) => isFood(snack.kind)), 'friendly opening');
assert.deepEqual(spawnPlan(mulberry32(7)), plan, 'same seed, same rain');

assert.equal(isFood('apple'), true);
assert.equal(isFood('berry'), true);
assert.equal(isFood('golden'), true);
assert.equal(isFood('sock'), false);
assert.equal(isFood('star'), false, 'a star is not food');

assert.equal(snackValue('apple'), 1);
assert.equal(snackValue('golden'), 3);
assert.equal(snackValue('sock'), -1);
assert.equal(snackValue('star'), -1);

assert.equal(scoreAfterCatch(5, 'sock'), 4, 'junk costs a point');
assert.equal(scoreAfterCatch(0, 'star'), 0, 'the score never dips below zero');
assert.equal(scoreAfterCatch(5, 'golden'), 8);

// Waves: the second half is faster in both spawn clock and fall speed.
assert.equal(waveOf(0), 1);
assert.equal(waveOf(WAVE2_AT - 1), 1);
assert.equal(waveOf(WAVE2_AT), 2);
assert.equal(clockRate(1), 1);
assert.ok(clockRate(2) > 1);
assert.equal(fallSpeed('apple', 1), FALL_SPEED);
assert.ok(fallSpeed('apple', 2) > fallSpeed('apple', 1));
assert.ok(fallSpeed('golden', 1) > fallSpeed('apple', 1), 'golden apples fall faster');

// Streaks: food catches build, misses and caught junk reset, dodged junk keeps.
assert.equal(nextStreak(0, 'apple', true), 1);
assert.equal(nextStreak(4, 'berry', true), 5);
assert.equal(nextStreak(4, 'apple', false), 0, 'a missed snack resets the streak');
assert.equal(nextStreak(4, 'sock', true), 0, 'a caught sock breaks the streak');
assert.equal(nextStreak(4, 'star', false), 4, 'a dodged star keeps the streak');

const y = (CATCH_BAND[0] + CATCH_BAND[1]) / 2;
assert.equal(caught(0.5, y, 0.5), true);
assert.equal(caught(0.5 + CATCH_HALF, y, 0.5), true);
assert.equal(caught(0.5 + CATCH_HALF + 0.01, y, 0.5), false);
assert.equal(caught(0.5, 0.2, 0.5), false, 'too high to catch');
assert.equal(caught(0.5, 0.99, 0.5), false, 'already past the bowl');
