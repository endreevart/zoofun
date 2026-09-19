import * as THREE from 'three';
import { airSpawnChance, joyFromHearts } from './joy';

type Speck = {
  mesh: THREE.Mesh;
  kind: 'fly' | 'heart' | 'wing';
  age: number;
  life: number;
  spin: number;
};

const FLY = new THREE.Color(1, 0.92, 0.45);
const HEART = new THREE.Color(1, 0.35, 0.48);
const WING = new THREE.Color(0.85, 0.72, 1);

/** Sparse fireflies, butterflies, hearts. More joy = more often, not a blizzard. */
export class JoyAir {
  readonly group = new THREE.Group();
  private specks: Speck[] = [];
  private hearts = 0;
  private clock = 0;
  private geo = new THREE.SphereGeometry(0.08, 6, 6);

  constructor() {
    this.group.name = 'joy-air';
  }

  setHearts(hearts: number) {
    this.hearts = Math.max(0, hearts);
  }

  update(dt: number) {
    this.clock += dt;
    const chance = airSpawnChance(this.hearts);
    if (this.hearts > 0 && this.specks.length < 22 && Math.random() < chance) {
      this.spawn();
    }
    for (let i = this.specks.length - 1; i >= 0; i -= 1) {
      const speck = this.specks[i];
      speck.age += dt;
      speck.mesh.position.y += dt * (speck.kind === 'heart' ? 0.85 : 0.45);
      speck.mesh.position.x += Math.sin(this.clock * speck.spin) * dt * 0.35;
      speck.mesh.position.z += Math.cos(this.clock * speck.spin * 0.7) * dt * 0.25;
      const fade = 1 - speck.age / speck.life;
      const mat = speck.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, fade);
      speck.mesh.scale.setScalar(speck.kind === 'heart' ? 1.15 : 0.7 + fade * 0.4);
      if (speck.age >= speck.life) {
        this.group.remove(speck.mesh);
        mat.dispose();
        this.specks.splice(i, 1);
      }
    }
  }

  dispose() {
    for (const speck of this.specks) {
      this.group.remove(speck.mesh);
      (speck.mesh.material as THREE.Material).dispose();
    }
    this.specks = [];
    this.geo.dispose();
  }

  private spawn() {
    const roll = Math.random();
    const kind: Speck['kind'] = roll < 0.45 ? 'fly' : roll < 0.75 ? 'wing' : 'heart';
    const color = kind === 'fly' ? FLY : kind === 'heart' ? HEART : WING;
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.geo, mat);
    const lift = 0.6 + joyFromHearts(this.hearts) * 1.4;
    mesh.position.set((Math.random() - 0.5) * 22, lift + Math.random() * 2.4, (Math.random() - 0.5) * 22);
    this.group.add(mesh);
    this.specks.push({
      mesh,
      kind,
      age: 0,
      life: 3.2 + Math.random() * 2.4,
      spin: 0.6 + Math.random() * 1.4,
    });
  }
}
