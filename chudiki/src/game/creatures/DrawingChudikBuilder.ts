import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EYE } from '../core/palette';
import { bakePaintables, blobGeometry, createToyMaterial } from '../core/geometry';
import type { ChudikSpec, DrawingData } from './ChudikSpec';
import type { ChudikRig } from './ChudikBuilder';

const meshyLoader = new GLTFLoader();

export async function preloadMeshyModel(url: string): Promise<boolean> {
  try {
    await loadMeshyGltf(url);
    return true;
  } catch {
    return false;
  }
}

async function loadMeshyGltf(url: string) {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await meshyLoader.loadAsync(url);
    } catch (error) {
      last = error;
      await new Promise((resolve) => window.setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw last instanceof Error ? last : new Error('glb missing');
}

/**
 * Grows a creature out of a child's drawing.
 *
 * The silhouette stays the child's. A neural restyle already paints the face,
 * so we do not glue on extra eyes and feet. A raw drawing still gets those
 * two toys so it reads as alive.
 */
export function buildDrawingChudik(spec: ChudikSpec, drawing: DrawingData): ChudikRig {
  if (spec.hatching) return buildEggChudik(spec, drawing);
  if (drawing.modelUrl) return buildMeshyChudik(spec, drawing);

  const root = new THREE.Group();
  root.name = `chudik:${spec.id}`;
  const bounce = new THREE.Group();
  const squash = new THREE.Group();
  root.add(bounce);
  bounce.add(squash);

  const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];

  // Overall height in world units. Drawings read best a bit taller than the
  // procedural residents so a child can spot their own creature immediately.
  const scale = 2.5 * spec.size;
  const width = drawing.aspect * scale;
  const painted = drawing.painted === true;
  // Felt cutout, not a loaf. Three.js adds a bevel on both caps, so total
  // thickness is depth + 2 * bevelThickness. Keep that near 1/5 of the span.
  const span = Math.min(width, scale);
  const depth = span * 0.07;
  const bevelThickness = span * 0.065;
  const bevelSize = span * 0.03;

  const shape = contourToShape(drawing.contour, scale);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness,
    bevelSize,
    bevelSegments: 5,
    curveSegments: 1,
    steps: 1,
  });
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box) geometry.translate(0, 0, -(box.min.z + box.max.z) / 2);
  geometry.computeVertexNormals();
  disposables.push(geometry);

  const texture = new THREE.Texture();
  const image = new Image();
  image.onload = () => {
    texture.image = image;
    texture.needsUpdate = true;
  };
  image.src = drawing.textureUrl;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  // ExtrudeGeometry lays out cap UVs straight from shape coordinates, so this
  // maps the silhouette's bounding box onto the full 0..1 texture.
  texture.repeat.set(1 / width, 1 / scale);
  texture.offset.set(0.5, 0.5);
  texture.anisotropy = 4;
  disposables.push(texture);

  const faceMaterial = createToyMaterial({
    roughness: painted ? 0.58 : 0.68,
    transparent: true,
  });
  faceMaterial.map = texture;
  faceMaterial.alphaTest = 0.08;
  const sideMaterial = createToyMaterial({
    color: drawing.sideColor,
    roughness: painted ? 0.78 : 0.82,
  });
  disposables.push(faceMaterial, sideMaterial);

  const bodyMesh = new THREE.Mesh(geometry, [faceMaterial, sideMaterial]);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  bodyMesh.userData.chudikId = spec.id;
  bodyMesh.position.y = scale / 2 + scale * 0.06;
  squash.add(bodyMesh);

  const eyeRig = painted
    ? { eyes: [] as THREE.Group[], pupils: [] as THREE.Group[] }
    : addGooglyEyes(squash, spec, drawing, {
        scale,
        depth,
        lift: bodyMesh.position.y,
        disposables,
      });

  if (!painted) {
    addFeet(squash, spec, drawing, { scale, width, depth, disposables });
  }

  return {
    root,
    bounce,
    squash,
    eyes: eyeRig.eyes,
    pupils: eyeRig.pupils,
    ears: [],
    wings: [],
    tail: null,
    height: scale * 1.12,
    radius: Math.max(width, depth + bevelThickness * 2) * 0.5,
    dispose() {
      for (const item of disposables) item.dispose();
    },
  };
}

/** Normalised contour to a three Shape, forced counter-clockwise. */
function contourToShape(contour: Array<[number, number]>, scale: number): THREE.Shape {
  const points = contour.map(([x, y]) => new THREE.Vector2(x * scale, y * scale));
  if (signedArea(points) < 0) points.reverse();
  return new THREE.Shape(points);
}

function signedArea(points: THREE.Vector2[]): number {
  let area = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    area += (points[j].x + points[i].x) * (points[j].y - points[i].y);
  }
  return area / 2;
}

function addGooglyEyes(
  parent: THREE.Group,
  spec: ChudikSpec,
  drawing: DrawingData,
  ctx: {
    scale: number;
    depth: number;
    lift: number;
    disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture>;
  },
): { eyes: THREE.Group[]; pupils: THREE.Group[] } {
  const eyes: THREE.Group[] = [];
  const pupils: THREE.Group[] = [];

  const material = createToyMaterial({ vertexColors: true, roughness: 0.5 });
  ctx.disposables.push(material);

  const eyeRadius = drawing.eyeRadius * ctx.scale * spec.eyeScale;
  const spacing = (drawing.eyeSpacing * ctx.scale) / 2;
  const anchorX = drawing.eyeAnchor[0] * ctx.scale;
  const anchorY = drawing.eyeAnchor[1] * ctx.scale + ctx.lift;
  const eyeZ = ctx.depth / 2 + eyeRadius * 0.5;

  for (const side of [-1, 1]) {
    const group = new THREE.Group();
    group.position.set(anchorX + side * spacing, anchorY, eyeZ);
    parent.add(group);

    const white = new THREE.Mesh(
      bakePaintables([
        { geometry: blobGeometry(eyeRadius, new THREE.Vector3(1, 1.05, 0.92), 20), color: EYE.white },
      ]),
      material,
    );
    white.castShadow = true;
    white.userData.chudikId = spec.id;
    group.add(white);
    ctx.disposables.push(white.geometry);

    const pupilGroup = new THREE.Group();
    const pupil = new THREE.Mesh(
      bakePaintables([
        {
          geometry: blobGeometry(eyeRadius * 0.5, new THREE.Vector3(1, 1.1, 0.85), 16),
          color: EYE.pupil,
        },
        {
          geometry: blobGeometry(eyeRadius * 0.15, new THREE.Vector3(1, 1, 1), 10),
          color: EYE.glint,
          position: new THREE.Vector3(-side * eyeRadius * 0.16, eyeRadius * 0.2, eyeRadius * 0.32),
        },
      ]),
      material,
    );
    pupil.userData.chudikId = spec.id;
    pupilGroup.add(pupil);
    pupilGroup.position.z = eyeRadius * 0.56;
    group.add(pupilGroup);
    ctx.disposables.push(pupil.geometry);

    eyes.push(group);
    pupils.push(pupilGroup);
  }

  return { eyes, pupils };
}

function addFeet(
  parent: THREE.Group,
  spec: ChudikSpec,
  drawing: DrawingData,
  ctx: {
    scale: number;
    width: number;
    depth: number;
    disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture>;
  },
) {
  const footRadius = Math.min(ctx.width, ctx.scale) * 0.14;
  const material = createToyMaterial({ vertexColors: true, roughness: 0.6 });
  ctx.disposables.push(material);

  const mesh = new THREE.Mesh(
    bakePaintables(
      [-1, 1].map((side) => ({
        geometry: blobGeometry(footRadius, new THREE.Vector3(0.95, 0.62, 1.45), 12),
        color: drawing.accentColor,
        position: new THREE.Vector3(
          side * ctx.width * 0.2,
          footRadius * 0.62,
          ctx.depth * 0.28,
        ),
      })),
    ),
    material,
  );
  mesh.castShadow = true;
  mesh.userData.chudikId = spec.id;
  parent.add(mesh);
  ctx.disposables.push(mesh.geometry);
}

function paintWaitRing(
  ctx: CanvasRenderingContext2D,
  fill: number,
  spin: number,
  ready: boolean,
) {
  const size = 128;
  const center = size / 2;
  const radius = 46;
  ctx.clearRect(0, 0, size, size);
  ctx.lineCap = 'round';
  ctx.lineWidth = 9;
  ctx.strokeStyle = ready ? 'rgba(255, 224, 110, 0.38)' : 'rgba(255, 250, 230, 0.3)';
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.stroke();
  const amount = Math.max(0.05, Math.min(1, fill));
  const start = -Math.PI / 2 + (ready ? 0 : spin);
  ctx.lineWidth = 12;
  ctx.strokeStyle = ready ? '#ffe066' : '#6dff88';
  ctx.beginPath();
  ctx.arc(center, center, radius, start, start + Math.PI * 2 * amount);
  ctx.stroke();
}

/** A clay egg on the lawn while the real puppet is still being made. */
function buildEggChudik(spec: ChudikSpec, drawing: DrawingData): ChudikRig {
  const root = new THREE.Group();
  root.name = `chudik:${spec.id}`;
  const bounce = new THREE.Group();
  const squash = new THREE.Group();
  root.add(bounce);
  bounce.add(squash);

  const scale = 4.3 * spec.size;
  const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  const shell = new THREE.SphereGeometry(scale * 0.4, 22, 16);
  shell.scale(0.78, 1.14, 0.78);
  const body = new THREE.Mesh(
    shell,
    createToyMaterial({ color: drawing.sideColor, roughness: 0.7 }),
  );
  body.position.y = scale * 0.42;
  body.castShadow = true;
  body.userData.chudikId = spec.id;
  squash.add(body);
  disposables.push(shell, body.material);

  const spotGeo = new THREE.SphereGeometry(scale * 0.08, 10, 8);
  spotGeo.scale(1.4, 0.7, 1);
  const spotMat = createToyMaterial({ color: drawing.accentColor, roughness: 0.62 });
  disposables.push(spotGeo, spotMat);
  for (const [x, y, z, s] of [
    [0.18, 0.52, 0.16, 1],
    [-0.2, 0.38, 0.12, 0.8],
    [0.06, 0.62, -0.18, 0.7],
  ] as const) {
    const spot = new THREE.Mesh(spotGeo, spotMat);
    spot.position.set(x * scale, y * scale, z * scale);
    spot.scale.setScalar(s);
    spot.userData.chudikId = spec.id;
    squash.add(spot);
  }

  const crackMat = new THREE.MeshBasicMaterial({
    color: 0x3a2418,
    transparent: true,
    opacity: 1,
    depthWrite: false,
  });
  disposables.push(crackMat);
  const cracks: THREE.Group[] = [];
  const crackMarks = [
    { x: 0.02, y: 0.5, z: 0.3, yaw: 0, rotZ: 0.18, rotX: 0.16, h: 0.4, branch: 0.55 },
    { x: 0.22, y: 0.44, z: 0.16, yaw: 0.85, rotZ: -0.42, rotX: 0.1, h: 0.32, branch: -0.7 },
    { x: -0.2, y: 0.56, z: 0.14, yaw: -0.7, rotZ: 0.62, rotX: -0.06, h: 0.3, branch: 0.8 },
    { x: 0.1, y: 0.4, z: -0.26, yaw: 2.5, rotZ: -0.22, rotX: 0.18, h: 0.34, branch: 0.4 },
    { x: -0.08, y: 0.6, z: -0.22, yaw: 3.2, rotZ: 0.48, rotX: 0, h: 0.26, branch: -0.5 },
    { x: -0.24, y: 0.38, z: 0.06, yaw: -1.3, rotZ: -0.58, rotX: 0.12, h: 0.33, branch: 0.9 },
    { x: 0.16, y: 0.64, z: 0.02, yaw: 0.35, rotZ: 0.12, rotX: -0.18, h: 0.24, branch: -0.35 },
    { x: 0.04, y: 0.46, z: 0.28, yaw: 0.15, rotZ: 1.05, rotX: 0.04, h: 0.22, branch: 0.25 },
  ];
  for (const mark of crackMarks) {
    const group = new THREE.Group();
    group.position.set(mark.x * scale, mark.y * scale, mark.z * scale);
    group.rotation.y = mark.yaw;
    group.visible = false;
    group.userData.chudikId = spec.id;
    const stem = new THREE.Mesh(
      new THREE.BoxGeometry(scale * 0.02, scale * mark.h, scale * 0.02),
      crackMat,
    );
    stem.rotation.z = mark.rotZ;
    stem.rotation.x = mark.rotX;
    stem.userData.chudikId = spec.id;
    const branch = new THREE.Mesh(
      new THREE.BoxGeometry(scale * 0.018, scale * mark.h * 0.55, scale * 0.018),
      crackMat,
    );
    branch.position.y = scale * mark.h * 0.08;
    branch.rotation.z = mark.rotZ + mark.branch;
    branch.rotation.x = mark.rotX * 0.4;
    branch.userData.chudikId = spec.id;
    group.add(stem, branch);
    squash.add(group);
    cracks.push(group);
    disposables.push(stem.geometry, branch.geometry);
  }

  const ringCanvas = document.createElement('canvas');
  ringCanvas.width = 128;
  ringCanvas.height = 128;
  const ringCtx = ringCanvas.getContext('2d');
  const ringTex = new THREE.CanvasTexture(ringCanvas);
  ringTex.colorSpace = THREE.SRGBColorSpace;
  const ring = new THREE.Mesh(
    new THREE.CircleGeometry(scale * 0.58, 40),
    new THREE.MeshBasicMaterial({
      map: ringTex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  ring.userData.chudikId = spec.id;
  bounce.add(ring);
  disposables.push(ring.geometry, ring.material, ringTex);

  let shown = 0;
  return {
    root,
    bounce,
    squash,
    eyes: [],
    pupils: [],
    ears: [],
    wings: [],
    tail: null,
    height: scale * 0.92,
    radius: scale * 0.42,
    setHatchLook(look) {
      const next = Math.max(0, Math.min(cracks.length, look.cracks));
      for (let i = 0; i < cracks.length; i += 1) {
        const crack = cracks[i];
        const on = i < next;
        crack.visible = on;
        if (on && i >= shown) crack.userData.pop = 1;
        const pop = typeof crack.userData.pop === 'number' ? crack.userData.pop : 0;
        crack.scale.setScalar(on ? 1 + pop * 0.45 : 1);
        crack.userData.pop = Math.max(0, pop - 0.05);
      }
      shown = next;
      if (ringCtx) {
        paintWaitRing(ringCtx, look.fill, look.spin, look.ready);
        ringTex.needsUpdate = true;
      }
      ring.rotation.z = look.ready ? 0 : look.spin * 0.15;
    },
    dispose() {
      for (const item of disposables) item.dispose();
    },
  };
}

function buildMeshyChudik(spec: ChudikSpec, drawing: DrawingData): ChudikRig {
  const root = new THREE.Group();
  root.name = `chudik:${spec.id}`;
  const bounce = new THREE.Group();
  const squash = new THREE.Group();
  root.add(bounce);
  bounce.add(squash);

  const scale = 2.5 * spec.size;
  const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  const holder = new THREE.Group();
  squash.add(holder);

  const placeholder = new THREE.Mesh(
    blobGeometry(scale * 0.28, new THREE.Vector3(1, 1.15, 0.95), 18),
    createToyMaterial({ color: drawing.sideColor, roughness: 0.62 }),
  );
  placeholder.position.y = scale * 0.32;
  placeholder.castShadow = true;
  holder.add(placeholder);
  disposables.push(placeholder.geometry, placeholder.material);

  const rig: ChudikRig = {
    root,
    bounce,
    squash,
    eyes: [],
    pupils: [],
    ears: [],
    wings: [],
    tail: null,
    height: scale * 1.05,
    radius: scale * 0.42,
    dispose() {
      cancelled = true;
      holder.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const mat of mats) mat.dispose();
        }
      });
      for (const item of disposables) item.dispose();
    },
  };

  let cancelled = false;
  void loadMeshyGltf(drawing.modelUrl!).then((gltf) => {
    if (cancelled) return;
    holder.clear();
    placeholder.geometry.dispose();
    if (placeholder.material instanceof THREE.Material) placeholder.material.dispose();
    const scene = gltf.scene;
    fitMeshyModel(scene, scale);
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      obj.userData.chudikId = spec.id;
    });
    holder.add(scene);
    const box = new THREE.Box3().setFromObject(holder);
    const size = box.getSize(new THREE.Vector3());
    rig.height = Math.max(scale * 0.6, size.y);
    rig.radius = Math.max(size.x, size.z) * 0.5;
  }).catch((error) => {
    console.warn('[meshy] glb failed, keeping clay', error);
  });

  return rig;
}

function fitMeshyModel(scene: THREE.Object3D, targetHeight: number) {
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
