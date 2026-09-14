export type Ground2 = { x: number; z: number };

/** Keep the toy under the finger: world offset from the first ground hit. */
export function holdDragOffset(origin: Ground2, start: Ground2, now: Ground2): Ground2 {
  return {
    x: start.x + (now.x - origin.x),
    z: start.z + (now.z - origin.z),
  };
}
