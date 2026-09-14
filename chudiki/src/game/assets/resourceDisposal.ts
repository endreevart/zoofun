import * as THREE from 'three';

/** Texture slots belong to the material; shader uniforms may be shared globally. */
export function materialTextures(material: THREE.Material): THREE.Texture[] {
  return Object.values(material).filter(
    (value): value is THREE.Texture => Boolean(value?.isTexture),
  );
}

/** Release owned GPU textures and their decoded images once, even for cloned maps. */
export class TextureDisposer {
  private textures = new WeakSet<THREE.Texture>();
  private images = new WeakSet<object>();

  dispose(texture: THREE.Texture) {
    if (!this.textures.has(texture)) {
      this.textures.add(texture);
      texture.dispose();
    }

    // A TextureLoader can finish after the owner is disposed. Look at the image
    // again on that callback even if this texture's GPU allocation was released.
    const image = texture.source?.data as { close?: () => void } | undefined;
    if (!image || typeof image.close !== 'function' || this.images.has(image)) return;
    // Cache can hand the same ImageBitmap to a later world. It then owns the
    // decoded image's lifetime, even if someone has since disabled the cache.
    if (THREE.Cache.enabled || Object.values(THREE.Cache.files).includes(image)) return;
    this.images.add(image);
    image.close();
  }
}

/**
 * Dispose a scene owned by the caller. Set textures:false when its texture maps
 * were transferred to cloned materials. Does not follow custom shader uniforms.
 */
export function disposeObjectResources(
  root: THREE.Object3D,
  options: { textures?: boolean; textureDisposer?: TextureDisposer } = {},
) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const skeletons = new Set<THREE.Skeleton>();
  const textureDisposer = options.textureDisposer ?? new TextureDisposer();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) {
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        materials.add(material);
      }
    }
    // Instance attributes and skeleton bone textures are not owned by geometry.
    if ((object as THREE.InstancedMesh).isInstancedMesh) (object as THREE.InstancedMesh).dispose();
    const skinned = object as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh && skinned.skeleton) skeletons.add(skinned.skeleton);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) {
    if (options.textures !== false) {
      for (const texture of materialTextures(material)) textureDisposer.dispose(texture);
    }
    material.dispose();
  }
  for (const skeleton of skeletons) skeleton.dispose();
}
