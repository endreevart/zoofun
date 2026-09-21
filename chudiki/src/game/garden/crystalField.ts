import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from '../../assetUrl';
import { PLAZA_CRYSTAL } from '../plaza/plazaApi';
import { PLAZA_TICKET, type PlazaMound, type PlazaTicket } from '../plaza/plazaDig';

const SPAN = 1.55;

function spinOf(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 0xffffffff) * Math.PI * 2;
}

function glowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const outer = ctx.createRadialGradient(32, 32, 4, 32, 32, 28);
    outer.addColorStop(0, '#ffffff');
    outer.addColorStop(0.45, '#ffe899');
    outer.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = outer;
    ctx.fillRect(0, 0, 64, 64);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
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

function disposeSprites(root: THREE.Object3D) {
  root.traverse((node) => {
    if (node instanceof THREE.Sprite) node.material.dispose();
  });
}

/** Five personal crystals on a family lawn. Prizes stay on the server (D-030). */
export class CrystalField {
  readonly group = new THREE.Group();
  private moundsGroup = new THREE.Group();
  private ticketGroup = new THREE.Group();
  private proto: THREE.Object3D | null = null;
  private shared = false;
  private failed = false;
  private mounds: PlazaMound[] = [];
  private tickets: PlazaTicket[] = [];
  private paintKey = '';
  private ticketKey = '';
  private heightAt: (x: number, z: number) => number;
  private loader = new GLTFLoader();
  private textures = new THREE.TextureLoader();
  private ticketMap: THREE.Texture | null = null;
  private glowMap = glowTexture();
  private dead = false;

  constructor(heightAt: (x: number, z: number) => number) {
    this.heightAt = heightAt;
    this.group.name = 'garden-crystals';
    this.moundsGroup.name = 'garden-crystal-mounds';
    this.ticketGroup.name = 'garden-crystal-tickets';
    this.group.add(this.moundsGroup, this.ticketGroup);
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
    this.textures.load(assetUrl(PLAZA_TICKET), (texture) => {
      if (this.dead) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      this.ticketMap = texture;
      this.ticketKey = '';
      this.paintTickets();
    });
  }

  setMounds(mounds: readonly PlazaMound[]) {
    this.mounds = mounds.slice();
    this.paint();
  }

  setTickets(tickets: readonly PlazaTicket[]) {
    this.tickets = tickets.slice();
    this.paintTickets();
  }

  update(elapsed: number) {
    for (const root of this.ticketGroup.children) {
      const phase = Number(root.userData.phase) || 0;
      const ground = Number(root.userData.ground) || 0;
      root.position.y = ground + 1.45 + Math.sin(elapsed * 2.15 + phase) * 0.22;
      const glow = root.children[0] as THREE.Sprite | undefined;
      if (!(glow instanceof THREE.Sprite)) continue;
      const pulse = 1 + Math.sin(elapsed * 3.05 + phase) * 0.1;
      glow.scale.set(3.4 * pulse, 2.1 * pulse, 1);
      glow.material.opacity = 0.52 + Math.sin(elapsed * 3.05 + phase) * 0.22;
    }
  }

  dispose() {
    this.dead = true;
    this.clearMounds(true);
    this.clearTickets();
    if (this.proto) disposeObject(this.proto, false);
    this.proto = null;
    this.ticketMap?.dispose();
    this.ticketMap = null;
    this.glowMap.dispose();
    this.group.removeFromParent();
  }

  private paint() {
    if (!this.proto && !this.failed) return;
    const proto = this.proto ?? fallbackCrystal();
    if (!this.proto) this.proto = proto;
    const key = this.mounds.map((item) => item.id).join(',');
    if (key === this.paintKey) return;
    this.clearMounds(this.shared);
    this.paintKey = key;
    for (const item of this.mounds) {
      const y = this.heightAt(item.x, item.z);
      this.moundsGroup.add(plant(proto, item.id, item.x, item.z, Number.isFinite(y) ? y : 0));
    }
  }

  private paintTickets() {
    if (!this.ticketMap) return;
    const key = this.tickets.map((item) => item.id).join(',');
    if (key === this.ticketKey) return;
    this.clearTickets();
    this.ticketKey = key;
    for (const item of this.tickets) {
      const y = this.heightAt(item.x, item.z);
      const ground = Number.isFinite(y) ? y : 0;
      const root = new THREE.Group();
      root.position.set(item.x, ground + 1.45, item.z);
      root.userData.phase = (item.x + item.z) * 0.17;
      root.userData.ground = ground;
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowMap,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          opacity: 0.72,
        }),
      );
      glow.scale.set(3.4, 2.1, 1);
      const card = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.ticketMap,
          transparent: true,
          depthWrite: false,
        }),
      );
      card.scale.set(2.6, 1.74, 1);
      root.add(glow, card);
      this.ticketGroup.add(root);
    }
  }

  private clearMounds(shared: boolean) {
    while (this.moundsGroup.children.length) {
      const child = this.moundsGroup.children[0];
      this.moundsGroup.remove(child);
      disposeObject(child, shared);
    }
  }

  private clearTickets() {
    while (this.ticketGroup.children.length) {
      const child = this.ticketGroup.children[0];
      this.ticketGroup.remove(child);
      disposeSprites(child);
    }
  }
}
