import * as THREE from 'three';

/** Sit a Tripo lawn toy on the grass. Provider meshes are centred, not footed. */
export function seatPlazaToyGlb(
  object: THREE.Object3D,
  options: { height: number; x: number; z: number; rotationY?: number },
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
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
}
