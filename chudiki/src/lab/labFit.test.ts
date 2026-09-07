import assert from 'node:assert/strict';
import * as THREE from 'three';
import { fitLabModel } from './labFit.ts';

const huge = new THREE.Mesh(new THREE.BoxGeometry(400, 80, 120));
assert.equal(fitLabModel(huge), true);
huge.updateMatrixWorld(true);
const box = new THREE.Box3().setFromObject(huge);
const size = box.getSize(new THREE.Vector3());
assert.ok(Math.abs(Math.max(size.x, size.y, size.z) - 1.6) < 0.01);
assert.ok(box.getCenter(new THREE.Vector3()).length() < 0.02);

const empty = new THREE.Group();
assert.equal(fitLabModel(empty), false);
