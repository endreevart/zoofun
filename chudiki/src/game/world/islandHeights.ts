/**
 * Densest upward band: the walkable lawn. A hanging voxel isle is 20 m of
 * cliff under a thin grass plate, so "above the ocean" is the wrong cut.
 */
export function peakHeight(values: number[], binSize = 0.25): number | null {
  if (values.length === 0) return null;
  const counts = new Map<number, number>();
  let best = values[0]!;
  let bestN = 0;
  for (const y of values) {
    const bin = Math.round(y / binSize) * binSize;
    const n = (counts.get(bin) ?? 0) + 1;
    counts.set(bin, n);
    if (n > bestN) {
      bestN = n;
      best = bin;
    }
  }
  return best;
}

/** Keep the plateau and short steps; drop deep cliff faces and tree spikes. */
export function lawnHeightWindow(
  peak: number,
  below = 1.2,
  above = 2.4,
): { min: number; max: number } {
  return { min: peak - below, max: peak + above };
}

/** Ocean-bed fallback is empty air, not a floor the camera should sit on. */
export function isSolidGround(y: number, bed = -5.4): boolean {
  return y > bed + 0.25;
}
