export type SkyShell = 'garden' | 'meadow' | 'grove';

export const HAZE_RGB = { r: 0.62, g: 0.78, b: 0.88 } as const;
export const MEADOW_HAZE_RGB = { r: 0.28, g: 0.76, b: 1 } as const;

/** All playable shells paint cumulus on the sky dome. */
export function usesPuffyClouds(shell: SkyShell): boolean {
  return shell === 'meadow' || shell === 'garden' || shell === 'grove';
}

export function fogDensityForShell(shell: SkyShell): number {
  if (shell === 'meadow') return 0.00035;
  if (shell === 'grove') return 0.0004;
  if (shell === 'garden') return 0.0022;
  return 0.0045;
}

/** Wider range = fainter, more airbrushed edge. */
export function cloudSoftEdges(softness: number): { inner: number; outer: number } {
  const t = Math.min(1, Math.max(0, softness));
  return {
    inner: 0.55 - t * 0.43,
    outer: 0.72 + t * 0.26,
  };
}
