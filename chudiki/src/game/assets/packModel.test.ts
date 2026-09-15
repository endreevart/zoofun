import assert from 'node:assert/strict';
import * as THREE from 'three';
import { flattenPackedScene, placePackedMesh, positionArrayName } from './packModel.ts';

function int16Box(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const positions = new Int16Array([-100, 0, -100, 100, 0, -100, 100, 50, 100, -100, 50, 100]);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return geometry;
}

const scene = new THREE.Group();
const mesh = new THREE.Mesh(int16Box(), new THREE.MeshStandardMaterial({ name: 'lawn' }));
mesh.position.set(10, 2, -4);
mesh.updateMatrixWorld(true);
scene.add(mesh);

const packed = flattenPackedScene('whimsy-isle', scene, (source) => {
  const material = (source as THREE.MeshStandardMaterial).clone();
  return material;
});

assert.equal(packed.primitives.length, 1);
assert.equal(positionArrayName(packed.primitives[0].geometry), 'Int16Array');
assert.ok(packed.primitives[0].matrix, 'centering lives on the primitive matrix');
assert.ok(packed.size.x > 0 && packed.size.y > 0);

const placed = new THREE.Mesh(packed.primitives[0].geometry);
placed.position.set(3, 1, 0);
placed.scale.setScalar(2);
const expected = new THREE.Matrix4()
  .compose(placed.position.clone(), new THREE.Quaternion(), new THREE.Vector3(2, 2, 2))
  .multiply(packed.primitives[0].matrix!);
placePackedMesh(placed, packed.primitives[0]);
assert.equal(placed.matrixAutoUpdate, true);
const delta = new THREE.Matrix4().copy(placed.matrix).multiply(expected.clone().invert());
for (let i = 0; i < 16; i++) {
  assert.ok(Math.abs(delta.elements[i] - (i % 5 === 0 ? 1 : 0)) < 1e-5);
}
const rebuilt = new THREE.Matrix4().compose(placed.position, placed.quaternion, placed.scale);
const rebuiltDelta = new THREE.Matrix4().copy(rebuilt).multiply(expected.invert());
for (let i = 0; i < 16; i++) {
  assert.ok(Math.abs(rebuiltDelta.elements[i] - (i % 5 === 0 ? 1 : 0)) < 1e-5);
}

for (const primitive of packed.primitives) {
  primitive.geometry.dispose();
  primitive.material.dispose();
}
