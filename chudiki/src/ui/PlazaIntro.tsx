import { assetUrl } from '../assetUrl';
import { UI_CUES, type CueId } from '../game/audio/cues';
import { PLAZA_INTRO_COMPASS, plazaIntroSpec } from '../game/plaza/plazaCues';

type Props = {
  cue: CueId;
  onSkip(): void;
};

/** Welcome plaque on the shared lawn. Only the title board and compass are pictures. */
export function PlazaIntro({ cue, onSkip }: Props) {
  const card = plazaIntroSpec(cue);
  const spec = UI_CUES[cue];
  if (!card || !spec) return null;
  return (
    <div className="plaza-intro" role="status" aria-label={card.title}>
      <div className="plaza-intro-card">
        {card.titleArt ? (
          <img
            className="plaza-intro-title"
            src={assetUrl(card.titleArt)}
            alt={card.title}
            draggable={false}
          />
        ) : (
          <p className="plaza-intro-title-text">{card.title}</p>
        )}
        <button className="plaza-intro-close" type="button" aria-label="Закрыть" onClick={onSkip}>
          ✕
        </button>
        {card.icon === false ? null : (
          <img
            className="plaza-intro-icon"
            src={assetUrl(card.icon || PLAZA_INTRO_COMPASS)}
            alt=""
            draggable={false}
          />
        )}
        <p className="plaza-intro-body">{spec.line}</p>
        <button className="plaza-intro-ok" type="button" onClick={onSkip}>
          Понятно
        </button>
      </div>
    </div>
  );
}
