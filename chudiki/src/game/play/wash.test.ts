import assert from 'node:assert/strict';
import {
  DRY_HITS,
  FOAM_HP,
  SOAK_HITS,
  SPOT_HP,
  STAGE_TOOL,
  applyWash,
  makeDirt,
  scrubAt,
  startWash,
  washDone,
  washProgress,
  washTotal,
} from './wash.ts';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dirt = makeDirt(mulberry32(99));
assert.equal(dirt.length, 7);
for (const spot of dirt) {
  assert.ok(spot.x >= 0.22 && spot.x <= 0.78);
  assert.ok(spot.y >= 0.24 && spot.y <= 0.76);
  assert.ok(spot.r >= 0.07 && spot.r <= 0.13);
  assert.equal(spot.hp, SPOT_HP);
}
assert.deepEqual(makeDirt(mulberry32(99)), dirt, 'same seed, same mud');

assert.equal(washProgress(dirt), 0);
assert.equal(washDone(dirt), false);

const first = dirt[0];
const hits = scrubAt(dirt, first.x, first.y, 0.01);
assert.ok(hits >= 1);
assert.equal(first.hp, SPOT_HP - 1);
assert.ok(washProgress(dirt) > 0);

assert.equal(scrubAt(dirt, -5, -5, 0.01), 0, 'far away touches nothing');

for (let i = 0; i < SPOT_HP * 2; i += 1) {
  for (const spot of dirt) scrubAt(dirt, spot.x, spot.y, 0.01);
}
assert.equal(washDone(dirt), true);
assert.equal(washProgress(dirt), 1);
assert.equal(scrubAt(dirt, first.x, first.y, 0.05), 0, 'clean spots stay clean');

assert.equal(washProgress([]), 1);

// --- Full four-stage wash walkthrough ---

const state = startWash(mulberry32(5));
assert.equal(state.stage, 'soak');
assert.equal(STAGE_TOOL[state.stage], 'shower');
assert.equal(washTotal(state), 0);

// Soak: pours must land on the toy; the last pour advances the stage.
assert.equal(applyWash(state, -0.2, 0.5, mulberry32(1)).hit, false, 'pouring past the toy is dry');
assert.equal(state.soak, 0);
let advanced = false;
for (let i = 0; i < SOAK_HITS; i += 1) {
  const result = applyWash(state, 0.5, 0.5, mulberry32(i));
  assert.equal(result.hit, true);
  advanced = result.advanced;
}
assert.equal(advanced, true, 'full soak advances');
assert.equal(state.stage, 'scrub');
assert.equal(state.soak, 1);
assert.ok(washTotal(state) >= 0.19 && washTotal(state) <= 0.21);

// Scrub: rubbing the mud produces foam and eventually advances.
assert.equal(applyWash(state, -5, -5, mulberry32(1)).hit, false, 'missing the mud does nothing');
const scrubRng = mulberry32(77);
for (let round = 0; round < SPOT_HP + 1 && state.stage === 'scrub'; round += 1) {
  for (const spot of [...state.spots]) {
    if (state.stage !== 'scrub') break;
    if (spot.hp > 0) applyWash(state, spot.x, spot.y, scrubRng);
  }
}
assert.equal(washDone(state.spots), true);
assert.ok(state.stage === 'rinse' || state.stage === 'dry');
assert.ok(state.foam.length > 0, 'scrubbing left foam behind');
assert.equal(state.foamTotal, state.foam.length * FOAM_HP);

// Rinse: pour on every blob until the foam is gone.
assert.equal(state.stage, 'rinse');
assert.equal(
  applyWash(state, -5, -5, mulberry32(1)).hit,
  false,
  'pouring far from foam does nothing',
);
for (let round = 0; round < FOAM_HP + 1 && state.stage === 'rinse'; round += 1) {
  for (const blob of [...state.foam]) {
    if (state.stage !== 'rinse') break;
    applyWash(state, blob.x, blob.y, mulberry32(round));
  }
}
assert.equal(state.stage, 'dry');
assert.equal(state.foam.length, 0);
assert.ok(washTotal(state) >= 0.79, 'three stages down');

// Dry: towel rubs on the toy finish the job; rubbing the sky does not.
assert.equal(applyWash(state, 0.5, 1.4, mulberry32(1)).hit, false, 'towel misses off the toy');
for (let i = 0; i < DRY_HITS && state.stage === 'dry'; i += 1) {
  applyWash(state, 0.5, 0.5, mulberry32(i));
}
assert.equal(state.stage, 'done');
assert.equal(washTotal(state), 1);
assert.deepEqual(applyWash(state, 0.5, 0.5, mulberry32(1)), { hit: false, advanced: false });
