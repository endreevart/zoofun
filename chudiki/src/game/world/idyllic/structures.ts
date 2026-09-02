import * as THREE from 'three';
import type { IdyllicLibrary } from '../../assets/IdyllicLibrary';
import type { InstancedScatter } from '../../assets/InstancedScatter';
import type { Terrain } from '../Terrain';
import {
  BRIDGE,
  BURROW,
  GATE,
  BENCHES,
  HOUSES,
  PONDS,
  creek,
  inPond,
  nearPath,
  pathMain,
  pathSide,
} from '../layout';
import type { Rng } from '../../core/rng';
import { range } from '../../core/rng';
import { createToyMaterial } from '../../core/geometry';
import { withWhiteVertexColors } from './geometry';

/**
 * The built landmarks, ported from build_bridge / build_gate_and_house /
 * build_burrow / build_fences in scripts/render-idyllic-world.py.
 *
 * The fence and the burrow's stonework are generated from primitives rather
 * than taken from a pack: the reference's fence is a framing device with thick
 * capped posts, and the plank assets read as twigs at foreground scale.
 */

const FENCE_WOOD = new THREE.Color(0.3, 0.165, 0.075);
const DOOR_WOOD = new THREE.Color(0.46, 0.26, 0.11);
const DOOR_PLANK = new THREE.Color(0.36, 0.19, 0.08);
const DOOR_INSIDE = new THREE.Color(0.07, 0.04, 0.03);
const DOOR_FRAME = new THREE.Color(0.42, 0.36, 0.3);
const DOOR_KNOB = new THREE.Color(0.9, 0.68, 0.22);
const MOSS_TINT = new THREE.Color(0.4, 0.62, 0.2);

/** Fence runs, each a polyline plus a post height. */
const FENCE_RUNS: { points: THREE.Vector2[]; height: number }[] = [
  // Near runs sit just inside the frame edge: close enough to frame the view,
  // far enough not to loom over it.
  { points: [v(-6.8, 1.5), v(-5.0, 1.1), v(-3.4, 0.9)], height: 1.15 },
  { points: [v(2.2, 1.3), v(3.8, 0.7), v(5.2, -0.2)], height: 1.15 },
  // A run climbing the right side, closing the meadow behind the path.
  { points: [v(7.4, -2.6), v(8.0, -5.4), v(8.2, -8.4)], height: 1.25 },
  // A short run beside the burrow steps.
  { points: [v(-9.0, -1.6), v(-7.4, -1.1), v(-6.0, -0.9)], height: 1.1 },
];

function v(x: number, z: number) {
  return new THREE.Vector2(x, z);
}

export function createStructures(
  library: IdyllicLibrary,
  terrain: Terrain,
  scatter: InstancedScatter,
  rng: Rng,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'structures';

  // Decorative stamps are authored in the layout editor, not planted here.
  const plantDefaultDecor = false;
  if (plantDefaultDecor) {
    group.add(buildGate(library, terrain, rng));
    group.add(buildBurrow(library, terrain, scatter, rng));
    placeBridge(library, terrain, group);
    placeHouses(library, terrain, group);
    placeBenches(library, terrain, group);
    if (!placeFenceRuns(library, terrain, scatter)) {
      group.add(buildFences(terrain));
    }
    placeSteppingStones(library, terrain, scatter, rng);
    placePondRim(library, terrain, scatter, rng);
    placeMossyStones(library, terrain, scatter, rng);
  }

  return group;
}

/** Scales a loaded model to a target height and drops it at a ground point. */
function placeModel(
  library: IdyllicLibrary,
  parent: THREE.Group,
  name: string,
  x: number,
  z: number,
  y: number,
  height: number,
  yaw: number,
) {
  if (!library.has(name)) return;
  const model = library.get(name);
  const scale = height / Math.max(model.size.y, 1e-4);
  for (const primitive of model.primitives) {
    const mesh = new THREE.Mesh(primitive.geometry, primitive.material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw;
    mesh.scale.setScalar(scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = name;
    parent.add(mesh);
  }
}

function placeBridge(library: IdyllicLibrary, terrain: Terrain, group: THREE.Group) {
  placeModel(
    library,
    group,
    'bridge',
    BRIDGE.center.x,
    BRIDGE.center.z,
    terrain.heightAt(BRIDGE.center.x, BRIDGE.center.z) + 0.02,
    BRIDGE.height,
    BRIDGE.yaw,
  );
}

function placeBenches(library: IdyllicLibrary, terrain: Terrain, group: THREE.Group) {
  for (const bench of BENCHES) {
    placeModel(
      library,
      group,
      'rustic-bench',
      bench.position.x,
      bench.position.y,
      terrain.heightAt(bench.position.x, bench.position.y),
      bench.height,
      bench.yaw,
    );
  }
}

function placeHouses(library: IdyllicLibrary, terrain: Terrain, group: THREE.Group) {
  for (const house of HOUSES) {
    placeModel(
      library,
      group,
      house.model,
      house.position.x,
      house.position.y,
      terrain.heightAt(house.position.x, house.position.y),
      house.height,
      house.yaw,
    );
  }
}

/**
 * Meshy fence panels along the authored runs. The model is a single bay
 * (wide on X, thin on Z); yaw lines that bay up with the polyline. Primitive
 * posts stay as the fallback if the GLB did not load.
 */
function placeFenceRuns(
  library: IdyllicLibrary,
  terrain: Terrain,
  scatter: InstancedScatter,
): boolean {
  if (!library.has('wooden-fence')) return false;
  const model = library.get('wooden-fence');
  const nativeHeight = Math.max(model.size.y, 1e-4);
  const nativeLength = Math.max(model.size.x, 1e-4);

  for (const run of FENCE_RUNS) {
    let total = 0;
    for (let i = 0; i < run.points.length - 1; i++) {
      total += run.points[i].distanceTo(run.points[i + 1]);
    }
    if (total < 0.4) continue;

    // One bay is two posts. Space by the model's own length so rails never
    // sit inside the next posts. Centre the chain on the run; short runs get
    // a single bay instead of one-per-polyline-edge (that was the overlap).
    const bay = nativeLength * (run.height / nativeHeight);
    const count = Math.max(1, Math.round(total / bay));
    const start = (total - (count - 1) * bay) / 2;

    for (let k = 0; k < count; k++) {
      const at = alongPolyline(run.points, start + k * bay);
      scatter.place('wooden-fence', {
        position: new THREE.Vector3(at.x, terrain.heightAt(at.x, at.z) - 0.03, at.z),
        height: run.height,
        rotationY: Math.atan2(-at.dz, at.dx),
      });
    }
  }
  return true;
}

/** Point and tangent at `distance` metres along a ground polyline. */
function alongPolyline(
  points: THREE.Vector2[],
  distance: number,
): { x: number; z: number; dx: number; dz: number } {
  let remaining = Math.max(0, distance);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dz = b.y - a.y;
    const length = Math.hypot(dx, dz) || 1e-6;
    if (remaining <= length || i === points.length - 2) {
      const t = THREE.MathUtils.clamp(remaining / length, 0, 1);
      return { x: a.x + dx * t, z: a.y + dz * t, dx, dz };
    }
    remaining -= length;
  }
  const last = points[points.length - 1];
  const prev = points[points.length - 2] ?? last;
  return { x: last.x, z: last.y, dx: last.x - prev.x, dz: last.y - prev.y };
}

/**
 * A handful of mossy boulders — pond far bank, path edge, burrow — so the
 * lawn has the chunky stones from the reference without ringing the water.
 */
function placeMossyStones(
  library: IdyllicLibrary,
  terrain: Terrain,
  scatter: InstancedScatter,
  rng: Rng,
) {
  if (!library.has('mosslit-stones')) return;

  const spots: [number, number, number][] = [
    [-6.4, -7.2, 0.62],
    [-1.8, -8.6, 0.52],
    [1.2, -6.8, 0.48],
    [-8.8, -2.4, 0.55],
    [4.6, 1.8, 0.5],
    [6.4, -3.2, 0.58],
    [-3.2, 1.4, 0.46],
    [8.6, -9.4, 0.54],
    [-11.2, -5.6, 0.5],
    [2.8, -12.4, 0.48],
  ];

  for (const [x, z, height] of spots) {
    if (inPond(x, z, 0.7) || nearPath(x, z, 1.05)) continue;
    scatter.place('mosslit-stones', {
      position: new THREE.Vector3(x, terrain.heightAt(x, z), z),
      height,
      fit: 'width',
      sink: 0.35,
      rotationY: range(rng, 0, Math.PI * 2),
    });
  }
}

/** Flat slabs marking where the side path leaves the main path. */
function placeSteppingStones(
  library: IdyllicLibrary,
  terrain: Terrain,
  scatter: InstancedScatter,
  rng: Rng,
) {
  const stones = library.variants('stone_medium_');
  if (stones.length === 0) return;
  const point = new THREE.Vector2();

  for (let i = 0; i < 7; i++) {
    pathMain(0.12 + i * 0.12, point);
    const x = point.x + range(rng, -0.35, 0.35);
    const z = point.y;
    scatter.place(stones[i % stones.length], {
      position: new THREE.Vector3(x, terrain.heightAt(x, z), z),
      height: 0.55,
      fit: 'width',
      sink: 0.55,
      rotationY: range(rng, 0, Math.PI * 2),
    });
  }
}

/**
 * Chunky stone rim: boulders half-buried around the bank, kept low so they
 * frame the water instead of hiding it.
 */
function placePondRim(
  library: IdyllicLibrary,
  terrain: Terrain,
  scatter: InstancedScatter,
  rng: Rng,
) {
  const big = library.variants('rock_big_');
  const medium = library.variants('rock_medium_');
  const small = library.variants('rock_small_');

  PONDS.forEach((pond, pondIndex) => {
  const count = pondIndex === 0 ? 34 : 16;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const x = pond.center.x + Math.cos(angle) * (pond.radiusX + 0.1);
    const z = pond.center.y + Math.sin(angle) * (pond.radiusZ + 0.1);
    if (nearPath(x, z, 1.1, pathSide, 20) || nearPath(x, z, 1.0, creek, 24)) continue;

    let pool = small;
    let height = range(rng, 0.16, 0.28);
    let sink = 0.04;
    // The big boulders are squat and much wider than they are tall, so they are
    // fitted across instead of up. Fitting them by height gave a three-metre
    // rock beside a seven-metre pond, which swallowed the water.
    let fit: 'height' | 'width' = 'height';
    if (i % 11 === 0) {
      pool = big;
      height = range(rng, 1.1, 1.5);
      sink = 0.22;
      fit = 'width';
    } else if (i % 2 === 0) {
      pool = medium;
      height = range(rng, 0.42, 0.62);
      sink = 0.12;
    }
    if (pool.length === 0) continue;

    scatter.place(pool[i % pool.length], {
      position: new THREE.Vector3(x, terrain.heightAt(x, z) - sink, z),
      height,
      fit,
      sink: 0.4,
      rotationY: range(rng, 0, Math.PI * 2),
    });
  }
  });

  placeCreekBanks(library, terrain, scatter, rng);
}

/**
 * Pebbles and tufts down both banks of the creek. A stream is read from its
 * banks: without them the water is just a coloured strip laid on the lawn.
 */
function placeCreekBanks(
  library: IdyllicLibrary,
  terrain: Terrain,
  scatter: InstancedScatter,
  rng: Rng,
) {
  const pebbles = [...library.variants('rock_small_'), ...library.variants('stone_medium_')];
  if (pebbles.length === 0) return;

  const here = new THREE.Vector2();
  const ahead = new THREE.Vector2();
  const steps = 26;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    creek(t, here);
    creek(Math.min(t + 0.02, 1), ahead);

    const tx = ahead.x - here.x;
    const tz = ahead.y - here.y;
    const length = Math.hypot(tx, tz) || 1;

    for (const side of [-1, 1]) {
      const offset = range(rng, 1.05, 1.55) * side;
      const x = here.x + (-tz / length) * offset;
      const z = here.y + (tx / length) * offset;
      if (inPond(x, z, 0.3)) continue;

      scatter.place(pebbles[(i * 2 + (side > 0 ? 1 : 0)) % pebbles.length], {
        position: new THREE.Vector3(x, terrain.heightAt(x, z), z),
        height: range(rng, 0.22, 0.42),
        fit: 'width',
        sink: 0.5,
        rotationY: range(rng, 0, Math.PI * 2),
      });
    }
  }
}

/**
 * A round hobbit door that actually reads as a door: dark hole, wood disc with
 * planks, stone ring, and a knob. The previous pair of fat cylinders plus a
 * box sill collapsed into one tan blob from the playable camera.
 */
function buildBurrowDoor(
  x: number,
  y: number,
  z: number,
  yaw: number,
  dir: THREE.Vector2,
  radius: number,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'burrow-door';

  const place = (mesh: THREE.Mesh, along: number, lift = 0, side = 0) => {
    const tangentX = dir.y;
    const tangentZ = -dir.x;
    mesh.position.set(
      x + dir.x * along + tangentX * side,
      y + lift,
      z + dir.y * along + tangentZ * side,
    );
    mesh.rotation.order = 'YXZ';
    mesh.rotation.y = yaw;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  const face = (mesh: THREE.Mesh) => {
    mesh.rotation.x = Math.PI / 2;
  };

  const hole = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.92, radius * 0.92, 0.22, 32),
    createToyMaterial({ color: DOOR_INSIDE, roughness: 1, translucent: false }),
  );
  face(hole);
  place(hole, -0.12);

  const frame = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.1, 10, 28),
    createToyMaterial({ color: DOOR_FRAME, roughness: 0.88, translucent: false }),
  );
  place(frame, 0.02);

  const leaf = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.82, radius * 0.82, 0.08, 32),
    createToyMaterial({ color: DOOR_WOOD, roughness: 0.82, translucent: false }),
  );
  face(leaf);
  place(leaf, 0.07);

  const plankMat = createToyMaterial({ color: DOOR_PLANK, roughness: 0.86, translucent: false });
  for (let i = -2; i <= 2; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.07, radius * 1.35, 0.03), plankMat);
    place(plank, 0.12, 0, i * 0.22);
  }

  const brace = new THREE.Mesh(
    new THREE.BoxGeometry(radius * 1.45, 0.08, 0.04),
    createToyMaterial({ color: DOOR_PLANK, roughness: 0.86, translucent: false }),
  );
  place(brace, 0.13);

  const knob = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 12, 10),
    createToyMaterial({ color: DOOR_KNOB, roughness: 0.35, translucent: false }),
  );
  place(knob, 0.18, -0.04, 0.28);

  const sill = new THREE.Mesh(
    new THREE.BoxGeometry(radius * 1.35, 0.1, 0.28),
    createToyMaterial({ color: DOOR_FRAME, roughness: 0.9, translucent: false }),
  );
  place(sill, 0.06, -radius * 0.88);

  return group;
}

/**
 * Hobbit burrow: a mossy mound with an arched door set into the slope facing
 * the camera, a stone surround, and slabs stepping down toward the pond.
 */
function buildBurrow(
  library: IdyllicLibrary,
  terrain: Terrain,
  scatter: InstancedScatter,
  rng: Rng,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'burrow';

  const mossMap = library.groundTexture('moss_albedo', 6);
  const moss = createToyMaterial({
    color: MOSS_TINT,
    roughness: 0.92,
    map: mossMap ?? null,
    translucent: false,
  });

  const base = terrain.heightAt(BURROW.position.x, BURROW.position.y);
  const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 18), moss);
  mound.scale.copy(BURROW.moundScale);
  mound.position.set(BURROW.position.x, base + 0.55, BURROW.position.y);
  mound.castShadow = true;
  mound.receiveShadow = true;
  mound.name = 'burrow-mound';
  group.add(mound);

  const dir = BURROW.doorDirection;
  // Sit the door on the ellipsoid surface, then a little further out, so the
  // moss does not swallow it. The previous offsets landed inside the mound.
  const surface =
    1 / Math.hypot(dir.x / BURROW.moundScale.x, dir.y / BURROW.moundScale.z);
  const outset = surface + 0.28;
  const doorX = BURROW.position.x + dir.x * outset;
  const doorZ = BURROW.position.y + dir.y * outset;
  const radius = 0.82;
  const doorY = base + 0.55 - 0.15;
  const yaw = Math.atan2(dir.x, dir.y);
  group.add(buildBurrowDoor(doorX, doorY, doorZ, yaw, dir, radius));

  // Stones on the ground around the doorway — not hung in the air around the
  // disc, which is how they used to read as floating rocks.
  const chunks = library.variants('stone_medium_');
  const tangent = new THREE.Vector2(dir.y, -dir.x);
  if (chunks.length > 0) {
    for (let k = 0; k < 6; k++) {
      const side = k % 2 === 0 ? -1 : 1;
      const along = 0.4 + (k >> 1) * 0.45;
      const x = doorX + tangent.x * side * (0.85 + (k % 3) * 0.15) + dir.x * along * 0.2;
      const z = doorZ + tangent.y * side * (0.85 + (k % 3) * 0.15) + dir.y * along * 0.2;
      scatter.place(chunks[k % chunks.length], {
        position: new THREE.Vector3(x, terrain.heightAt(x, z), z),
        height: 0.38,
        fit: 'width',
        sink: 0.45,
        rotationY: range(rng, 0, Math.PI * 2),
      });
    }
  }

  const slabs = library.variants('stone_big_');
  if (slabs.length > 0) {
    for (let i = 0; i < 5; i++) {
      const f = 1.0 + i * 0.85;
      const x = doorX + dir.x * f;
      const z = doorZ + dir.y * f;
      scatter.place(slabs[0], {
        position: new THREE.Vector3(x, terrain.heightAt(x, z), z),
        height: 0.7,
        fit: 'width',
        sink: 0.6,
        rotationY: range(rng, 0, Math.PI * 2),
      });
    }
  }

  return group;
}

/** Stone arch over the path, buttressed by two boulders. */
function buildGate(library: IdyllicLibrary, terrain: Terrain, rng: Rng): THREE.Group {
  const group = new THREE.Group();
  group.name = 'gate';

  const base = terrain.heightAt(GATE.position.x, GATE.position.y);
  const arch = new THREE.Mesh(
    // A torus lies in the XY plane, which is already upright for a camera on
    // +Z, so only the yaw has to be applied.
    withWhiteVertexColors(new THREE.TorusGeometry(1.95, 0.26, 16, 48)),
    library.material('idy_rock_rock_big_01'),
  );
  arch.position.set(GATE.position.x, base + 1.35, GATE.position.y);
  arch.rotation.y = GATE.yaw;
  arch.castShadow = true;
  arch.receiveShadow = true;
  group.add(arch);

  const boulders = library.variants('rock_big_');
  if (boulders.length > 0) {
    for (const side of [-1, 1]) {
      const x = GATE.position.x + side * 2.0;
      const z = GATE.position.y + side * 0.25;
      const model = library.get(boulders[1 % boulders.length]);
      const scale = 0.75 / Math.max(model.size.y, 1e-4);
      for (const primitive of model.primitives) {
        const mesh = new THREE.Mesh(primitive.geometry, primitive.material);
        mesh.position.set(x, terrain.heightAt(x, z) - model.size.y * scale * 0.4, z);
        mesh.rotation.y = range(rng, 0, Math.PI * 2);
        mesh.scale.setScalar(scale);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      }
    }
  }

  return group;
}

/**
 * Chunky rounded-post fence, merged into one instanced mesh per part so four
 * runs cost three draw calls.
 */
function buildFences(terrain: Terrain): THREE.Group {
  const group = new THREE.Group();
  group.name = 'fences';

  const wood = createToyMaterial({ color: FENCE_WOOD, roughness: 0.75, translucent: false });

  type Post = { x: number; z: number; height: number };
  type Rail = { from: Post; to: Post; y: number };
  const posts: Post[] = [];
  const rails: Rail[] = [];

  for (const run of FENCE_RUNS) {
    const dense: Post[] = [];
    for (let i = 0; i < run.points.length - 1; i++) {
      const a = run.points[i];
      const b = run.points[i + 1];
      const span = a.distanceTo(b);
      const steps = Math.max(1, Math.round(span / 1.5));
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        dense.push({
          x: a.x + (b.x - a.x) * t,
          z: a.y + (b.y - a.y) * t,
          height: run.height,
        });
      }
    }
    dense.push({ x: run.points.at(-1)!.x, z: run.points.at(-1)!.y, height: run.height });

    posts.push(...dense);
    for (let i = 0; i < dense.length - 1; i++) {
      rails.push({ from: dense[i], to: dense[i + 1], y: run.height * 0.68 });
      rails.push({ from: dense[i], to: dense[i + 1], y: run.height * 0.38 });
    }
  }

  const postRadius = 0.115;
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();

  const shafts = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(postRadius, postRadius, 1, 16),
    wood,
    posts.length,
  );
  const caps = new THREE.InstancedMesh(
    new THREE.SphereGeometry(postRadius * 1.08, 16, 8),
    wood,
    posts.length,
  );

  posts.forEach((post, index) => {
    const ground = terrain.heightAt(post.x, post.z);
    matrix.compose(
      new THREE.Vector3(post.x, ground + post.height / 2, post.z),
      new THREE.Quaternion(),
      new THREE.Vector3(1, post.height, 1),
    );
    shafts.setMatrixAt(index, matrix);
    matrix.compose(
      new THREE.Vector3(post.x, ground + post.height, post.z),
      new THREE.Quaternion(),
      new THREE.Vector3(1, 0.6, 1),
    );
    caps.setMatrixAt(index, matrix);
  });

  const beams = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.085, 0.085, 1, 12),
    wood,
    rails.length,
  );
  rails.forEach((rail, index) => {
    const fromY = terrain.heightAt(rail.from.x, rail.from.z) + rail.y;
    const toY = terrain.heightAt(rail.to.x, rail.to.z) + rail.y;
    const dx = rail.to.x - rail.from.x;
    const dz = rail.to.z - rail.from.z;
    const length = Math.hypot(dx, dz, toY - fromY);
    // A cylinder points along +Y; lay it down, then swing it onto the run.
    euler.set(Math.PI / 2, Math.atan2(dx, dz), 0, 'YXZ');
    quaternion.setFromEuler(euler);
    matrix.compose(
      new THREE.Vector3(
        (rail.from.x + rail.to.x) / 2,
        (fromY + toY) / 2,
        (rail.from.z + rail.to.z) / 2,
      ),
      quaternion,
      new THREE.Vector3(1, length, 1),
    );
    beams.setMatrixAt(index, matrix);
  });

  for (const mesh of [shafts, caps, beams]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return group;
}
