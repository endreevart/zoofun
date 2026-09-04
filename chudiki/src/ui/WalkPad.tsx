import { useEffect, useRef, useState } from 'react';

type Props = {
  onWalk: (forward: number, right: number) => void;
};

const HELD = new Set<string>();
const STICK_DEAD = 8;
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
export function WalkPad({ onWalk }: Props) {
  const compact = useCompactWalk();
  return compact ? <WalkStick onWalk={onWalk} /> : <WalkArrows onWalk={onWalk} />;
}

function WalkStick({ onWalk }: Props) {
  const baseRef = useRef<HTMLDivElement | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  useEffect(
    () => () => {
      onWalk(0, 0);
    },
    [onWalk],
  );

  const moveTo = (clientX: number, clientY: number) => {
    const base = baseRef.current?.getBoundingClientRect();
    if (!base) return;
    const travel = Math.max(18, base.width / 2 - 22);
    const dx = clientX - (base.left + base.width / 2);
    const dy = clientY - (base.top + base.height / 2);
    const length = Math.hypot(dx, dy);
    const scale = length > travel ? travel / length : 1;
    const x = dx * scale;
    const y = dy * scale;
    setKnob({ x, y });
    const right = Math.abs(x) < STICK_DEAD ? 0 : x / travel;
    const forward = Math.abs(y) < STICK_DEAD ? 0 : -y / travel;
    onWalk(forward, right);
  };

  const reset = () => {
    setKnob({ x: 0, y: 0 });
    onWalk(0, 0);
  };

  return (
    <div
      ref={baseRef}
      className="walk-pad walk-stick"
      role="slider"
      aria-label="Ходить по зоопарку"
      aria-valuemin={-1}
      aria-valuemax={1}
      aria-valuenow={0}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        moveTo(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        moveTo(event.clientX, event.clientY);
      }}
      onPointerUp={reset}
      onPointerCancel={reset}
    >
      <div className="walk-stick-well" aria-hidden="true" />
      <div
        className="walk-stick-knob"
        aria-hidden="true"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
    </div>
  );
}

function WalkArrows({ onWalk }: Props) {
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
    <div className="walk-pad" aria-label="Ходить по зоопарку">
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
  return (
    <button
      type="button"
      className={`walk-btn ${className}`}
      aria-label={label}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        onPress(dir);
      }}
      onPointerUp={() => onRelease(dir)}
      onPointerCancel={() => onRelease(dir)}
    >
      {children}
    </button>
  );
}
