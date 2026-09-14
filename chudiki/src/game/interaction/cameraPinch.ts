import * as THREE from 'three';

/** Spread fingers → smaller orbit (closer). Pinch together → farther. */
export function zoomFromPinch(
  span: number,
  lastSpan: number,
  distance: number,
  min: number,
  max: number,
): number {
  if (lastSpan <= 0 || span <= 0) return distance;
  return THREE.MathUtils.clamp(distance * (lastSpan / span), min, max);
}

export function touchSpan(touches: TouchList): number {
  if (touches.length < 2) return 0;
  const a = touches[0];
  const b = touches[1];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

export function touchCenter(touches: TouchList): { x: number; y: number } {
  const a = touches[0];
  const b = touches[1];
  return { x: (a.clientX + b.clientX) * 0.5, y: (a.clientY + b.clientY) * 0.5 };
}

/** Two fingers still on the glass: zoom/pan, do not orbit or stamp. */
export function isPinch(touchCount: number): boolean {
  return touchCount >= 2;
}

/**
 * Count only fingers that landed on this surface.
 * A thumb on the walk stick plus one on the garden is not a pinch.
 */
export function touchesOn(
  root: { contains(node: Node): boolean } | null,
  touches: ArrayLike<{ target: EventTarget | null }>,
): number {
  if (!root) return 0;
  let count = 0;
  for (let i = 0; i < touches.length; i++) {
    const target = touches[i].target;
    if (target && root.contains(target as Node)) count += 1;
  }
  return count;
}

/**
 * Skip a child's place/select only for the extra finger of a pinch.
 * After a pinch, Safari may keep a ghost primary pointer, so a later one-finger
 * tap arrives with isPrimary=false. That tap must still plant and orbit.
 */
export function skipPlaceFinger(
  pointerType: string,
  isPrimary: boolean,
  touchCount: number,
): boolean {
  return pointerType === 'touch' && !isPrimary && isPinch(touchCount);
}

/** Mouse and pen orbit only while the button is held. Hover must not spin the garden. */
export function pointerMayOrbit(pointerType: string, buttons: number): boolean {
  if (pointerType === 'mouse' || pointerType === 'pen') {
    return (buttons & 1) === 1;
  }
  return true;
}

/**
 * After a swallowed touchstart, a second pinch finger may first appear on move.
 * A lone cancelled finger must not come back from a stray pointermove.
 */
export function adoptUntrackedPointer(pointerType: string, trackingCount: number): boolean {
  return pointerType === 'touch' && trackingCount > 0;
}
