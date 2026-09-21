import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from '../../assetUrl';
import { PLAZA_CRYSTAL } from '../plaza/plazaApi';
import type { PlazaMound } from '../plaza/plazaDig';

const SPAN = 1.55;

function spinOf(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 0xffffffff) * Math.PI * 2;
}

function prepareCrystal(scene: THREE.Object3D): THREE.Group {
  const root = new THREE.Group();
  root.add(scene);
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.z, 0.01);
  scene.scale.setScalar(SPAN / span);
  scene.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(root);
  scene.position.y -= fitted.min.y;
  scene.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.castShadow = false;
      node.receiveShadow = false;
    }
  });
  return root;
}

function fallbackCrystal(): THREE.Group {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.72, 0),
    new THREE.MeshStandardMaterial({
      color: 0x7ad7ff,
      roughness: 0.28,
      metalness: 0.42,
      transparent: true,
      opacity: 0.92,
    }),
  );
  mesh.position.y = 0.72;
  root.add(mesh);
  return root;
}

function plant(
  proto: THREE.Object3D,
  id: string,
  x: number,
  z: number,
  y: number,
): THREE.Object3D {
  const bump = proto.clone(true);
  bump.position.set(x, y, z);
  bump.rotation.y = spinOf(id);
  bump.scale.setScalar(0.92 + (spinOf(`${id}-s`) / (Math.PI * 2)) * 0.14);
  bump.name = `crystal:${id}`;
  return bump;
}

function disposeObject(child: THREE.Object3D, shared: boolean) {
  if (shared) return;
  child.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry.dispose();
    const material = node.material;
    if (Array.isArray(material)) material.forEach((item) => item.dispose());
    else material.dispose();
  });
}

/** Five personal crystals on a family lawn. Prizes stay on the server (D-030). */
export class CrystalField {
  readonly group = new THREE.Group();
  private proto: THREE.Object3D | null = null;
  private shared = false;
  private failed = false;
  private mounds: PlazaMound[] = [];
  private paintKey = '';
  private heightAt: (x: number, z: number) => number;
  private loader = new GLTFLoader();
  private dead = false;

  constructor(heightAt: (x: number, z: number) => number) {
    this.heightAt = heightAt;
    this.group.name = 'garden-crystals';
    this.loader.load(
      assetUrl(PLAZA_CRYSTAL),
      (gltf) => {
        if (this.dead) {
          disposeObject(gltf.scene, false);
          return;
        }
        this.proto = prepareCrystal(gltf.scene);
        this.shared = true;
        this.paintKey = '';
        this.paint();
      },
      undefined,
      () => {
        if (this.dead) return;
        this.failed = true;
        this.proto = fallbackCrystal();
        this.shared = false;
        this.paintKey = '';
        this.paint();
      },
    );
  }

  setMounds(mounds: readonly PlazaMound[]) {
    this.mounds = mounds.slice();
    this.paint();
  }

  dispose() {
    this.dead = true;
    this.clear(true);
    if (this.proto) disposeObject(this.proto, false);
    this.proto = null;
    this.group.removeFromParent();
  }

  private paint() {
    if (!this.proto && !this.failed) return;
    const proto = this.proto ?? fallbackCrystal();
    if (!this.proto) this.proto = proto;
    const key = this.mounds.map((item) => item.id).join(',');
    if (key === this.paintKey) return;
    this.clear(this.shared);
    this.paintKey = key;
    for (const item of this.mounds) {
      const y = this.heightAt(item.x, item.z);
      this.group.add(plant(proto, item.id, item.x, item.z, Number.isFinite(y) ? y : 0));
    }
  }

  private clear(shared: boolean) {
    while (this.group.children.length) {
      const child = this.group.children[0];
      this.group.remove(child);
      disposeObject(child, shared);
    }
  }
}
