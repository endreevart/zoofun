import * as THREE from 'three';
import type { IdyllicLibrary } from '../../assets/IdyllicLibrary';
import type { InstancedScatter } from '../../assets/InstancedScatter';
import type { Terrain } from '../Terrain';
import type { Rng } from '../../core/rng';
import { range } from '../../core/rng';
import {
  BURROW,
  FOREGROUND_Z,
  HOUSE,
  POND,
  PONDS,
  TREE_CLUSTERS,
  blocked,
  creek,
  inPond,
  nearHouse,
  nearPath,
  pathMain,
  pathSide,
} from '../layout';

/**
 * Four tiers of planting: canopy trees, bushes, broad-leaf plants and a ground
 * layer of flowers and grass.
 *
 * Everything here is deliberately sparse and clumped. An earlier pass filled
 * every gap so that no bare lawn showed anywhere, which buried the pond, the
 * bridge and the gate in undergrowth and left the creatures nowhere to walk.
 * Open lawn is the subject now, not a defect: planting gathers into a few
 * clumps that frame the landmarks and edge the paths, and the middle stays
 * clear.
 */

type Pools = {
  broadleaf: string[];
  broadleafWarm: string[];
  broadleafRed: string[];
  green: string[];
  bloom: string[];
  pebbles: string[];
};

/**
 * Trees and bushes are Trees Package Lite: solid chunky silhouettes. The
 * Idyllic flower/meadow/plant cards are cut-out planes — they flash their
 * quad edges and sort badly, which is the messy cluster the child just saw.
 * Pebbles stay Idyllic; they are opaque rocks.
 */
function treePools(library: IdyllicLibrary) {
  return {
    broadleaf: library.variants('lp_tree_0'),
    broadleafWarm: library.variants('lp_tree_warm_'),
    broadleafRed: [
      ...library.variants('lp_tree_blossom_'),
      ...library.variants('lp_tree_autumn_'),
    ],
    green: library.variants('lp_bush_0'),
    bloom: library.variants('lp_bush_bloom_'),
  };
}

export function createVegetation(
  library: IdyllicLibrary,
  terrain: Terrain,
  scatter: InstancedScatter,
  rng: Rng,
): void {
  const pools: Pools = {
    ...treePools(library),
    pebbles: library.variants('rock_small_'),
  };

  const drop = (name: string, x: number, z: number, options: {
    height: number;
    lift?: number;
    wide?: number;
    tilt?: number;
    fit?: 'height' | 'width';
    sink?: number;
  }) => {
    scatter.place(name, {
      position: new THREE.Vector3(x, terrain.heightAt(x, z) + (options.lift ?? 0), z),
      height: options.height,
      rotationY: range(rng, 0, Math.PI * 2),
      tiltX: options.tilt,
      stretch: options.wide ? new THREE.Vector3(options.wide, 1, options.wide) : undefined,
      fit: options.fit,
      sink: options.sink,
    });
  };

  const treeBases = plantTrees(library, pools, rng, drop);
  plantBushes(library, pools, treeBases, rng, drop);
  plantMushrooms(library, treeBases, rng, drop);
  plantBlooms(library, treeBases, rng, drop);
  plantBeds(library, pools, rng, drop);
  plantBurrowRoof(pools, terrain, rng, scatter);
  plantForeground(library, pools, rng, drop);
}

type Drop = (
  name: string,
  x: number,
  z: number,
  options: {
    height: number;
    lift?: number;
    wide?: number;
    tilt?: number;
    fit?: 'height' | 'width';
    sink?: number;
  },
) => void;

/** Tier 1: canopy trees, fattened sideways so they read as rounded masses. */
function plantTrees(library: IdyllicLibrary, pools: Pools, rng: Rng, drop: Drop): [number, number][] {
  if (library.has('sunlit-canopy')) {
    // The park itself is these painted trees. One or two per clump, offset
    // so the canopies sit side by side instead of occupying the same trunk.
    for (const [cx, cz] of TREE_CLUSTERS) {
      const x = cx + range(rng, -0.3, 0.3);
      const z = cz + range(rng, -0.4, 0.4);
      if (blocked(x, z, 0.4)) continue;
      drop('sunlit-canopy', x, z, {
        height: range(rng, 4.8, 6.6),
        tilt: THREE.MathUtils.degToRad(range(rng, -4, 4)),
      });
    }
    return TREE_CLUSTERS;
  }

  if (pools.broadleaf.length === 0) return [];

  let index = 0;
  for (const [cx, cz] of TREE_CLUSTERS) {
    const count = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < count; i++) {
      const x = cx + range(rng, -1.8, 1.8);
      const z = cz + range(rng, -1.6, 1.6);
      if (blocked(x, z, 0.6)) continue;

      let pool = pools.broadleaf;
      if (index % 11 === 5 && pools.broadleafRed.length) pool = pools.broadleafRed;
      else if (index % 3 === 1 && pools.broadleafWarm.length) pool = pools.broadleafWarm;

      drop(pool[index % pool.length], x, z, {
        height: range(rng, 3.8, 5.2),
        wide: range(rng, 1.0, 1.18),
        tilt: THREE.MathUtils.degToRad(range(rng, -2, 2)),
      });
      index++;
    }
  }
  return TREE_CLUSTERS;
}

/**
 * Little red mushrooms under the park trees. Each tree gets at most a trio,
 * and the clumps stay a couple of metres apart so they never merge into a bed.
 */
function plantMushrooms(
  library: IdyllicLibrary,
  treeBases: [number, number][],
  rng: Rng,
  drop: Drop,
) {
  if (!library.has('red-mushroom')) return;

  const spots: [number, number][] = [...treeBases, [HOUSE.position.x, HOUSE.position.y]];

  for (const [cx, cz] of spots) {
    const clumps = rng() < 0.35 ? 2 : 1;
    for (let c = 0; c < clumps; c++) {
      const count = 1 + Math.floor(rng() * 3);
      const heading = rng() * Math.PI * 2;
      for (let i = 0; i < count; i++) {
        const a = heading + (i - (count - 1) / 2) * 0.7 + range(rng, -0.15, 0.15);
        const r = range(rng, 0.75, 1.7) + c * 0.55;
        const x = cx + Math.cos(a) * r;
        const z = cz + Math.sin(a) * r;
        if (blocked(x, z, 0.35) || inPond(x, z, 0.4) || nearPath(x, z, 1.1)) continue;
        drop('red-mushroom', x, z, {
          height: range(rng, 0.12, 0.46),
          wide: range(rng, 0.85, 1.25),
          tilt: THREE.MathUtils.degToRad(range(rng, -8, 8)),
        });
      }
    }
  }
}

/** Tier 2: bushes, in a few clumps that frame the landmarks. */
function plantBushes(
  library: IdyllicLibrary,
  pools: Pools,
  treeBases: [number, number][],
  rng: Rng,
  drop: Drop,
) {
  const shrub = library.has('verdant-glow') ? 'verdant-glow' : '';
  if (!shrub && pools.green.length === 0) return;

  /** A handful of domes around one spot, so they read as one soft mass. */
  const clump = (
    cx: number,
    cz: number,
    count: number,
    spread: number,
    lo: number,
    hi: number,
  ) => {
    for (let i = 0; i < count; i++) {
      const a = range(rng, 0, Math.PI * 2);
      const r = Math.sqrt(rng()) * spread;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      if (inPond(x, z, 0.6) || nearPath(x, z, 1.6) || nearPath(x, z, 1.2, pathSide, 20)) continue;
      const name = shrub || (i % 4 === 1 && pools.bloom.length ? pools.bloom[i % pools.bloom.length] : pools.green[i % pools.green.length]);
      if (!name) continue;
      drop(name, x, z, {
        height: shrub ? range(rng, Math.max(lo, 0.7), Math.max(hi, 1.35)) : range(rng, lo, hi),
        wide: shrub ? range(rng, 0.9, 1.15) : range(rng, 1.1, 1.4),
      });
    }
  };

  // Far bank only. Bushes on the near bank would hide the water.
  for (const pond of PONDS) {
    const count = pond === POND ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const a = 0.35 + ((Math.PI - 0.7) * i) / Math.max(count - 1, 1);
      clump(
        pond.center.x + Math.cos(a) * (pond.radiusX + range(rng, 1.0, 1.7)),
        pond.center.y - Math.sin(a) * (pond.radiusZ + range(rng, 1.0, 1.7)),
        2,
        0.7,
        0.5,
        0.9,
      );
    }
  }

  // Cushion the burrow on the sides and back — never on the door face.
  for (let i = 0; i < 3; i++) {
    const a = Math.PI * 1.05 + (i / 3) * Math.PI * 1.1;
    clump(
      BURROW.position.x + Math.cos(a) * range(rng, 2.6, 3.4),
      BURROW.position.y + Math.sin(a) * range(rng, 2.4, 3.0),
      2,
      0.8,
      0.5,
      0.95,
    );
  }

  // One clump per tree cluster, so no bare trunk stands on bare lawn.
  treeBases.forEach(([cx, cz]) => {
    const a = range(rng, 0, Math.PI * 2);
    clump(
      cx + Math.cos(a) * range(rng, 1.6, 2.6),
      cz + Math.sin(a) * range(rng, 1.5, 2.4),
      2,
      0.9,
      0.5,
      1.0,
    );
  });
}

/**
 * Big painted flower clumps from the reference: path edges, pond far bank,
 * a few tree skirts. Sparse on purpose — a carpet of them would hide the lawn.
 */
function plantBlooms(
  library: IdyllicLibrary,
  treeBases: [number, number][],
  rng: Rng,
  drop: Drop,
) {
  if (!library.has('garden-blooms')) return;

  const bloom = (x: number, z: number, height: number) => {
    if (inPond(x, z, 0.55) || nearPath(x, z, 1.2) || nearHouse(x, z, 4.5)) return;
    drop('garden-blooms', x, z, {
      height,
      wide: range(rng, 0.88, 1.12),
    });
  };

  const point = new THREE.Vector2();
  for (let i = 0; i < 6; i++) {
    pathMain(i / 5, point);
    const side = i % 2 === 0 ? 1 : -1;
    bloom(
      point.x + side * range(rng, 1.85, 2.6),
      point.y + range(rng, -0.35, 0.35),
      range(rng, 0.62, 0.95),
    );
  }

  for (const pond of PONDS) {
    const count = pond === POND ? 4 : 2;
    for (let i = 0; i < count; i++) {
      const a = 0.35 + ((Math.PI - 0.7) * i) / Math.max(count - 1, 1);
      bloom(
        pond.center.x + Math.cos(a) * (pond.radiusX + range(rng, 1.15, 1.85)),
        pond.center.y - Math.sin(a) * (pond.radiusZ + range(rng, 1.05, 1.7)),
        range(rng, 0.55, 0.85),
      );
    }
  }

  treeBases.forEach(([cx, cz], k) => {
    if (k % 2 === 1) return;
    const a = range(rng, 0, Math.PI * 2);
    bloom(
      cx + Math.cos(a) * range(rng, 1.7, 2.5),
      cz + Math.sin(a) * range(rng, 1.5, 2.3),
      range(rng, 0.5, 0.78),
    );
  });
}

/**
 * Small low-poly bushes along the path and the pond rim — the same role the
 * flower cards used to play, without the transparent quads.
 */
function plantBeds(library: IdyllicLibrary, pools: Pools, rng: Rng, drop: Drop) {
  const shrub = library.has('verdant-glow') ? 'verdant-glow' : '';
  const bushes = shrub ? [shrub] : [...pools.bloom, ...pools.green];
  if (bushes.length === 0) return;
  const point = new THREE.Vector2();

  const bed = (cx: number, cz: number, count: number, spread: number) => {
    for (let i = 0; i < count; i++) {
      const a = range(rng, 0, Math.PI * 2);
      const r = Math.sqrt(rng()) * spread;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      if (inPond(x, z, 0.5) || nearPath(x, z, 1.2) || nearPath(x, z, 1.0, pathSide, 20)) continue;
      if (nearHouse(x, z, 4.5)) continue;
      drop(bushes[(count + i) % bushes.length], x, z, {
        height: range(rng, 0.4, 0.7),
        wide: range(rng, 1.05, 1.25),
      });
    }
  };

  for (let i = 0; i < 5; i++) {
    pathMain(i / 4, point);
    const side = i % 2 === 0 ? 1 : -1;
    bed(point.x + side * range(rng, 1.7, 2.5), point.y + range(rng, -0.4, 0.4), 2, 0.55);
  }

  for (const pond of PONDS) {
    const count = pond === POND ? 4 : 3;
    for (let i = 0; i < count; i++) {
      const a = 0.4 + ((Math.PI - 0.8) * i) / Math.max(count - 1, 1);
      bed(
        pond.center.x + Math.cos(a) * (pond.radiusX + range(rng, 0.9, 1.5)),
        pond.center.y - Math.sin(a) * (pond.radiusZ + range(rng, 0.9, 1.4)),
        2,
        0.5,
      );
    }
  }

  for (let i = 0; i < 16 && pools.pebbles.length > 0; i++) {
    pathMain(rng(), point);
    const x = point.x + (rng() < 0.5 ? -1 : 1) * range(rng, 1.1, 2.0);
    const z = point.y + range(rng, -0.9, 0.9);
    if (inPond(x, z, 0.2) || nearPath(x, z, 1.0)) continue;
    drop(pools.pebbles[i % pools.pebbles.length], x, z, {
      height: range(rng, 0.22, 0.38),
      fit: 'width',
      sink: 0.5,
    });
  }
}

/** Plant the mound so it reads as living turf rather than a mossy egg. */
function plantBurrowRoof(
  pools: Pools,
  terrain: Terrain,
  rng: Rng,
  scatter: InstancedScatter,
) {
  const base = terrain.heightAt(BURROW.position.x, BURROW.position.y);

  for (let i = 0; i < 10; i++) {
    const a = range(rng, 0, Math.PI * 2);
    const r = rng() * 0.86;
    const x = BURROW.position.x + Math.cos(a) * r * BURROW.moundScale.x;
    const z = BURROW.position.y + Math.sin(a) * r * BURROW.moundScale.z;
    const facing =
      (x - BURROW.position.x) * BURROW.doorDirection.x +
      (z - BURROW.position.y) * BURROW.doorDirection.y;
    if (facing > 0.6) continue;
    // Ride the surface of the ellipsoid instead of the lawn under it.
    const y = base + 0.55 + Math.sqrt(Math.max(0, 1 - r * r)) * BURROW.moundScale.y - 0.12;

    const pool = i % 3 === 0 && pools.bloom.length ? pools.bloom : pools.green;
    if (pool.length === 0) continue;

    scatter.place(pool[i % pool.length], {
      position: new THREE.Vector3(x, y, z),
      height: range(rng, 0.28, 0.48),
      rotationY: range(rng, 0, Math.PI * 2),
    });
  }
}

/**
 * A thin foreground frame of low-poly bushes and boulders. The old flower
 * cards sat here too, and a 24 mm lens turned every quad edge into a slab.
 */
function plantForeground(library: IdyllicLibrary, pools: Pools, rng: Rng, drop: Drop) {
  const boulders = library.variants('rock_medium_');
  const shrub = library.has('verdant-glow') ? 'verdant-glow' : '';
  const bushes = shrub ? [shrub] : [...pools.bloom, ...pools.green];

  for (let i = 0; i < 12; i++) {
    const x = range(rng, -5.5, 3.5);
    const z = range(rng, FOREGROUND_Z.far, FOREGROUND_Z.near);
    if (
      nearPath(x, z, 1.9) ||
      nearPath(x, z, 1.3, pathSide, 20) ||
      nearPath(x, z, 1.1, creek, 24) ||
      inPond(x, z, 0.6)
    ) {
      continue;
    }

    const cap = x < -1.4 ? 0.55 : 1.0;
    if (i % 5 === 0 && library.has('garden-blooms')) {
      drop('garden-blooms', x, z, {
        height: range(rng, 0.55, 0.85) * cap,
        wide: range(rng, 0.9, 1.12),
      });
    } else if (i % 4 === 3 && boulders.length) {
      drop(boulders[i % boulders.length], x, z, {
        height: range(rng, 0.45, 0.7) * cap,
        fit: 'width',
        sink: 0.5,
      });
    } else if (bushes.length) {
      drop(bushes[i % bushes.length], x, z, {
        height: range(rng, shrub ? 0.65 : 0.45, shrub ? 1.05 : 0.75) * cap,
        wide: range(rng, shrub ? 0.9 : 1.05, shrub ? 1.15 : 1.3),
      });
    }
  }
}
