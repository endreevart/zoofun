import * as THREE from 'three';

/**
 * Sweeps a strip along a 2D spline, the Three.js equivalent of ribbon() in
 * scripts/render-idyllic-world.py. Used for the dirt paths and the creek.
 *
 * Unlike the Blender version, which laid the strip at a constant height, this
 * samples the terrain so a path draped over the lawn's ripple never sinks into
 * it or floats above it.
 */

export type RibbonOptions = {
  at(t: number, out?: THREE.Vector2): THREE.Vector2;
  steps: number;
  halfWidth(t: number): number;
  /** `t` is supplied so a strip can follow its own profile instead of the ground. */
  heightAt(x: number, z: number, t: number): number;
  /** Texture repeats per ring along the strip. */
  vScale?: number;
  /** Extra per-vertex attribute, e.g. the water shader's shoreDepth. */
  attribute?: { name: string; value(t: number, side: 0 | 1): number };
};

export function ribbonGeometry(options: RibbonOptions): THREE.BufferGeometry {
  const { at, steps, halfWidth, heightAt, vScale = 0.3 } = options;

  const positions: number[] = [];
  const uvs: number[] = [];
  const extra: number[] = [];
  const indices: number[] = [];

  const here = new THREE.Vector2();
  const ahead = new THREE.Vector2();

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    at(t, here);
    at(Math.min(t + 0.005, 1), ahead);

    let tx = ahead.x - here.x;
    let tz = ahead.y - here.y;
    const length = Math.hypot(tx, tz) || 1;
    tx /= length;
    tz /= length;
    // Left-hand normal in the ground plane.
    const nx = -tz;
    const nz = tx;

    const w = halfWidth(t);
    for (const side of [0, 1] as const) {
      const sign = side === 0 ? 1 : -1;
      const x = here.x + nx * w * sign;
      const z = here.y + nz * w * sign;
      positions.push(x, heightAt(x, z, t), z);
      uvs.push(side, i * vScale);
      if (options.attribute) extra.push(options.attribute.value(t, side));
    }

    if (i < steps) {
      const k = i * 2;
      indices.push(k, k + 1, k + 3, k, k + 3, k + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (options.attribute) {
    geometry.setAttribute(options.attribute.name, new THREE.Float32BufferAttribute(extra, 1));
  }
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
