import assert from 'node:assert/strict';
import * as THREE from 'three';
import { EmotePuff } from './EmotePuff.ts';

const scene = new THREE.Scene();
const map = new THREE.Texture();
const puff = new EmotePuff();
const origin = new THREE.Vector3(2, 1.4, -3);

puff.burst(scene, map, origin, 1, 6);
assert.equal(puff.count, 6);
assert.equal(scene.children.length, 6);
assert.equal((scene.children[0] as THREE.Sprite).visible, false);

puff.update(0.001);
assert.equal((scene.children[0] as THREE.Sprite).visible, true, 'first sprite pops immediately');
assert.equal((scene.children[5] as THREE.Sprite).visible, false, 'later sprites wait a beat');

puff.update(0.05);
const risen = scene.children.find((node) => node.visible) as THREE.Sprite | undefined;
assert.ok(risen, 'at least one sprite is in the air');
assert.ok(risen.position.y > origin.y, 'sprites float up from the head');

puff.update(4);
assert.equal(puff.count, 0);
assert.equal(scene.children.length, 0);

puff.burst(scene, map, origin, 1, 3);
assert.equal(puff.count, 3);
puff.dispose();
assert.equal(puff.count, 0);
assert.equal(scene.children.length, 0);
map.dispose();
