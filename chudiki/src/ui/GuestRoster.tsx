import { useState } from 'react';
import { displayStillUrl } from '../game/drawing/portrait';
import type { GuestCreature } from '../game/visits/visitApi';
import { CreatureMenuIcon } from './CreatureMenuIcon';

type Props = {
  shareId?: string;
  creatures: GuestCreature[];
  thumbs?: Record<string, string>;
  onHeart(id: string): void;
  onClose(): void;
};

function guestFace(row: GuestCreature, shareId: string, thumb?: string): string {
  const drawing = row.spec.drawing;
  const hosted =
    drawing?.portraitUrl ||
    drawing?.postcardUrl ||
    (shareId && !shareId.startsWith('local:')
      ? `/v1/public/zoos/${encodeURIComponent(shareId)}/creatures/${encodeURIComponent(row.spec.id)}/portrait`
      : '');
  return displayStillUrl(hosted || thumb || null) ?? '';
}

export function GuestRoster({ shareId = '', creatures, thumbs = {}, onHeart, onClose }: Props) {
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const [pop, setPop] = useState<string | null>(null);
  return (
    <div className="roster-sheet" role="dialog" aria-label="Зуфики сада">
      <div className="roster-card">
        <header className="roster-head">
          <button className="roster-back" type="button" aria-label="Назад" onClick={onClose}>
            <CreatureMenuIcon name="close" />
          </button>
          <h1 className="roster-title">
            Зуфики <span className="roster-count">{creatures.length}</span>
          </h1>
        </header>
        {creatures.length === 0 ? (
          <p className="roster-empty">Здесь пока никого.</p>
        ) : (
          <div className="roster-photos guest-hearts">
            {creatures.map((row) => {
              const src = guestFace(row, shareId, thumbs[row.spec.id]);
              const face = src && !broken[row.spec.id] ? src : '';
              return (
                <div key={row.spec.id} className="roster-photo">
                  <span className="roster-photo-hit">
                    {face ? (
                      <img src={face} alt="" onError={() => setBroken((cur) => ({ ...cur, [row.spec.id]: true }))} />
                    ) : (
                      <span className="roster-pick-face is-empty">♥</span>
                    )}
                  </span>
                  <span className="roster-photo-name">{row.spec.name || 'Зуфик'}</span>
                  <button
                    className={`guest-heart-btn${pop === row.spec.id ? ' is-pop' : ''}`}
                    type="button"
                    onClick={() => {
                      setPop(row.spec.id);
                      onHeart(row.spec.id);
                    }}
                    onAnimationEnd={() => setPop(null)}
                  >
                    ♥ {row.hearts}
                    {pop === row.spec.id ? (
                      <span className="heart-hud-plus" aria-hidden="true">
                        +1
                      </span>
                    ) : null}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
