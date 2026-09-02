import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { assetUrl } from '../../assetUrl';
import type { IdyllicLibrary } from '../assets/IdyllicLibrary';
import { InstancedScatter } from '../assets/InstancedScatter';
import { injectWorldCurve } from '../render/worldCurve';
import { mulberry32 } from '../core/rng';
import type { Terrain } from './Terrain';
import { GATE, ISLAND, inPond, onIsland } from './layout';
import { nearestPathId, type AuthoredPath } from './layoutPaths';

const grassTime = { value: 0 };

/**
 * Lawn undergrowth. SMM Stylized Grass is a Unity VFX graph — we keep its
 * blade card and scatter painted tufts in Three, plus the Idyllic grass clumps
 * when those models are loaded.
 */
export class GrassField {
  readonly group = new THREE.Group();

  private terrain: Terrain;
  private library: IdyllicLibrary;
  private blades: THREE.Group | null = null;
  private painted: THREE.Group | null = null;

  constructor(terrain: Terrain, library: IdyllicLibrary) {
    this.group.name = 'grass-field';
    this.terrain = terrain;
    this.library = library;
  }

  rebuild(paths: readonly AuthoredPath[]) {
    this.clear();
    const spots = plantSpots(this.terrain, paths);
    this.blades = scatterBlades(spots);
    this.group.add(this.blades);
    if (this.library.has('grass_a') || this.library.has('grass_b')) {
      this.painted = scatterPainted(this.library, spots);
      this.group.add(this.painted);
    }
  }

  update(elapsed: number) {
    grassTime.value = elapsed;
  }

  dispose() {
    this.clear();
  }

  private clear() {
    if (this.blades) {
      let geometry: THREE.BufferGeometry | null = null;
      let material: THREE.Material | null = null;
      this.blades.traverse((object) => {
        const mesh = object as THREE.InstancedMesh;
        if (!mesh.isInstancedMesh) return;
        geometry = mesh.geometry;
        material = mesh.material as THREE.Material;
      });
      this.blades.removeFromParent();
      geometry?.dispose();
      material?.dispose();
      this.blades = null;
    }
    if (this.painted) {
      this.painted.removeFromParent();
      this.painted = null;
    }
  }
}

type Spot = { x: number; z: number; y: number; yaw: number; scale: number; tint: THREE.Color };

function plantSpots(terrain: Terrain, paths: readonly AuthoredPath[]): Spot[] {
  const rng = mulberry32(20260902);
  const spots: Spot[] = [];
  const step = 0.48;
  const minX = ISLAND.centerX - ISLAND.radius;
  const minZ = ISLAND.centerZ - ISLAND.radius;
  const cols = Math.ceil((ISLAND.radius * 2) / step);

  for (let row = 0; row < cols; row++) {
    for (let col = 0; col < cols; col++) {
      const x = minX + (col + 0.5) * step + (rng() - 0.5) * step * 0.85;
      const z = minZ + (row + 0.5) * step + (rng() - 0.5) * step * 0.85;
      if (!onIsland(x, z, 1.8)) continue;
      if (inPond(x, z, 1.0)) continue;
      if (Math.hypot(x - GATE.position.x, z - GATE.position.y) < 2.6) continue;
      if (nearestPathId(paths, x, z, 0.38)) continue;
      const y = terrain.heightAt(x, z);
      if (y < ISLAND.oceanY + 0.45) continue;
      const warm = 0.8 + rng() * 0.28;
      spots.push({
        x,
        z,
        y,
        yaw: rng() * Math.PI * 2,
        scale: 0.52 + rng() * 0.28,
        tint: new THREE.Color(0.5 * warm, 0.8, 0.28 / warm),
      });
    }
  }
  return spots;
}

function scatterBlades(spots: Spot[]): THREE.Group {
  const geometry = bladeClump();
  const map = new THREE.TextureLoader().load(assetUrl('textures/ground/smm-grass-blade.png'));
  map.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshStandardMaterial({
    map,
    color: 0xc8e85a,
    roughness: 0.9,
    metalness: 0,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    depthWrite: true,
  });
  material.onBeforeCompile = (shader) => {
    injectWorldCurve(shader);
    shader.uniforms.uGrassTime = grassTime;
    shader.vertexShader = `uniform float uGrassTime;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      /* glsl */ `
#include <begin_vertex>
      {
        float h = max(transformed.y, 0.0);
        float sway = sin(uGrassTime * 1.8 + transformed.x * 4.2 + transformed.z * 2.4) * h * 0.1;
        transformed.x += sway;
        transformed.z += sway * 0.35;
      }
`,
    );
  };
  material.customProgramCacheKey = () => 'smm-grass-blade';

  // One InstancedMesh for the whole island cannot frustum-cull, so the GPU
  // drew every blade even when looking at the gate. 12 m tiles drop the
  // opening view from ~20k clumps to a handful.
  const TILE = 12;
  const buckets = new Map<string, Spot[]>();
  for (const spot of spots) {
    const key = `${Math.floor(spot.x / TILE)}:${Math.floor(spot.z / TILE)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(spot);
    else buckets.set(key, [spot]);
  }

  const group = new THREE.Group();
  group.name = 'smm-grass';
  for (const [key, bucket] of buckets) {
    group.add(fillBladeTile(geometry, material, bucket, key));
  }
  return group;
}

function fillBladeTile(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  spots: Spot[],
  key: string,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, spots.length);
  mesh.name = `smm-grass:${key}`;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  const matrix = new THREE.Matrix4();
  const colors = new Float32Array(spots.length * 3);
  spots.forEach((spot, index) => {
    matrix.compose(
      new THREE.Vector3(spot.x, spot.y - 0.02, spot.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spot.yaw),
      new THREE.Vector3(spot.scale, spot.scale, spot.scale),
    );
    mesh.setMatrixAt(index, matrix);
    colors[index * 3] = spot.tint.r;
    colors[index * 3 + 1] = spot.tint.g;
    colors[index * 3 + 2] = spot.tint.b;
  });
  mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

function bladeClump(): THREE.BufferGeometry {
  const blades: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const card = new THREE.PlaneGeometry(0.18, 0.36, 1, 2);
    card.translate(0, 0.18, 0);
    const yaw = (i / 7) * Math.PI + (i % 2) * 0.12;
    const lean = 0.08 + (i % 3) * 0.04;
    card.rotateY(yaw);
    card.rotateX((i % 2 === 0 ? 1 : -1) * lean);
    card.translate((i - 4.5) * 0.045, 0, ((i * 3) % 8) * 0.035 - 0.12);
    blades.push(card);
  }
  const merged = mergeGeometries(blades, false);
  for (const blade of blades) blade.dispose();
  if (!merged) throw new Error('grass clump merge failed');
  return merged;
}

function scatterPainted(library: IdyllicLibrary, spots: Spot[]): THREE.Group {
  const scatter = new InstancedScatter(library);
  const every = 5;
  for (let i = 0; i < spots.length; i += every) {
    const spot = spots[i];
    const model = i % (every * 2) === 0 && library.has('grass_b') ? 'grass_b' : 'grass_a';
    if (!library.has(model)) continue;
    scatter.place(model, {
      position: new THREE.Vector3(spot.x, spot.y, spot.z),
      height: 0.28 + (i % 5) * 0.05,
      rotationY: spot.yaw,
    });
  }
  return scatter.build({ name: 'idyllic-grass', castShadow: false, receiveShadow: true });
}
