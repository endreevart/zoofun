import assert from 'node:assert/strict';
import * as THREE from 'three';
import { disposeScatter, InstancedScatter, setScatterFrustumCulling } from './InstancedScatter.ts';
import type { IdyllicLibrary, IdyllicModel } from './IdyllicLibrary.ts';

function model(name: string, triangles: number): IdyllicModel {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(triangles * 9), 3));
  return {
    name,
    size: new THREE.Vector3(1, 2, 1),
    primitives: [{ geometry, material: new THREE.MeshStandardMaterial(), materialName: 'mat' }],
  };
}

const expensive = model('tree', 10_000);
const cheap = model('flower', 100);
const models = new Map([[expensive.name, expensive], [cheap.name, cheap]]);
const library = {
  has: (name: string) => models.has(name),
  get: (name: string) => models.get(name)!,
} as IdyllicLibrary;

const scatter = new InstancedScatter(library);
for (const [index, x] of [0, 24, 48, 72, 96, 120].entries()) {
  scatter.place('tree', { position: new THREE.Vector3(x, 0, 0), height: 2 + index * 0.1 });
  scatter.place('flower', { position: new THREE.Vector3(x, 0, 2), height: 1 });
}
const root = scatter.build({ spatial: true });
const trees = root.children.filter((child) => child.name.startsWith('tree:')) as THREE.InstancedMesh[];
const flowers = root.children.filter((child) => child.name.startsWith('flower:')) as THREE.InstancedMesh[];

assert.ok(trees.length > 1 && trees.length <= 4, 'expensive, spread-out instances use bounded batches');
assert.equal(trees.reduce((sum, mesh) => sum + mesh.count, 0), 6);
assert.deepEqual(
  trees.flatMap((mesh) => mesh.userData.placementIndices as number[]).sort((a, b) => a - b),
  [0, 1, 2, 3, 4, 5],
  'batches retain the source placement order for stable editor IDs',
);
assert.equal(flowers.length, 1, 'cheap objects keep the minimum draw-call count');

setScatterFrustumCulling(root, false);
assert.ok(trees.every((mesh) => !mesh.frustumCulled));
setScatterFrustumCulling(root, true);
assert.ok(trees.every((mesh) => mesh.frustumCulled));

let disposed = 0;
for (const mesh of trees) mesh.addEventListener('dispose', () => disposed++);
disposeScatter(root);
assert.equal(disposed, trees.length);
assert.equal(root.children.length, 0);

for (const item of models.values()) {
  for (const primitive of item.primitives) {
    primitive.geometry.dispose();
    primitive.material.dispose();
  }
}
