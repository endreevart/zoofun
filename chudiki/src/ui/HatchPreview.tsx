import { useState } from 'react';
import { downloadPortrait, portraitFileName } from '../game/drawing/portrait';
import { composePostcard, postcardFileName } from '../game/drawing/postcard';
import { HudIcon } from './HudIcon';
import { CreatureMenuIcon } from './CreatureMenuIcon';
import {
  HATCH_DRAW_ANOTHER,
  HATCH_GO_GARDEN,
  HATCH_MESH_WAIT,
  HATCH_TAP_HINT,
  hatchPreviewMode,
  hatchPreviewSrc,
  hatchStillLabel,
} from './hatchView';

function HatchBackIcon() {
  return (
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
  );
}

function HatchLeaves() {
  return (
    <svg className="hatch-leaves" viewBox="0 0 88 64" aria-hidden="true">
      <path d="M58 8c18 6 28 22 22 36-14-2-28-14-32-30 4-4 8-6 10-6z" fill="#b7d86a" />
      <path d="M72 18c8 10 8 22 0 30-10-6-16-16-16-26 6-2 12-4 16-4z" fill="#8fc15a" />
      <path d="M18 14c16 10 20 28 8 40-16-8-24-22-20-36 4-2 8-4 12-4z" fill="#c8e087" opacity="0.85" />
    </svg>
  );
}

function PostcardMark() {
  return (
    <svg className="hatch-tile-ico" viewBox="0 0 48 48" aria-hidden="true">
      <rect x="6" y="10" width="36" height="28" rx="6" fill="#f4ead0" stroke="#d7c49a" strokeWidth="2" />
      <path d="M8 30l10-9 8 7 6-5 10 9" fill="#8ec85a" />
      <circle cx="16" cy="18" r="3" fill="#f0c44a" />
    </svg>
  );
}

/**
 * After submit the child only goes forward. The still is the studio toy.
 * The garden postcard is a second OpenRouter paint; tapping the picture
 * shows it once it lands. A local meadow composite is only the fallback
 * if that second paint never arrived.
 */
export function HatchPreview({
  src,
  postcardSrc,
  postcardDone = false,
  name,
  canDrawAnother = true,
  stillRemaining = null,
  meshCooking = false,
  onDrawAnother,
  onForward,
  onPuzzle,
}: {
  src: string | null;
  postcardSrc?: string | null;
  postcardDone?: boolean;
  name?: string;
  canDrawAnother?: boolean;
  stillRemaining?: number | null;
  meshCooking?: boolean;
  onDrawAnother: () => void;
  onForward: () => void;
  onPuzzle?: () => void;
}) {
  const [saving, setSaving] = useState<'photo' | 'postcard' | null>(null);
  const [wantGarden, setWantGarden] = useState(false);
  const postcard = postcardSrc ?? null;
  const mode = hatchPreviewMode(src, postcard, wantGarden);
  const art = hatchPreviewSrc(src, postcard, wantGarden);
  const waitingGarden = wantGarden && !postcard && !postcardDone;

  const save = async (kind: 'photo' | 'postcard') => {
    if (!src || saving) return;
    if (kind === 'postcard' && !postcard && !postcardDone) {
      setWantGarden(true);
      return;
    }
    setSaving(kind);
    try {
      const fileName =
        kind === 'photo' ? portraitFileName(name ?? 'chudik') : postcardFileName(name ?? 'chudik');
      const url = kind === 'photo' ? src : postcard ?? (await composePostcard(src));
      await downloadPortrait(url, fileName);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div
      className={`hatch-preview${src ? (mode === 'garden' ? ' is-garden' : ' is-studio') : ' is-painting'}`}
      role="dialog"
      aria-label={src ? (name ? name : 'Вот кто получился') : 'Красим игрушку'}
    >
      {src ? (
        <>
          <div className="hatch-head">
            <button className="hatch-back" type="button" aria-label="В сад" onClick={onForward}>
              <HatchBackIcon />
            </button>
            {name ? <h1 className="hatch-preview-name">{name}</h1> : <span className="hatch-preview-name" />}
            <HatchLeaves />
          </div>
          <button
            className="hatch-preview-art-btn"
            type="button"
            onClick={() => setWantGarden((open) => !open)}
            aria-label={mode === 'garden' ? 'Показать игрушку' : 'Показать в саду'}
          >
            <img className="hatch-preview-art" src={art ?? src} alt="" />
          </button>
          <p className="hatch-preview-hint">
            {mode === 'garden' ? 'В саду' : waitingGarden ? 'Рисуем сад…' : HATCH_TAP_HINT}
          </p>
          <div className="hatch-tools">
            <button className="hatch-go" type="button" onClick={onForward}>
              {HATCH_GO_GARDEN}
            </button>
            <div className="hatch-grid">
              <button
                className="hatch-tile"
                type="button"
                disabled={saving !== null}
                onClick={() => void save('photo')}
              >
                <HudIcon name="photo" />
                <span>{saving === 'photo' ? '…' : 'Фото'}</span>
              </button>
              <button
                className={`hatch-tile${mode === 'garden' ? ' is-on' : ''}`}
                type="button"
                disabled={saving !== null}
                onClick={() => {
                  setWantGarden(true);
                  void save('postcard');
                }}
              >
                {saving === 'postcard' || waitingGarden ? <span className="hatch-tile-wait">…</span> : <PostcardMark />}
                <span>Открытка</span>
              </button>
              <button
                className="hatch-tile is-draw"
                type="button"
                disabled={!canDrawAnother}
                aria-label={HATCH_DRAW_ANOTHER}
                onClick={onDrawAnother}
              >
                <HudIcon name="draw" />
                <span>{HATCH_DRAW_ANOTHER}</span>
                {stillRemaining != null ? (
                  <em className="hatch-still">{hatchStillLabel(stillRemaining)}</em>
                ) : null}
              </button>
              {onPuzzle ? (
                <button className="hatch-tile" type="button" onClick={onPuzzle}>
                  <CreatureMenuIcon name="puzzle" />
                  <span>Собрать пазл</span>
                </button>
              ) : (
                <span className="hatch-tile is-gap" />
              )}
            </div>
            {meshCooking ? <p className="hatch-preview-wait">{HATCH_MESH_WAIT}</p> : null}
          </div>
        </>
      ) : (
        <>
          <div className="spinner" />
          <p className="hatch-preview-lead">Красим игрушку</p>
        </>
      )}
    </div>
  );
}
