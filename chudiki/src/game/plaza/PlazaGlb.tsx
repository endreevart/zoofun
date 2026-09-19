import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { API_BASE } from '../../api';
import { assetUrl } from '../../assetUrl';
import type { ChudikSpec } from '../creatures/ChudikSpec';
import { buildDrawingChudik } from '../creatures/DrawingChudikBuilder';
import { displayStillUrl } from '../drawing/portrait';
import { resolveModelUrl } from '../drawing/modelUrl';
import { zoomFromPinch } from '../interaction/cameraPinch';
import { PostFx } from '../render/PostFx';
import { lookForPlaza, quality } from '../render/quality';
import { updateStylizedSun } from '../render/stylized';
import { tuning } from '../render/tuning';
import { Lighting } from '../world/lighting';
import { createSky, hazeForShell } from '../world/Sky';
import { IdyllicLibrary } from '../assets/IdyllicLibrary';
import { getIslandAudio } from '../audio/AudioBus';
import { idleJump, stepJump } from './plazaJump';
import { hintPlaza } from './plazaVoice';
import { nearMound, PLAZA_TICKET, type PlazaMound, type PlazaTicket } from './plazaDig';
import { PLAZA_EMOTES, PLAZA_FOG, PLAZA_PLANE, PLAZA_SHADOW_R, PLAZA_WALK, type PlazaEmoteId } from './plazaCopy';
import { PLAZA_CRYSTAL, PLAZA_GLB, type PlazaPeer } from './plazaApi';
import { seatWorld } from './plazaPeers';
import { PlazaStudio } from './plazaStudio';

export type PlazaBurst = { id: number; kind: PlazaEmoteId };

type Walk = { forward: number; right: number };
export type PlazaCam = { yaw: number; zoom: number };

const SPEED = 7;
const TURN = 5.4;
const CAM_MIN = 4.6;
const CAM_MAX = 52;
const CAM_PITCH_MIN = 0.32;
const CAM_PITCH_MAX = 1.28;
const textureLoader = new THREE.TextureLoader();

type Props = {
  className?: string;
  spec: ChudikSpec | null;
  portrait: string;
  others: PlazaPeer[];
  burst: PlazaBurst | null;
  walk: MutableRefObject<Walk>;
  building?: boolean;
  jump?: MutableRefObject<boolean>;
  mounds?: PlazaMound[];
  tickets?: PlazaTicket[];
  onNearMound?: (id: string | null) => void;
  onStudio?: (studio: PlazaStudio | null) => void;
};

function wrapPi(angle: number): number {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function blobTexture(hex: string, glow = '#fff7c2'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const outer = ctx.createRadialGradient(32, 32, 4, 32, 32, 28);
    outer.addColorStop(0, glow);
    outer.addColorStop(0.45, hex);
    outer.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = outer;
    ctx.fillRect(0, 0, 64, 64);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

function lawnMaterial(): THREE.MeshStandardMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const pixels = ctx.createImageData(256, 256);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 26;
      pixels.data[i] = Math.max(0, Math.min(255, 52 + n));
      pixels.data[i + 1] = Math.max(0, Math.min(255, 102 + n * 0.75));
      pixels.data[i + 2] = Math.max(0, Math.min(255, 44 + n * 0.4));
      pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(96, 96);
  map.anisotropy = 8;
  return new THREE.MeshStandardMaterial({ map, roughness: 0.94, metalness: 0 });
}

function makeMound(): THREE.Group {
  const group = new THREE.Group();
  const dirt = new THREE.Mesh(
    new THREE.SphereGeometry(1.4, 14, 10),
    new THREE.MeshStandardMaterial({ color: 0x6b4728, roughness: 0.96 }),
  );
  dirt.scale.set(1.2, 0.52, 1.2);
  dirt.position.y = 0.32;
  dirt.castShadow = true;
  dirt.receiveShadow = true;
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0x4a7a32, roughness: 0.92 }),
  );
  cap.scale.set(1.25, 0.38, 1.25);
  cap.position.y = 0.62;
  cap.castShadow = true;
  group.add(dirt, cap);
  return group;
}

const CRYSTAL_SPAN = 2.05;

function prepareCrystal(scene: THREE.Object3D): THREE.Group {
  const root = new THREE.Group();
  root.add(scene);
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.z, 0.01);
  scene.scale.setScalar(CRYSTAL_SPAN / span);
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

function spinOf(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 0xffffffff) * Math.PI * 2;
}

function plantCrystal(proto: THREE.Object3D, id: string, x: number, z: number): THREE.Object3D {
  const bump = proto.clone(true);
  bump.position.set(x, 0, z);
  bump.rotation.y = spinOf(id);
  bump.scale.setScalar(0.92 + (spinOf(`${id}-s`) / (Math.PI * 2)) * 0.14);
  return bump;
}

function clearMounds(group: THREE.Group, shared: boolean) {
  while (group.children.length) {
    const child = group.children[0];
    group.remove(child);
    if (shared) continue;
    child.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.geometry.dispose();
        const material = node.material;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material.dispose();
      }
    });
  }
}

function tree(
  height: number,
  trunkMat: THREE.Material,
  crownMat: THREE.Material,
  trunkGeo: THREE.BufferGeometry,
  crownGeo: THREE.BufferGeometry,
): THREE.Group {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = height * 0.16;
  trunk.scale.set(1, height * 0.32, 1);
  trunk.castShadow = false;
  const crown = new THREE.Mesh(crownGeo, crownMat);
  crown.position.y = height * 0.58;
  crown.scale.set(height * 0.4, height * 0.46, height * 0.4);
  crown.castShadow = false;
  group.add(trunk, crown);
  return group;
}

function makeGround(): THREE.Group {
  const group = new THREE.Group();
  const rim = PLAZA_PLANE / 2;
  const geo = new THREE.CircleGeometry(rim, 48);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const haze = new THREE.Color(0.42, 0.8, 1);
  const sod = new THREE.Color(0.24, 0.5, 0.2);
  for (let i = 0; i < pos.count; i += 1) {
    const fade = THREE.MathUtils.smoothstep(rim * 0.55, rim, Math.hypot(pos.getX(i), pos.getY(i)));
    const tint = sod.clone().lerp(haze, fade);
    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const sodMat = lawnMaterial();
  sodMat.vertexColors = true;
  const grass = new THREE.Mesh(geo, sodMat);
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  group.add(grass);

  const skirt = new THREE.Mesh(
    new THREE.RingGeometry(rim * 0.88, rim * 1.42, 48),
    new THREE.MeshBasicMaterial({
      color: haze,
      fog: true,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  skirt.rotation.x = -Math.PI / 2;
  skirt.position.y = 0.04;
  group.add(skirt);

  const shades = [0x3f7a32, 0x4f8c3a, 0x35682a, 0x5a9a42, 0x2f6828];
  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 1, 5);
  const crownGeo = new THREE.SphereGeometry(1, 8, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a5a32 });
  const crownMats = shades.map((shade) => new THREE.MeshLambertMaterial({ color: shade }));
  const belts = [
    { count: 16, inner: PLAZA_WALK + 6, span: 8, height: 2.8 },
    { count: 22, inner: PLAZA_WALK + 20, span: 14, height: 4.4 },
    { count: 28, inner: PLAZA_WALK + 40, span: 22, height: 6.2 },
  ];
  for (const belt of belts) {
    for (let i = 0; i < belt.count; i += 1) {
      const angle = (i / belt.count) * Math.PI * 2 + belt.inner * 0.01;
      const radius = belt.inner + (i % 7) * (belt.span / 7);
      const plant = tree(
        belt.height + (i % 5) * 0.55,
        trunkMat,
        crownMats[i % crownMats.length],
        trunkGeo,
        crownGeo,
      );
      plant.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      group.add(plant);
    }
  }
  return group;
}

function emoteSrc(kind: string): string {
  return PLAZA_EMOTES.find((item) => item.id === kind)?.src ?? PLAZA_EMOTES[0].src;
}

const PEER_COLORS = ['#f2c14e', '#7ec8e3', '#e07a5f', '#81b29a', '#f4a261', '#9b8ec4', '#e9c46a', '#2a9d8f'];

function peerLetterMap(name: string, seat: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = PEER_COLORS[((Math.trunc(seat) % PEER_COLORS.length) + PEER_COLORS.length) % PEER_COLORS.length];
    ctx.beginPath();
    ctx.arc(128, 128, 108, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3b332c';
    ctx.font = '800 120px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((name.trim()[0] || '?').toUpperCase(), 128, 138);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

function peerNameSprite(name: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const label = name.trim().slice(0, 16) || 'Зуфик';
  if (ctx) {
    ctx.fillStyle = 'rgba(255, 250, 240, 0.94)';
    ctx.fillRect(12, 10, 232, 44);
    ctx.fillStyle = '#3b332c';
    ctx.font = '700 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 128, 33);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthTest: false }));
  sprite.scale.set(1.7, 0.42, 1);
  sprite.position.y = 1.95;
  sprite.renderOrder = 4;
  return sprite;
}

function peerCard(map: THREE.Texture, height = 1.7): THREE.Mesh {
  const image = map.image as { width?: number; height?: number } | undefined;
  const aspect = (image?.width || 1) / (image?.height || 1);
  const card = new THREE.Mesh(
    new THREE.PlaneGeometry(height * Math.min(aspect, 1.35), height),
    new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      alphaTest: 0.08,
      side: THREE.DoubleSide,
    }),
  );
  card.position.y = height / 2;
  card.name = 'peer-card';
  return card;
}

function fitPeerToy(scene: THREE.Object3D, targetHeight: number) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const tall = Math.max(size.y, 0.001);
  scene.scale.setScalar(targetHeight / tall);
  scene.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(scene);
  scene.position.x -= (fitted.min.x + fitted.max.x) / 2;
  scene.position.y -= fitted.min.y;
  scene.position.z -= (fitted.min.z + fitted.max.z) / 2;
}

type Particle = {
  sprite: THREE.Sprite;
  age: number;
  life: number;
  vx: number;
  vy: number;
  vz: number;
};

function keysWalk(): Walk {
  const held = new Set(
    ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].filter((code) =>
      pressed.has(code),
    ),
  );
  const forward = (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0) + (held.has('KeyS') || held.has('ArrowDown') ? -1 : 0);
  const right = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) + (held.has('KeyA') || held.has('ArrowLeft') ? -1 : 0);
  return { forward, right };
}

function keysCam(): PlazaCam {
  const yaw =
    (pressed.has('KeyE') || pressed.has('KeyC') ? 1 : 0) + (pressed.has('KeyQ') || pressed.has('KeyZ') ? -1 : 0);
  const zoom =
    (pressed.has('Minus') || pressed.has('NumpadSubtract') ? 1 : 0) +
    (pressed.has('Equal') || pressed.has('NumpadAdd') ? -1 : 0);
  return { yaw, zoom };
}

const pressed = new Set<string>();

export function PlazaGlb({
  className,
  spec,
  portrait,
  others,
  burst,
  walk,
  building = false,
  jump,
  mounds = [],
  tickets = [],
  onNearMound,
  onStudio,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const walkRef = useRef(walk);
  walkRef.current = walk;
  const othersRef = useRef(others);
  othersRef.current = others;
  const burstRef = useRef(burst);
  const spawnBurst = useRef<(kind: PlazaEmoteId) => void>(() => undefined);
  const paintOthersRef = useRef<() => void>(() => undefined);
  const othersKey = useRef('');
  const jumpRef = useRef(jump);
  jumpRef.current = jump;
  const onStudioRef = useRef(onStudio);
  onStudioRef.current = onStudio;
  const buildingRef = useRef(building);
  buildingRef.current = building;
  const moundsRef = useRef(mounds);
  moundsRef.current = mounds;
  const ticketsRef = useRef(tickets);
  ticketsRef.current = tickets;
  const onNearMoundRef = useRef(onNearMound);
  onNearMoundRef.current = onNearMound;
  const studioHold = useRef<PlazaStudio | null>(null);

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let stop = false;
    let frame = 0;
    let headY = 1.6;
    let billboardSelf = false;
    let facing = 0;
    let speed = 0;
    let camYaw = 0;
    let camPitch = 1.06;
    let camDist = 11;
    let wantYaw = 0;
    let wantPitch = 1.06;
    let wantDist = 11;
    let jumpState = idleJump();
    let jumpWanted = false;
    let studio: PlazaStudio | null = null;
    let library: IdyllicLibrary | null = null;
    const abort = new AbortController();
    const clock = new THREE.Clock();
    const scene = new THREE.Scene();
    const haze = hazeForShell('meadow');
    scene.fog = new THREE.FogExp2(haze.getHex(), PLAZA_FOG);
    const camera = new THREE.PerspectiveCamera(46, 1, 0.4, 1800);
    const lookSettings = lookForPlaza(quality());
    const lighting = new Lighting(lookSettings, true);
    lighting.apply(tuning.get());
    const sunLift = lighting.sun.position.clone().sub(lighting.sun.target.position);
    const shadowSpan = PLAZA_SHADOW_R + 6;
    lighting.sun.shadow.camera.left = -shadowSpan;
    lighting.sun.shadow.camera.right = shadowSpan;
    lighting.sun.shadow.camera.top = shadowSpan;
    lighting.sun.shadow.camera.bottom = -shadowSpan;
    lighting.sun.shadow.camera.far = 80;
    lighting.sun.shadow.camera.updateProjectionMatrix();
    const plazaShadow = lighting.sun.shadow as { intensity?: number };
    if (plazaShadow.intensity !== undefined) plazaShadow.intensity = 0.48;
    scene.add(lighting.group);

    const sky = createSky('meadow');
    const dome = sky.getObjectByName('sky-dome') as THREE.Mesh | undefined;
    const skyMat = dome?.material as THREE.ShaderMaterial | undefined;
    if (skyMat?.uniforms?.uPlanetAmount) skyMat.uniforms.uPlanetAmount.value = 0;
    scene.add(sky);
    scene.add(makeGround());
    const moundGroup = new THREE.Group();
    scene.add(moundGroup);
    let moundPaint = '';
    let crystalRoot: THREE.Group | null = null;
    let crystalFailed = false;
    let lastNear: string | null | undefined;
    const ticketGroup = new THREE.Group();
    scene.add(ticketGroup);
    let ticketPaint = '';
    let ticketMap: THREE.Texture | null = null;
    const glowMap = blobTexture('#ffe899', '#ffffff');

    const avatar = new THREE.Group();
    scene.add(avatar);
    const bounce = new THREE.Group();
    avatar.add(bounce);

    const othersGroup = new THREE.Group();
    scene.add(othersGroup);
    const particles: Particle[] = [];
    const emoteMaps = new Map<string, THREE.Texture>();
    const lastPeerEmote = new Map<number, string>();

    const renderer = new THREE.WebGLRenderer({ antialias: lookSettings.antialias });
    renderer.setPixelRatio(lookSettings.pixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = lookSettings.shadows;
    renderer.shadowMap.type = lookSettings.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    renderer.setClearColor(haze.getHex(), 1);
    node.appendChild(renderer.domElement);
    const postFx = new PostFx(renderer, scene, camera, lookSettings);

    const onKey = (event: KeyboardEvent) => {
      void getIslandAudio().unlock();
      if (event.code === 'Space') {
        if (event.type === 'keydown' && !event.repeat) {
          event.preventDefault();
          jumpWanted = true;
        }
        return;
      }
      if (event.type === 'keydown') pressed.add(event.code);
      else pressed.delete(event.code);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);

    const pointers = new Map<number, THREE.Vector2>();
    let lastPinch = 0;

    const onPointerDown = (event: PointerEvent) => {
      void getIslandAudio().unlock();
      if (studio?.onPointerDown(event)) return;
      if (event.pointerType !== 'touch') {
        try {
          renderer.domElement.setPointerCapture?.(event.pointerId);
        } catch {
          /* already captured */
        }
      }
      if (event.isPrimary) pointers.clear();
      pointers.set(event.pointerId, new THREE.Vector2(event.clientX, event.clientY));
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        lastPinch = a.distanceTo(b);
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      studio?.onPointerMove(event);
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      const current = new THREE.Vector2(event.clientX, event.clientY);
      if (pointers.size === 2) {
        pointers.set(event.pointerId, current);
        const [a, b] = [...pointers.values()];
        const span = a.distanceTo(b);
        wantDist = zoomFromPinch(span, lastPinch, wantDist, CAM_MIN, CAM_MAX);
        lastPinch = span;
        return;
      }
      if (event.pointerType === 'mouse' && (event.buttons & 1) !== 1) {
        pointers.set(event.pointerId, current);
        return;
      }
      const dx = current.x - previous.x;
      const dy = current.y - previous.y;
      if (Math.abs(dx) + Math.abs(dy) > 1.2) {
        wantYaw -= dx * 0.006;
        wantPitch = THREE.MathUtils.clamp(wantPitch - dy * 0.0048, CAM_PITCH_MIN, CAM_PITCH_MAX);
      }
      pointers.set(event.pointerId, current);
    };
    const onPointerUp = (event: PointerEvent) => {
      studio?.onPointerUp(event);
      pointers.delete(event.pointerId);
      if (pointers.size < 2) lastPinch = 0;
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      wantDist = THREE.MathUtils.clamp(wantDist * Math.exp(event.deltaY * 0.00115), CAM_MIN, CAM_MAX);
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    const mountStandee = (url: string) => {
      if (!url) return;
      textureLoader.load(url, (texture) => {
        if (stop) return;
        texture.colorSpace = THREE.SRGBColorSpace;
        const image = texture.image as { width?: number; height?: number };
        const aspect = (image.width || 1) / (image.height || 1);
        const height = 1.85;
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(height * Math.min(aspect, 1.35), height),
          new THREE.MeshStandardMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, roughness: 0.72 }),
        );
        mesh.position.y = height / 2;
        bounce.add(mesh);
        headY = height;
      });
    };

    if (spec?.drawing && !spec.drawing.placeholder && (spec.drawing.contour?.length || spec.drawing.modelUrl)) {
      const drawing = spec.drawing.modelUrl
        ? { ...spec.drawing, modelUrl: resolveModelUrl(spec.drawing.modelUrl, API_BASE) }
        : spec.drawing;
      const rig = buildDrawingChudik(spec, drawing);
      rig.root.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh) mesh.castShadow = true;
      });
      bounce.add(rig.root);
      headY = rig.height;
    } else {
      billboardSelf = true;
      mountStandee(portrait);
    }

    const paintOthers = () => {
      paintGen += 1;
      const gen = paintGen;
      othersGroup.clear();
      for (const peer of othersRef.current) {
        if (peer.self) continue;
        const spot = seatWorld(peer.seat);
        const root = new THREE.Group();
        root.position.set(spot.x, 0, spot.z);
        root.userData.billboard = true;
        const fallback = peerCard(peerLetterMap(peer.name, peer.seat), 1.55);
        root.add(fallback);
        root.add(peerNameSprite(peer.name));
        othersGroup.add(root);
        const src = displayStillUrl(peer.portrait) ?? peer.portrait.trim();
        if (src) {
          textureLoader.load(
            src,
            (texture) => {
              if (stop || gen !== paintGen || root.userData.mesh) return;
              texture.colorSpace = THREE.SRGBColorSpace;
              const old = root.getObjectByName('peer-card');
              if (old) root.remove(old);
              root.add(peerCard(texture));
            },
            undefined,
            () => {
              /* keep the letter standee */
            },
          );
        }
        const model = displayStillUrl(peer.model?.trim() || null);
        if (!model) continue;
        peerLoader.load(
          model,
          (gltf) => {
            if (stop || gen !== paintGen) return;
            const toy = gltf.scene.clone(true);
            fitPeerToy(toy, 2.5);
            toy.name = 'peer-mesh';
            toy.traverse((node) => {
              if (!(node instanceof THREE.Mesh)) return;
              node.castShadow = lookSettings.shadows;
              node.receiveShadow = false;
            });
            const old = root.getObjectByName('peer-card');
            if (old) root.remove(old);
            root.userData.billboard = false;
            root.userData.mesh = true;
            root.add(toy);
          },
          undefined,
          () => {
            /* still/letter standee stays */
          },
        );
      }
    };
    let paintGen = 0;
    const peerLoader = new GLTFLoader();
    paintOthers();
    paintOthersRef.current = paintOthers;

    const puff = (
      map: THREE.Texture,
      x: number,
      y: number,
      z: number,
      count = 6,
      spread = 0.28,
      power = 1,
    ) => {
      for (let i = 0; i < count; i += 1) {
        const material = new THREE.SpriteMaterial({
          map,
          transparent: true,
          depthWrite: false,
          depthTest: false,
        });
        const sprite = new THREE.Sprite(material);
        const size = 0.55 + Math.random() * 0.55 * power;
        sprite.scale.set(size, size, 1);
        sprite.position.set(x + (Math.random() - 0.5) * spread, y, z + (Math.random() - 0.5) * spread);
        scene.add(sprite);
        particles.push({
          sprite,
          age: -i * 0.03,
          life: 0.9 + Math.random() * 0.55 * power,
          vx: (Math.random() - 0.5) * 1.6 * power,
          vy: 1.4 + Math.random() * 2.2 * power,
          vz: (Math.random() - 0.5) * 1.6 * power,
        });
      }
    };

    const withEmoteMap = (kind: string, then: (map: THREE.Texture) => void) => {
      const ready = emoteMaps.get(kind);
      if (ready) {
        then(ready);
        return;
      }
      textureLoader.load(assetUrl(emoteSrc(kind)), (texture) => {
        if (stop) return;
        texture.colorSpace = THREE.SRGBColorSpace;
        emoteMaps.set(kind, texture);
        then(texture);
      });
    };

    spawnBurst.current = (kind: PlazaEmoteId) => {
      withEmoteMap(kind, (map) => {
        puff(map, avatar.position.x, avatar.position.y + headY * 0.95, avatar.position.z);
      });
    };

    textureLoader.load(assetUrl(PLAZA_TICKET), (texture) => {
      if (stop) return;
      texture.colorSpace = THREE.SRGBColorSpace;
      ticketMap = texture;
      ticketPaint = '';
    });

    for (const item of PLAZA_EMOTES) {
      textureLoader.load(assetUrl(item.src), (texture) => {
        if (stop) return;
        texture.colorSpace = THREE.SRGBColorSpace;
        emoteMaps.set(item.id, texture);
      });
    }

    const look = new THREE.Vector3();
    const audio = getIslandAudio();
    let stepAcc = 0.18;
    let wasGrounded = true;

    let lastFrameAt = 0;
    const draw = () => {
      if (stop) return;
      frame = window.requestAnimationFrame(draw);
      const cap = lookSettings.maxFps;
      if (cap > 0) {
        const now = performance.now();
        if (now - lastFrameAt < 1000 / cap - 1) return;
        lastFrameAt = now;
      }
      const dt = Math.min(0.05, clock.getDelta());
      const pad = walkRef.current.current;
      const keys = keysWalk();
      const forward = THREE.MathUtils.clamp(pad.forward + keys.forward, -1, 1);
      const right = THREE.MathUtils.clamp(pad.right + keys.right, -1, 1);
      const analog = Math.min(1, Math.hypot(forward, right));
      const camKeys = keysCam();
      wantYaw += camKeys.yaw * 1.7 * dt;
      wantDist = THREE.MathUtils.clamp(wantDist + camKeys.zoom * 14 * dt, CAM_MIN, CAM_MAX);
      const wantHop = jumpWanted || Boolean(jumpRef.current?.current);
      jumpWanted = false;
      if (jumpRef.current) jumpRef.current.current = false;
      jumpState = stepJump(jumpState, dt, wantHop);
      avatar.position.y = jumpState.y;
      if (wasGrounded && !jumpState.grounded) {
        audio.playSfx('jump');
        hintPlaza('plaza_jump');
      }
      if (!wasGrounded && jumpState.grounded) audio.playSfx('land');
      wasGrounded = jumpState.grounded;

      const ease = 1 - Math.exp(-6.2 * dt);
      camYaw += wrapPi(wantYaw - camYaw) * ease;
      camPitch = THREE.MathUtils.lerp(camPitch, wantPitch, ease);
      camDist = THREE.MathUtils.lerp(camDist, wantDist, ease);

      if (analog > 0.06) {
        const sin = Math.sin(camYaw);
        const cos = Math.cos(camYaw);
        const fx = -sin * forward + cos * right;
        const fz = -cos * forward - sin * right;
        const wantFace = Math.atan2(fx, fz);
        const turn = THREE.MathUtils.clamp(wrapPi(wantFace - facing), -TURN * dt, TURN * dt);
        facing += turn;
        avatar.rotation.y = facing;
        const align = Math.max(0.38, 1 - Math.abs(wrapPi(wantFace - facing)) / 1.2);
        speed = THREE.MathUtils.lerp(speed, SPEED * analog * align, dt * 8);
        const step = speed * dt;
        const len = Math.hypot(fx, fz) || 1;
        avatar.position.x = THREE.MathUtils.clamp(avatar.position.x + (fx / len) * step, -PLAZA_WALK, PLAZA_WALK);
        avatar.position.z = THREE.MathUtils.clamp(avatar.position.z + (fz / len) * step, -PLAZA_WALK, PLAZA_WALK);
        bounce.position.y = jumpState.grounded ? Math.abs(Math.sin(clock.elapsedTime * 10)) * 0.08 : 0;
        if (jumpState.grounded) {
          stepAcc += dt * (0.85 + analog * 0.7);
          if (stepAcc >= 0.34) {
            stepAcc = 0;
            audio.playSfx('step');
          }
        }
      } else {
        speed = THREE.MathUtils.lerp(speed, 0, dt * 10);
        bounce.position.y = jumpState.grounded ? THREE.MathUtils.lerp(bounce.position.y, 0, dt * 12) : 0;
        stepAcc = Math.min(stepAcc, 0.18);
      }

      const listed = moundsRef.current;
      const shared = Boolean(crystalRoot);
      if (!shared && !crystalFailed) {
        /* wait for the compact crystal GLB */
      } else {
        const moundKey = `${listed.map((item) => item.id).join(',')}|${shared ? 'c' : 'd'}`;
        if (moundKey !== moundPaint) {
          const wasShared = moundPaint.endsWith('|c');
          clearMounds(moundGroup, wasShared);
          moundPaint = moundKey;
          for (const item of listed) {
            if (crystalRoot) {
              moundGroup.add(plantCrystal(crystalRoot, item.id, item.x, item.z));
            } else {
              const bump = makeMound();
              bump.position.set(item.x, 0, item.z);
              moundGroup.add(bump);
            }
          }
        }
      }
      const shown = ticketsRef.current;
      const ticketKey = shown.map((item) => item.id).join(',');
      if (ticketMap && ticketKey !== ticketPaint) {
        ticketPaint = ticketKey;
        while (ticketGroup.children.length) {
          const child = ticketGroup.children[0];
          ticketGroup.remove(child);
          child.traverse((node) => {
            if (node instanceof THREE.Sprite) {
              node.material.dispose();
            }
          });
        }
        for (const item of shown) {
          const root = new THREE.Group();
          root.position.set(item.x, 1.55, item.z);
          root.userData.phase = (item.x + item.z) * 0.17;
          const glow = new THREE.Sprite(
            new THREE.SpriteMaterial({
              map: glowMap,
              transparent: true,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
              opacity: 0.72,
            }),
          );
          glow.scale.set(4.2, 2.6, 1);
          const card = new THREE.Sprite(
            new THREE.SpriteMaterial({
              map: ticketMap,
              transparent: true,
              depthWrite: false,
            }),
          );
          card.scale.set(3.2, 2.14, 1);
          root.add(glow, card);
          ticketGroup.add(root);
        }
      }
      const floatT = clock.elapsedTime;
      for (const root of ticketGroup.children) {
        const phase = Number(root.userData.phase) || 0;
        root.position.y = 1.58 + Math.sin(floatT * 2.15 + phase) * 0.22;
        const glow = root.children[0] as THREE.Sprite;
        const pulse = 1 + Math.sin(floatT * 3.05 + phase) * 0.1;
        glow.scale.set(4.2 * pulse, 2.6 * pulse, 1);
        (glow.material as THREE.SpriteMaterial).opacity = 0.52 + Math.sin(floatT * 3.05 + phase) * 0.22;
      }
      const near = nearMound(avatar.position.x, avatar.position.z, listed);
      if (near !== lastNear) {
        lastNear = near;
        onNearMoundRef.current?.(near);
      }

      const horiz = Math.sin(camPitch) * camDist;
      camera.position.set(
        avatar.position.x + Math.sin(camYaw) * horiz,
        avatar.position.y + Math.cos(camPitch) * camDist + 0.35,
        avatar.position.z + Math.cos(camYaw) * horiz,
      );
      look.set(avatar.position.x, avatar.position.y + 1.15, avatar.position.z);
      camera.lookAt(look);
      lighting.sun.target.position.set(avatar.position.x, 0, avatar.position.z);
      lighting.sun.position.copy(lighting.sun.target.position).add(sunLift);
      lighting.sun.target.updateMatrixWorld();
      studio?.syncView(avatar.position.x, avatar.position.z);
      if (billboardSelf) bounce.rotation.y = wrapPi(camYaw - facing);
      for (const child of othersGroup.children) {
        if (!child.userData.billboard) continue;
        child.lookAt(camera.position.x, child.position.y + 0.8, camera.position.z);
      }
      updateStylizedSun(lighting.sun, camera);
      postFx.updateSun(lighting.sun, camera);

      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const item = particles[i];
        item.age += dt;
        if (item.age < 0) {
          item.sprite.visible = false;
          continue;
        }
        item.sprite.visible = true;
        item.sprite.position.x += item.vx * dt;
        item.sprite.position.y += item.vy * dt;
        item.sprite.position.z += item.vz * dt;
        const t = item.age / item.life;
        const fade = t < 0.15 ? t / 0.15 : Math.max(0, 1 - (t - 0.15) / 0.85);
        item.sprite.material.opacity = fade;
        const size = 0.85 + t * 0.55;
        item.sprite.scale.set(size, size, 1);
        if (t >= 1) {
          scene.remove(item.sprite);
          item.sprite.material.dispose();
          particles.splice(i, 1);
        }
      }

      for (const peer of othersRef.current) {
        if (peer.self) continue;
        const kind = peer.emote;
        if (!kind) {
          lastPeerEmote.delete(peer.seat);
          continue;
        }
        if (lastPeerEmote.get(peer.seat) === kind) continue;
        lastPeerEmote.set(peer.seat, kind);
        const spot = seatWorld(peer.seat);
        withEmoteMap(kind, (map) => puff(map, spot.x, 1.7, spot.z));
      }

      const w = node.clientWidth || 1;
      const h = node.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      postFx.setSize(w, h);
      postFx.render(dt);
    };
    draw();

    const loader = new GLTFLoader();
    loader.load(assetUrl(PLAZA_GLB), (gltf) => {
      if (stop) return;
      gltf.scene.position.y = 0.02;
      scene.add(gltf.scene);
    });
    loader.load(
      assetUrl(PLAZA_CRYSTAL),
      (gltf) => {
        if (stop) {
          gltf.scene.traverse((node) => {
            if (node instanceof THREE.Mesh) {
              node.geometry.dispose();
              const material = node.material;
              if (Array.isArray(material)) material.forEach((item) => item.dispose());
              else material.dispose();
            }
          });
          return;
        }
        crystalRoot = prepareCrystal(gltf.scene);
        moundPaint = '';
      },
      undefined,
      () => {
        crystalFailed = true;
        moundPaint = '';
      },
    );

    void IdyllicLibrary.load(() => undefined, [], abort.signal, renderer)
      .then(async (loaded) => {
        if (stop) {
          loaded.dispose();
          return;
        }
        library = loaded;
        studio = new PlazaStudio({
          library: loaded,
          scene,
          camera,
          canvas: renderer.domElement,
          renderer,
        });
        studioHold.current = studio;
        studio.setEnabled(buildingRef.current);
        onStudioRef.current?.(studio);
        await studio.boot();
      })
      .catch(() => {
        /* placeholder lawn still walks */
      });

    return () => {
      stop = true;
      abort.abort();
      studioHold.current = null;
      onStudioRef.current?.(null);
      studio?.dispose();
      library?.dispose();
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      pressed.clear();
      glowMap.dispose();
      ticketMap?.dispose();
      crystalRoot?.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.geometry.dispose();
          const material = node.material;
          if (Array.isArray(material)) material.forEach((item) => item.dispose());
          else material.dispose();
        }
      });
      postFx.dispose();
      renderer.dispose();
      node.replaceChildren();
    };
  }, [spec, portrait]);

  useEffect(() => {
    studioHold.current?.setEnabled(building);
  }, [building]);

  useEffect(() => {
    if (!burst || burstRef.current?.id === burst.id) {
      burstRef.current = burst;
      return;
    }
    burstRef.current = burst;
    spawnBurst.current(burst.kind);
  }, [burst]);

  useEffect(() => {
    othersRef.current = others;
    const key = others
      .filter((peer) => !peer.self)
      .map((peer) => `${peer.seat}:${peer.spec_id}:${peer.portrait}:${peer.model ?? ''}`)
      .join('|');
    if (key === othersKey.current) return;
    othersKey.current = key;
    paintOthersRef.current();
  }, [others]);

  return <div ref={host} className={className} aria-hidden="true" />;
}
