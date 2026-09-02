import { useMemo, useState } from 'react';
import { KINDS, NAME_SUGGESTIONS } from '../game/creatures/ChudikSpec';

/**
 * "Give it a name and a kind" — the moment the drawing becomes somebody's
 * creature. Names can be tapped instead of typed, because most of the audience
 * cannot spell yet; the text field is there for the ones who can.
 */

export type NameSheetProps = {
  previewUrl: string;
  suggestedName: string;
  onCancel(): void;
  onConfirm(result: { name: string; kindId: string }): void;
};

export function NameSheet({ previewUrl, suggestedName, onCancel, onConfirm }: NameSheetProps) {
  const [name, setName] = useState(suggestedName);
  const [kindId, setKindId] = useState(KINDS[0].id);

  // Six options is enough to feel like a choice without becoming a wall.
  const suggestions = useMemo(() => {
    const pool = NAME_SUGGESTIONS.filter((candidate) => candidate !== suggestedName);
    const picks = [suggestedName];
    for (let i = 0; i < 5 && pool.length > 0; i++) {
      picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    return picks;
  }, [suggestedName]);

  const trimmed = name.trim();

  return (
    <div className="sheet">
      <div className="sheet-header">
        <button className="icon-button" onClick={onCancel} aria-label="Назад">
          ⬅️
        </button>
        <h1 className="sheet-title">Кто это получился?</h1>
        <div style={{ width: 62 }} />
      </div>

      <div className="sheet-body">
        <div className="name-layout">
          <div className="preview-card">
            <img src={previewUrl} alt="Твой чудик" />
            <strong style={{ fontSize: 22 }}>{trimmed || '...'}</strong>
          </div>

          <div className="name-choices">
            <p className="section-label">Как его зовут?</p>
            <div className="chip-grid">
              {suggestions.map((candidate) => (
                <button
                  key={candidate}
                  className="chip"
                  data-active={trimmed === candidate}
                  onClick={() => setName(candidate)}
                >
                  {candidate}
                </button>
              ))}
            </div>

            <input
              className="name-input"
              value={name}
              maxLength={16}
              placeholder="или впиши своё имя"
              onChange={(event) => setName(event.target.value)}
            />

            <p className="section-label">Кто он такой?</p>
            <div className="kind-grid">
              {KINDS.map((kind) => (
                <button
                  key={kind.id}
                  className="kind-card"
                  data-active={kindId === kind.id}
                  onClick={() => setKindId(kind.id)}
                >
                  <span className="emoji">{kind.emoji}</span>
                  <span>{kind.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="sheet-footer">
        <button
          className="icon-button wide go"
          disabled={trimmed.length === 0}
          onClick={() => onConfirm({ name: trimmed, kindId })}
        >
          🎉 В зоопарк!
        </button>
      </div>
    </div>
  );
}
