import * as THREE from 'three';
import type { IdyllicLibrary } from '../../assets/IdyllicLibrary';
import { InstancedScatter } from '../../assets/InstancedScatter';
import type { Terrain } from '../Terrain';
import type { Rng } from '../../core/rng';
import { range } from '../../core/rng';
import {
  ISLAND,
  TREELINE,
  distanceOutsidePark,
  inWalkZone,
  nearHouse,
  nearPath,
  onIsland,
  pathSide,
} from '../layout';

/**
 * The forest beyond the zoo. Low-poly Trees Package Lite on purpose: chunky
 * cones and round crowns, cooler tint, so the painted Meshy trees in the park
 * read as the garden and this reads as wild land. Creatures never walk here.
 */

/** Tight grid: low-poly crowns need to overlap a little or the hills look bald. */
const CELL = 3.2;

/** Grid extent, in metres. Wide enough to wrap round behind the camera too. */
const AREA = { minX: -54, maxX: 54, minZ: -60, maxZ: 42 };

export function plantTreeline(
  library: IdyllicLibrary,
  terrain: Terrain,
  scatter: InstancedScatter,
  rng: Rng,
): void {

  const pools: Pools = {
    firs: library.variants('lp_pine_0'),
    firsDeep: library.variants('lp_pine_haze_'),
    willows: library.variants('lp_tree_blossom_'),
    broadleaf: [...library.variants('lp_tree_0'), ...library.variants('lp_tree_deep_')],
  };

  if (pools.firs.length === 0 && pools.broadleaf.length === 0) {
    return;
  }

  let index = 0;
  for (let x = AREA.minX; x <= AREA.maxX; x += CELL) {
    for (let z = AREA.minZ; z <= AREA.maxZ; z += CELL) {
      const px = x + range(rng, -CELL * 0.42, CELL * 0.42);
      const pz = z + range(rng, -CELL * 0.42, CELL * 0.42);

      const out = distanceOutsidePark(px, pz);
      if (out < TREELINE.inner || out > TREELINE.outer) continue;
      if (!onIsland(px, pz, ISLAND.cliff + 1.2)) continue;
      if (nearPath(px, pz, 1.7)) continue;
      if (nearHouse(px, pz, 5.2)) continue;
      if (rng() > density(out)) continue;

      index++;
      const depth = THREE.MathUtils.clamp(out / TREELINE.dense, 0, 1);
      const pool = pickPool(index, depth, pools);
      const name = pool[index % pool.length];
      if (!name) continue;

      scatter.place(name, {
        position: new THREE.Vector3(px, terrain.heightAt(px, pz), pz),
        height: range(rng, 3.8, 5.6) + depth * 0.8,
        rotationY: range(rng, 0, Math.PI * 2),
        tiltX: THREE.MathUtils.degToRad(range(rng, -3, 3)),
        stretch: new THREE.Vector3(range(rng, 1.12, 1.38), 1, range(rng, 1.12, 1.38)),
        tint: wildTint(rng),
      });
    }
  }

  plantUndergrowth(library, terrain, scatter, rng);
}

/**
 * Chance of planting a cell. Densest in the near band, where the wall has to be
 * opaque, then thinning outward.
 */
function density(out: number): number {
  if (out <= TREELINE.dense) {
    const t = (out - TREELINE.inner) / (TREELINE.dense - TREELINE.inner);
    return 0.9 + t * 0.08;
  }
  const t = (out - TREELINE.dense) / (TREELINE.outer - TREELINE.dense);
  return 0.82 * (1 - t * 0.18);
}

type Pools = {
  firs: string[];
  firsDeep: string[];
  willows: string[];
  broadleaf: string[];
};

/**
 * Round deep-green crowns at the park edge, then conifers. The cones silhouette
 * against the sky and their cooler greens are what make the wall read as a
 * different country rather than more of the same garden.
 */
function pickPool(index: number, depth: number, pools: Pools): string[] {
  const conifer = depth > 0.72 ? pools.firsDeep : pools.firs;
  if (depth > 0.34 && conifer.length) return conifer;
  if (depth > 0.34 && pools.firs.length) return pools.firs;
  if (index % 5 === 2 && pools.willows.length) return pools.willows;
  return pools.broadleaf.length ? pools.broadleaf : pools.firs;
}

/** Cooler and a touch duskier — the forest beyond the park. */
function wildTint(rng: Rng): THREE.Color {
  return new THREE.Color(0.58 + rng() * 0.08, 0.74 + rng() * 0.06, 0.92 + rng() * 0.06);
}

/**
 * A skirt of bushes right at the boundary. Without it the treeline stands on
 * open grass and the eye reads the gap under the trunks as a way through.
 */
function plantUndergrowth(
  library: IdyllicLibrary,
  terrain: Terrain,
  scatter: InstancedScatter,
  rng: Rng,
) {
  const bushes = [...library.variants('lp_bush_0'), ...library.variants('lp_bush_bloom_')];
  if (bushes.length === 0) return;

  const bushCell = 4.0;
  let index = 0;
  for (let x = AREA.minX; x <= AREA.maxX; x += bushCell) {
    for (let z = AREA.minZ; z <= AREA.maxZ; z += bushCell) {
      const px = x + range(rng, -bushCell * 0.4, bushCell * 0.4);
      const pz = z + range(rng, -bushCell * 0.4, bushCell * 0.4);
      const out = distanceOutsidePark(px, pz);
      if (out < TREELINE.inner - 0.3 || out > TREELINE.outer + 3) continue;
      if (!onIsland(px, pz, ISLAND.cliff + 0.8)) continue;
      if (nearPath(px, pz, 1.7)) continue;
      if (nearPath(px, pz, 1.4, pathSide, 20)) continue;
      if (inWalkZone(px, pz)) continue;
      if (rng() > 0.72) continue;

      scatter.place(bushes[index++ % bushes.length], {
        position: new THREE.Vector3(px, terrain.heightAt(px, pz) - 0.04, pz),
        height: range(rng, 0.55, 1.2),
        rotationY: range(rng, 0, Math.PI * 2),
        tint: wildTint(rng),
      });
    }
  }
}

