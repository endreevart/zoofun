import { kindById, type ChudikSpec } from '../game/creatures/ChudikSpec';

type Props = {
  spec: ChudikSpec;
  onPilot: () => void;
  onDismiss: () => void;
};

/**
 * After a tap: the chudik already said hello. One big choice — walk as them.
 */
export function PilotChoice({ spec, onPilot, onDismiss }: Props) {
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
      <button className="pilot-dismiss" type="button" onClick={onDismiss} aria-label="Не сейчас">
        ✖️
      </button>
    </div>
  );
}
