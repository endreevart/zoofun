import * as THREE from 'three';

/**
 * The Idyllic garden, transcribed from scripts/render-idyllic-world.py so the
 * runtime scene stands where the reviewed Cycles frame put it. Units are metres.
 *
 * Blender is Z-up and Three.js is Y-up, so ground coordinates convert as
 * `x = bx, z = -by`. Yaw carries over unchanged: a Blender rotation about +Z by
 * θ is a Three rotation about +Y by θ.
 *
 * The camera therefore sits on +Z and the park recedes toward -Z: the gate and
 * the house are at negative Z, the path enters the frame at positive Z.
 */

/** Blender ground coordinates -> Three.js ground coordinates. */
export function fromBlender(bx: number, by: number): THREE.Vector2 {
  return new THREE.Vector2(bx, -by);
}

export const WORLD_RADIUS = 24;

/** The lawn plane, matching Blender's 90 m plane centred at by = 8. */
export const GROUND = { size: 100, centerX: 0, centerZ: -5 };

/**
 * The zoo sits on a cartoon island in an ocean. Radius is the cliff top;
 * `cliff` is how many metres the rock drops before the bed goes underwater.
 */
export const ISLAND = {
  centerX: 0,
  centerZ: -5,
  radius: 40,
  cliff: 4.2,
  bed: -5.4,
  oceanY: -1.15,
};

/** Organic island outline at this angle, so the shore is not a perfect circle. */
export function islandEdgeRadius(x: number, z: number): number {
  const dx = x - ISLAND.centerX;
  const dz = z - ISLAND.centerZ;
  const angle = Math.atan2(dz, dx);
  return (
    ISLAND.radius *
    (1 + 0.055 * Math.sin(angle * 3) + 0.03 * Math.cos(angle * 5) + 0.018 * Math.sin(angle * 2 + 0.4))
  );
}

/** True on the grassy plateau, `inset` metres in from the cliff lip. */
export function onIsland(x: number, z: number, inset = 0): boolean {
  const r = Math.hypot(x - ISLAND.centerX, z - ISLAND.centerZ);
  return r < islandEdgeRadius(x, z) - inset;
}

/**
 * The park is a set of named clearings joined by the walkways, not one open
 * rectangle. A creature picks targets inside whichever clearing it is standing
 * in and crosses to the next along a corridor, which is why the gate and the
 * bridge read as ways through rather than as scenery.
 */
export type Zone = {
  id: string;
  label: string;
  center: THREE.Vector2;
  radiusX: number;
  radiusZ: number;
};

export const ZONES: Zone[] = [
  {
    id: 'meadow',
    label: 'Главный луг',
    center: new THREE.Vector2(-0.2, -2.0),
    radiusX: 13.8,
    radiusZ: 11.2,
  },
  {
    id: 'gate-glade',
    label: 'Поляна за воротами',
    center: new THREE.Vector2(7.2, -18.2),
    radiusX: 8.8,
    radiusZ: 6.8,
  },
  {
    id: 'pond-grove',
    label: 'Роща за прудом',
    center: new THREE.Vector2(-16.2, -3.2),
    radiusX: 6.8,
    radiusZ: 7.8,
  },
  {
    id: 'entry-lawn',
    label: 'Лужайка у входа',
    center: new THREE.Vector2(0.2, 11.8),
    radiusX: 10.5,
    radiusZ: 5.8,
  },
  {
    id: 'east-lawn',
    label: 'Восточная лужайка',
    center: new THREE.Vector2(13.2, -5.2),
    radiusX: 6.4,
    radiusZ: 5.6,
  },
];

const meadowZone = ZONES.find((zone) => zone.id === 'meadow') ?? ZONES[0];
/** New drawings hatch on the open lawn, not behind a rock at the gate. */
export const MEADOW_SPAWN = new THREE.Vector3(meadowZone.center.x, 0, meadowZone.center.y);

/** Walkable links between zones, as capsules along the ground. */
export const CORRIDORS: { from: THREE.Vector2; to: THREE.Vector2; halfWidth: number }[] = [
  { from: new THREE.Vector2(5.2, -9.5), to: new THREE.Vector2(6.2, -15.2), halfWidth: 2.4 },
  { from: new THREE.Vector2(-9.8, -1.4), to: new THREE.Vector2(-14.4, -2.6), halfWidth: 2.6 },
  { from: new THREE.Vector2(2.4, 5.4), to: new THREE.Vector2(1.8, 12.6), halfWidth: 2.6 },
  { from: new THREE.Vector2(8.6, -3.2), to: new THREE.Vector2(11.4, -4.8), halfWidth: 2.3 },
];

/**
 * Bounding box of every zone and corridor, with a margin: the walk grid is
 * sampled over this, and nothing outside it is ever walkable.
 */
export const ROAM_BOUNDS = { minX: -25, maxX: 22, minZ: -28, maxZ: 19 };

/** Inside a clearing or a link between two of them. */
export function inWalkZone(x: number, z: number): boolean {
  for (const zone of ZONES) {
    const nx = (x - zone.center.x) / zone.radiusX;
    const nz = (z - zone.center.y) / zone.radiusZ;
    if (nx * nx + nz * nz <= 1) return true;
  }
  for (const link of CORRIDORS) {
    if (nearSegment(x, z, link.from, link.to) <= link.halfWidth) return true;
  }
  return false;
}

/** Distance from a point to a segment, in the ground plane. */
export function nearSegment(x: number, z: number, a: THREE.Vector2, b: THREE.Vector2): number {
  const abx = b.x - a.x;
  const abz = b.y - a.y;
  const lengthSq = abx * abx + abz * abz || 1;
  const t = THREE.MathUtils.clamp(((x - a.x) * abx + (z - a.y) * abz) / lengthSq, 0, 1);
  return Math.hypot(x - (a.x + abx * t), z - (a.y + abz * t));
}

export type WaterBody = {
  center: THREE.Vector2;
  radiusX: number;
  radiusZ: number;
  surfaceY: number;
};

export const PONDS: WaterBody[] = [
  { center: new THREE.Vector2(-3.6, -6.2), radiusX: 5.2, radiusZ: 5.2, surfaceY: 0.02 },
  { center: new THREE.Vector2(-3.27, 5.72), radiusX: 4.7, radiusZ: 4.7, surfaceY: 0.02 },
];

/** The original pond, kept as an alias so older call sites stay readable. */
export const POND = PONDS[0];

/** Main path: enters bottom-right of frame, sweeps back to the gate. */
export const PATH_MAIN_POINTS: THREE.Vector2[] = [
  new THREE.Vector2(8.8, 7.2),
  new THREE.Vector2(7.2, 3.6),
  new THREE.Vector2(4.2, 0.4),
  new THREE.Vector2(0.7, -1.8),
  new THREE.Vector2(-2.1, -3.7),
  new THREE.Vector2(-3.8, -6.6),
];

/** Spur that leaves the main path, crosses the creek and reaches the pond. */
export const PATH_SIDE_POINTS: THREE.Vector2[] = [
  new THREE.Vector2(2.6, 1.6),
  new THREE.Vector2(0.6, 1.0),
  new THREE.Vector2(-1.2, 0.6),
  new THREE.Vector2(-3.4, 0.2),
  new THREE.Vector2(-6.0, -1.6),
];

/** Creek draining the main pond toward the camera. Wider than the old ribbon. */
export const CREEK_POINTS: THREE.Vector2[] = [
  new THREE.Vector2(-4.4, -2.6),
  new THREE.Vector2(-3.4, -0.8),
  new THREE.Vector2(-2.8, 1.4),
  new THREE.Vector2(-2.6, 4.0),
  new THREE.Vector2(-2.8, 7.4),
  new THREE.Vector2(-3.0, 11.2),
];

/** Where the side path crosses the creek, so the bridge really spans water. */
export const BRIDGE = {
  center: new THREE.Vector3(-0.9, 0.02, -2.55),
  yaw: -0.49,
  height: 1.25,
  length: 4.4,
  width: 1.6,
  arc: 0.38,
};

export const GATE = { position: new THREE.Vector2(8.2, 5.6), yaw: -2.82 };

export type Cottage = {
  position: THREE.Vector2;
  yaw: number;
  height: number;
  model: string;
};

/** One landmark on the far glade: the Meshy garden tree, about 4 m tall. */
export const HOUSES: Cottage[] = [
  {
    position: new THREE.Vector2(9.2, -21.2),
    yaw: THREE.MathUtils.degToRad(196),
    height: 4.0,
    model: 'giant-tree',
  },
];

export const HOUSE = HOUSES[0];

export function nearHouse(x: number, z: number, margin = 5): boolean {
  return HOUSES.some((house) => Math.hypot(x - house.position.x, z - house.position.y) < margin);
}

export type Bench = {
  position: THREE.Vector2;
  yaw: number;
  height: number;
};

/** A pair of rustic benches on the lawn — one by the pond, one on the path. */
export const BENCHES: Bench[] = [
  { position: new THREE.Vector2(-3.6, -6.4), yaw: THREE.MathUtils.degToRad(38), height: 0.9 },
  { position: new THREE.Vector2(5.2, 3.4), yaw: THREE.MathUtils.degToRad(-112), height: 0.9 },
];

export function nearBench(x: number, z: number, margin = 1.3): boolean {
  return BENCHES.some((bench) => Math.hypot(x - bench.position.x, z - bench.position.y) < margin);
}
export const BURROW = {
  position: new THREE.Vector2(-13.6, 0.6),
  /**
   * Unit direction the door faces, angled toward the camera so the doorway is
   * visible in the opening frame rather than buried in the far slope.
   */
  doorDirection: new THREE.Vector2(0.342, 0.94),
  /** Half-extents of the mossy mound: a 2.25 m sphere, widened and flattened. */
  moundScale: new THREE.Vector3(2.7, 1.395, 2.25),
};

/**
 * Opening pose. Ported from CAM_POS/CAM_TARGET; the 24 mm lens on Blender's
 * 36 mm sensor is a 46 degree vertical field of view at 16:9.
 */
export const HERO_CAMERA = new THREE.Vector3(-0.6, 3.9, 7.5);
export const HERO_FOCUS = new THREE.Vector3(-1.4, 0.55, -5.2);
export const HERO_FOV = 46;

/**
 * Backdrop hills: (x, z, radius, height, tier).
 *
 * The ring is closed on the sides and partly in front of the camera, because a
 * backdrop only behind the park leaves the frame edges opening onto empty sky —
 * which is what made the zoo look like a diorama on a table.
 */
export const HILLS: { x: number; z: number; radius: number; height: number; tier: number }[] = [
  // Near shoulders, rising out of the forest so the park sits in a valley.
  { x: -22, z: -28, radius: 14, height: 7.5, tier: 0 },
  { x: -6, z: -32, radius: 16, height: 8.5, tier: 0 },
  { x: 12, z: -33, radius: 15, height: 8.0, tier: 0 },
  { x: 26, z: -28, radius: 13, height: 7.0, tier: 0 },
  { x: -32, z: -14, radius: 13, height: 7.5, tier: 0 },
  { x: 32, z: -12, radius: 13, height: 7.5, tier: 0 },
  // Flanks that close the left and right of the frame.
  { x: -36, z: 6, radius: 15, height: 9.0, tier: 1 },
  { x: 37, z: 8, radius: 15, height: 9.0, tier: 1 },
  { x: -28, z: 24, radius: 16, height: 10.0, tier: 1 },
  { x: 30, z: 26, radius: 16, height: 10.0, tier: 1 },
  { x: 8, z: 38, radius: 18, height: 11.0, tier: 1 },
  { x: -14, z: 40, radius: 17, height: 10.5, tier: 1 },
  { x: 52, z: -6, radius: 18, height: 12.0, tier: 2 },
  { x: 58, z: 18, radius: 20, height: 13.0, tier: 2 },
  { x: 48, z: 40, radius: 18, height: 12.0, tier: 2 },
  { x: 0, z: 56, radius: 22, height: 14.0, tier: 2 },
  { x: -48, z: 20, radius: 18, height: 12.0, tier: 2 },
  { x: 72, z: -18, radius: 24, height: 18.0, tier: 3 },
  { x: 62, z: 44, radius: 22, height: 16.0, tier: 3 },
  { x: 18, z: 70, radius: 24, height: 18.0, tier: 3 },
  { x: -20, z: 68, radius: 22, height: 16.0, tier: 3 },
  { x: -64, z: 28, radius: 22, height: 16.0, tier: 3 },
  // Mid range — overlapping lumps, so the silhouette is a ridge, not a row.
  { x: -16, z: -44, radius: 22, height: 14.0, tier: 2 },
  { x: 4, z: -50, radius: 26, height: 16.0, tier: 2 },
  { x: 24, z: -46, radius: 22, height: 15.0, tier: 2 },
  { x: -40, z: -34, radius: 20, height: 13.0, tier: 2 },
  { x: 44, z: -32, radius: 20, height: 13.5, tier: 2 },
  { x: -8, z: -56, radius: 18, height: 12.0, tier: 2 },
  { x: 36, z: -54, radius: 18, height: 12.5, tier: 2 },
  // Far peaks, the cartoon mountain wall.
  { x: -30, z: -68, radius: 28, height: 24.0, tier: 3 },
  { x: 6, z: -78, radius: 36, height: 30.0, tier: 3 },
  { x: 42, z: -70, radius: 28, height: 26.0, tier: 3 },
  { x: -58, z: -52, radius: 26, height: 22.0, tier: 3 },
  { x: 68, z: -50, radius: 26, height: 22.0, tier: 3 },
  { x: -18, z: -88, radius: 24, height: 20.0, tier: 3 },
  { x: 22, z: -90, radius: 24, height: 21.0, tier: 3 },
];

/**
 * The forested rim. Trees fill everything from `inner` metres outside the
 * clearings to `outer`, so the wall follows the shape of the park instead of
 * being a circle drawn around it, and a creature never sees a way out.
 */
export const TREELINE = { inner: 1.6, dense: 8.5, outer: 24.0 };

/**
 * Roughly how far outside the walkable clearings a point lies, in metres.
 * Zero inside. Ellipses use a normalised-radius approximation, which is exact
 * on a circle and close enough on these gentle ovals.
 */
export function distanceOutsidePark(x: number, z: number): number {
  let best = Infinity;

  for (const zone of ZONES) {
    const nx = (x - zone.center.x) / zone.radiusX;
    const nz = (z - zone.center.y) / zone.radiusZ;
    const n = Math.sqrt(nx * nx + nz * nz);
    if (n <= 1) return 0;
    best = Math.min(best, (n - 1) * Math.min(zone.radiusX, zone.radiusZ));
  }

  for (const link of CORRIDORS) {
    const d = nearSegment(x, z, link.from, link.to) - link.halfWidth;
    if (d <= 0) return 0;
    best = Math.min(best, d);
  }

  return best;
}

/** Band along the bottom of the frame the reference crowds with big blooms. */
export const FOREGROUND_Z = { near: 2.4, far: -0.6 };

/**
 * Authored tree clusters ringing the meadow. Each holds four or five trunks
 * within about a metre, so they double as the footprints creatures walk around.
 */
export const TREE_CLUSTERS: [number, number][] = [
  [-13.2, -13.0], [-6.4, -16.0], [1.4, -17.0], [10.2, -15.4], [15.0, -10.6],
  [-15.0, -7.2], [-14.2, 4.2], [14.8, 6.2], [-12.4, 8.4],
  [11.2, 8.0], [-19.0, -11.0], [18.2, -7.2], [3.4, -21.0], [-4.6, -21.0],
  [-18.4, 0.6],
];

/**
 * Uniform Catmull-Rom, ported from the render script rather than delegated to
 * THREE.CatmullRomCurve3 so the paths land exactly where the reviewed frame
 * put them.
 */
export function splineAt(points: THREE.Vector2[], t: number, out = new THREE.Vector2()): THREE.Vector2 {
  const n = points.length - 1;
  const f = THREE.MathUtils.clamp(t, 0, 1) * n;
  const i = Math.min(Math.floor(f), n - 1);
  const u = f - i;

  const p0 = points[Math.max(i - 1, 0)];
  const p1 = points[i];
  const p2 = points[i + 1];
  const p3 = points[Math.min(i + 2, n)];

  const cr = (a: number, b: number, c: number, d: number) =>
    0.5 *
    (2 * b +
      (-a + c) * u +
      (2 * a - 5 * b + 4 * c - d) * u * u +
      (-a + 3 * b - 3 * c + d) * u * u * u);

  return out.set(cr(p0.x, p1.x, p2.x, p3.x), cr(p0.y, p1.y, p2.y, p3.y));
}

export const pathMain = (t: number, out?: THREE.Vector2) => splineAt(PATH_MAIN_POINTS, t, out);
export const pathSide = (t: number, out?: THREE.Vector2) => splineAt(PATH_SIDE_POINTS, t, out);
export const creek = (t: number, out?: THREE.Vector2) => splineAt(CREEK_POINTS, t, out);

export function inPond(x: number, z: number, margin = 0): boolean {
  for (const pond of PONDS) {
    const nx = (x - pond.center.x) / (pond.radiusX + margin);
    const nz = (z - pond.center.y) / (pond.radiusZ + margin);
    if (nx * nx + nz * nz < 1) return true;
  }
  return false;
}

const scratch = new THREE.Vector2();

export function nearPath(
  x: number,
  z: number,
  distance: number,
  fn: (t: number, out?: THREE.Vector2) => THREE.Vector2 = pathMain,
  steps = 40,
): boolean {
  const limit = distance * distance;
  for (let i = 0; i <= steps; i++) {
    fn(i / steps, scratch);
    const dx = scratch.x - x;
    const dz = scratch.y - z;
    if (dx * dx + dz * dz < limit) return true;
  }
  return false;
}

/** Everywhere planting must not go: water, walkways and the built landmarks. */
export function blocked(x: number, z: number, margin = 1): boolean {
  if (inPond(x, z, margin)) return true;
  if (nearPath(x, z, 1.35 + margin * 0.3)) return true;
  if (nearPath(x, z, 1.0 + margin * 0.3, pathSide, 20)) return true;
  if (nearPath(x, z, 1.2, creek, 24)) return true;
  if (Math.hypot(x - GATE.position.x, z - GATE.position.y) < 3.0) return true;
  if (Math.hypot(x - BURROW.position.x, z - BURROW.position.y) < 3.6) return true;
  if (nearHouse(x, z, 5.4 + margin * 0.4)) return true;
  if (nearBench(x, z, 1.2 + margin * 0.2)) return true;
  return false;
}
