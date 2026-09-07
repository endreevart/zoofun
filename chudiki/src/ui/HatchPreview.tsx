import { useState } from 'react';
import { downloadPortrait, portraitFileName } from '../game/drawing/portrait';
import { composePostcard, postcardFileName } from '../game/drawing/postcard';

/**
 * After submit the child only goes forward. The still is a preview; the garden
 * keeps the egg until Meshy finishes the puppet. The photo can be taken home:
 * as the plain still or as a postcard with the toy standing on the meadow.
 */

export function HatchPreview({
  src,
  name,
  onForward,
  onPuzzle,
}: {
  src: string | null;
  name?: string;
  onForward: () => void;
  onPuzzle?: () => void;
}) {
  const [saving, setSaving] = useState<'photo' | 'postcard' | null>(null);

  const save = async (kind: 'photo' | 'postcard') => {
    if (!src || saving) return;
    setSaving(kind);
    try {
      const fileName =
        kind === 'photo' ? portraitFileName(name ?? 'chudik') : postcardFileName(name ?? 'chudik');
      const url = kind === 'photo' ? src : await composePostcard(src);
      await downloadPortrait(url, fileName);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="hatch-preview" role="dialog" aria-label="Вот кто получился">
      {src ? (
        <>
          <p className="hatch-preview-lead">Вот кто получился</p>
          {name ? <h2 className="hatch-preview-name">{name}</h2> : null}
          <img className="hatch-preview-art" src={src} alt="" />
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
              className="save-chip"
              type="button"
              disabled={saving !== null}
              onClick={() => void save('postcard')}
            >
              <span className="icon">{saving === 'postcard' ? '⏳' : '🖼️'}</span>
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
