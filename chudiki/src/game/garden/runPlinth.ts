import * as THREE from 'three';
import { RUN_IMG } from '../run/runAssets';
import type { PlazaMound } from '../plaza/plazaDig';
import { crystalUmbra } from './crystalUmbra';

function stone(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xc9b496,
    roughness: 0.84,
    metalness: 0.05,
  });
}

function moss(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x7fad5f,
    roughness: 0.9,
    metalness: 0.02,
  });
}

function buildPlinth(flowerMap: THREE.Texture | null): THREE.Group {
  const root = new THREE.Group();
  root.name = 'run-plinth';
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.86, 0.26, 14), stone());
  base.position.y = 0.13;
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.54, 0.78, 14), stone());
  pillar.position.y = 0.65;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.5, 0.16, 14), moss());
  cap.position.y = 1.12;
  for (const mesh of [base, pillar, cap]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  root.add(base, pillar, cap);
  if (flowerMap) {
    const flower = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: flowerMap,
        transparent: true,
        depthWrite: false,
        fog: true,
      }),
    );
    flower.name = 'run-plinth-flower';
    flower.position.y = 1.72;
    flower.scale.set(1.15, 1.15, 1);
    root.add(flower);
  }
  return root;
}

function disposeObject(child: THREE.Object3D) {
  child.traverse((node) => {
    if (node instanceof THREE.Mesh || node instanceof THREE.Sprite) {
      node.geometry && 'dispose' in node.geometry && node.geometry.dispose();
      const material = node.material;
      if (Array.isArray(material)) material.forEach((item) => item.dispose());
      else material.dispose();
    }
  });
}

/** Stone play-plinth on the free garden (D-037). */
export class RunPlinthField {
  readonly group = new THREE.Group();
  private proto: THREE.Group | null = null;
  private mound: PlazaMound | null = null;
  private paintKey = '';
  private heightAt: (x: number, z: number) => number;
  private dead = false;
  private groundY = 0;
  private umbra = crystalUmbra(null, 1.35);
  private flowerMap: THREE.Texture | null = null;

  constructor(heightAt: (x: number, z: number) => number) {
    this.heightAt = heightAt;
    this.group.name = 'garden-run';
    this.umbra.name = 'run-umbra';
    const loader = new THREE.TextureLoader();
    loader.load(
      RUN_IMG.flower,
      (map) => {
        if (this.dead) {
          map.dispose();
          return;
        }
        map.colorSpace = THREE.SRGBColorSpace;
        this.flowerMap = map;
        this.proto = buildPlinth(map);
        this.paintKey = '';
        this.paint();
      },
      undefined,
      () => {
        if (this.dead) return;
        this.proto = buildPlinth(null);
        this.paintKey = '';
        this.paint();
      },
    );
  }

  setMound(mound: PlazaMound | null) {
    this.mound = mound;
    this.paint();
  }

  update(elapsed: number) {
    const pulse = 0.5 + 0.5 * Math.sin(elapsed * 2.1);
    for (const child of this.group.children) {
      if (child.name.startsWith('run:')) {
        child.position.y = this.groundY;
        const flower = child.getObjectByName('run-plinth-flower');
        if (flower) flower.position.y = 1.62 + pulse * 0.12;
      } else if (child === this.umbra) {
        (this.umbra.material as THREE.MeshBasicMaterial).opacity = 0.28 + pulse * 0.1;
      }
    }
  }

  dispose() {
    this.dead = true;
    this.clear();
    if (this.proto) disposeObject(this.proto);
    this.proto = null;
    this.umbra.geometry.dispose();
    (this.umbra.material as THREE.MeshBasicMaterial).dispose();
    this.flowerMap?.dispose();
    this.group.removeFromParent();
  }

  private paint() {
    if (!this.proto) return;
    const key = this.mound ? this.mound.id : '';
    if (key === this.paintKey) return;
    this.clear();
    this.paintKey = key;
    if (!this.mound) return;
    const y = this.heightAt(this.mound.x, this.mound.z);
    this.groundY = Number.isFinite(y) ? y : 0;
    const bump = this.proto.clone(true);
    bump.position.set(this.mound.x, this.groundY, this.mound.z);
    bump.name = `run:${this.mound.id}`;
    this.umbra.position.set(this.mound.x, this.groundY + 0.04, this.mound.z);
    this.group.add(this.umbra, bump);
  }

  private clear() {
    while (this.group.children.length) {
      const child = this.group.children[0];
      this.group.remove(child);
    }
  }
}
