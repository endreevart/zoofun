export type AuthoredPath = {
  id: string;
  points: [number, number][];
  width: number;
};

export const DEFAULT_PATH_WIDTH = 2.15;
export const MIN_PATH_WIDTH = 0.7;
export const MAX_PATH_WIDTH = 4.4;
export const STROKE_GAP = 0.22;
export const MIN_STROKE_LENGTH = 0.55;

export function clampPathWidth(width: number): number {
  return Math.min(MAX_PATH_WIDTH, Math.max(MIN_PATH_WIDTH, width));
}

export function strokeLength(points: ReadonlyArray<readonly [number, number]>): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    length += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return length;
}

export function appendStrokePoint(
  points: ReadonlyArray<readonly [number, number]>,
  x: number,
  z: number,
  minGap = STROKE_GAP,
): [number, number][] {
  if (points.length === 0) return [[x, z]];
  const last = points[points.length - 1];
  if (Math.hypot(x - last[0], z - last[1]) < minGap) {
    return points.map((point) => [point[0], point[1]]);
  }
  return [...points.map((point) => [point[0], point[1]] as [number, number]), [x, z]];
}

export function shouldCommitStroke(
  points: ReadonlyArray<readonly [number, number]>,
  minLength = MIN_STROKE_LENGTH,
): boolean {
  return points.length >= 2 && strokeLength(points) >= minLength;
}

export function isAuthoredPath(value: unknown): value is AuthoredPath {
  if (!value || typeof value !== 'object') return false;
  const path = value as AuthoredPath;
  return (
    typeof path.id === 'string' &&
    typeof path.width === 'number' &&
    Number.isFinite(path.width) &&
    Array.isArray(path.points) &&
    path.points.length >= 2 &&
    path.points.every(
      (point) =>
        Array.isArray(point) &&
        point.length >= 2 &&
        Number.isFinite(point[0]) &&
        Number.isFinite(point[1]),
    )
  );
}

function distanceToSegment(
  x: number,
  z: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const length2 = dx * dx + dz * dz;
  if (length2 < 1e-8) return Math.hypot(x - ax, z - az);
  const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / length2));
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

/** Nearest painted ribbon, measured to the polyline plus half the path width. */
export function nearestPathId(
  paths: readonly AuthoredPath[],
  x: number,
  z: number,
  slack = 0.35,
): string | null {
  let best: { id: string; dist: number } | null = null;
  for (const path of paths) {
    const reach = path.width * 0.5 + slack;
    for (let i = 1; i < path.points.length; i++) {
      const a = path.points[i - 1];
      const b = path.points[i];
      const dist = distanceToSegment(x, z, a[0], a[1], b[0], b[1]);
      if (dist > reach) continue;
      if (!best || dist < best.dist) best = { id: path.id, dist };
    }
  }
  return best?.id ?? null;
}

export function hashPathSeed(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return hash;
}
