import * as THREE from 'three';

export function markHuntCaster(root: THREE.Object3D): void {
  root.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.castShadow = true;
      node.receiveShadow = false;
    }
  });
}

/** Put an object's visual feet on local y = 0. Position is not scaled; the box is. */
export function seatOnGround(object: THREE.Object3D): void {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  if (!Number.isFinite(box.min.y)) return;
  object.position.y -= box.min.y;
}

export function crystalUmbra(map: THREE.Texture | null = null, radius = 1.15): THREE.Mesh {
  const geometry = new THREE.CircleGeometry(1, 24);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: map ? 0xffffff : 0x24180e,
    transparent: true,
    opacity: map ? 1 : 0.42,
    depthWrite: false,
    fog: true,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  if (map) material.map = map;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'crystal-umbra';
  mesh.scale.set(radius, 1, radius * 0.82);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 1;
  return mesh;
}
