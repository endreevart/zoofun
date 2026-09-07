import { useEffect, useMemo, useRef, useState } from 'react';
import { mulberry32 } from '../game/core/rng';
import { cellAt, isRightCell, makePieces, shuffledOrder, type PuzzlePiece } from '../game/play/puzzle';

/**
 * While Meshy sculpts, the child rebuilds the painted still piece by piece.
 * Round one is 2×2 for small hands; round two is 3×3 for the rest of the family.
 */

const ROUNDS = [
  { cols: 2, rows: 2 },
  { cols: 3, rows: 3 },
];

type Drag = { index: number; x: number; y: number; w: number; h: number };

function pieceStyle(piece: PuzzlePiece, cols: number, rows: number, src: string) {
  return {
    backgroundImage: `url("${src}")`,
    backgroundSize: `${cols * 100}% ${rows * 100}%`,
    backgroundPosition: `${cols > 1 ? (piece.col / (cols - 1)) * 100 : 0}% ${
      rows > 1 ? (piece.row / (rows - 1)) * 100 : 0
    }%`,
  };
}

export function HatchPuzzle({
  src,
  name,
  onBack,
  onForward,
}: {
  src: string;
  name?: string;
  onBack: () => void;
  onForward: () => void;
}) {
  const [round, setRound] = useState(0);
  const { cols, rows } = ROUNDS[round];
  const pieces = useMemo(() => makePieces(cols, rows), [cols, rows]);
  const [trayOrder, setTrayOrder] = useState<number[]>(() =>
    shuffledOrder(cols * rows, mulberry32(Date.now() >>> 0)),
  );
  const [placed, setPlaced] = useState<Set<number>>(new Set());
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pop, setPop] = useState<number | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<Drag | null>(null);

  const solved = placed.size === pieces.length;
  const lastRound = round === ROUNDS.length - 1;

  const startRound = (next: number) => {
    const grid = ROUNDS[next];
    setRound(next);
    setPlaced(new Set());
    setTrayOrder(shuffledOrder(grid.cols * grid.rows, mulberry32((Date.now() + next * 977) >>> 0)));
    setPop(null);
  };

  useEffect(() => {
    if (!drag) return;
    const move = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current) return;
      const next = { ...current, x: event.clientX, y: event.clientY };
      dragRef.current = next;
      setDrag(next);
    };
    const up = (event: PointerEvent) => {
      const current = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      const board = boardRef.current;
      if (!current || !board) return;
      const rect = board.getBoundingClientRect();
      const cell = cellAt(
        event.clientX - rect.left,
        event.clientY - rect.top,
        rect.width,
        rect.height,
        cols,
        rows,
      );
      if (isRightCell(pieces[current.index], cell)) {
        setPlaced((have) => new Set(have).add(current.index));
        setPop(current.index);
        window.setTimeout(() => setPop(null), 450);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [drag !== null, cols, rows, pieces]);

  const grab = (index: number) => (event: React.PointerEvent) => {
    if (placed.has(index) || solved) return;
    event.preventDefault();
    const board = boardRef.current;
    const rect = board?.getBoundingClientRect();
    const next = {
      index,
      x: event.clientX,
      y: event.clientY,
      w: rect ? rect.width / cols : 96,
      h: rect ? rect.height / rows : 96,
    };
    dragRef.current = next;
    setDrag(next);
  };

  return (
    <div className="puzzle" role="dialog" aria-label="Собери картинку">
      <div className="mg-head">
        <button className="icon-button" type="button" onClick={onBack} aria-label="Назад">
          ⬅️
        </button>
        <p className="mg-lead">{solved ? 'Собрал!' : `Собери: ${name ?? 'чудик'}`}</p>
        <span className="puzzle-count">
          {placed.size}/{pieces.length}
        </span>
      </div>

      <div
        ref={boardRef}
        className={`puzzle-board${solved ? ' is-solved' : ''}`}
        style={{ aspectRatio: '1 / 1' }}
      >
        <img className="puzzle-ghost" src={src} alt="" draggable={false} />
        {pieces.map((piece) => (
          <div
            key={piece.index}
            className={`puzzle-cell${placed.has(piece.index) ? ' is-placed' : ''}${
              pop === piece.index ? ' is-pop' : ''
            }`}
            style={{
              left: `${(piece.col / cols) * 100}%`,
              top: `${(piece.row / rows) * 100}%`,
              width: `${100 / cols}%`,
              height: `${100 / rows}%`,
              ...(placed.has(piece.index) ? pieceStyle(piece, cols, rows, src) : {}),
            }}
          />
        ))}
      </div>

      {solved ? (
        <div className="mg-done">
          {lastRound ? null : (
            <button className="big-button" type="button" onClick={() => startRound(round + 1)}>
              <span className="icon">🧩</span>
              <span>Ещё сложнее</span>
            </button>
          )}
          <button className="big-button primary" type="button" onClick={onForward}>
            <span className="icon">🌿</span>
            <span>В сад!</span>
          </button>
        </div>
      ) : (
        <div className="puzzle-tray">
          {trayOrder
            .filter((index) => !placed.has(index))
            .map((index) => (
              <div
                key={index}
                className={`puzzle-piece${drag?.index === index ? ' is-dragging' : ''}`}
                style={pieceStyle(pieces[index], cols, rows, src)}
                onPointerDown={grab(index)}
              />
            ))}
        </div>
      )}

      {drag ? (
        <div
          className="puzzle-float"
          style={{
            width: drag.w,
            height: drag.h,
            left: drag.x - drag.w / 2,
            top: drag.y - drag.h * 0.72,
            ...pieceStyle(pieces[drag.index], cols, rows, src),
          }}
        />
      ) : null}
    </div>
  );
}
