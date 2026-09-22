/** Side-run on the free garden plinth. Five levels, no credits. */

export const RUN_LEVELS = 5;
export const FLOWERS_BASE = 3;
export const RUN_SPEED = 290;
/** Same height as before, longer hang so one jump clears a bush, rock, or log. */
export const GRAVITY = 800;
export const JUMP_VY = 510;
export const HERO_W = 88;
export const HERO_H = 96;
export const INVULN = 0.85;
export const FIRST_GAP = 460;
/** @deprecated use flowersOf(level) */
export const FLOWER_GOAL = FLOWERS_BASE;

export type RunKind = 'log' | 'bush' | 'rock' | 'flower';
export type RunStatus = 'play' | 'pause' | 'win';

export type RunProp = {
  id: number;
  kind: RunKind;
  x: number;
  y: number;
  w: number;
  h: number;
  taken: boolean;
  cleared: boolean;
};

export type RunState = {
  t: number;
  x: number;
  y: number;
  vy: number;
  flowers: number;
  status: RunStatus;
  invuln: number;
  spawnX: number;
  nextId: number;
  pattern: number;
  props: RunProp[];
  level: number;
  goal: number;
  speed: number;
};

const SIZE: Record<RunKind, { w: number; h: number; y: number }> = {
  log: { w: 148, h: 78, y: 0 },
  bush: { w: 156, h: 62, y: 0 },
  rock: { w: 148, h: 70, y: 0 },
  flower: { w: 64, h: 64, y: 118 },
};

type Beat = { kind: RunKind; gap: number; y?: number };

/** Sparse → dense. Level 1 is mostly flowers. */
const PATTERNS: Beat[][] = [
  [
    { kind: 'flower', gap: 400, y: 118 },
    { kind: 'bush', gap: 580 },
    { kind: 'flower', gap: 480, y: 132 },
    { kind: 'flower', gap: 500, y: 112 },
  ],
  [
    { kind: 'bush', gap: 560 },
    { kind: 'flower', gap: 280, y: 118 },
    { kind: 'log', gap: 520 },
    { kind: 'flower', gap: 290, y: 136 },
    { kind: 'rock', gap: 540 },
    { kind: 'flower', gap: 250, y: 112 },
  ],
  [
    { kind: 'bush', gap: 480 },
    { kind: 'flower', gap: 240, y: 118 },
    { kind: 'log', gap: 440 },
    { kind: 'flower', gap: 220, y: 130 },
    { kind: 'rock', gap: 460 },
    { kind: 'log', gap: 400 },
    { kind: 'flower', gap: 210, y: 112 },
  ],
  [
    { kind: 'rock', gap: 420 },
    { kind: 'log', gap: 360 },
    { kind: 'flower', gap: 200, y: 124 },
    { kind: 'bush', gap: 400 },
    { kind: 'flower', gap: 180, y: 112 },
    { kind: 'log', gap: 340 },
    { kind: 'flower', gap: 190, y: 136 },
  ],
  [
    { kind: 'bush', gap: 360 },
    { kind: 'flower', gap: 160, y: 118 },
    { kind: 'log', gap: 300 },
    { kind: 'flower', gap: 150, y: 132 },
    { kind: 'rock', gap: 320 },
    { kind: 'log', gap: 280 },
    { kind: 'flower', gap: 140, y: 112 },
  ],
];

export function clampLevel(level: number): number {
  return Math.min(RUN_LEVELS, Math.max(1, Math.floor(level) || 1));
}

export function flowersOf(level: number): number {
  return FLOWERS_BASE * clampLevel(level);
}

export function speedOf(level: number): number {
  const lv = clampLevel(level);
  return Math.round(RUN_SPEED * (1 + 0.22 * (lv - 1)));
}

export function startRun(level = 1): RunState {
  const lv = clampLevel(level);
  const speed = speedOf(lv);
  const state: RunState = {
    t: 0,
    x: 0,
    y: 0,
    vy: 0,
    flowers: 0,
    status: 'play',
    invuln: 0,
    spawnX: Math.max(FIRST_GAP, speed * 1.2),
    nextId: 1,
    pattern: 0,
    props: [],
    level: lv,
    goal: flowersOf(lv),
    speed,
  };
  while (state.spawnX < state.x + ahead(state.speed)) spawnOne(state);
  return state;
}

export function togglePause(state: RunState): RunState {
  if (state.status === 'win') return state;
  return { ...state, status: state.status === 'pause' ? 'play' : 'pause' };
}

export function jump(state: RunState): RunState {
  if (state.status !== 'play') return state;
  if (state.y > 1) return state;
  return { ...state, y: Math.max(state.y, 0.01), vy: JUMP_VY };
}

export function tick(state: RunState, dt: number): RunState {
  if (state.status !== 'play') return state;
  const step = Math.min(Math.max(dt, 0), 1 / 20);
  let next = { ...state, props: state.props.map((item) => ({ ...item })) };
  next.t += step;
  next.invuln = Math.max(0, next.invuln - step);
  next.x += next.speed * step;
  next.vy -= GRAVITY * step;
  next.y += next.vy * step;
  if (next.y <= 0) {
    next.y = 0;
    next.vy = 0;
  }
  while (next.spawnX < next.x + ahead(next.speed)) spawnOne(next);
  collect(next);
  bump(next);
  if (next.flowers >= next.goal) next.status = 'win';
  next.props = next.props.filter((item) => item.x > next.x - 400);
  return next;
}

function ahead(speed: number) {
  return Math.max(1800, speed * 5);
}

function spawnOne(state: RunState) {
  const beats = PATTERNS[state.level - 1] ?? PATTERNS[0];
  const beat = beats[state.pattern % beats.length];
  const size = SIZE[beat.kind];
  state.props.push({
    id: state.nextId,
    kind: beat.kind,
    x: state.spawnX,
    y: beat.y ?? size.y,
    w: size.w,
    h: size.h,
    taken: false,
    cleared: false,
  });
  state.nextId += 1;
  state.spawnX += Math.round(beat.gap * (0.92 + 0.08 * state.level));
  state.pattern += 1;
}

function heroBox(state: RunState) {
  return {
    l: state.x - HERO_W * 0.32,
    r: state.x + HERO_W * 0.32,
    b: state.y,
    t: state.y + HERO_H,
  };
}

function overlapX(state: RunState, prop: RunProp): boolean {
  const l = prop.x - prop.w * 0.5;
  const r = prop.x + prop.w * 0.5;
  const box = heroBox(state);
  return box.l < r && box.r > l;
}

function overlap(
  a: { l: number; r: number; b: number; t: number },
  prop: RunProp,
): boolean {
  const l = prop.x - prop.w * 0.5;
  const r = prop.x + prop.w * 0.5;
  const b = prop.y;
  const t = prop.y + prop.h;
  return a.l < r && a.r > l && a.b < t && a.t > b;
}

function collect(state: RunState) {
  const box = heroBox(state);
  for (const prop of state.props) {
    if (prop.kind !== 'flower' || prop.taken) continue;
    if (!overlap(box, prop)) continue;
    prop.taken = true;
    state.flowers += 1;
  }
}

function bump(state: RunState) {
  if (state.invuln > 0) return;
  for (const prop of state.props) {
    if (prop.kind === 'flower' || prop.cleared) continue;
    if (!overlapX(state, prop)) continue;
    const over = prop.kind === 'bush' ? 48 : prop.kind === 'rock' ? 58 : 70;
    if (state.y > over) {
      prop.cleared = true;
      continue;
    }
    state.invuln = INVULN;
    state.vy = Math.max(state.vy, 420);
    state.y = Math.max(state.y, 8);
    return;
  }
}
