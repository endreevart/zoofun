import assert from 'node:assert/strict';
import {
  FLOWERS_BASE,
  JUMP_VY,
  RUN_LEVELS,
  RUN_SPEED,
  clampLevel,
  flowersOf,
  jump,
  speedOf,
  startRun,
  tick,
  togglePause,
} from './runSim.ts';

const start = startRun();
assert.equal(start.status, 'play');
assert.equal(start.level, 1);
assert.equal(start.goal, FLOWERS_BASE);
assert.equal(start.speed, RUN_SPEED);
assert.equal(start.y, 0);
assert.equal(start.flowers, 0);
assert.ok(start.props.length >= 2);
assert.equal(
  start.props.filter((item) => item.kind === 'log').length,
  0,
);

assert.equal(clampLevel(0), 1);
assert.equal(clampLevel(9), RUN_LEVELS);
assert.equal(flowersOf(1), 3);
assert.equal(flowersOf(2), 6);
assert.equal(flowersOf(5), 15);
assert.equal(speedOf(1), RUN_SPEED);
assert.ok(speedOf(2) > speedOf(1));
assert.ok(speedOf(2) < RUN_SPEED * 1.4);
assert.ok(speedOf(5) > RUN_SPEED * 1.7);
assert.ok(speedOf(5) < RUN_SPEED * 2.1);

const two = startRun(2);
assert.equal(two.goal, 6);
assert.equal(two.speed, speedOf(2));
assert.ok(two.props.some((item) => item.kind === 'log'));

const five = startRun(5);
assert.equal(five.goal, 15);
assert.equal(five.speed, speedOf(5));
const logsFive = five.props.filter((item) => item.kind === 'log').length;
const logsTwo = two.props.filter((item) => item.kind === 'log').length;
assert.ok(logsFive > logsTwo);

let paced = startRun(3);
for (let i = 0; i < 30; i += 1) paced = tick(paced, 1 / 30);
assert.ok(Math.abs(paced.x - speedOf(3)) < 40);

const paused = togglePause(start);
assert.equal(paused.status, 'pause');
assert.equal(tick(paused, 1).x, paused.x);
assert.equal(togglePause(paused).status, 'play');

const hopped = jump(start);
assert.equal(hopped.vy, JUMP_VY);
assert.ok(hopped.y > 0);
const air = tick(hopped, 1 / 30);
assert.ok(air.y > 0);

let grounded = jump(startRun());
let maxY = 0;
for (let i = 0; i < 22; i += 1) {
  grounded = tick(grounded, 1 / 30);
  maxY = Math.max(maxY, grounded.y);
}
assert.ok(maxY > 80);
assert.ok(grounded.y > 0);

let run = startRun(1);
for (let i = 0; i < 2400 && run.status === 'play'; i += 1) {
  if (run.y < 1) run = jump(run);
  run = tick(run, 1 / 30);
}
assert.equal(run.status, 'win');
assert.ok(run.flowers >= run.goal);

let bump = startRun();
let bush = bump.props.find((item) => item.kind === 'bush');
while (!bush && bump.status === 'play' && bump.x < 5000) {
  bump = tick(bump, 1 / 30);
  bush = bump.props.find((item) => item.kind === 'bush');
}
assert.ok(bush);
while (bump.x + 20 < bush.x) bump = tick(bump, 1 / 30);
assert.ok(bump.invuln > 0);
assert.equal(bump.status, 'play');
assert.ok(bump.flowers >= 0);

let hopBush = startRun();
let hedge = hopBush.props.find((item) => item.kind === 'bush');
while (!hedge && hopBush.status === 'play' && hopBush.x < 5000) {
  hopBush = tick(hopBush, 1 / 30);
  hedge = hopBush.props.find((item) => item.kind === 'bush');
}
assert.ok(hedge);
while (hopBush.x < hedge.x - 160) hopBush = tick(hopBush, 1 / 30);
hopBush = jump(hopBush);
while (hopBush.x < hedge.x + hedge.w) hopBush = tick(hopBush, 1 / 30);
assert.equal(hopBush.invuln, 0);
const stillBush = hopBush.props.find((item) => item.id === hedge.id);
assert.ok(stillBush);
assert.equal(stillBush.taken, false);
assert.equal(stillBush.cleared, true);

let hopLog = startRun(2);
const firstBush = hopLog.props.find((item) => item.kind === 'bush');
const log = hopLog.props.find((item) => item.kind === 'log');
assert.ok(firstBush);
assert.ok(log);
while (hopLog.x < firstBush.x - 160) hopLog = tick(hopLog, 1 / 30);
hopLog = jump(hopLog);
while (hopLog.x < log.x - 220) hopLog = tick(hopLog, 1 / 30);
while (hopLog.y > 1) hopLog = tick(hopLog, 1 / 30);
hopLog = jump(hopLog);
while (hopLog.x < log.x + log.w) hopLog = tick(hopLog, 1 / 30);
assert.equal(hopLog.invuln, 0);

let rocky = startRun(2);
while (!rocky.props.some((item) => item.kind === 'rock') && rocky.x < 8000) {
  rocky = tick(rocky, 1 / 30);
}
assert.ok(rocky.props.some((item) => item.kind === 'rock'));
