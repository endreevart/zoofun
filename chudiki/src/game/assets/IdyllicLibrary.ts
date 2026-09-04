import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from '../../assetUrl';
import { stylize, trackRoughness } from '../render/stylized';
import { dressLotusWater } from '../world/cartoonWater';

/**
 * Loads the Idyllic Fantasy Nature assets exported by
 * scripts/export-idyllic-glb.py.
 *
 * The GLBs carry geometry only. The pack's foliage atlases are greyscale masks
 * whose colour comes entirely from a vertical Bottom_Color -> Top_Color tint;
 * that tint is baked into COLOR_0 at export time, which glTF multiplies into
 * base colour, so no custom shader is needed here. Textures and the remaining
 * material parameters come from the manifest, which lets dozens of assets share
 * a handful of texture uploads.
 */

const MODEL_PATH = assetUrl('models/idyllic');
const TEXTURE_PATH = assetUrl('textures/idyllic');

/** Self-contained GLBs (Meshy etc.) that keep their own textures. */
const EXTRA_MODELS = [
  { name: 'giant-tree', path: assetUrl('models/props/giant-tree.glb') },
  { name: 'rustic-bench', path: assetUrl('models/props/rustic-bench.glb') },
  { name: 'red-mushroom', path: assetUrl('models/props/red-mushroom.glb') },
  { name: 'sunlit-canopy', path: assetUrl('models/props/sunlit-canopy.glb') },
  { name: 'verdant-glow', path: assetUrl('models/props/verdant-glow.glb') },
  { name: 'mosslit-stones', path: assetUrl('models/props/mosslit-stones.glb') },
  { name: 'garden-blooms', path: assetUrl('models/props/garden-blooms.glb') },
  { name: 'neon-leaves', path: assetUrl('models/props/neon-leaves.glb') },
  { name: 'vibrant-bloom', path: assetUrl('models/props/vibrant-bloom.glb') },
  { name: 'neon-bloom', path: assetUrl('models/props/neon-bloom.glb') },
  { name: 'blooming-bush', path: assetUrl('models/props/blooming-bush.glb') },
  { name: 'harvest-cradle', path: assetUrl('models/props/harvest-cradle.glb') },
  { name: 'emerald-cascade', path: assetUrl('models/props/emerald-cascade.glb') },
  { name: 'wooden-fence', path: assetUrl('models/props/wooden-fence.glb') },
  { name: 'floating-island', path: assetUrl('models/props/floating-island.glb') },
  { name: 'lotus-pond', path: assetUrl('models/props/lotus-pond.glb') },
  { name: 'timber-bridge', path: assetUrl('models/props/timber-bridge.glb') },
  { name: 'mossy-burrow', path: assetUrl('models/props/mossy-burrow.glb') },
  { name: 'garden-gate', path: `${assetUrl('models/props/garden-gate.glb')}?feet=1` },
  { name: 'mossflower-hollow', path: assetUrl('models/props/mossflower-hollow.glb') },
  { name: 'wooden-lantern', path: assetUrl('models/props/wooden-lantern.glb') },
];

type MaterialSpec = {
  map: string;
  normalMap: string;
  color: [number, number, number];
  roughness: number;
  alphaTest: number;
  doubleSide: boolean;
};

type Manifest = {
  models: string[];
  materials: Record<string, MaterialSpec>;
  ground: Record<string, string>;
};

export type IdyllicPrimitive = {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  materialName: string;
};

export type IdyllicModel = {
  name: string;
  primitives: IdyllicPrimitive[];
  /** Bounding size after centring, so callers can scale by target height. */
  size: THREE.Vector3;
};

export class IdyllicLibrary {
  private models = new Map<string, IdyllicModel>();
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private textures = new Map<string, THREE.Texture>();
  private manifest!: Manifest;
  private loader = new GLTFLoader();
  private inflight = new Map<string, Promise<void>>();

  static async load(
    onProgress?: (done: number, total: number) => void,
    preload: readonly string[] = ['floating-island'],
  ): Promise<IdyllicLibrary> {
    const library = new IdyllicLibrary();
    const response = await fetch(`${MODEL_PATH}/manifest.json`);
    if (!response.ok) throw new Error('[idyllic] manifest.json is missing; run export-idyllic-glb.py');
    library.manifest = (await response.json()) as Manifest;
    await library.ensureAll(preload, onProgress);
    return library;
  }

  canLoad(name: string): boolean {
    return this.manifest.models.includes(name) || EXTRA_MODELS.some((extra) => extra.name === name);
  }

  has(name: string): boolean {
    return this.models.has(name);
  }

  /** Fetch any missing GLBs. Safe to call twice; already-loaded names no-op. */
  async ensureAll(
    names: readonly string[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<void> {
    const wanted = [...new Set(names)].filter((name) => this.canLoad(name));
    let done = 0;
    const batchSize = 8;
    for (let i = 0; i < wanted.length; i += batchSize) {
      await Promise.all(
        wanted.slice(i, i + batchSize).map(async (name) => {
          try {
            await this.ensure(name);
          } finally {
            onProgress?.(++done, wanted.length);
          }
        }),
      );
    }
  }

  async ensure(name: string): Promise<void> {
    if (this.models.has(name)) return;
    const pending = this.inflight.get(name);
    if (pending) return pending;
    const task = this.loadOne(name).finally(() => this.inflight.delete(name));
    this.inflight.set(name, task);
    return task;
  }

  private async loadOne(name: string): Promise<void> {
    const extra = EXTRA_MODELS.find((item) => item.name === name);
    try {
      if (extra) {
        const gltf = await this.loader.loadAsync(extra.path);
        this.models.set(name, this.flattenPacked(name, gltf.scene));
        return;
      }
      const gltf = await this.loader.loadAsync(`${MODEL_PATH}/${name}.glb`);
      this.models.set(name, this.flatten(name, gltf.scene));
    } catch (error) {
      console.warn(`[idyllic] could not load ${name}`, error);
    }
  }

  get(name: string): IdyllicModel {
    const model = this.models.get(name);
    if (!model) throw new Error(`[idyllic] model "${name}" was not loaded`);
    return model;
  }

  /** Names that loaded, filtered to a prefix — used to build variant pools. */
  variants(prefix: string): string[] {
    return [...this.models.keys()].filter((name) => name.startsWith(prefix)).sort();
  }

  /** A ground/structure texture from the manifest, e.g. 'grass_albedo'. */
  groundTexture(key: string, repeat = 1): THREE.Texture | null {
    const file = this.manifest.ground[key];
    if (!file) return null;
    const texture = this.texture(file, key.endsWith('_normal'));
    const clone = texture.clone();
    clone.needsUpdate = true;
    clone.wrapS = THREE.RepeatWrapping;
    clone.wrapT = THREE.RepeatWrapping;
    clone.repeat.set(repeat, repeat);
    return clone;
  }

  /** Keeps a packed GLB material instead of swapping it for a pack atlas. */
  private keepMaterial(source: THREE.Material): THREE.MeshStandardMaterial {
    const material =
      source instanceof THREE.MeshStandardMaterial
        ? source.clone()
        : new THREE.MeshStandardMaterial({
            color: (source as THREE.MeshBasicMaterial).color?.clone() ?? new THREE.Color(0xffffff),
            map: (source as THREE.MeshBasicMaterial).map ?? null,
            roughness: 0.82,
            metalness: 0,
          });
    material.vertexColors = false;
    if (material.map) material.map.colorSpace = THREE.SRGBColorSpace;
    material.roughness = Math.max(material.roughness, 0.72);
    stylize(material, { translucent: false });
    trackRoughness(material);
    this.materials.set(material.uuid, material);
    return material;
  }

  /** The shared material for a named manifest entry, e.g. 'idy_bridge_wood'. */
  material(name: string): THREE.MeshStandardMaterial {
    const existing = this.materials.get(name);
    if (existing) return existing;

    const spec = this.manifest.materials[name];
    // Every Idyllic geometry is given a COLOR_0 attribute (white where no
    // gradient was baked), so vertex colours can be on unconditionally instead
    // of depending on which model happened to create the shared material first.
    const material = new THREE.MeshStandardMaterial({ metalness: 0, vertexColors: true });
    material.name = name;

    if (!spec) {
      console.warn(`[idyllic] no manifest entry for material "${name}"`);
      material.color.setRGB(0.7, 0.7, 0.7);
      this.materials.set(name, material);
      return material;
    }

    material.color.setRGB(spec.color[0], spec.color[1], spec.color[2]);
    material.roughness = spec.roughness;
    if (spec.map) material.map = this.texture(spec.map, false);
    if (spec.normalMap) material.normalMap = this.texture(spec.normalMap, true);

    if (spec.alphaTest > 0) {
      // Hard cutout, never blending: alpha-blended foliage sorts badly and
      // leaves translucent halos around every leaf card.
      material.alphaTest = spec.alphaTest;
      material.transparent = false;
      material.depthWrite = true;
    }
    material.side = spec.doubleSide ? THREE.DoubleSide : THREE.FrontSide;
    // Leaf cards are single-sided geometry lit from both sides; without this the
    // half of every canopy facing away from the sun renders black.
    if (spec.doubleSide) material.shadowSide = THREE.DoubleSide;

    // Rim lp trees sit next to painted Meshy canopies. A warm multiply stops
    // the vertex-colour crowns reading as a different, colder game.
    if (name === 'idy_lowpoly') {
      material.color.setRGB(1.08, 0.96, 0.78);
      material.roughness = 0.82;
    }

    // Cut-out cards and the solid low-poly crowns both count as foliage: the
    // translucency slider has to reach the trees the child actually looks at.
    // Bark, rock and painted wood stay opaque so they do not glow from inside.
    stylize(material, { translucent: spec.alphaTest > 0 || name === 'idy_lowpoly' });
    trackRoughness(material);

    this.materials.set(name, material);
    return material;
  }

  private texture(file: string, nonColor: boolean): THREE.Texture {
    const cached = this.textures.get(file);
    if (cached) return cached;

    const texture = new THREE.TextureLoader().load(`${TEXTURE_PATH}/${file}`);
    if (!nonColor) texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    this.textures.set(file, texture);
    return texture;
  }

  /**
   * Collapses a GLB into one primitive per material, in world space, with the
   * footprint centred on the origin and the base at y = 0.
   */
  private flattenPacked(name: string, scene: THREE.Object3D): IdyllicModel {
    scene.updateMatrixWorld(true);
    const primitives: IdyllicPrimitive[] = [];

    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const geometry = mesh.geometry.clone();
      geometry.applyMatrix4(mesh.matrixWorld);
      if (name === 'wooden-lantern') geometry.rotateX(Math.PI / 2);
      if (name === 'garden-gate') standGardenGate(geometry);
      if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
      const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (!source) return;
      const material = this.keepMaterial(source);
      if (name === 'lotus-pond') dressLotusWater(material);
      primitives.push({
        geometry,
        material,
        materialName: source.name || name,
      });
    });

    return this.centerPrimitives(name, primitives);
  }

  private flatten(name: string, scene: THREE.Object3D, keepMaterials = false): IdyllicModel {
    scene.updateMatrixWorld(true);

    const byMaterial = new Map<string, { source: THREE.Material; geometries: THREE.BufferGeometry[] }>();
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const groups = mesh.geometry.groups.length
        ? mesh.geometry.groups
        : [{ start: 0, count: Infinity, materialIndex: 0 }];

      for (const group of groups) {
        const source = materials[group.materialIndex ?? 0];
        if (!source) continue;
        const slice = sliceGroup(mesh.geometry, group);
        slice.applyMatrix4(mesh.matrixWorld);
        const key = keepMaterials ? `keep:${source.uuid}` : source.name;
        const bucket = byMaterial.get(key) ?? { source, geometries: [] };
        bucket.geometries.push(slice);
        byMaterial.set(key, bucket);
      }
    });

    const primitives: IdyllicPrimitive[] = [];
    for (const [materialName, bucket] of byMaterial) {
      const merged =
        bucket.geometries.length === 1 ? bucket.geometries[0] : mergeGeometries(bucket.geometries);
      if (!merged.getAttribute('normal')) merged.computeVertexNormals();
      if (!keepMaterials && !merged.getAttribute('color')) {
        const count = merged.getAttribute('position').count;
        merged.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3));
      }
      primitives.push({
        geometry: merged,
        material: keepMaterials ? this.keepMaterial(bucket.source) : this.material(materialName),
        materialName,
      });
    }

    return this.centerPrimitives(name, primitives);
  }

  private centerPrimitives(name: string, primitives: IdyllicPrimitive[]): IdyllicModel {
    const box = new THREE.Box3();
    for (const primitive of primitives) {
      primitive.geometry.computeBoundingBox();
      box.union(primitive.geometry.boundingBox!);
    }
    const offset = new THREE.Vector3(
      -(box.min.x + box.max.x) / 2,
      -box.min.y,
      -(box.min.z + box.max.z) / 2,
    );
    for (const primitive of primitives) {
      primitive.geometry.translate(offset.x, offset.y, offset.z);
      primitive.geometry.computeBoundingBox();
    }

    const size = new THREE.Vector3();
    box.getSize(size);
    return { name, primitives, size };
  }

  dispose() {
    for (const model of this.models.values()) {
      for (const primitive of model.primitives) primitive.geometry.dispose();
    }
    for (const material of this.materials.values()) material.dispose();
    for (const texture of this.textures.values()) texture.dispose();
    this.models.clear();
    this.materials.clear();
    this.textures.clear();
  }
}

/**
 * Put the arch on its two posts. Meshy and Blender glTF disagree about Y-up,
 * so we do not trust a baked rotation: find the wide end (feet) and the narrow
 * end (crown), then rotate until feet sit at min Y.
 */
function standGardenGate(geometry: THREE.BufferGeometry) {
  const pos = geometry.getAttribute('position');
  if (!pos) return;
  const point = new THREE.Vector3();
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < pos.count; i++) {
    point.fromBufferAttribute(pos, i);
    min.min(point);
    max.max(point);
  }
  const size = max.clone().sub(min);

  const endSpread = (axis: 0 | 1 | 2, high: boolean) => {
    const lo = min.getComponent(axis);
    const span = size.getComponent(axis) || 1;
    const edge = high ? lo + span * 0.92 : lo + span * 0.08;
    const a = ((axis + 1) % 3) as 0 | 1 | 2;
    const b = ((axis + 2) % 3) as 0 | 1 | 2;
    let minA = Infinity;
    let maxA = -Infinity;
    let minB = Infinity;
    let maxB = -Infinity;
    let hits = 0;
    for (let i = 0; i < pos.count; i++) {
      point.fromBufferAttribute(pos, i);
      const t = point.getComponent(axis);
      if (high ? t < edge : t > edge) continue;
      hits++;
      const va = point.getComponent(a);
      const vb = point.getComponent(b);
      if (va < minA) minA = va;
      if (va > maxA) maxA = va;
      if (vb < minB) minB = vb;
      if (vb > maxB) maxB = vb;
    }
    if (hits < 8) return 0;
    return maxA - minA + (maxB - minB);
  };

  let axis: 0 | 1 | 2 = 1;
  let score = -1;
  let feetHigh = false;
  for (const candidate of [0, 1, 2] as const) {
    const low = endSpread(candidate, false);
    const high = endSpread(candidate, true);
    const contrast = Math.abs(high - low);
    if (contrast > score) {
      score = contrast;
      axis = candidate;
      feetHigh = high > low;
    }
  }

  if (axis === 1) {
    if (feetHigh) geometry.rotateZ(Math.PI);
    return;
  }
  if (axis === 2) {
    geometry.rotateX(feetHigh ? Math.PI / 2 : -Math.PI / 2);
    return;
  }
  geometry.rotateZ(feetHigh ? -Math.PI / 2 : Math.PI / 2);
}

const ATTRIBUTES = ['position', 'normal', 'uv', 'color'] as const;

function sliceGroup(
  source: THREE.BufferGeometry,
  group: { start: number; count: number },
): THREE.BufferGeometry {
  const flat = source.index ? source.toNonIndexed() : source.clone();
  const total = flat.getAttribute('position').count;
  const start = group.start;
  const count = group.count === Infinity ? total - start : Math.min(group.count, total - start);
  if (start === 0 && count === total) return flat;

  const sliced = new THREE.BufferGeometry();
  for (const name of ATTRIBUTES) {
    const attribute = flat.getAttribute(name) as THREE.BufferAttribute | undefined;
    if (!attribute) continue;
    const array = (attribute.array as Float32Array).slice(
      start * attribute.itemSize,
      (start + count) * attribute.itemSize,
    );
    sliced.setAttribute(name, new THREE.BufferAttribute(array, attribute.itemSize));
  }
  flat.dispose();
  return sliced;
}

function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let vertexCount = 0;
  for (const geometry of geometries) vertexCount += geometry.getAttribute('position').count;

  const sizes: Record<string, number> = { position: 3, normal: 3, uv: 2, color: 3 };
  const present = ATTRIBUTES.filter((name) => geometries.some((g) => g.getAttribute(name)));
  const buffers = new Map<string, Float32Array>();
  for (const name of present) buffers.set(name, new Float32Array(vertexCount * sizes[name]));

  let offset = 0;
  for (const geometry of geometries) {
    const count = geometry.getAttribute('position').count;
    for (const name of present) {
      const target = buffers.get(name)!;
      const attribute = geometry.getAttribute(name) as THREE.BufferAttribute | undefined;
      if (attribute) {
        target.set(attribute.array as Float32Array, offset * sizes[name]);
      } else if (name === 'color') {
        // A mesh without vertex colours must contribute white, or the merge
        // would multiply its share of the model down to black.
        target.fill(1, offset * 3, (offset + count) * 3);
      }
    }
    offset += count;
    geometry.dispose();
  }

  const merged = new THREE.BufferGeometry();
  for (const name of present) {
    merged.setAttribute(name, new THREE.BufferAttribute(buffers.get(name)!, sizes[name]));
  }
  return merged;
}
