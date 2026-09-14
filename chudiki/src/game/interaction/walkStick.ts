export const STICK_DEAD = 8;
/** Full throw is a brisk walk. Small thumb moves used to do nothing. */
export const MOBILE_STICK_GAIN = 0.92;
/** Mild ease so the centre is not twitchy, but a short drag already walks. */
export const STICK_SHAPE = 1.2;

export function clampStickTravel(
  dx: number,
  dy: number,
  travel: number,
): { x: number; y: number } {
  const length = Math.hypot(dx, dy);
  const scale = travel > 0 && length > travel ? travel / length : 1;
  return { x: dx * scale, y: dy * scale };
}

/** Soft near the centre so a small nudge does not floor the stick. */
export function shapeStick(value: number): number {
  const sign = Math.sign(value);
  const mag = Math.min(1, Math.abs(value));
  return sign * mag ** STICK_SHAPE;
}

export function stickWalk(
  x: number,
  y: number,
  travel: number,
  gain: number,
): { forward: number; right: number } {
  if (travel <= 0) return { forward: 0, right: 0 };
  const right = Math.abs(x) < STICK_DEAD ? 0 : shapeStick(x / travel) * gain;
  const forward = Math.abs(y) < STICK_DEAD ? 0 : shapeStick(-y / travel) * gain;
  return { forward, right };
}
