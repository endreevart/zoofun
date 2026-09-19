import { useEffect, useRef, useState } from 'react';
import {
  canBeginWalkHold,
  COMPACT_WALK,
  ignoreWalkCancel,
  isHeldPointer,
  shouldCaptureWalkPointer,
  touchStillHeld,
} from '../game/interaction/walkHold';
import { MOBILE_STICK_GAIN, clampStickTravel, stickWalk } from '../game/interaction/walkStick';

type Props = {
  onWalk: (forward: number, right: number) => void;
  className?: string;
};

const HELD = new Set<string>();

function emit(onWalk: (forward: number, right: number) => void) {
  const forward = (HELD.has('up') ? 1 : 0) + (HELD.has('down') ? -1 : 0);
  const right = (HELD.has('right') ? 1 : 0) + (HELD.has('left') ? -1 : 0);
  onWalk(forward, right);
}

function useCompactWalk(): boolean {
  const [compact, setCompact] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(COMPACT_WALK).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(COMPACT_WALK);
    const sync = () => setCompact(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  return compact;
}

function capturePointer(node: HTMLElement, pointerId: number, pointerType: string) {
  if (!shouldCaptureWalkPointer(pointerType)) return;
  try {
    node.setPointerCapture(pointerId);
  } catch {
    /* already released */
  }
}

function blockCallout(node: HTMLElement) {
  const block = (event: Event) => event.preventDefault();
  node.addEventListener('contextmenu', block);
  return () => node.removeEventListener('contextmenu', block);
}

/**
 * Phone and tablet get a thumb stick. Desktop keeps the four arrows.
 * No words — a 4-year-old can drag the knob.
 */
export function WalkPad({ onWalk, className }: Props) {
  const compact = useCompactWalk();
  return compact ? (
    <WalkStick onWalk={onWalk} className={className} />
  ) : (
    <WalkArrows onWalk={onWalk} className={className} />
  );
}

function WalkStick({ onWalk, className }: Props) {
  const baseRef = useRef<HTMLDivElement | null>(null);
  const knobRef = useRef<HTMLDivElement | null>(null);
  const dragId = useRef<number | null>(null);
  const onWalkRef = useRef(onWalk);
  onWalkRef.current = onWalk;

  const paintKnob = (x: number, y: number) => {
    const knob = knobRef.current;
    if (!knob) return;
    knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  };

  const moveTo = (clientX: number, clientY: number) => {
    const base = baseRef.current?.getBoundingClientRect();
    if (!base) return;
    const travel = Math.max(18, base.width / 2 - 22);
    const dx = clientX - (base.left + base.width / 2);
    const dy = clientY - (base.top + base.height / 2);
    const { x, y } = clampStickTravel(dx, dy, travel);
    paintKnob(x, y);
    const walk = stickWalk(x, y, travel, MOBILE_STICK_GAIN);
    onWalkRef.current(walk.forward, walk.right);
  };

  const reset = (pointerId?: number) => {
    if (pointerId !== undefined && !isHeldPointer(dragId.current, pointerId)) return;
    dragId.current = null;
    paintKnob(0, 0);
    onWalkRef.current(0, 0);
  };

  useEffect(() => {
    const node = baseRef.current;
    const onMove = (event: PointerEvent) => {
      if (!isHeldPointer(dragId.current, event.pointerId)) return;
      moveTo(event.clientX, event.clientY);
    };
    const onUp = (event: PointerEvent) => {
      if (ignoreWalkCancel(event)) return;
      reset(event.pointerId);
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (!touchStillHeld(event.touches, dragId.current)) reset();
    };
    const hide = () => {
      if (document.visibilityState === 'hidden') reset();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('touchend', onTouchEnd);
    document.addEventListener('visibilitychange', hide);
    const unbind = node ? blockCallout(node) : () => {};
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('visibilitychange', hide);
      unbind();
      reset();
    };
  }, []);

  return (
    <div
      ref={baseRef}
      className={`walk-pad walk-stick${className ? ` ${className}` : ''}`}
      role="slider"
      aria-label="Ходить по зоопарку"
      aria-valuemin={-1}
      aria-valuemax={1}
      aria-valuenow={0}
      onPointerDown={(event) => {
        if (!canBeginWalkHold(event)) return;
        event.preventDefault();
        event.stopPropagation();
        dragId.current = event.pointerId;
        capturePointer(event.currentTarget, event.pointerId, event.pointerType);
        moveTo(event.clientX, event.clientY);
      }}
      onLostPointerCapture={(event) => {
        if (ignoreWalkCancel(event)) return;
        reset(event.pointerId);
      }}
    >
      <div className="walk-stick-well" aria-hidden="true" />
      <div ref={knobRef} className="walk-stick-knob" aria-hidden="true" />
    </div>
  );
}

function WalkArrows({ onWalk, className }: Props) {
  const onWalkRef = useRef(onWalk);
  onWalkRef.current = onWalk;

  useEffect(() => {
    const tick = () => {
      if (HELD.size) emit(onWalkRef.current);
      raf = window.requestAnimationFrame(tick);
    };
    let raf = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(raf);
      HELD.clear();
      onWalkRef.current(0, 0);
    };
  }, []);

  const press = (dir: string) => {
    HELD.add(dir);
    emit(onWalkRef.current);
  };
  const release = (dir: string) => {
    HELD.delete(dir);
    emit(onWalkRef.current);
  };

  return (
    <div className={`walk-pad${className ? ` ${className}` : ''}`} aria-label="Ходить по зоопарку">
      <PadButton className="walk-up" dir="up" label="Вперёд" onPress={press} onRelease={release}>
        ▲
      </PadButton>
      <PadButton className="walk-left" dir="left" label="Влево" onPress={press} onRelease={release}>
        ◀
      </PadButton>
      <PadButton className="walk-right" dir="right" label="Вправо" onPress={press} onRelease={release}>
        ▶
      </PadButton>
      <PadButton className="walk-down" dir="down" label="Назад" onPress={press} onRelease={release}>
        ▼
      </PadButton>
    </div>
  );
}

function PadButton({
  className,
  dir,
  label,
  onPress,
  onRelease,
  children,
}: {
  className: string;
  dir: string;
  label: string;
  onPress: (dir: string) => void;
  onRelease: (dir: string) => void;
  children: string;
}) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const held = useRef(false);
  const pointerId = useRef<number | null>(null);
  const onPressRef = useRef(onPress);
  const onReleaseRef = useRef(onRelease);
  onPressRef.current = onPress;
  onReleaseRef.current = onRelease;

  const end = (id: number) => {
    if (!isHeldPointer(pointerId.current, id)) return;
    pointerId.current = null;
    if (!held.current) return;
    held.current = false;
    onReleaseRef.current(dir);
  };

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    const onUp = (event: PointerEvent) => {
      if (ignoreWalkCancel(event)) return;
      end(event.pointerId);
    };
    const onTouchEnd = (event: TouchEvent) => {
      const id = pointerId.current;
      if (id === null) return;
      if (touchStillHeld(event.touches, id)) return;
      end(id);
    };
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('touchend', onTouchEnd);
    const unbind = blockCallout(node);
    return () => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('touchend', onTouchEnd);
      unbind();
    };
  }, [dir]);

  return (
    <div
      ref={nodeRef}
      role="button"
      tabIndex={0}
      className={`walk-btn ${className}`}
      aria-label={label}
      onPointerDown={(event) => {
        if (!canBeginWalkHold(event)) return;
        event.preventDefault();
        event.stopPropagation();
        pointerId.current = event.pointerId;
        held.current = true;
        capturePointer(event.currentTarget, event.pointerId, event.pointerType);
        onPressRef.current(dir);
      }}
      onLostPointerCapture={(event) => {
        if (ignoreWalkCancel(event)) return;
        end(event.pointerId);
      }}
      onKeyDown={(event) => {
        if (event.key !== ' ' && event.key !== 'Enter') return;
        event.preventDefault();
        if (held.current) return;
        pointerId.current = -1;
        held.current = true;
        onPressRef.current(dir);
      }}
      onKeyUp={(event) => {
        if (event.key !== ' ' && event.key !== 'Enter') return;
        end(-1);
      }}
    >
      {children}
    </div>
  );
}
