import { assetUrl } from '../assetUrl';
import { kindById, type ChudikSpec } from '../game/creatures/ChudikSpec';

type Props = {
  spec: ChudikSpec;
  onPilot: () => void;
  /** Null hides the button (residents have no portrait to wash). */
  onWash: (() => void) | null;
  onFeedGame: (() => void) | null;
  onPuzzle: (() => void) | null;
  onDismiss: () => void;
};

/**
 * After a tap: the chudik already said hello. Walk as them, wash them,
 * feed them, or rebuild their portrait as a puzzle. Drawn creatures get
 * the care games.
 */
export function PilotChoice({ spec, onPilot, onWash, onFeedGame, onPuzzle, onDismiss }: Props) {
  const kind = kindById(spec.kindId);
  return (
    <div className="pilot-choice">
      <p className="pilot-choice-name">
        <span>{kind.emoji}</span>
        {spec.name}
      </p>
      <button className="big-button primary" type="button" onClick={onPilot}>
        <span className="icon">🕹️</span>
        <span>Вести</span>
      </button>
      {onWash ? (
        <button className="big-button" type="button" onClick={onWash}>
          <img className="mg-button-sprite" src={assetUrl('/ui/sponge.png')} alt="" />
          <span>Помыть</span>
        </button>
      ) : null}
      {onFeedGame ? (
        <button className="big-button" type="button" onClick={onFeedGame}>
          <img className="mg-button-sprite" src={assetUrl('/ui/apple.png')} alt="" />
          <span>Кормить</span>
        </button>
      ) : null}
      {onPuzzle ? (
        <button className="big-button" type="button" onClick={onPuzzle}>
          <span className="icon">🧩</span>
          <span>Пазл</span>
        </button>
      ) : null}
      <button className="pilot-dismiss" type="button" onClick={onDismiss} aria-label="Не сейчас">
        ✖️
      </button>
    </div>
  );
}
