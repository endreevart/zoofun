import { kindById, type ChudikSpec } from '../game/creatures/ChudikSpec';
import { CreatureMenuIcon } from './CreatureMenuIcon';

type Props = {
  spec: ChudikSpec;
  pic: string | null;
  onPilot: () => void;
  /** Null hides the button (park animals have no wash game). */
  onWash: (() => void) | null;
  onFeedGame: (() => void) | null;
  onPuzzle: (() => void) | null;
  onTeleport: (() => void) | null;
  onSettings: () => void;
  onDismiss: () => void;
};

/**
 * After a tap: walk as them, wash them, feed them, or rebuild their portrait.
 * The gear opens the same extra settings that used to live behind a long press.
 */
export function PilotChoice({
  spec,
  pic,
  onPilot,
  onWash,
  onFeedGame,
  onPuzzle,
  onTeleport,
  onSettings,
  onDismiss,
}: Props) {
  const kind = kindById(spec.kindId);
  return (
    <div className="pilot-choice" role="dialog" aria-label={spec.name}>
      <div className="pilot-choice-id">
        {pic ? (
          <img className="pilot-choice-face" src={pic} alt="" />
        ) : (
          <span className="pilot-choice-face is-emoji">{kind.emoji}</span>
        )}
        <p className="pilot-choice-name">{spec.name}</p>
      </div>
      <div className="pilot-choice-tools">
        <button className="pilot-tool" type="button" onClick={onSettings} aria-label="Настройки">
          <CreatureMenuIcon name="gear" />
        </button>
        <button className="pilot-tool" type="button" onClick={onDismiss} aria-label="Закрыть">
          <CreatureMenuIcon name="close" />
        </button>
      </div>
      <div className="pilot-choice-actions">
        <button className="pilot-act is-lead" type="button" onClick={onPilot}>
          <CreatureMenuIcon name="lead" />
          <span>Вести</span>
        </button>
        {onWash ? (
          <button className="pilot-act" type="button" onClick={onWash}>
            <CreatureMenuIcon name="wash" />
            <span>Помыть</span>
          </button>
        ) : null}
        {onFeedGame ? (
          <button className="pilot-act" type="button" onClick={onFeedGame}>
            <CreatureMenuIcon name="feed" />
            <span>Кормить</span>
          </button>
        ) : null}
        {onPuzzle ? (
          <button className="pilot-act" type="button" onClick={onPuzzle}>
            <CreatureMenuIcon name="puzzle" />
            <span>Пазл</span>
          </button>
        ) : null}
        {onTeleport ? (
          <button className="pilot-act" type="button" onClick={onTeleport}>
            <CreatureMenuIcon name="move" />
            <span>Телепорт</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
