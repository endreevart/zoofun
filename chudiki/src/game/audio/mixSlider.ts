/** Map a finger on a horizontal track to 0…1. */

export const MIX_SLIDER_MAX = 1000;

export function sliderFromClientX(clientX: number, left: number, width: number): number {
  if (!(width > 0)) return 0;
  return Math.min(1, Math.max(0, (clientX - left) / width));
}

export function sliderToUnit(raw: string | number, max = MIX_SLIDER_MAX): number {
  const n = typeof raw === 'number' ? raw : Number.parseFloat(raw);
  if (!Number.isFinite(n) || max <= 0) return 0;
  return Math.min(1, Math.max(0, n / max));
}

export function unitToSliderValue(unit: number, max = MIX_SLIDER_MAX): string {
  return String(Math.round(Math.min(1, Math.max(0, unit)) * max));
}
