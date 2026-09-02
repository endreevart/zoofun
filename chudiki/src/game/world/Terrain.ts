import * as THREE from 'three';
import { Noise2D } from '../core/noise';
import type { IdyllicLibrary } from '../assets/IdyllicLibrary';
import { createToyMaterial } from '../core/geometry';
import {
  BURROW,
  CREEK_POINTS,
  GROUND,
  ISLAND,
  PONDS,
  islandEdgeRadius,
  splineAt,
} from './layout';

/**
 * The island lawn: a gentle ripple, a mound under the burrow, a dish under the
 * pond, a creek cut, and a steep rock cliff that drops into the ocean.
 */

const SEGMENTS = 200;

const GRASS_SHADE = new THREE.Color(0.145, 0.400, 0.155);
const GRASS_LIGHT = new THREE.Color(0.430, 0.760, 0.300);
const ROCK = new THREE.Color(0.74, 0.58, 0.38);
const ROCK_DARK = new THREE.Color(0.48, 0.34, 0.22);
const MOSS = new THREE.Color(0.28, 0.50, 0.18);

const CREEK_DEPTH = 0.34;
const CREEK_HALF_WIDTH = 1.65;

const CREEK_SAMPLES: THREE.Vector2[] = Array.from({ length: 40 }, (_, i) =>
  splineAt(CREEK_POINTS, i / 39, new THREE.Vector2()),
);

type IslandSurface = {
  minX: number;
  minZ: number;
  step: number;
  cols: number;
  rows: number;
  heights: Float32Array;
};

export class Terrain {
  readonly mesh: THREE.Mesh;
  readonly group = new THREE.Group();
  private cliff: THREE.Mesh;
  private noise: Noise2D;
  private sculpted = false;
  private islandSurface: IslandSurface | null = null;
  private islandMeshes: THREE.Mesh[] = [];

  constructor(seed: number, grassMap?: THREE.Texture | null, grassNormal?: THREE.Texture | null) {
    this.noise = new Noise2D(seed);
    this.group.name = 'terrain';

    const geometry = new THREE.PlaneGeometry(GROUND.size, GROUND.size, SEGMENTS, SEGMENTS);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(GROUND.centerX, 0, GROUND.centerZ);

    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const colors = new Float32Array(position.count * 3);
    const mixed = new THREE.Color();

    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const y = this.heightAt(x, z);
      position.setY(i, y);

      const r = Math.hypot(x - ISLAND.centerX, z - ISLAND.centerZ);
      const edge = islandEdgeRadius(x, z);
      const cliffT = THREE.MathUtils.clamp((r - (edge - ISLAND.cliff)) / ISLAND.cliff, 0, 1);

      const patch = THREE.MathUtils.clamp(this.noise.fbm(x * 0.24, z * 0.24, 3) * 0.5 + 0.5, 0, 1);
      mixed.copy(GRASS_SHADE).lerp(GRASS_LIGHT, THREE.MathUtils.smoothstep(patch, 0.3, 0.72));
      if (cliffT > 0.08) {
        const rock = ROCK.clone().lerp(ROCK_DARK, this.noise.fbm(x * 0.7, z * 0.7, 2) * 0.5 + 0.5);
        const face = rock.lerp(MOSS, THREE.MathUtils.clamp(1 - cliffT * 1.4, 0, 0.45));
        mixed.lerp(face, THREE.MathUtils.smoothstep(cliffT, 0.08, 0.42));
      }
      colors[i * 3 + 0] = mixed.r;
      colors[i * 3 + 1] = mixed.g;
      colors[i * 3 + 2] = mixed.b;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    position.needsUpdate = true;
    geometry.computeVertexNormals();

    const material = createToyMaterial({
      vertexColors: true,
      roughness: 0.92,
      map: grassMap ?? null,
      normalMap: grassNormal ?? null,
      normalScale: 0.5,
      translucent: false,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.name = 'island-lawn';
    this.cliff = this.buildCliffWall();
    this.group.add(this.mesh);
    this.group.add(this.cliff);
  }

  /**
   * The Meshy floating platform is the visible island. The procedural lawn and
   * cliff stay in memory for height queries but are hidden so they do not
   * fight the sculpted mesh.
   */
  adoptFloatingIsland(library: IdyllicLibrary): boolean {
    if (!library.has('floating-island')) return false;
    const model = library.get('floating-island');
    const width = Math.max(model.size.x, model.size.z);
    const scale = (ISLAND.radius * 2.04) / width;
    const top = 0.04;
    const y = top - model.size.y * scale;
    const placed: THREE.Mesh[] = [];

    for (const primitive of model.primitives) {
      const material = (primitive.material as THREE.MeshStandardMaterial).clone();
      material.side = THREE.FrontSide;
      material.shadowSide = THREE.FrontSide;
      const mesh = new THREE.Mesh(primitive.geometry, material);
      mesh.position.set(ISLAND.centerX, y, ISLAND.centerZ);
      mesh.scale.setScalar(scale);
      // Receive tree and creature shadows, but never cast: a 80 m grassy
      // platform shadowing itself produces acne — the dark shards on the lawn.
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.name = 'floating-island';
      this.group.add(mesh);
      placed.push(mesh);
    }

    this.sculpted = true;
    this.islandMeshes = placed;
    this.mesh.visible = false;
    this.cliff.visible = false;
    this.bakeIslandSurface(placed);
    return true;
  }

  /** True once the Meshy platform replaced the procedural lawn. */
  get usesFloatingIsland(): boolean {
    return this.sculpted;
  }

  /** Height of the lawn at a world position. Single source of truth. */
  heightAt(x: number, z: number): number {
    const sampled = this.sampleIslandSurface(x, z);
    if (sampled !== null) return sampled;

    if (this.sculpted) {
      const r = Math.hypot(x - ISLAND.centerX, z - ISLAND.centerZ);
      return r >= islandEdgeRadius(x, z) ? ISLAND.bed : 0.04;
    }

    let y = 0.06 * Math.sin(x * 0.55) * Math.cos(z * 0.42);

    const burrowDx = x - BURROW.position.x;
    const burrowDz = z - BURROW.position.y;
    y += 1.1 * Math.exp(-(burrowDx * burrowDx + burrowDz * burrowDz) / 18);

    for (const pond of PONDS) {
      const pondDx = x - pond.center.x;
      const pondDz = z - pond.center.y;
      y -= 0.42 * Math.exp(
        -(
          (pondDx * pondDx) / (pond.radiusX * pond.radiusX * 1.3) +
          (pondDz * pondDz) / (pond.radiusZ * pond.radiusZ * 1.3)
        ),
      );
    }

    y -= this.creekCut(x, z);

    const r = Math.hypot(x - ISLAND.centerX, z - ISLAND.centerZ);
    const edge = islandEdgeRadius(x, z);
    const inner = edge - ISLAND.cliff;
    if (r <= inner) return y;
    if (r >= edge) return ISLAND.bed;
    const t = (r - inner) / ISLAND.cliff;
    const s = t * t * t * (t * (t * 6 - 15) + 10);
    return THREE.MathUtils.lerp(y, ISLAND.bed, s);
  }

  /**
   * Rasterize the Meshy platform's top vertices so props sit on the grass we
   * see, not on the hidden procedural lawn. The GLB's bounding-box roof is
   * higher than the walkable turf (tufts, rim rocks), which left a hover gap.
   */
  private bakeIslandSurface(meshes: THREE.Mesh[]) {
    const pad = ISLAND.radius * 1.2;
    const step = 0.45;
    const minX = ISLAND.centerX - pad;
    const minZ = ISLAND.centerZ - pad;
    const cols = Math.ceil((pad * 2) / step) + 1;
    const rows = cols;
    const heights = new Float32Array(cols * rows).fill(Number.NaN);
    const world = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const minGrassY = ISLAND.oceanY + 0.4;

    for (const mesh of meshes) {
      mesh.updateMatrixWorld(true);
      const position = mesh.geometry.getAttribute('position');
      const normals = mesh.geometry.getAttribute('normal');
      for (let i = 0; i < position.count; i++) {
        world.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
        if (world.y < minGrassY) continue;
        if (normals) {
          normal.fromBufferAttribute(normals, i).transformDirection(mesh.matrixWorld);
          if (normal.y < 0.2) continue;
        }
        const col = Math.round((world.x - minX) / step);
        const row = Math.round((world.z - minZ) / step);
        if (col < 0 || row < 0 || col >= cols || row >= rows) continue;
        const index = row * cols + col;
        if (!Number.isFinite(heights[index]) || world.y > heights[index]) {
          heights[index] = world.y;
        }
      }
    }

    this.fillSurfaceHoles(heights, cols, rows);
    this.islandSurface = { minX, minZ, step, cols, rows, heights };
  }

  private fillSurfaceHoles(heights: Float32Array, cols: number, rows: number) {
    const next = new Float32Array(heights.length);
    for (let pass = 0; pass < 8; pass++) {
      next.set(heights);
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const index = row * cols + col;
          if (Number.isFinite(heights[index])) continue;
          let sum = 0;
          let count = 0;
          if (col > 0 && Number.isFinite(heights[index - 1])) {
            sum += heights[index - 1];
            count++;
          }
          if (col + 1 < cols && Number.isFinite(heights[index + 1])) {
            sum += heights[index + 1];
            count++;
          }
          if (row > 0 && Number.isFinite(heights[index - cols])) {
            sum += heights[index - cols];
            count++;
          }
          if (row + 1 < rows && Number.isFinite(heights[index + cols])) {
            sum += heights[index + cols];
            count++;
          }
          if (count >= 2) next[index] = sum / count;
        }
      }
      heights.set(next);
    }
  }

  private sampleIslandSurface(x: number, z: number): number | null {
    const surface = this.islandSurface;
    if (!surface) return null;
    const u = (x - surface.minX) / surface.step;
    const v = (z - surface.minZ) / surface.step;
    if (u < 0 || v < 0 || u > surface.cols - 1 || v > surface.rows - 1) return null;

    const col = Math.floor(u);
    const row = Math.floor(v);
    const tx = u - col;
    const tz = v - row;
    const h00 = this.surfaceHeight(surface, col, row);
    const h10 = this.surfaceHeight(surface, col + 1, row);
    const h01 = this.surfaceHeight(surface, col, row + 1);
    const h11 = this.surfaceHeight(surface, col + 1, row + 1);
    if (h00 === null && h10 === null && h01 === null && h11 === null) return null;

    const top = this.mixHeight(h00, h10, tx);
    const bottom = this.mixHeight(h01, h11, tx);
    const mixed = this.mixHeight(top, bottom, tz);
    if (mixed === null || mixed < ISLAND.oceanY + 0.3) return null;
    return mixed - 0.02;
  }

  /** Where a click hits the visible island grass. */
  pickSurface(raycaster: THREE.Raycaster): THREE.Vector3 | null {
    if (this.islandMeshes.length === 0) return null;
    const hits = raycaster.intersectObjects(this.islandMeshes, false);
    for (const hit of hits) {
      if (hit.normal && hit.normal.y < 0.12) continue;
      if (hit.point.y < ISLAND.oceanY + 0.3) continue;
      return hit.point.clone();
    }
    return null;
  }

  private surfaceHeight(surface: IslandSurface, col: number, row: number): number | null {
    if (col < 0 || row < 0 || col >= surface.cols || row >= surface.rows) return null;
    const value = surface.heights[row * surface.cols + col];
    return Number.isFinite(value) ? value : null;
  }

  private mixHeight(a: number | null, b: number | null, t: number): number | null {
    if (a === null) return b;
    if (b === null) return a;
    return a * (1 - t) + b * t;
  }

  private buildCliffWall(): THREE.Mesh {
    const segments = 96;
    const rings = 5;
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    for (let ring = 0; ring <= rings; ring++) {
      const v = ring / rings;
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        const dirx = Math.cos(a);
        const dirz = Math.sin(a);
        const probeX = ISLAND.centerX + dirx * ISLAND.radius;
        const probeZ = ISLAND.centerZ + dirz * ISLAND.radius;
        const edge = islandEdgeRadius(probeX, probeZ);
        const lip = edge - 0.2;
        const bulge = 0.45 * Math.sin(v * Math.PI);
        const radius = THREE.MathUtils.lerp(lip, edge + 0.55, v) + bulge;
        const topY = this.heightAt(ISLAND.centerX + dirx * (edge - ISLAND.cliff), ISLAND.centerZ + dirz * (edge - ISLAND.cliff));
        const y = THREE.MathUtils.lerp(topY, ISLAND.bed, v * v * (3 - 2 * v));
        positions.push(ISLAND.centerX + dirx * radius, y, ISLAND.centerZ + dirz * radius);

        const mossMix = (1 - v) * (0.35 + 0.25 * Math.sin(a * 4));
        const color = ROCK.clone().lerp(ROCK_DARK, v * 0.55).lerp(MOSS, THREE.MathUtils.clamp(mossMix, 0, 0.55));
        colors.push(color.r, color.g, color.b);
      }
    }

    const stride = segments + 1;
    for (let ring = 0; ring < rings; ring++) {
      for (let i = 0; i < segments; i++) {
        const a = ring * stride + i;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = createToyMaterial({
      vertexColors: true,
      roughness: 0.94,
      translucent: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'island-cliff';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  creekCut(x: number, z: number): number {
    let nearest = Infinity;
    for (const point of CREEK_SAMPLES) {
      const dx = point.x - x;
      const dz = point.y - z;
      const d = dx * dx + dz * dz;
      if (d < nearest) nearest = d;
    }
    const distance = Math.sqrt(nearest);
    if (distance > CREEK_HALF_WIDTH * 2.4) return 0;
    const t = THREE.MathUtils.clamp(distance / (CREEK_HALF_WIDTH * 2.4), 0, 1);
    return CREEK_DEPTH * (1 - t * t) * (1 - t * t);
  }

  slopeAt(x: number, z: number): number {
    const e = 0.6;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return Math.sqrt(dx * dx + dz * dz) / (2 * e);
  }

  dispose() {
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    });
  }
}
