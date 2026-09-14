import * as THREE from 'three';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';

let installed = false;

/** Mesh raycast walks every triangle unless a bounds tree is present. */
export function installBvhRaycast() {
  if (installed) return;
  THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
  THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
  THREE.Mesh.prototype.raycast = acceleratedRaycast;
  installed = true;
}

export function buildMeshBounds(mesh: THREE.Mesh) {
  installBvhRaycast();
  mesh.geometry.computeBoundsTree({ indirect: true });
}
