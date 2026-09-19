import assert from 'node:assert/strict';
import * as THREE from 'three';
import { compactPlazaToyGlb, seatPlazaToyGlb } from './plazaToyFit.ts';

const cube = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
seatPlazaToyGlb(cube, { height: 2, x: 5, z: -3, rotationY: 0.4 });
cube.updateMatrixWorld(true);
const box = new THREE.Box3().setFromObject(cube);
const size = box.getSize(new THREE.Vector3());
const center = box.getCenter(new THREE.Vector3());
assert.ok(Math.abs(box.min.y) < 0.02, `feet should sit on grass, min.y=${box.min.y}`);
assert.ok(Math.abs(size.y - 2) < 0.02, `height should match, size.y=${size.y}`);
assert.ok(Math.abs(center.x - 5) < 0.02);
assert.ok(Math.abs(center.z + 3) < 0.02);
assert.equal(cube.receiveShadow, false);
assert.equal(cube.castShadow, true);

const far = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
seatPlazaToyGlb(far, { height: 1.2, x: 0, z: 0, castShadow: false });
assert.equal(far.castShadow, false);
assert.equal(far.receiveShadow, false);

const tall = new THREE.Mesh(new THREE.BoxGeometry(1, 4, 1));
seatPlazaToyGlb(tall, { height: 1.6, x: 0, z: 0 });
tall.updateMatrixWorld(true);
const fitted = new THREE.Box3().setFromObject(tall);
assert.ok(Math.abs(fitted.min.y) < 0.02);
assert.ok(Math.abs(fitted.max.y - 1.6) < 0.02);

const empty = new THREE.Group();
seatPlazaToyGlb(empty, { height: 2, x: 8, z: 9 });
assert.equal(empty.position.x, 8);
assert.equal(empty.position.z, 9);
assert.equal(empty.position.y, 0);

const shiny = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x4488ff, roughness: 0.15, metalness: 0.7 }),
);
compactPlazaToyGlb(shiny);
assert.equal((shiny.material as THREE.MeshLambertMaterial).isMeshLambertMaterial, true);
assert.equal(shiny.receiveShadow, false);
