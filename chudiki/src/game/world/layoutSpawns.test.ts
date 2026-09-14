import assert from 'node:assert/strict';
import {
  clampSpawnRadius,
  DEFAULT_SPAWN_RADIUS,
  isAuthoredSpawn,
  MAX_SPAWN_RADIUS,
  MIN_SPAWN_RADIUS,
  nearestSpawnId,
  sampleSpawnPoint,
  type AuthoredSpawn,
} from './layoutSpawns.ts';

const anywhere = () => true;

/** Deterministic stand-in for Math.random, cycling a fixed sequence. */
function rolls(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

const zone = (over: Partial<AuthoredSpawn> = {}): AuthoredSpawn => ({
  id: 'spawn-1',
  x: 0,
  z: 0,
  radius: 2,
  ...over,
});

assert.equal(clampSpawnRadius(0.1), MIN_SPAWN_RADIUS);
assert.equal(clampSpawnRadius(50), MAX_SPAWN_RADIUS);
assert.equal(clampSpawnRadius(3), 3);
assert.equal(clampSpawnRadius(Number.NaN), DEFAULT_SPAWN_RADIUS);

assert.equal(isAuthoredSpawn(zone()), true);
assert.equal(isAuthoredSpawn({ ...zone(), radius: 0 }), false);
assert.equal(isAuthoredSpawn({ ...zone(), x: Number.NaN }), false);
assert.equal(isAuthoredSpawn({ id: 'spawn-1' }), false);
assert.equal(isAuthoredSpawn(null), false);

// Nothing painted: the caller keeps whatever default it had.
assert.equal(sampleSpawnPoint([], Math.random, anywhere), null);
assert.equal(sampleSpawnPoint([{ id: 'bad' } as unknown as AuthoredSpawn], Math.random, anywhere), null);

// One zone: every sample lands inside it.
const single = [zone({ x: 4, z: -3, radius: 1.5 })];
for (let i = 0; i < 200; i++) {
  const spot = sampleSpawnPoint(single, Math.random, anywhere);
  assert.ok(spot, 'a painted zone always yields a spot on walkable ground');
  assert.ok(Math.hypot(spot.x - 4, spot.z + 3) <= 1.5 + 1e-9);
}

// A zone drawn over a pond: only the walkable half may be used.
const dryEast = (x: number) => x >= 0;
for (let i = 0; i < 200; i++) {
  const spot = sampleSpawnPoint(single, Math.random, (x) => dryEast(x));
  assert.ok(spot && spot.x >= 0);
}

// Fully blocked but for the centre: the author's chosen middle wins.
const centreOnly = sampleSpawnPoint(
  [zone({ x: 7, z: 7, radius: 3 })],
  rolls([0.5]),
  (x, z) => x === 7 && z === 7,
);
assert.deepEqual(centreOnly, { x: 7, z: 7 });

// Blocked everywhere, centre included: null, so the caller falls back.
assert.equal(sampleSpawnPoint(single, Math.random, () => false, 20), null);

// Two zones, one four times the radius of the other: the wide one takes most
// of the eggs rather than half of them.
const wide = zone({ id: 'wide', x: -20, z: 0, radius: 4 });
const narrow = zone({ id: 'narrow', x: 20, z: 0, radius: 1 });
let inWide = 0;
for (let i = 0; i < 4000; i++) {
  const spot = sampleSpawnPoint([wide, narrow], Math.random, anywhere);
  assert.ok(spot);
  if (spot.x < 0) inWide++;
}
assert.ok(inWide > 3000, `expected the wide zone to dominate, got ${inWide}/4000`);
assert.ok(inWide < 4000, 'the narrow zone must still get eggs');

assert.equal(nearestSpawnId([wide, narrow], -20, 0), 'wide');
assert.equal(nearestSpawnId([wide, narrow], 20.5, 0), 'narrow');
assert.equal(nearestSpawnId([wide, narrow], 0, 0), null);
// Overlapping zones: the one whose centre is closer is the one being edited.
assert.equal(nearestSpawnId([zone({ id: 'a', x: 0 }), zone({ id: 'b', x: 1 })], 0.9, 0), 'b');
