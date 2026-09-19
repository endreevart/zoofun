import { useEffect, useRef, useState } from 'react';
import { MOBILE_STICK_GAIN, clampStickTravel, stickWalk } from '../game/interaction/walkStick';

type Props = {
  onWalk: (forward: number, right: number) => void;
  className?: string;
};

const HELD = new Set<string>();
const COMPACT_WALK = '(max-width: 1280px)';

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

  const reset = () => {
    dragId.current = null;
    paintKnob(0, 0);
    onWalkRef.current(0, 0);
  };

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (dragId.current !== event.pointerId) return;
      moveTo(event.clientX, event.clientY);
    };
    const onUp = (event: PointerEvent) => {
      if (dragId.current !== event.pointerId) return;
      reset();
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (dragId.current === null) return;
      if (event.touches.length > 0) return;
      reset();
    };
    const hide = () => {
      if (document.visibilityState === 'hidden') reset();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', hide);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('blur', reset);
      document.removeEventListener('visibilitychange', hide);
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
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.stopPropagation();
        dragId.current = event.pointerId;
        moveTo(event.clientX, event.clientY);
      }}
    >
      <div className="walk-stick-well" aria-hidden="true" />
      <div ref={knobRef} className="walk-stick-knob" aria-hidden="true" />
    </div>
  );
}

function WalkArrows({ onWalk, className }: Props) {
  useEffect(
    () => () => {
      HELD.clear();
      onWalk(0, 0);
    },
    [onWalk],
  );

  const press = (dir: string) => {
    HELD.add(dir);
    emit(onWalk);
  };
  const release = (dir: string) => {
    HELD.delete(dir);
    emit(onWalk);
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
  const held = useRef(false);
  const onReleaseRef = useRef(onRelease);
  onReleaseRef.current = onRelease;

  useEffect(() => {
    const up = () => {
      if (!held.current) return;
      held.current = false;
      onReleaseRef.current(dir);
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('blur', up);
    };
  }, [dir]);

  return (
    <button
      type="button"
      className={`walk-btn ${className}`}
      aria-label={label}
      onPointerDown={(event) => {
        event.preventDefault();
        held.current = true;
        onPress(dir);
      }}
    >
      {children}
    </button>
  );
}
