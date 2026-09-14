import { CreatureMenuIcon } from './CreatureMenuIcon';
import { HudIcon } from './HudIcon';
import { firstDrawCopy } from './firstDraw';

type Props = {
  again?: boolean;
  onDraw(): void;
  onPhoto(): void;
  onClose(): void;
};

/** Huge draw/photo paths: first visit of the garden, or after the last credit. */
export function FirstDrawPrompt({ again = false, onDraw, onPhoto, onClose }: Props) {
  const copy = firstDrawCopy(again);
  return (
    <div className="first-draw" role="dialog" aria-label={copy.label}>
      <button className="first-draw-close" type="button" aria-label="Закрыть" onClick={onClose}>
        <CreatureMenuIcon name="close" />
      </button>
      <div className="first-draw-actions">
        <button className="big-button primary first-draw-btn" type="button" onClick={onDraw}>
          <HudIcon name="draw" />
          <span>{copy.draw}</span>
        </button>
        <button className="big-button first-draw-btn" type="button" onClick={onPhoto}>
          <HudIcon name="photo" />
          <span>{copy.photo}</span>
        </button>
      </div>
    </div>
  );
}
