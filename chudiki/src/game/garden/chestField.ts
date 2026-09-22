import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from '../../assetUrl';
import { GARDEN_CHEST } from '../plaza/plazaApi';
import type { PlazaMound } from '../plaza/plazaDig';
import {
  CHEST_GLOW_OUTER,
  CHEST_GLOW_RADIUS,
  chestGlowDisc,
  chestGlowMap,
  chestGlowOuterDisc,
  chestLamp,
} from './chestGlow';

const SPAN = 2.6;

function prepareChest(scene: THREE.Object3D): THREE.Group {
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
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  return root;
}

function fallbackChest(): THREE.Group {
  const root = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({
    color: 0xb06a2a,
    roughness: 0.62,
    metalness: 0.12,
  });
  const gold = new THREE.MeshStandardMaterial({
    color: 0xe8c35a,
    roughness: 0.35,
    metalness: 0.45,
  });
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.05, 1.15), wood);
  box.position.y = 0.52;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.28, 1.2), wood);
  lid.position.y = 1.14;
  const band = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.12, 1.22), gold);
  band.position.y = 0.92;
  root.add(box, lid, band);
  return root;
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

/** One daily treasure chest on the family lawn (D-036). */
export class ChestField {
  readonly group = new THREE.Group();
  private proto: THREE.Object3D | null = null;
  private shared = false;
  private failed = false;
  private chest: PlazaMound | null = null;
  private paintKey = '';
  private heightAt: (x: number, z: number) => number;
  private loader = new GLTFLoader();
  private dead = false;
  private groundY = 0;
  private glowMap = chestGlowMap();
  private glow = chestGlowDisc(this.glowMap);
  private glowOuter = chestGlowOuterDisc(this.glowMap);
  private lamp = chestLamp();

  constructor(heightAt: (x: number, z: number) => number) {
    this.heightAt = heightAt;
    this.group.name = 'garden-chest';
    this.loader.load(
      assetUrl(GARDEN_CHEST),
      (gltf) => {
        if (this.dead) {
          disposeObject(gltf.scene, false);
          return;
        }
        this.proto = prepareChest(gltf.scene);
        this.shared = true;
        this.paintKey = '';
        this.paint();
      },
      undefined,
      () => {
        if (this.dead) return;
        this.failed = true;
        this.proto = fallbackChest();
        this.shared = false;
        this.paintKey = '';
        this.paint();
      },
    );
  }

  setChest(chest: PlazaMound | null) {
    this.chest = chest;
    this.paint();
  }

  update(elapsed: number) {
    const pulse = 0.5 + 0.5 * Math.sin(elapsed * 2.05);
    for (const child of this.group.children) {
      if (child.name.startsWith('chest:')) {
        child.position.y = this.groundY + Math.sin(elapsed * 1.6) * 0.08;
        child.rotation.y = Math.sin(elapsed * 0.55) * 0.12;
      } else if (child === this.glow) {
        const span = CHEST_GLOW_RADIUS * (0.88 + pulse * 0.28);
        child.scale.set(span, 1, span);
        (this.glow.material as THREE.MeshBasicMaterial).opacity = 0.92 + pulse * 0.08;
      } else if (child === this.glowOuter) {
        const span = CHEST_GLOW_OUTER * (0.86 + pulse * 0.3);
        child.scale.set(span, 1, span);
        (this.glowOuter.material as THREE.MeshBasicMaterial).opacity = 0.7 + pulse * 0.3;
      } else if (child === this.lamp) {
        this.lamp.intensity = 5.4 + pulse * 2.4;
      }
    }
  }

  dispose() {
    this.dead = true;
    this.clear(true);
    if (this.proto) disposeObject(this.proto, false);
    this.proto = null;
    this.glow.geometry.dispose();
    (this.glow.material as THREE.MeshBasicMaterial).dispose();
    this.glowOuter.geometry.dispose();
    (this.glowOuter.material as THREE.MeshBasicMaterial).dispose();
    this.glowMap.dispose();
    this.group.removeFromParent();
  }

  private paint() {
    if (!this.proto && !this.failed) return;
    const proto = this.proto ?? fallbackChest();
    if (!this.proto) this.proto = proto;
    const key = this.chest ? this.chest.id : '';
    if (key === this.paintKey) return;
    this.clear(this.shared);
    this.paintKey = key;
    if (!this.chest) return;
    const y = this.heightAt(this.chest.x, this.chest.z);
    this.groundY = Number.isFinite(y) ? y : 0;
    const bump = proto.clone(true);
    bump.position.set(this.chest.x, this.groundY, this.chest.z);
    bump.name = `chest:${this.chest.id}`;
    this.glow.position.set(this.chest.x, this.groundY + 0.08, this.chest.z);
    this.glowOuter.position.set(this.chest.x, this.groundY + 0.06, this.chest.z);
    this.lamp.position.set(this.chest.x, this.groundY + 1.05, this.chest.z);
    this.group.add(this.glowOuter, this.glow, this.lamp, bump);
  }

  private clear(shared: boolean) {
    while (this.group.children.length) {
      const child = this.group.children[0];
      this.group.remove(child);
      if (child === this.glow || child === this.glowOuter || child === this.lamp) {
        continue;
      }
      disposeObject(child, shared);
    }
  }
}
