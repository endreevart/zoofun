import * as THREE from 'three';
import { assetUrl } from '../../assetUrl';
import { createToyMaterial } from '../core/geometry';
import type { Terrain } from './Terrain';
import { hashPathSeed, type AuthoredPath } from './layoutPaths';

const LIFT = 0.045;

/**
 * Painted dirt ribbons the adult draws in the layout editor. Each stroke is a
 * Catmull-Rom strip draped on the island surface, textured like the sandy
 * cartoon path — not the old procedural brown slivers.
 */
export class PathLayer {
  readonly group = new THREE.Group();

  private terrain: Terrain;
  private material: THREE.MeshStandardMaterial;
  private selectedMaterial: THREE.MeshStandardMaterial;
  private previewMaterial: THREE.MeshStandardMaterial;
  private preview: THREE.Mesh | null = null;
  private selectedId: string | null = null;

  constructor(terrain: Terrain) {
    this.group.name = 'authored-paths';
    this.terrain = terrain;
    this.material = makePathMaterial(1);
    this.selectedMaterial = makePathMaterial(1);
    this.selectedMaterial.emissive.set(0x3a2208);
    this.selectedMaterial.emissiveIntensity = 0.08;
    this.previewMaterial = makePathMaterial(0.72);
    this.previewMaterial.depthWrite = false;
  }

  rebuild(paths: readonly AuthoredPath[]) {
    const keep = this.preview;
    while (this.group.children.length) {
      const child = this.group.children[0];
      this.group.remove(child);
      if (child !== keep && child instanceof THREE.Mesh) child.geometry.dispose();
    }
    if (keep) this.group.add(keep);

    for (const path of paths) {
      const geometry = pathRibbonGeometry(
        path.points,
        path.width * 0.5,
        (x, z) => this.terrain.heightAt(x, z) + LIFT,
        hashPathSeed(path.id),
      );
      if (!geometry) continue;
      const mesh = new THREE.Mesh(
        geometry,
        path.id === this.selectedId ? this.selectedMaterial : this.material,
      );
      mesh.name = path.id;
      mesh.userData.pathId = path.id;
      mesh.receiveShadow = false;
      mesh.renderOrder = 2;
      this.group.add(mesh);
    }
  }

  setPreview(points: readonly [number, number][], width: number) {
    const geometry = pathRibbonGeometry(
      points,
      width * 0.5,
      (x, z) => this.terrain.heightAt(x, z) + LIFT + 0.01,
      1,
    );
    if (!geometry) {
      this.clearPreview();
      return;
    }
    if (this.preview) {
      this.preview.geometry.dispose();
      this.preview.geometry = geometry;
      return;
    }
    this.preview = new THREE.Mesh(geometry, this.previewMaterial);
    this.preview.name = 'path-preview';
    this.preview.renderOrder = 3;
    this.group.add(this.preview);
  }

  clearPreview() {
    if (!this.preview) return;
    this.preview.removeFromParent();
    this.preview.geometry.dispose();
    this.preview = null;
  }

  setSelected(id: string | null) {
    this.selectedId = id;
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || mesh === this.preview) return;
      const pathId = mesh.userData.pathId as string | undefined;
      if (!pathId) return;
      mesh.material = pathId === id ? this.selectedMaterial : this.material;
    });
  }

  pick(raycaster: THREE.Raycaster): string | null {
    const hits = raycaster.intersectObject(this.group, true);
    for (const hit of hits) {
      if (hit.object === this.preview) continue;
      const id = hit.object.userData.pathId as string | undefined;
      if (id) return id;
    }
    return null;
  }

  dispose() {
    this.clearPreview();
    this.rebuild([]);
    this.material.dispose();
    this.selectedMaterial.dispose();
    this.previewMaterial.dispose();
    const map = this.material.map;
    map?.dispose();
  }
}

function makePathMaterial(opacity: number): THREE.MeshStandardMaterial {
  const map = new THREE.TextureLoader().load(assetUrl('textures/ground/path-sand.png'));
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  const material = createToyMaterial({
    color: 0xe4c27a,
    map,
    roughness: 0.94,
    transparent: true,
    opacity,
    translucent: false,
    side: THREE.DoubleSide,
  });
  material.depthWrite = opacity >= 1;
  material.alphaTest = 0.04;
  material.polygonOffset = true;
  material.polygonOffsetFactor = -2;
  material.polygonOffsetUnits = -2;
  return material;
}

export function pathRibbonGeometry(
  points: readonly [number, number][],
  halfWidth: number,
  heightAt: (x: number, z: number) => number,
  seed = 1,
): THREE.BufferGeometry | null {
  if (points.length < 2) return null;

  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    'centripetal',
    0.25,
  );
  const length = curve.getLength();
  if (length < 0.2) return null;

  const steps = Math.max(8, Math.round(length / 0.22));
  const samples = curve.getSpacedPoints(steps);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let dist = 0;
  // Island bake includes grass tufts. Sample only the centerline so the two
  // ribbon edges share one height — edge sampling made tents. A hard 10 cm
  // clamp then parked short strokes inside the mesh when the first sample
  // landed in a bake hole.
  let lastY = heightAt(samples[0].x, samples[0].z);
  const maxStep = 0.85;

  for (let i = 0; i <= steps; i++) {
    const here = samples[i];
    const prev = samples[Math.max(0, i - 1)];
    const next = samples[Math.min(steps, i + 1)];
    let tx = next.x - prev.x;
    let tz = next.z - prev.z;
    const segment = Math.hypot(tx, tz);
    if (segment < 1e-5) {
      tx = 0;
      tz = 1;
    } else {
      tx /= segment;
      tz /= segment;
    }
    const nx = -tz;
    const nz = tx;
    const wobble =
      1 + 0.06 * Math.sin(dist * 1.65 + seed * 0.01) + 0.03 * Math.sin(dist * 3.8 + seed * 0.02);
    const w = halfWidth * wobble;

    let y = heightAt(here.x, here.z);
    if (y > lastY + maxStep) y = lastY + maxStep;
    if (y < lastY - maxStep) y = lastY - maxStep;
    lastY = y;

    for (const side of [0, 1] as const) {
      const sign = side === 0 ? 1 : -1;
      const x = here.x + nx * w * sign;
      const z = here.z + nz * w * sign;
      positions.push(x, y, z);
      uvs.push(side, dist * 0.34);
    }

    if (i < steps) {
      const k = i * 2;
      indices.push(k, k + 1, k + 3, k, k + 3, k + 2);
      dist += Math.hypot(samples[i + 1].x - here.x, samples[i + 1].z - here.z);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
