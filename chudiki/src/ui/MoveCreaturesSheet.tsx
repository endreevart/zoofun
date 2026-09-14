import { useMemo, useState } from 'react';
import type { ChudikSpec } from '../game/creatures/ChudikSpec';
import { isParkResidentId } from '../game/creatures/residents';
import { displayStillUrl, portraitUrlOf } from '../game/drawing/portrait';

type Props = {
  destTitle: string;
  specs: ChudikSpec[];
  onMove(ids: string[]): void;
  onLater(): void;
};

/** Offer to move some or all child-made creatures onto a newly bought lawn. */
export function MoveCreaturesSheet({ destTitle, specs, onMove, onLater }: Props) {
  const movable = useMemo(
    () => specs.filter((spec) => !isParkResidentId(spec.id)),
    [specs],
  );
  const [picked, setPicked] = useState<Set<string>>(() => new Set());

  if (movable.length === 0) return null;

  const toggle = (id: string) => {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="sheet move-sheet" role="dialog" aria-label="Перенести зуфунят">
      <div className="sheet-header">
        <h1 className="sheet-title">На «{destTitle}»?</h1>
      </div>
      <p className="section-label">Можно перенести всех или тыкнуть кого взять.</p>
      <div className="sheet-body">
        <div className="roster-gallery-grid move-grid">
          {movable.map((spec) => {
            const pic = displayStillUrl(portraitUrlOf(spec.drawing));
            const on = picked.has(spec.id);
            return (
              <button
                key={spec.id}
                type="button"
                className={`move-pick${on ? ' is-on' : ''}`}
                onClick={() => toggle(spec.id)}
              >
                {pic ? <img src={pic} alt="" /> : <span className="move-pick-fallback">{spec.name[0]}</span>}
                <span>{spec.name}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="move-actions">
        <button className="big-button" type="button" onClick={onLater}>
          Позже
        </button>
        <button
          className="big-button"
          type="button"
          onClick={() => onMove(movable.map((spec) => spec.id))}
        >
          Всех
        </button>
        <button
          className="big-button primary"
          type="button"
          disabled={picked.size === 0}
          onClick={() => onMove([...picked])}
        >
          Перенести
        </button>
      </div>
    </div>
  );
}
