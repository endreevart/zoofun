import { CreatureMenuIcon } from './CreatureMenuIcon';
import { HudIcon } from './HudIcon';

type Props = {
  onDraw(): void;
  onClose(): void;
};

/** Short card after the first living Zufik: more friends become postcards. */
export function StillHint({ onDraw, onClose }: Props) {
  return (
    <div className="first-draw still-hint" role="dialog" aria-label="Можно нарисовать ещё">
      <button className="first-draw-close" type="button" aria-label="Понятно" onClick={onClose}>
        <CreatureMenuIcon name="close" />
      </button>
      <div className="first-draw-actions">
        <button className="big-button primary first-draw-btn" type="button" onClick={onDraw}>
          <HudIcon name="draw" />
          <span>Нарисовать ещё</span>
        </button>
        <button className="big-button first-draw-btn" type="button" onClick={onClose}>
          <HudIcon name="roster" />
          <span>Понятно</span>
        </button>
      </div>
    </div>
  );
}
