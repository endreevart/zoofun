import { useState } from 'react';
import { downloadPortrait, portraitFileName } from '../game/drawing/portrait';
import { composePostcard, postcardFileName } from '../game/drawing/postcard';
import { hatchPreviewMode, hatchPreviewSrc } from './hatchView';

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
  onForward,
  onPuzzle,
}: {
  src: string | null;
  postcardSrc?: string | null;
  postcardDone?: boolean;
  name?: string;
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
      className={`hatch-preview${mode === 'garden' ? ' is-garden' : ' is-studio'}`}
      role="dialog"
      aria-label="Вот кто получился"
    >
      {src ? (
        <>
          <p className="hatch-preview-lead">Вот кто получился</p>
          {name ? <h2 className="hatch-preview-name">{name}</h2> : null}
          <button
            className="hatch-preview-art-btn"
            type="button"
            onClick={() => setWantGarden((open) => !open)}
            aria-label={mode === 'garden' ? 'Показать игрушку' : 'Показать в саду'}
          >
            <img className="hatch-preview-art" src={art ?? src} alt="" />
          </button>
          <p className="hatch-preview-hint">
            {mode === 'garden' ? 'В саду' : waitingGarden ? 'Рисуем сад…' : 'Нажми — увидишь сад'}
          </p>
          <div className="hatch-preview-save">
            <button
              className="save-chip"
              type="button"
              disabled={saving !== null}
              onClick={() => void save('photo')}
            >
              <span className="icon">{saving === 'photo' ? '⏳' : '⬇️'}</span>
              <span>Фото</span>
            </button>
            <button
              className={`save-chip${mode === 'garden' ? ' is-on' : ''}`}
              type="button"
              disabled={saving !== null}
              onClick={() => {
                setWantGarden(true);
                void save('postcard');
              }}
            >
              <span className="icon">
                {saving === 'postcard' || waitingGarden ? '⏳' : '🖼️'}
              </span>
              <span>Открытка из сада</span>
            </button>
          </div>
          <div className="hatch-preview-actions">
            {onPuzzle ? (
              <button className="big-button hatch-preview-go" type="button" onClick={onPuzzle}>
                <span className="icon">🧩</span>
                <span>Собрать пазл</span>
              </button>
            ) : null}
            <button
              className="big-button primary hatch-preview-go"
              type="button"
              onClick={onForward}
            >
              <span className="icon">🌿</span>
              <span>В сад!</span>
            </button>
          </div>
          <p className="hatch-preview-wait">Объём ещё лепится — можно не ждать</p>
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
