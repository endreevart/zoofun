/** Small value-noise implementation: enough for gentle terrain mounds, no dependencies. */

const PERM_SIZE = 256;

function buildPermutation(seed: number): Uint8Array {
  const perm = new Uint8Array(PERM_SIZE * 2);
  const base = new Uint8Array(PERM_SIZE);
  for (let i = 0; i < PERM_SIZE; i++) base[i] = i;

  let a = seed >>> 0;
  for (let i = PERM_SIZE - 1; i > 0; i--) {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    const j = a % (i + 1);
    [base[i], base[j]] = [base[j], base[i]];
  }
  for (let i = 0; i < PERM_SIZE * 2; i++) perm[i] = base[i & 255];
  return perm;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export class Noise2D {
  private perm: Uint8Array;

  constructor(seed = 1337) {
    this.perm = buildPermutation(seed);
  }

  private valueAt(ix: number, iy: number): number {
    const h = this.perm[(this.perm[ix & 255] + (iy & 255)) & 511];
    return h / 255;
  }

  sample(x: number, y: number): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smoothstep(x - x0);
    const fy = smoothstep(y - y0);

    const v00 = this.valueAt(x0, y0);
    const v10 = this.valueAt(x0 + 1, y0);
    const v01 = this.valueAt(x0, y0 + 1);
    const v11 = this.valueAt(x0 + 1, y0 + 1);

    const top = v00 + (v10 - v00) * fx;
    const bottom = v01 + (v11 - v01) * fx;
    return top + (bottom - top) * fy;
  }

  /** Fractal sum in the -1..1 range. */
  fbm(x: number, y: number, octaves = 3, lacunarity = 2, gain = 0.5): number {
    let amplitude = 1;
    let frequency = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amplitude * (this.sample(x * frequency, y * frequency) * 2 - 1);
      norm += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }
    return sum / norm;
  }
}
