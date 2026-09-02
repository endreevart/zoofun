/**
 * Gesture recogniser. Separating this from the camera means a child can drag
 * the view across a chudik without accidentally poking it.
 */

const TAP_MAX_MOVEMENT = 12;
const TAP_MAX_DURATION = 500;
const LONG_PRESS_DURATION = 520;

export type TapControllerOptions = {
  element: HTMLElement;
  onTap(x: number, y: number): void;
  onLongPress(x: number, y: number): void;
};

export class TapController {
  private element: HTMLElement;
  private options: TapControllerOptions;

  private activePointer: number | null = null;
  private startX = 0;
  private startY = 0;
  private startTime = 0;
  private moved = false;
  private multiTouch = false;
  private longPressTimer: number | null = null;

  constructor(options: TapControllerOptions) {
    this.options = options;
    this.element = options.element;

    this.element.addEventListener('pointerdown', this.onPointerDown);
    this.element.addEventListener('pointermove', this.onPointerMove);
    this.element.addEventListener('pointerup', this.onPointerUp);
    this.element.addEventListener('pointercancel', this.onCancel);
  }

  private onPointerDown = (event: PointerEvent) => {
    if (this.activePointer !== null) {
      // A second finger means the user is framing the shot, not tapping.
      this.multiTouch = true;
      this.clearLongPress();
      return;
    }

    this.activePointer = event.pointerId;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.startTime = performance.now();
    this.moved = false;
    this.multiTouch = false;

    this.longPressTimer = window.setTimeout(() => {
      this.longPressTimer = null;
      if (!this.moved && !this.multiTouch && this.activePointer !== null) {
        this.activePointer = null;
        this.options.onLongPress(this.startX, this.startY);
      }
    }, LONG_PRESS_DURATION);
  };

  private onPointerMove = (event: PointerEvent) => {
    if (event.pointerId !== this.activePointer) return;
    const distance = Math.hypot(event.clientX - this.startX, event.clientY - this.startY);
    if (distance > TAP_MAX_MOVEMENT) {
      this.moved = true;
      this.clearLongPress();
    }
  };

  private onPointerUp = (event: PointerEvent) => {
    if (event.pointerId !== this.activePointer) return;
    this.clearLongPress();
    this.activePointer = null;

    if (this.moved || this.multiTouch) return;
    const distance = Math.hypot(event.clientX - this.startX, event.clientY - this.startY);
    const duration = performance.now() - this.startTime;
    if (distance <= TAP_MAX_MOVEMENT && duration <= TAP_MAX_DURATION) {
      this.options.onTap(event.clientX, event.clientY);
    }
  };

  private onCancel = () => {
    this.clearLongPress();
    this.activePointer = null;
  };

  private clearLongPress() {
    if (this.longPressTimer !== null) {
      window.clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  dispose() {
    this.clearLongPress();
    this.element.removeEventListener('pointerdown', this.onPointerDown);
    this.element.removeEventListener('pointermove', this.onPointerMove);
    this.element.removeEventListener('pointerup', this.onPointerUp);
    this.element.removeEventListener('pointercancel', this.onCancel);
  }
}
