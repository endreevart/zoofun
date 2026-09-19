import * as THREE from 'three';

const MAX_TOY_MAP = 512;

/** Sit a Tripo lawn toy on the grass. Provider meshes are centred, not footed. */
export function seatPlazaToyGlb(
  object: THREE.Object3D,
  options: { height: number; x: number; z: number; rotationY?: number; castShadow?: boolean },
): void {
  object.position.set(0, 0, 0);
  object.rotation.set(0, 0, 0);
  object.scale.set(1, 1, 1);
  object.updateMatrixWorld(true);
  const raw = new THREE.Box3().setFromObject(object);
  if (raw.isEmpty()) {
    object.position.set(options.x, 0, options.z);
    object.rotation.y = options.rotationY ?? 0;
    return;
  }
  const size = raw.getSize(new THREE.Vector3());
  const target = Math.max(0.8, options.height);
  object.scale.setScalar(target / Math.max(size.y, 0.01));
  object.rotation.y = options.rotationY ?? 0;
  object.position.set(options.x, 0, options.z);
  object.updateMatrixWorld(true);
  const seated = new THREE.Box3().setFromObject(object);
  const cx = (seated.min.x + seated.max.x) / 2;
  const cz = (seated.min.z + seated.max.z) / 2;
  object.position.x += options.x - cx;
  object.position.z += options.z - cz;
  object.position.y -= seated.min.y;
  const casts = options.castShadow !== false;
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = casts;
    mesh.receiveShadow = false;
  });
}

/** Drop extra maps and shrink albedo so a personal GLB is cheaper on the lawn. */
export function compactPlazaToyGlb(root: THREE.Object3D): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = materials.map((material) => compactToyMaterial(material));
    mesh.material = Array.isArray(mesh.material) ? next : next[0];
  });
}

function compactToyMaterial(material: THREE.Material): THREE.Material {
  const std = material as THREE.MeshStandardMaterial;
  if (!std.isMeshStandardMaterial) return material;
  const map = std.map ? shrinkToyMap(std.map) : null;
  dropToyMap(std, 'normalMap');
  dropToyMap(std, 'roughnessMap');
  dropToyMap(std, 'metalnessMap');
  dropToyMap(std, 'aoMap');
  dropToyMap(std, 'emissiveMap');
  dropToyMap(std, 'bumpMap');
  const lambert = new THREE.MeshLambertMaterial({
    color: std.color?.clone() ?? new THREE.Color(0xffffff),
    transparent: std.transparent,
    opacity: std.opacity,
    alphaTest: std.alphaTest,
    side: std.side,
    depthWrite: std.depthWrite,
  });
  if (map) lambert.map = map;
  material.dispose();
  return lambert;
}

function dropToyMap(material: THREE.MeshStandardMaterial, key: 'normalMap' | 'roughnessMap' | 'metalnessMap' | 'aoMap' | 'emissiveMap' | 'bumpMap') {
  const map = material[key];
  if (!map) return;
  material[key] = null;
  map.dispose();
}

function shrinkToyMap(map: THREE.Texture): THREE.Texture {
  const image = map.image as { width?: number; height?: number } | undefined;
  const width = image?.width ?? 0;
  const height = image?.height ?? 0;
  if (!width || !height || Math.max(width, height) <= MAX_TOY_MAP) return map;
  if (typeof document === 'undefined') return map;
  try {
    const scale = MAX_TOY_MAP / Math.max(width, height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return map;
    ctx.drawImage(image as CanvasImageSource, 0, 0, canvas.width, canvas.height);
    const next = new THREE.CanvasTexture(canvas);
    next.colorSpace = map.colorSpace;
    next.wrapS = map.wrapS;
    next.wrapT = map.wrapT;
    next.flipY = map.flipY;
    next.needsUpdate = true;
    map.dispose();
    return next;
  } catch {
    return map;
  }
}
