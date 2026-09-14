import * as THREE from 'three';

export type ContactShadowProp = {
  model: string;
  x: number;
  z: number;
  height: number;
};

/**
 * Fake ground umbra for hanging Meshy lawns. Real shadow maps wash out on
 * the bright painted grass; a cheap disc still reads as volume.
 */

export function contactShadowOffset(
  azimuthDeg: number,
  length = 0.7,
): { x: number; z: number } {
  const azimuth = THREE.MathUtils.degToRad(azimuthDeg);
  return {
    x: Math.sin(azimuth) * length,
    z: -Math.cos(azimuth) * length,
  };
}

export function contactShadowRadius(height: number, footprint: number): number {
  return THREE.MathUtils.clamp(Math.max(height * 0.42, footprint * 0.48), 0.9, 5.2);
}

export function buildContactShadows(
  props: ContactShadowProp[],
  sizeOf: (model: string) => { x: number; y: number; z: number } | undefined,
  groundAt: (x: number, z: number) => number,
  azimuthDeg: number,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'contact-shadows';
  const spots = props.filter((prop) => sizeOf(prop.model));
  if (!spots.length) return group;

  const geometry = new THREE.CircleGeometry(1, 24);
  geometry.rotateX(-Math.PI / 2);
  const blob = blobTexture();
  const material = new THREE.MeshBasicMaterial({
    map: blob,
    transparent: true,
    depthWrite: false,
    fog: true,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, spots.length);
  mesh.name = 'contact-shadows:discs';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 1;

  const offset = contactShadowOffset(azimuthDeg);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();

  spots.forEach((prop, index) => {
    const size = sizeOf(prop.model)!;
    const radius = contactShadowRadius(prop.height, Math.max(size.x, size.z));
    const stretch = Math.max(prop.height * 0.1, 0.45);
    const x = prop.x + offset.x * stretch;
    const z = prop.z + offset.z * stretch;
    position.set(x, groundAt(x, z) + 0.08, z);
    scale.set(radius, 1, radius * 0.82);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
  return group;
}

export function disposeContactShadows(root: THREE.Object3D) {
  const group = root.getObjectByName('contact-shadows');
  if (!group) return;
  group.traverse((object) => {
    const mesh = object as THREE.InstancedMesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const map = (material as THREE.MeshBasicMaterial).map;
      map?.dispose();
      material.dispose();
    }
  });
  group.removeFromParent();
}

function blobTexture(): THREE.DataTexture {
  const size = 64;
  const mid = (size - 1) / 2;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const falloff = Math.max(0, 1 - Math.hypot(x - mid, y - mid) / mid);
      const alpha = falloff * falloff * falloff;
      const i = (y * size + x) * 4;
      data[i] = 48;
      data[i + 1] = 36;
      data[i + 2] = 22;
      data[i + 3] = Math.round(alpha * 88);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.needsUpdate = true;
  return texture;
}
