import * as THREE from 'three';

/**
 * Every Idyllic material has vertex colours enabled, because the pack's foliage
 * tint is baked into COLOR_0. Procedural geometry built here has no such
 * attribute, and a missing `color` attribute reads as black rather than as
 * "no tint", so primitives that borrow a pack material need a white one.
 */
export function withWhiteVertexColors(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3));
  return geometry;
}
