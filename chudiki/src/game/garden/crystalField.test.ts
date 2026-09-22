import assert from 'node:assert/strict';
import * as THREE from 'three';
import { crystalUmbra, markHuntCaster, seatOnGround } from './crystalUmbra.ts';

const mesh = new THREE.Mesh(new THREE.BoxGeometry());
markHuntCaster(mesh);
assert.equal(mesh.castShadow, true);
assert.equal(mesh.receiveShadow, false);

const nested = new THREE.Group();
const child = new THREE.Mesh(new THREE.BoxGeometry());
nested.add(child);
markHuntCaster(nested);
assert.equal(child.castShadow, true);
assert.equal(child.receiveShadow, false);

const umbra = crystalUmbra();
assert.equal(umbra.name, 'crystal-umbra');
assert.equal(umbra.castShadow, false);
assert.equal(umbra.receiveShadow, false);
assert.equal((umbra.material as THREE.MeshBasicMaterial).transparent, true);
assert.ok(umbra.scale.x >= 1);

const floating = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1));
floating.position.y = 4;
seatOnGround(floating);
floating.updateMatrixWorld(true);
const seated = new THREE.Box3().setFromObject(floating);
assert.ok(Math.abs(seated.min.y) < 1e-5, `feet should sit on y=0, min.y=${seated.min.y}`);

const scaled = new THREE.Group();
const chunk = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
chunk.scale.setScalar(0.4);
scaled.add(chunk);
scaled.updateMatrixWorld(true);
const before = new THREE.Box3().setFromObject(scaled);
assert.ok(before.min.y < -0.3);
seatOnGround(scaled);
scaled.updateMatrixWorld(true);
const after = new THREE.Box3().setFromObject(scaled);
assert.ok(Math.abs(after.min.y) < 1e-5, `scaled feet, min.y=${after.min.y}`);
