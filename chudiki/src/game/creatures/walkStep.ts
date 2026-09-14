/** Extra headings so a blocked step slides along a trunk instead of freezing. */
export const SLIDE_YAWS = [0, 0.35, -0.4, 0.75, -0.85, 1.2, -1.25, 1.75, -1.75] as const;

export function stepPoint(
  x: number,
  z: number,
  yaw: number,
  step: number,
): { x: number; z: number } {
  return {
    x: x + Math.sin(yaw) * step,
    z: z + Math.cos(yaw) * step,
  };
}
