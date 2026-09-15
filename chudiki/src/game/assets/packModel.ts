import * as THREE from 'three';

/** Parallel GLB fetches. 8 caused hitch on first appearance; 2 is the cheap cap. */
export const GLB_LOAD_BATCH = 2;

/**
 * Packed Meshy GLBs keep quantized attributes. Baking matrixWorld into
 * vertices (applyMatrix4 / translate) turns Int16 back into Float32 and
 * kills the GPU win from KHR_mesh_quantization. Store that transform on
 * the primitive and multiply it when placing the mesh.
 */

export type PackedPrimitive = {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  materialName: string;
  /** World + centering. Multiply after placement; do not bake into verts. */
  matrix?: THREE.Matrix4;
};

const _offset = new THREE.Matrix4();
const _extra = new THREE.Matrix4();
const _world = new THREE.Matrix4();
const _box = new THREE.Box3();
const _size = new THREE.Vector3();

export function attributeArray(geometry: THREE.BufferGeometry, name: string): ArrayBufferView | undefined {
  return geometry.getAttribute(name)?.array;
}

/** After flatten, positions must still be the loader's typed array. */
export function positionArrayName(geometry: THREE.BufferGeometry): string {
  return geometry.getAttribute('position')?.array.constructor.name ?? '';
}

export function placePackedMesh(object: THREE.Object3D, primitive: PackedPrimitive) {
  object.updateMatrix();
  if (primitive.matrix) object.matrix.multiply(primitive.matrix);
  // Put the packed basis back into pos/quat/scale. A raw matrix with
  // matrixAutoUpdate=false left the garden isle looking right but sampling
  // the shadow map as if it were still at the pre-basis transform.
  object.matrix.decompose(object.position, object.quaternion, object.scale);
  object.matrixAutoUpdate = true;
  object.updateMatrix();
  object.updateMatrixWorld(true);
}

export function multiplyPlacement(matrix: THREE.Matrix4, primitive: PackedPrimitive) {
  if (primitive.matrix) matrix.multiply(primitive.matrix);
}

/**
 * Collapse a packed GLB into one primitive per mesh. Geometry stays in the
 * loader's local space; `matrix` carries world + centering.
 */
export function flattenPackedScene(
  name: string,
  scene: THREE.Object3D,
  keepMaterial: (source: THREE.Material) => THREE.MeshStandardMaterial,
  dress?: (name: string, material: THREE.MeshStandardMaterial) => void,
): { name: string; primitives: PackedPrimitive[]; size: THREE.Vector3 } {
  scene.updateMatrixWorld(true);
  const primitives: PackedPrimitive[] = [];
  const worldBox = new THREE.Box3();

  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!source) return;

    const geometry = mesh.geometry.clone();
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();

    extraBasis(name, geometry, _extra);
    _world.copy(mesh.matrixWorld).multiply(_extra);
    geometry.computeBoundingBox();
    if (geometry.boundingBox) {
      _box.copy(geometry.boundingBox).applyMatrix4(_world);
      worldBox.union(_box);
    }

    const material = keepMaterial(source);
    dress?.(name, material);
    primitives.push({
      geometry,
      material,
      materialName: source.name || name,
      matrix: _world.clone(),
    });
  });

  worldBox.getSize(_size);
  const offset = new THREE.Vector3(
    -(worldBox.min.x + worldBox.max.x) / 2,
    -worldBox.min.y,
    -(worldBox.min.z + worldBox.max.z) / 2,
  );
  _offset.makeTranslation(offset.x, offset.y, offset.z);
  for (const primitive of primitives) {
    if (!primitive.matrix) continue;
    primitive.matrix.premultiply(_offset);
  }

  return { name, primitives, size: _size.clone() };
}

function extraBasis(name: string, geometry: THREE.BufferGeometry, target: THREE.Matrix4) {
  target.identity();
  if (name === 'wooden-lantern') {
    target.makeRotationX(Math.PI / 2);
    return;
  }
  if (name === 'garden-gate') {
    gardenGateBasis(geometry, target);
  }
}

/**
 * Put the arch on its two posts. Meshy and Blender glTF disagree about Y-up,
 * so we do not trust a baked rotation: find the wide end (feet) and the narrow
 * end (crown), then rotate until feet sit at min Y. Rotation is a matrix so
 * quantized attributes stay intact.
 */
export function gardenGateBasis(geometry: THREE.BufferGeometry, target: THREE.Matrix4) {
  target.identity();
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
    if (feetHigh) target.makeRotationZ(Math.PI);
    return;
  }
  if (axis === 2) {
    target.makeRotationX(feetHigh ? Math.PI / 2 : -Math.PI / 2);
    return;
  }
  target.makeRotationZ(feetHigh ? -Math.PI / 2 : Math.PI / 2);
}
