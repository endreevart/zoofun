/** Walk-pad hold: iPad long-press and a second camera finger used to cancel the step. */

export const COMPACT_WALK = '(max-width: 1280px), (pointer: coarse)';

export function canBeginWalkHold(event: { pointerType: string; button: number }): boolean {
  return event.pointerType !== 'mouse' || event.button === 0;
}

/** Only the finger that started the hold may end it. */
export function isHeldPointer(heldId: number | null, pointerId: number): boolean {
  return heldId !== null && heldId === pointerId;
}

/** iOS Safari cancels a captured touch after a long-press. Do not capture it. */
export function shouldCaptureWalkPointer(pointerType: string): boolean {
  return pointerType !== 'touch';
}

/** Long-press callout / capture loss must not stop a held step. */
export function ignoreWalkCancel(event: { type: string; pointerType?: string }): boolean {
  if (event.type === 'touchcancel') return true;
  if (event.type === 'pointercancel' && event.pointerType === 'touch') return true;
  if (event.type === 'lostpointercapture' && event.pointerType === 'touch') return true;
  return false;
}

export function touchStillHeld(
  touches: ArrayLike<{ identifier: number }>,
  identifier: number | null,
): boolean {
  if (identifier === null) return false;
  for (let i = 0; i < touches.length; i += 1) {
    if (touches[i].identifier === identifier) return true;
  }
  return false;
}
