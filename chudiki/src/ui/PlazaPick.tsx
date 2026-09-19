import { useEffect, useRef, useState } from 'react';
import { assetUrl } from '../assetUrl';
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
const MEADOW = assetUrl('/ui/bg-meadow.webp');
const SWIPE = 48;

function wrapIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  return (index + total) % total;
}

function PickArt({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="plaza-pick-fallback">{alt}</span>;
  return (
    <img
      src={assetUrl(src)}
      alt={alt}
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

function PickArrow({ back, onClick }: { back: boolean; onClick: () => void }) {
  const [failed, setFailed] = useState(false);
  return (
    <button
      className={`plaza-pick-arrow${back ? ' is-prev' : ' is-next'}`}
      type="button"
      aria-label={back ? 'Назад' : 'Дальше'}
      onClick={onClick}
    >
      {failed ? (
        <span className="plaza-pick-fallback">{back ? '‹' : '›'}</span>
      ) : (
        <img
          src={assetUrl(back ? PLAZA_PICK_PREV : PLAZA_PICK_NEXT)}
          alt=""
          draggable={false}
          onError={() => setFailed(true)}
        />
      )}
    </button>
  );
}

function ToyCard({
  toy,
  on,
  onClick,
}: {
  toy: PlazaToy;
  on?: boolean;
  onClick?: () => void;
}) {
  const src = displayStillUrl(toy.portrait) ?? '';
  return (
    <button
      className={`plaza-pick-card${on ? ' is-on' : ''}`}
      type="button"
      aria-pressed={on}
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
  const swipeX = useRef<number | null>(null);

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
  const shown = wide ? toys.slice(start, start + PLAZA_PICK_WIDE) : [current];
  const many = total > 1;

  const onSwipeStart = (clientX: number) => {
    swipeX.current = clientX;
  };
  const onSwipeEnd = (clientX: number) => {
    const from = swipeX.current;
    swipeX.current = null;
    if (from == null || !many) return;
    const dx = clientX - from;
    if (dx > SWIPE) step(-1);
    else if (dx < -SWIPE) step(1);
  };

  return (
    <div className="plaza-sheet" role="dialog" aria-label={PLAZA_PICK_TITLE}>
      <div
        className={`plaza-pick${wide ? ' is-wide' : ' is-narrow'}${many ? ' has-arrows' : ''}`}
        style={{ ['--plaza-meadow' as string]: `url("${MEADOW}")` }}
      >
        <div className="plaza-pick-frame">
          <h1 className="plaza-pick-sign">
            <PickArt src={PLAZA_PICK_SIGN} alt={PLAZA_PICK_TITLE} />
          </h1>
          {wide && many ? <PickArrow back onClick={() => step(-1)} /> : null}
          <div
            className="plaza-pick-panel"
            onPointerDown={(event) => {
              if (event.pointerType === 'mouse' && event.button !== 0) return;
              onSwipeStart(event.clientX);
            }}
            onPointerUp={(event) => onSwipeEnd(event.clientX)}
            onPointerCancel={() => {
              swipeX.current = null;
            }}
          >
            <button className="plaza-close" type="button" aria-label="Домой" onClick={onClose}>
              ✕
            </button>
            <p className="plaza-pick-hint">
              {wide ? <PickArt src={PLAZA_PICK_HINT_ART} alt={PLAZA_PICK_HINT} /> : PLAZA_PICK_HINT}
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
                {many ? <PickArrow back onClick={() => step(-1)} /> : <span className="plaza-pick-arrow-gap" />}
                <ToyCard toy={current} on />
                {many ? <PickArrow back={false} onClick={() => step(1)} /> : <span className="plaza-pick-arrow-gap" />}
              </div>
            )}
            {!wide && many ? (
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
          {wide && many ? <PickArrow back={false} onClick={() => step(1)} /> : null}
        </div>
      </div>
    </div>
  );
}
