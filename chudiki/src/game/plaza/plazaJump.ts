/** One hop on the shared lawn. Ground is y = 0. */

export const JUMP_SPEED = 8.2;
export const JUMP_GRAVITY = 24;

export type JumpState = {
  y: number;
  vy: number;
  grounded: boolean;
};

export function idleJump(): JumpState {
  return { y: 0, vy: 0, grounded: true };
}

export function stepJump(state: JumpState, dt: number, want: boolean): JumpState {
  let { y, vy, grounded } = state;
  if (want && grounded) {
    vy = JUMP_SPEED;
    grounded = false;
    y += vy * dt;
    return { y, vy, grounded };
  }
  if (!grounded) {
    vy -= JUMP_GRAVITY * dt;
    y += vy * dt;
    if (y <= 0) {
      y = 0;
      vy = 0;
      grounded = true;
    }
  }
  return { y, vy, grounded };
}
