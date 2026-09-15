import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { assetUrl } from '../../assetUrl';
import { quality } from '../render/quality';
import { stylize, trackRoughness } from '../render/stylized';
import { dressLotusWater } from '../world/cartoonWater';
import { isPackedFoliage } from './packFoliage';
import { flattenPackedScene, GLB_LOAD_BATCH, type PackedPrimitive } from './packModel';
import { disposeObjectResources, materialTextures, TextureDisposer } from './resourceDisposal';

export { GLB_LOAD_BATCH } from './packModel';

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
  {
    name: 'whimsy-isle',
    path: `${assetUrl('models/props/meadow/whimsy-isle.glb')}?v=raw`,
    mobilePath: `${assetUrl('models/props/meadow/whimsy-isle-mobile-gpu.glb')}?v=gpu1`,
  },
  { name: 'whimsywood-tree', path: assetUrl('models/props/meadow/whimsywood-tree.glb') },
  { name: 'blossom-tree', path: assetUrl('models/props/meadow/blossom-tree.glb') },
  { name: 'lantern-leaf-tree', path: assetUrl('models/props/meadow/lantern-leaf-tree.glb') },
  { name: 'luminous-canopy', path: `${assetUrl('models/props/meadow/luminous-canopy.glb')}?v=petals` },
  { name: 'whimsy-bloom-coral', path: `${assetUrl('models/props/meadow/whimsy-bloom-coral.glb')}?v=petals` },
  { name: 'blossomback-tortoise', path: `${assetUrl('models/props/meadow/blossomback-tortoise.glb')}?v=petals` },
  { name: 'pebble-blossom', path: `${assetUrl('models/props/meadow/pebble-blossom.glb')}?v=petals` },
  { name: 'moonlit-glow', path: `${assetUrl('models/props/meadow/moonlit-glow.glb')}?v=petals` },
  { name: 'spiral-garden', path: `${assetUrl('models/props/meadow/spiral-garden.glb')}?v=petals` },
  { name: 'acorn-cottage', path: assetUrl('models/props/meadow/acorn-cottage.glb') },
  { name: 'mushroom-lantern', path: assetUrl('models/props/meadow/mushroom-lantern.glb') },
  {
    name: 'floating-grassland',
    path: `${assetUrl('models/props/grove/floating-grassland.glb')}?v=raw`,
    mobilePath: `${assetUrl('models/props/grove/floating-grassland-mobile.glb')}?v=mobile1`,
  },
  {
    name: 'voxel-tree',
    path: `${assetUrl('models/props/grove/voxel-tree.glb')}?v=lod`,
    mobilePath: `${assetUrl('models/props/grove/voxel-tree-mobile.glb')}?v=mobile1`,
  },
  {
    name: 'voxel-blossom-tree',
    path: `${assetUrl('models/props/grove/voxel-blossom-tree.glb')}?v=lod`,
    mobilePath: `${assetUrl('models/props/grove/voxel-blossom-tree-mobile.glb')}?v=mobile1`,
  },
  {
    name: 'voxel-evergreen',
    path: `${assetUrl('models/props/grove/voxel-evergreen.glb')}?v=lod`,
    mobilePath: `${assetUrl('models/props/grove/voxel-evergreen-mobile.glb')}?v=mobile1`,
  },
  {
    name: 'voxel-blossom-canopy',
    path: `${assetUrl('models/props/grove/voxel-blossom-canopy.glb')}?v=lod`,
    mobilePath: `${assetUrl('models/props/grove/voxel-blossom-canopy-mobile.glb')}?v=mobile1`,
  },
  {
    name: 'voxel-bloom-garden',
    path: `${assetUrl('models/props/grove/voxel-bloom-garden.glb')}?v=lod`,
    mobilePath: `${assetUrl('models/props/grove/voxel-bloom-garden-mobile.glb')}?v=mobile1`,
  },
  {
    name: 'voxel-verdant-garden',
    path: `${assetUrl('models/props/grove/voxel-verdant-garden.glb')}?v=lod`,
    mobilePath: `${assetUrl('models/props/grove/voxel-verdant-garden-mobile.glb')}?v=mobile1`,
  },
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

export type IdyllicPrimitive = PackedPrimitive;

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
  private ktx2?: KTX2Loader;
  private inflight = new Map<string, Promise<void>>();
  private ownedTextures = new Set<THREE.Texture>();
  private textureDisposer = new TextureDisposer();
  private controller = new AbortController();
  private disposed = false;
  private unlinkAbort?: () => void;

  static async load(
    onProgress?: (done: number, total: number) => void,
    preload: readonly string[] = ['floating-island'],
    signal?: AbortSignal,
    renderer?: THREE.WebGLRenderer,
  ): Promise<IdyllicLibrary> {
    const library = new IdyllicLibrary();
    library.attachDecoders(renderer);
    const abort = () => library.dispose();
    signal?.addEventListener('abort', abort, { once: true });
    library.unlinkAbort = () => signal?.removeEventListener('abort', abort);
    if (signal?.aborted) library.dispose();
    try {
      const response = await fetch(`${MODEL_PATH}/manifest.json`, { signal: library.controller.signal });
      if (!response.ok) throw new Error('[idyllic] manifest.json is missing; run export-idyllic-glb.py');
      library.manifest = (await response.json()) as Manifest;
      await library.ensureAll(preload, onProgress);
      library.assertActive();
      return library;
    } catch (error) {
      library.dispose();
      throw error;
    }
  }

  private attachDecoders(renderer?: THREE.WebGLRenderer) {
    this.loader.setMeshoptDecoder(MeshoptDecoder);
    if (!renderer) return;
    const ktx2 = new KTX2Loader();
    ktx2.setTranscoderPath(assetUrl('basis/'));
    ktx2.detectSupport(renderer);
    this.loader.setKTX2Loader(ktx2);
    this.ktx2 = ktx2;
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
    this.assertActive();
    const wanted = [...new Set(names)].filter((name) => this.canLoad(name));
    let done = 0;
    const batchSize = GLB_LOAD_BATCH;
    for (let i = 0; i < wanted.length; i += batchSize) {
      await Promise.all(
        wanted.slice(i, i + batchSize).map(async (name) => {
          try {
            await this.ensure(name);
          } finally {
            if (!this.disposed) onProgress?.(++done, wanted.length);
          }
        }),
      );
    }
  }

  async ensure(name: string): Promise<void> {
    this.assertActive();
    if (this.models.has(name)) return;
    const pending = this.inflight.get(name);
    if (pending) return pending;
    const task = this.loadOne(name).finally(() => this.inflight.delete(name));
    this.inflight.set(name, task);
    return task;
  }

  private async loadOne(name: string): Promise<void> {
    const extra = EXTRA_MODELS.find((item) => item.name === name);
    let scene: THREE.Object3D | undefined;
    try {
      // GLTFLoader.loadAsync does not expose cancellation. Own the network
      // request so a world switch stops fetching a 100 MB shell immediately.
      const path = extra ? extraModelPath(extra) : `${MODEL_PATH}/${name}.glb`;
      const response = await fetch(path, { signal: this.controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${path}`);
      const buffer = await response.arrayBuffer();
      this.assertActive();
      const gltf = await this.loader.parseAsync(buffer, path.slice(0, path.lastIndexOf('/') + 1));
      scene = gltf.scene;
      this.assertActive();
      // Flattening clones geometry/materials but shares their maps. Keep all
      // embedded maps alive until the library's last consumer is gone.
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.material) return;
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          for (const texture of materialTextures(material)) this.ownedTextures.add(texture);
        }
      });
      this.models.set(name, extra ? this.flattenPacked(name, scene) : this.flatten(name, scene));
    } catch (error) {
      if (this.disposed) throw this.controller.signal.reason;
      console.warn(`[idyllic] could not load ${name}`, error);
    } finally {
      if (scene) {
        disposeObjectResources(scene, { textures: this.disposed, textureDisposer: this.textureDisposer });
      }
    }
  }

  private assertActive() {
    this.controller.signal.throwIfAborted();
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
    this.assertActive();
    const file = this.manifest.ground[key];
    if (!file) return null;
    const texture = this.texture(file, key.endsWith('_normal'));
    const clone = texture.clone();
    clone.needsUpdate = true;
    clone.wrapS = THREE.RepeatWrapping;
    clone.wrapT = THREE.RepeatWrapping;
    clone.repeat.set(repeat, repeat);
    this.ownedTextures.add(clone);
    return clone;
  }

  /** Keeps a packed GLB material instead of swapping it for a pack atlas. */
  private keepMaterial(source: THREE.Material, modelName: string): THREE.MeshStandardMaterial {
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
    const foliage = isPackedFoliage(modelName);
    // Meshy canopies are leaf cards. Front-only + no bleed turns the
    // camera-facing underside into a black blob on the phone.
    if (foliage) {
      material.side = THREE.DoubleSide;
      material.shadowSide = THREE.DoubleSide;
    }
    stylize(material, { translucent: foliage });
    trackRoughness(material);
    this.materials.set(material.uuid, material);
    return material;
  }

  /** The shared material for a named manifest entry, e.g. 'idy_bridge_wood'. */
  material(name: string): THREE.MeshStandardMaterial {
    this.assertActive();
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

    const texture = new THREE.TextureLoader().load(`${TEXTURE_PATH}/${file}`, (loaded) => {
      if (this.disposed) this.textureDisposer.dispose(loaded);
    });
    if (!nonColor) texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    this.textures.set(file, texture);
    this.ownedTextures.add(texture);
    return texture;
  }

  /**
   * Packed extras keep loader attribute types. Centering lives on
   * primitive.matrix — see packModel.ts.
   */
  private flattenPacked(name: string, scene: THREE.Object3D): IdyllicModel {
    return flattenPackedScene(
      name,
      scene,
      (source) => this.keepMaterial(source, name),
      (modelName, material) => {
        if (modelName === 'lotus-pond') dressLotusWater(material);
      },
    );
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
        material: keepMaterials ? this.keepMaterial(bucket.source, name) : this.material(materialName),
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
    if (this.disposed) return;
    this.disposed = true;
    this.controller.abort();
    this.unlinkAbort?.();
    this.unlinkAbort = undefined;
    for (const model of this.models.values()) {
      for (const primitive of model.primitives) primitive.geometry.dispose();
    }
    for (const material of this.materials.values()) material.dispose();
    for (const texture of this.ownedTextures) this.textureDisposer.dispose(texture);
    this.models.clear();
    this.materials.clear();
    this.textures.clear();
    this.ownedTextures.clear();
    this.inflight.clear();
    this.ktx2?.dispose();
    this.ktx2 = undefined;
  }
}

type ExtraModel = (typeof EXTRA_MODELS)[number];

const ROOT_MOBILE_MODELS = new Set([
  'giant-tree',
  'rustic-bench',
  'red-mushroom',
  'sunlit-canopy',
  'verdant-glow',
  'mosslit-stones',
  'garden-blooms',
  'neon-leaves',
  'vibrant-bloom',
  'blooming-bush',
  'harvest-cradle',
  'emerald-cascade',
  'wooden-fence',
  'lotus-pond',
  'timber-bridge',
  'mossy-burrow',
  'garden-gate',
  'mossflower-hollow',
  'wooden-lantern',
]);

const MEADOW_MOBILE_MODELS = new Set([
  'whimsywood-tree',
  'blossom-tree',
  'lantern-leaf-tree',
  'luminous-canopy',
  'whimsy-bloom-coral',
  'blossomback-tortoise',
  'pebble-blossom',
  'moonlit-glow',
  'spiral-garden',
  'acorn-cottage',
  'mushroom-lantern',
]);

/** Mobile files keep the same texture and silhouette with phone-sized geometry. */
function extraModelPath(extra: ExtraModel): string {
  if (quality().tier !== 'low') return extra.path;
  let mobilePath = 'mobilePath' in extra ? extra.mobilePath : undefined;
  if (!mobilePath && extra.name === 'floating-island') {
    mobilePath = `${assetUrl('models/props/floating-island-gpu.glb')}?v=gpu1`;
  }
  if (!mobilePath && ROOT_MOBILE_MODELS.has(extra.name)) {
    mobilePath = `${assetUrl(`models/props/mobile/${extra.name}-gpu.glb`)}?v=gpu1`;
  }
  if (!mobilePath && MEADOW_MOBILE_MODELS.has(extra.name)) {
    mobilePath = `${assetUrl(`models/props/meadow/mobile/${extra.name}.glb`)}?v=mobile1`;
  }
  if (!mobilePath) return extra.path;
  try {
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('assetLod') === 'full') {
      return extra.path;
    }
  } catch {
    /* SSR/tests */
  }
  return mobilePath;
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
