import * as THREE from 'three';
import type { Terrain } from './Terrain';
import type { AuthoredSpawn } from './layoutSpawns';

const LIFT = 0.08;

/**
 * Editor-only rings marking where a new egg may appear. Hidden during play:
 * a child should find an egg in the garden, not the grid it came from.
 */
export class SpawnLayer {
  readonly group = new THREE.Group();

  private terrain: Terrain;
  private material: THREE.MeshBasicMaterial;
  private selectedMaterial: THREE.MeshBasicMaterial;
  private selectedId: string | null = null;

  constructor(terrain: Terrain) {
    this.group.name = 'spawn-zones';
    this.group.visible = false;
    this.terrain = terrain;
    this.material = makeRingMaterial(0x6ec6ff, 0.7);
    this.selectedMaterial = makeRingMaterial(0xffdd55, 0.95);
  }

  rebuild(spawns: readonly AuthoredSpawn[]) {
    while (this.group.children.length) {
      const child = this.group.children[0];
      this.group.remove(child);
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    }

    for (const zone of spawns) {
      const geometry = spawnRingGeometry(zone, (x, z) => this.terrain.heightAt(x, z) + LIFT);
      const mesh = new THREE.Mesh(
        geometry,
        zone.id === this.selectedId ? this.selectedMaterial : this.material,
      );
      mesh.name = zone.id;
      mesh.userData.spawnId = zone.id;
      mesh.renderOrder = 22;
      this.group.add(mesh);
    }
  }

  setSelected(id: string | null) {
    this.selectedId = id;
    for (const child of this.group.children) {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) continue;
      mesh.material = mesh.userData.spawnId === id ? this.selectedMaterial : this.material;
    }
  }

  setVisible(on: boolean) {
    this.group.visible = on;
  }

  dispose() {
    this.rebuild([]);
    this.material.dispose();
    this.selectedMaterial.dispose();
  }
}

function makeRingMaterial(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    // The editor needs to see a zone behind a bush it was drawn around.
    depthTest: false,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
  });
}

/**
 * An annulus draped over the island so a wide zone on a slope still reads as a
 * ring on the ground rather than a disc hovering through the hill.
 */
export function spawnRingGeometry(
  zone: AuthoredSpawn,
  heightAt: (x: number, z: number) => number,
  segments = 72,
): THREE.BufferGeometry {
  const band = Math.max(0.09, zone.radius * 0.05);
  const inner = Math.max(0.02, zone.radius - band);
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (const radius of [inner, zone.radius]) {
      const x = zone.x + cos * radius;
      const z = zone.z + sin * radius;
      positions.push(x, heightAt(x, z), z);
    }
    if (i < segments) {
      const k = i * 2;
      indices.push(k, k + 1, k + 3, k, k + 3, k + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
