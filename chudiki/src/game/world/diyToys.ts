import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { API_BASE } from '../../api';
import { resolveModelUrl } from '../drawing/modelUrl';
import { displayStillUrl } from '../drawing/portrait';
import { isPlazaToyModel, isPlazaToyPreparing } from '../plaza/plazaToy';
import { compactPlazaToyGlb, seatPlazaToyGlb } from '../plaza/plazaToyFit';
import type { AuthoredProp } from './layoutAuthored';

const GROUP = 'diy-toys';

/** Still then GLB layer for personal drawing-toys on a DIY garden. */
export class DiyToyLayer {
  private group: THREE.Group | null = null;
  private last: AuthoredProp[] = [];
  private textures = new Map<string, THREE.Texture>();
  private glbs = new Map<string, THREE.Object3D>();
  private glbFailed = new Set<string>();
  private loader = new THREE.TextureLoader();
  private gltf = new GLTFLoader();

  constructor(
    private readonly root: THREE.Object3D,
    private readonly groundY: (x: number, z: number) => number,
  ) {}

  sync(props: AuthoredProp[]) {
    this.last = props;
    this.rebuild();
  }

  pick(raycaster: THREE.Raycaster): string | null {
    if (!this.group) return null;
    let bestId: string | null = null;
    let bestDist = Infinity;
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const id = mesh.userData.propId as string | undefined;
      if (!id) return;
      const hits = raycaster.intersectObject(mesh, false);
      if (!hits.length) return;
      const dist = hits[0].distance;
      if (dist >= bestDist) return;
      bestDist = dist;
      bestId = id;
    });
    return bestId;
  }

  dispose() {
    this.clear();
    for (const texture of this.textures.values()) texture.dispose();
    this.textures.clear();
    this.glbs.clear();
    this.glbFailed.clear();
  }

  private rebuild() {
    this.clear();
    const group = new THREE.Group();
    group.name = GROUP;
    for (const prop of this.last) {
      if (!isPlazaToyModel(prop.model)) continue;
      const modelUrl = prop.modelUrl;
      if (modelUrl) this.placeGlb(group, prop, modelUrl);
      else this.placeStill(group, prop);
    }
    this.root.add(group);
    this.group = group;
  }

  private clear() {
    if (!this.group) return;
    this.group.removeFromParent();
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || mesh.userData.shared) return;
      mesh.geometry.dispose();
      const material = mesh.material as THREE.Material;
      material.dispose();
    });
    this.group = null;
  }

  private placeStill(group: THREE.Group, prop: AuthoredProp) {
    const src = displayStillUrl(prop.stillUrl || null);
    if (!src) return;
    const preparing = isPlazaToyPreparing({
      mesh_status: prop.meshStatus,
      model_url: prop.modelUrl,
    });
    const height = Math.max(0.8, prop.height);
    const y = this.groundY(prop.x, prop.z);
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.max(0.6, height * 0.72), height),
      new THREE.MeshLambertMaterial({
        transparent: true,
        opacity: preparing ? 0.82 : 1,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    card.position.set(prop.x, y + height / 2, prop.z);
    card.rotation.y = prop.rotationY;
    card.userData.propId = prop.id;
    card.castShadow = true;
    card.receiveShadow = false;
    const cached = this.textures.get(src);
    if (cached) {
      (card.material as THREE.MeshLambertMaterial).map = cached;
      (card.material as THREE.MeshLambertMaterial).needsUpdate = true;
    } else {
      this.loader.load(src, (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        this.textures.set(src, texture);
        const material = card.material as THREE.MeshLambertMaterial;
        material.map = texture;
        material.needsUpdate = true;
        const image = texture.image as { width?: number; height?: number };
        const aspect = (image.width || 1) / (image.height || 1);
        card.scale.set(Math.min(aspect, 1.35), 1, 1);
      });
    }
    group.add(card);
    if (!preparing) return;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(Math.max(0.4, height * 0.28), 0.045, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffdd55, transparent: true, opacity: 0.9, depthTest: false }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(prop.x, y + 0.12, prop.z);
    ring.userData.propId = prop.id;
    group.add(ring);
  }

  private placeGlb(group: THREE.Group, prop: AuthoredProp, url: string) {
    const resolved = resolveModelUrl(url, API_BASE);
    if (this.glbFailed.has(resolved)) {
      this.placeStill(group, prop);
      return;
    }
    const cached = this.glbs.get(resolved);
    if (cached) {
      this.mountGlb(group, prop, cached);
      return;
    }
    this.placeStill(group, prop);
    this.gltf.load(
      resolved,
      (gltf) => {
        compactPlazaToyGlb(gltf.scene);
        this.glbs.set(resolved, gltf.scene);
        this.rebuild();
      },
      undefined,
      () => {
        this.glbFailed.add(resolved);
        this.rebuild();
      },
    );
  }

  private mountGlb(group: THREE.Group, prop: AuthoredProp, root: THREE.Object3D) {
    const clone = root.clone(true);
    clone.traverse((object) => {
      object.userData.shared = true;
      object.userData.propId = prop.id;
    });
    seatPlazaToyGlb(clone, {
      height: prop.height,
      x: prop.x,
      z: prop.z,
      y: this.groundY(prop.x, prop.z),
      rotationY: prop.rotationY,
    });
    clone.userData.propId = prop.id;
    group.add(clone);
  }
}
