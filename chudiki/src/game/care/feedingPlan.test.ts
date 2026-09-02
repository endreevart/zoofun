import assert from 'node:assert/strict';
import { assignToFeeders, livePlace, slotBeside } from './feedingPlan.ts';

const feeders = [
  { id: 'a', x: 0, z: 0, rotationY: 0 },
  { id: 'b', x: 20, z: 0, rotationY: 0 },
];

const creatures = [
  { id: 'near-a', x: 1, z: 0 },
  { id: 'near-b', x: 19, z: 0 },
  { id: 'also-a', x: 2, z: 1 },
  { id: 'far', x: 10, z: 8 },
];

const assigned = assignToFeeders(creatures, feeders);
assert.equal(assigned.length, 4);

const nearA = assigned.find((row) => row.creatureId === 'near-a');
const nearB = assigned.find((row) => row.creatureId === 'near-b');
assert.equal(nearA?.feederIndex, 0);
assert.equal(nearB?.feederIndex, 1);
assert.equal(nearA?.place, 0);
assert.equal(nearB?.place, 0);

const finished = new Set(['near-a']);
assert.equal(livePlace(assigned, 'also-a', finished), 0);
assert.equal(livePlace(assigned, 'near-a', finished), null);

const eat = slotBeside(feeders[0], 0, { x: 0, z: -5 });
const wait = slotBeside(feeders[0], 1, { x: 0, z: -5 });
assert.ok(Math.hypot(wait.x - eat.x, wait.z - eat.z) > 0.8);

console.log('feedingPlan ok');
