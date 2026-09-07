import * as THREE from 'three';

/** Pack a Meshy GLB into a 1.6-unit cube so the lab camera can see it. */
export function fitLabModel(object: THREE.Object3D, targetSpan = 1.6): boolean {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return false;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(span) || span <= 0) return false;
  object.position.sub(center);
  object.scale.multiplyScalar(targetSpan / span);
  object.updateMatrixWorld(true);
  return true;
}
