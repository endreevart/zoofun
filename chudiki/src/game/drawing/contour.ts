import type { Mask } from './maskOps';

export type Point = [number, number];

/**
 * Traces the outer boundary of a mask and turns it into a small, smooth
 * polygon that keeps the drawing's silhouette recognisable.
 */

/** Moore-neighbour boundary tracing. Returns pixel coordinates in order. */
export function traceBoundary(mask: Mask): Point[] {
  const { width, height, data } = mask;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : data[y * width + x]);

  let start: Point | null = null;
  for (let y = 0; y < height && !start; y++) {
    for (let x = 0; x < width; x++) {
      if (data[y * width + x]) {
        start = [x, y];
        break;
      }
    }
  }
  if (!start) return [];

  // Clockwise neighbour offsets, starting from "west".
  const offsets: Point[] = [
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
  ];

  const contour: Point[] = [start];
  let current = start;
  let backtrack = 0;
  const maxSteps = width * height * 4;

  for (let step = 0; step < maxSteps; step++) {
    let found = false;
    for (let i = 0; i < 8; i++) {
      const dir = (backtrack + 1 + i) % 8;
      const [dx, dy] = offsets[dir];
      const nx = current[0] + dx;
      const ny = current[1] + dy;

      if (at(nx, ny)) {
        contour.push([nx, ny]);
        // Come back facing where we arrived from.
        backtrack = (dir + 4) % 8;
        current = [nx, ny];
        found = true;
        break;
      }
    }

    if (!found) break;
    if (current[0] === start[0] && current[1] === start[1] && contour.length > 3) {
      contour.pop();
      break;
    }
  }

  return contour;
}

/** Ramer–Douglas–Peucker: drops points that do not change the shape. */
export function simplify(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points.slice();

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let maxDistance = 0;
    let index = -1;

    for (let i = first + 1; i < last; i++) {
      const d = perpendicularDistance(points[i], points[first], points[last]);
      if (d > maxDistance) {
        maxDistance = d;
        index = i;
      }
    }

    if (index >= 0 && maxDistance > epsilon) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  return points.filter((_, i) => keep[i]);
}

function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / length;
}

/** Chaikin corner cutting: softens the pixel staircase without losing shape. */
export function smoothClosed(points: Point[], iterations = 2): Point[] {
  let current = points;
  for (let pass = 0; pass < iterations; pass++) {
    const next: Point[] = [];
    for (let i = 0; i < current.length; i++) {
      const a = current[i];
      const b = current[(i + 1) % current.length];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    current = next;
  }
  return current;
}

/** Even spacing keeps the extruded bevel from bunching up. */
export function resampleClosed(points: Point[], count: number): Point[] {
  if (points.length < 3) return points.slice();

  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    lengths.push(d);
    total += d;
  }
  if (total < 1e-6) return points.slice();

  const out: Point[] = [];
  const spacing = total / count;
  let segment = 0;
  let travelled = 0;
  let consumed = 0;

  for (let i = 0; i < count; i++) {
    const wanted = i * spacing;
    while (segment < lengths.length - 1 && consumed + lengths[segment] < wanted) {
      consumed += lengths[segment];
      segment++;
    }
    travelled = wanted - consumed;
    const t = lengths[segment] > 1e-6 ? travelled / lengths[segment] : 0;
    const a = points[segment];
    const b = points[(segment + 1) % points.length];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }

  return out;
}

/**
 * Pixel coordinates to model space: centred, y pointing up, height of exactly
 * 1 unit so the caller can scale the whole creature with one number.
 */
export function normalizeContour(
  points: Point[],
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): { contour: Point[]; aspect: number } {
  const width = Math.max(1, bounds.maxX - bounds.minX + 1);
  const height = Math.max(1, bounds.maxY - bounds.minY + 1);
  const aspect = width / height;
  const centerX = bounds.minX + width / 2;
  const centerY = bounds.minY + height / 2;

  const contour = points.map<Point>(([x, y]) => [(x - centerX) / height, -(y - centerY) / height]);
  return { contour, aspect };
}
