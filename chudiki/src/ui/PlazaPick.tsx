import { useEffect, useState } from 'react';
import { displayStillUrl } from '../game/drawing/portrait';
import type { PlazaToy } from '../game/plaza/plazaApi';
import {
  PLAZA_PICK_HINT,
  PLAZA_PICK_HINT_ART,
  PLAZA_PICK_NEXT,
  PLAZA_PICK_PREV,
  PLAZA_PICK_SIGN,
  PLAZA_PICK_TITLE,
  PLAZA_PICK_WHERE,
  PLAZA_PICK_WIDE,
  plazaEnterLabel,
  plazaPickWindow,
} from '../game/plaza/plazaCopy';

type Props = {
  toys: PlazaToy[];
  onJoin(specId: string): void;
  onClose(): void;
};

const WIDE = '(min-width: 720px)';

function wrapIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  return (index + total) % total;
}

function PickArrow({ back, onClick }: { back: boolean; onClick: () => void }) {
  return (
    <button
      className={`plaza-pick-arrow${back ? ' is-prev' : ' is-next'}`}
      type="button"
      aria-label={back ? 'Назад' : 'Дальше'}
      onClick={onClick}
    >
      <img src={back ? PLAZA_PICK_PREV : PLAZA_PICK_NEXT} alt="" />
    </button>
  );
}

function ToyCard({
  toy,
  on,
  peek,
  onClick,
}: {
  toy: PlazaToy;
  on?: boolean;
  peek?: 'prev' | 'next';
  onClick?: () => void;
}) {
  const src = displayStillUrl(toy.portrait) ?? '';
  return (
    <button
      className={`plaza-pick-card${on ? ' is-on' : ''}${peek ? ` is-peek is-${peek}` : ''}`}
      type="button"
      aria-pressed={on}
      tabIndex={peek ? -1 : 0}
      onClick={onClick}
    >
      {on ? <span className="plaza-pick-check">✓</span> : null}
      <span className="plaza-pick-still">
        {src ? <img src={src} alt="" /> : <span className="plaza-pick-blank" />}
      </span>
      <strong>{toy.name}</strong>
    </button>
  );
}

/** Choose which living Zufik walks onto the shared lawn. */
export function PlazaPick({ toys, onJoin, onClose }: Props) {
  const [selected, setSelected] = useState(0);
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches);

  useEffect(() => {
    const media = window.matchMedia(WIDE);
    const sync = () => setWide(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (selected >= toys.length) setSelected(0);
  }, [selected, toys.length]);

  const total = toys.length;
  const current = toys[Math.min(selected, Math.max(0, total - 1))];
  if (!current) return null;

  const step = (delta: number) => setSelected((index) => wrapIndex(index + delta, total));
  const start = wide ? plazaPickWindow(selected, total) : 0;
  const shown = wide ? toys.slice(start, start + PLAZA_PICK_WIDE) : toys;
  const many = total > 1;
  const arrows = wide && many;
  const peekPrev =
    !wide && total > 2
      ? toys[wrapIndex(selected - 1, total)]
      : !wide && selected > 0
        ? toys[selected - 1]
        : null;
  const peekNext =
    !wide && total > 2
      ? toys[wrapIndex(selected + 1, total)]
      : !wide && selected < total - 1
        ? toys[selected + 1]
        : null;

  return (
    <div className="plaza-sheet" role="dialog" aria-label={PLAZA_PICK_TITLE}>
      <div className={`plaza-pick${wide ? ' is-wide' : ' is-narrow'}${arrows ? ' has-arrows' : ''}`}>
        {!wide ? (
          <button className="plaza-close" type="button" aria-label="Домой" onClick={onClose}>
            ✕
          </button>
        ) : null}
        <div className="plaza-pick-frame">
          <h1 className="plaza-pick-sign">
            <img src={PLAZA_PICK_SIGN} alt={PLAZA_PICK_TITLE} />
          </h1>
          {arrows ? <PickArrow back onClick={() => step(-1)} /> : null}
          <div className="plaza-pick-panel">
            {wide ? (
              <button className="plaza-close" type="button" aria-label="Домой" onClick={onClose}>
                ✕
              </button>
            ) : null}
            <p className="plaza-pick-hint">
              <img src={PLAZA_PICK_HINT_ART} alt={PLAZA_PICK_HINT} />
            </p>
            {wide ? (
              <div className="plaza-pick-row">
                {shown.map((toy) => (
                  <ToyCard
                    key={toy.spec_id}
                    toy={toy}
                    on={toy.spec_id === current.spec_id}
                    onClick={() => setSelected(toys.findIndex((item) => item.spec_id === toy.spec_id))}
                  />
                ))}
              </div>
            ) : (
              <div className="plaza-pick-stage">
                {peekPrev ? (
                  <ToyCard toy={peekPrev} peek="prev" onClick={() => step(-1)} />
                ) : (
                  <span className="plaza-pick-card is-peek is-empty" />
                )}
                <ToyCard toy={current} on />
                {peekNext ? (
                  <ToyCard toy={peekNext} peek="next" onClick={() => step(1)} />
                ) : (
                  <span className="plaza-pick-card is-peek is-empty" />
                )}
              </div>
            )}
            {!wide && total > 1 ? (
              <div className="plaza-pick-dots">
                {toys.map((toy, index) => (
                  <button
                    key={toy.spec_id}
                    className={index === selected ? 'is-on' : undefined}
                    type="button"
                    aria-label={toy.name}
                    onClick={() => setSelected(index)}
                  />
                ))}
              </div>
            ) : null}
            <p className="plaza-pick-where">{PLAZA_PICK_WHERE}</p>
            <button className="plaza-pick-go" type="button" onClick={() => onJoin(current.spec_id)}>
              {plazaEnterLabel(current.name)}
            </button>
          </div>
          {arrows ? <PickArrow back={false} onClick={() => step(1)} /> : null}
        </div>
      </div>
    </div>
  );
}
