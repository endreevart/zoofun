import { useEffect, useMemo, useRef, useState } from 'react';
import { kindById, type ChudikSpec } from '../game/creatures/ChudikSpec';
import { downloadPortrait, displayStillUrl, portraitUrlOf } from '../game/drawing/portrait';
import { ALBUM_POSTCARD_SIZE, composePostcard, postcardFileName } from '../game/drawing/postcard';
import { CreatureMenuIcon } from './CreatureMenuIcon';
import {
  albumSrc,
  collageFaces,
  ownRoster,
  photosInView,
  rosterEntry,
  ROSTER_ALL,
  ROSTER_DOWNLOAD_GLB,
  ROSTER_GO_GARDEN,
  ROSTER_TITLE,
  type RosterEntry,
} from './rosterView';

export type RosterSheetProps = {
  specs: ChudikSpec[];
  thumbs: Record<string, string>;
  onClose(): void;
  onSelect(spec: ChudikSpec): void;
  onGarden?(spec: ChudikSpec): void;
  onDownloadGlb?(spec: ChudikSpec): void;
};

export function RosterSheet({ specs, thumbs, onClose, onSelect, onGarden, onDownloadGlb }: RosterSheetProps) {
  const entries = useMemo(
    () =>
      ownRoster(specs).map((spec) =>
        rosterEntry({
          id: spec.id,
          name: spec.name,
          postcard: spec.drawing?.postcardUrl?.trim() || null,
          still: portraitUrlOf(spec.drawing) ?? thumbs[spec.id] ?? null,
        }),
      ),
    [specs, thumbs],
  );
  const [filter, setFilter] = useState(ROSTER_ALL);
  const [busy, setBusy] = useState(false);
  const [peek, setPeek] = useState<RosterEntry | null>(null);
  const [meadow, setMeadow] = useState<Record<string, string>>({});
  const meadowKey = useRef<Record<string, string>>({});
  const railRef = useRef<HTMLDivElement | null>(null);
  const [canSlide, setCanSlide] = useState(false);
  const photos = photosInView(entries, filter);
  const collage = collageFaces(entries);
  const byId = useMemo(() => new Map(specs.map((spec) => [spec.id, spec])), [specs]);

  useEffect(() => {
    let cancelled = false;
    const paint = async () => {
      for (const entry of entries) {
        if (cancelled || entry.hasPostcard || !entry.still) continue;
        if (meadowKey.current[entry.id] === entry.still) continue;
        const src = displayStillUrl(entry.still) ?? entry.still;
        const card = await composePostcard(src, ALBUM_POSTCARD_SIZE);
        if (cancelled) return;
        meadowKey.current[entry.id] = entry.still;
        setMeadow((prev) => ({ ...prev, [entry.id]: card }));
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    };
    void paint();
    return () => {
      cancelled = true;
    };
  }, [entries]);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const measure = () => setCanSlide(rail.scrollWidth > rail.clientWidth + 8);
    measure();
    rail.addEventListener('scroll', measure);
    window.addEventListener('resize', measure);
    return () => {
      rail.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [entries.length]);

  const gardenOf = (entry: RosterEntry) => {
    const src = albumSrc(entry, meadow[entry.id]);
    return displayStillUrl(src) ?? src ?? '';
  };

  const openCreature = (id: string) => {
    const spec = byId.get(id);
    if (spec) onSelect(spec);
  };

  const saveOne = async (entry: RosterEntry, share = true) => {
    const still = displayStillUrl(entry.still);
    const garden = displayStillUrl(entry.garden);
    const file = postcardFileName(entry.name);
    if (entry.hasPostcard && garden) {
      await downloadPortrait(garden, file, { share });
      return;
    }
    if (still) {
      const card = await composePostcard(still);
      await downloadPortrait(card, file, { share });
      return;
    }
    if (garden) await downloadPortrait(garden, file, { share });
  };

  const saveAll = async () => {
    if (busy || photos.length === 0) return;
    setBusy(true);
    try {
      for (const entry of photos) {
        await saveOne(entry, false);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="roster-sheet" role="dialog" aria-labelledby="roster-title">
      <div className="roster-card">
        <header className="roster-head">
          <button className="roster-back" type="button" aria-label="Назад" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M15 5 L8 12 L15 19"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <h1 id="roster-title" className="roster-title">
            {ROSTER_TITLE}
            <span className="roster-count">{entries.length}</span>
          </h1>
          <button
            className="roster-all"
            type="button"
            disabled={busy || photos.length === 0}
            onClick={() => void saveAll()}
          >
            <DownloadMark />
            <span className="roster-all-label">Скачать все</span>
          </button>
        </header>

        {entries.length === 0 ? (
          <p className="roster-empty">Пока никого. Нарисуй первого зуфика!</p>
        ) : (
          <>
            <div className="roster-filter">
              <p className="roster-filter-label">Выбери зуфика</p>
              <div className="roster-rail-wrap">
                <div className="roster-rail" ref={railRef}>
                  <button
                    type="button"
                    className={`roster-pick${filter === ROSTER_ALL ? ' is-on' : ''}`}
                    onClick={() => setFilter(ROSTER_ALL)}
                  >
                    <span className="roster-pick-face is-all" aria-hidden="true">
                      {collage.map((src) => (
                        <img key={src} src={displayStillUrl(src) ?? src} alt="" />
                      ))}
                    </span>
                    <span>Все</span>
                  </button>
                  {entries.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className={`roster-pick${filter === entry.id ? ' is-on' : ''}`}
                      onClick={() => setFilter(entry.id)}
                    >
                      {entry.face ? (
                        <img
                          className="roster-pick-face"
                          src={displayStillUrl(entry.face) ?? entry.face}
                          alt=""
                        />
                      ) : (
                        <span className="roster-pick-face is-empty">
                          {kindById(byId.get(entry.id)?.kindId ?? '').emoji}
                        </span>
                      )}
                      <span>{entry.name}</span>
                    </button>
                  ))}
                </div>
                {canSlide ? (
                  <button
                    className="roster-rail-next"
                    type="button"
                    aria-label="Ещё зуфики"
                    onClick={() => railRef.current?.scrollBy({ left: 220, behavior: 'smooth' })}
                  >
                    <CreatureMenuIcon name="chevron" />
                  </button>
                ) : null}
              </div>
            </div>

            <section className="roster-album">
              <h2 className="roster-album-title">Фотографии в саду</h2>
              <p className="roster-album-hint">Нажми на фото, чтобы открыть</p>
              <div className="roster-photos">
                {photos.map((entry, index) => (
                  <article
                    key={entry.id}
                    className={`roster-photo${index === 0 ? ' is-hero' : ''}`}
                  >
                    <button
                      type="button"
                      className="roster-photo-hit"
                      aria-label={`Открыть ${entry.name}`}
                      onClick={() => openCreature(entry.id)}
                    >
                      <img src={gardenOf(entry)} alt="" />
                      {index === 0 ? <span className="roster-open-pill">Открыть</span> : null}
                    </button>
                    <span className="roster-photo-name">{entry.name}</span>
                    <div className="roster-photo-tools">
                      <button
                        className="roster-expand"
                        type="button"
                        aria-label={`Посмотреть фото ${entry.name}`}
                        onClick={() => setPeek(entry)}
                      >
                        <ExpandMark />
                      </button>
                      <button
                        className="roster-dl"
                        type="button"
                        aria-label={`Скачать фото ${entry.name}`}
                        onClick={() => void saveOne(entry)}
                      >
                        <DownloadMark />
                      </button>
                      {byId.get(entry.id)?.drawing?.modelUrl ? (
                        <button
                          className="roster-chip"
                          type="button"
                          aria-label={`${ROSTER_DOWNLOAD_GLB} ${entry.name}`}
                          onClick={() => void onDownloadGlb?.(byId.get(entry.id)!)}
                        >
                          {ROSTER_DOWNLOAD_GLB}
                        </button>
                      ) : (
                        <button
                          className="roster-chip"
                          type="button"
                          aria-label={`${ROSTER_GO_GARDEN} ${entry.name}`}
                          onClick={() => (onGarden ?? onSelect)(byId.get(entry.id)!)}
                        >
                          {ROSTER_GO_GARDEN}
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      {peek ? (
        <div className="roster-peek">
          <button className="roster-peek-scrim" type="button" aria-label="Закрыть" onClick={() => setPeek(null)} />
          <div className="roster-peek-card">
            <img src={gardenOf(peek)} alt="" />
            <div className="roster-peek-bar">
              <strong>{peek.name}</strong>
              <button className="roster-dl" type="button" aria-label="Скачать" onClick={() => void saveOne(peek)}>
                <DownloadMark />
              </button>
              <button className="roster-back" type="button" aria-label="Закрыть" onClick={() => setPeek(null)}>
                <CreatureMenuIcon name="close" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DownloadMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 4v10m0 0-4.2-4.2M12 14l4.2-4.2M5 18.5h14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExpandMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M8 5H5v3M16 5h3v3M8 19H5v-3M16 19h3v-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
