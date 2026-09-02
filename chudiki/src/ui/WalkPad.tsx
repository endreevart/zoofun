import { useEffect } from 'react';

type Props = {
  onWalk: (forward: number, right: number) => void;
};

const HELD = new Set<string>();

function emit(onWalk: (forward: number, right: number) => void) {
  const forward = (HELD.has('up') ? 1 : 0) + (HELD.has('down') ? -1 : 0);
  const right = (HELD.has('right') ? 1 : 0) + (HELD.has('left') ? -1 : 0);
  onWalk(forward, right);
}

/**
 * Big D-pad for fingers. No words — a 4-year-old can press the arrows.
 * Hold one or two at once to go diagonally.
 */
export function WalkPad({ onWalk }: Props) {
  useEffect(() => () => {
    HELD.clear();
    onWalk(0, 0);
  }, [onWalk]);

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
