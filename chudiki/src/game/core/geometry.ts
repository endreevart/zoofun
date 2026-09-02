import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { stylize, trackRoughness } from '../render/stylized';

/**
 * Helpers for building the world out of many small painted shapes and then
 * collapsing them into a handful of draw calls.
 */

export type Paintable = {
  geometry: THREE.BufferGeometry;
  color: THREE.ColorRepresentation;
  position?: THREE.Vector3;
  rotation?: THREE.Euler;
  scale?: THREE.Vector3 | number;
};

const scratchColor = new THREE.Color();
const scratchMatrix = new THREE.Matrix4();
const scratchQuat = new THREE.Quaternion();
const scratchScale = new THREE.Vector3();

/** Guarantees the attribute set that `mergeGeometries` needs. */
function normalizeAttributes(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!g.getAttribute('uv')) {
    const count = g.getAttribute('position').count;
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
  const wanted = ['position', 'normal', 'uv', 'color'];
  for (const name of Object.keys(g.attributes)) {
    if (!wanted.includes(name)) g.deleteAttribute(name);
  }
  return g;
}

function applyVertexColor(geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation) {
  scratchColor.set(color).convertSRGBToLinear();
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3 + 0] = scratchColor.r;
    colors[i * 3 + 1] = scratchColor.g;
    colors[i * 3 + 2] = scratchColor.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/**
 * Bakes a list of coloured, transformed shapes into one geometry with vertex
 * colours. Source geometries are disposed unless they are shared templates.
 */
export function bakePaintables(parts: Paintable[], disposeSources = true): THREE.BufferGeometry {
  const prepared: THREE.BufferGeometry[] = [];

  for (const part of parts) {
    const g = normalizeAttributes(part.geometry.clone());
    applyVertexColor(g, part.color);

    const scale =
      typeof part.scale === 'number'
        ? scratchScale.setScalar(part.scale)
        : (part.scale ?? scratchScale.set(1, 1, 1));
    scratchQuat.setFromEuler(part.rotation ?? new THREE.Euler());
    scratchMatrix.compose(part.position ?? new THREE.Vector3(), scratchQuat, scale);
    g.applyMatrix4(scratchMatrix);

    prepared.push(g);
    if (disposeSources) part.geometry.dispose();
  }

  const merged = mergeGeometries(prepared, false);
  for (const g of prepared) g.dispose();
  if (!merged) throw new Error('bakePaintables: geometry merge failed');
  merged.computeBoundingSphere();
  return merged;
}

/** The single shared look of every baked prop: matte, soft, unlit-highlight free. */
export function createToyMaterial(options: {
  vertexColors?: boolean;
  roughness?: number;
  color?: THREE.ColorRepresentation;
  flatShading?: boolean;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  map?: THREE.Texture | null;
  normalMap?: THREE.Texture | null;
  normalScale?: number;
  /** Thin surfaces let light through. Default true; ground and stone do not. */
  translucent?: boolean;
}): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: options.vertexColors ?? false,
    color: options.color ?? 0xffffff,
    roughness: options.roughness ?? 0.72,
    metalness: 0,
    flatShading: options.flatShading ?? false,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    side: options.side ?? THREE.FrontSide,
    map: options.map ?? null,
    normalMap: options.normalMap ?? null,
  });
  if (options.normalMap && options.normalScale !== undefined) {
    material.normalScale.setScalar(options.normalScale);
  }
  // Creatures are the one thing the child looks at directly, so they get both
  // the rim and the light bleeding through ears, fins and petal-thin bits.
  // Ground and structures pass `translucent: false`: they are not thin, and
  // making them bleed is exactly the lit-from-inside plastic look being fixed.
  stylize(material, { translucent: options.translucent ?? true });
  trackRoughness(material);
  return material;
}

/** A blob: sphere with per-axis squash, the building block of this whole world. */
export function blobGeometry(
  radius: number,
  squash: THREE.Vector3,
  segments = 20,
): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(radius, segments, Math.max(8, Math.round(segments * 0.7)));
  g.scale(squash.x, squash.y, squash.z);
  return g;
}

/** Irregular lump used for rocks and terrain mounds. */
export function lumpGeometry(
  radius: number,
  detail: number,
  jitter: number,
  random: () => number,
): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const seen = new Map<string, THREE.Vector3>();
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    let offset = seen.get(key);
    if (!offset) {
      offset = new THREE.Vector3(
        (random() - 0.5) * jitter,
        (random() - 0.5) * jitter,
        (random() - 0.5) * jitter,
      );
      seen.set(key, offset);
    }
    pos.setXYZ(i, v.x + offset.x, v.y + offset.y, v.z + offset.z);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/**
 * Flat ribbon following a curve, used for the dirt roads.
 *
 * It is segmented across its width as well as along its length: with a single
 * quad per step, a bump in the middle of the road pokes straight through the
 * surface and the path disappears into the grass.
 */
export function ribbonGeometry(
  curve: THREE.Curve<THREE.Vector3>,
  steps: number,
  halfWidth: (t: number) => number,
  heightAt: (x: number, z: number) => number,
  lift: number,
  lateral = 5,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const point = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const columns = lateral + 1;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    curve.getPointAt(t, point);
    curve.getTangentAt(t, tangent);
    side.crossVectors(tangent, up).normalize().multiplyScalar(halfWidth(t));

    for (let j = 0; j <= lateral; j++) {
      const u = (j / lateral) * 2 - 1;
      const x = point.x + side.x * u;
      const z = point.z + side.z * u;
      positions.push(x, heightAt(x, z) + lift, z);
      uvs.push(j / lateral, t * steps * 0.08);
    }

    if (i < steps) {
      for (let j = 0; j < lateral; j++) {
        const a = i * columns + j;
        const b = a + 1;
        const c = a + columns;
        const d = c + 1;
        // Wound so the face normal points up; the other way round the whole
        // road gets back-face culled and vanishes into the lawn.
        indices.push(a, b, c, b, d, c);
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/**
 * Closed irregular outline (pond, flowerbed) as a filled horizontal mesh.
 * `wobble` breaks the circle so nothing looks machine-made.
 */
export function blobOutline(
  radiusX: number,
  radiusZ: number,
  points: number,
  wobble: number,
  random: () => number,
): THREE.Vector2[] {
  const offsets: number[] = [];
  for (let i = 0; i < points; i++) offsets.push(1 + (random() - 0.5) * wobble);

  const smoothed = offsets.map((_, i) => {
    const prev = offsets[(i - 1 + points) % points];
    const next = offsets[(i + 1) % points];
    return (prev + offsets[i] * 2 + next) / 4;
  });

  return smoothed.map((r, i) => {
    const angle = (i / points) * Math.PI * 2;
    return new THREE.Vector2(Math.cos(angle) * radiusX * r, Math.sin(angle) * radiusZ * r);
  });
}

export function outlineToHorizontalMesh(outline: THREE.Vector2[]): THREE.BufferGeometry {
  const shape = new THREE.Shape(outline);
  const g = new THREE.ShapeGeometry(shape, 12);
  g.rotateX(-Math.PI / 2);
  return g;
}

export function pointInOutline(outline: THREE.Vector2[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[i];
    const b = outline[j];
    if (a.y > z !== b.y > z && x < ((b.x - a.x) * (z - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}
