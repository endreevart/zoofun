import assert from 'node:assert/strict';
import * as THREE from 'three';
import { disposeObjectResources } from './resourceDisposal.ts';

let imageCloses = 0;
const texture = new THREE.Texture({ close: () => imageCloses++ });
const first = new THREE.MeshStandardMaterial({ map: texture });
const second = new THREE.MeshStandardMaterial({ map: texture });
const geometry = new THREE.BoxGeometry();
const root = new THREE.Group();
root.add(new THREE.Mesh(geometry, first), new THREE.Mesh(geometry, second));

let geometryDisposes = 0;
let textureDisposes = 0;
geometry.addEventListener('dispose', () => geometryDisposes++);
texture.addEventListener('dispose', () => textureDisposes++);
disposeObjectResources(root);

assert.equal(geometryDisposes, 1, 'shared geometry is released once');
assert.equal(textureDisposes, 1, 'shared texture is released once');
assert.equal(imageCloses, 1, 'decoded ImageBitmap-like source is closed once');
