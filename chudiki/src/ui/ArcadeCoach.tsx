import { arcadeCoachHint, arcadeCoachLabel, needForStep, type ArcadeStep } from '../game/arcade/arcadeQuest';
import { CreatureMenuIcon } from './CreatureMenuIcon';

type Props = {
  step: ArcadeStep;
  count?: number;
  thumb?: string | null;
  onLeave?: () => void;
};

const FALLBACK: Record<ArcadeStep, string> = {
  trees: '🌳',
  pond: '💧',
  houses: '🏠',
  settle: '🐣',
  done: '',
};

/** Huge picture of the toy in hand plus “tap the land”. Voice carries the rest. */
export function ArcadeCoach({ step, count = 0, thumb, onLeave }: Props) {
  if (step === 'done') return null;
  const label = arcadeCoachLabel(step);
  const hint = arcadeCoachHint(step);
  const left = Math.max(0, needForStep(step) - count);
  return (
    <>
      <div className="arcade-badge">Аркада</div>
      {onLeave ? (
        <button className="arcade-leave" type="button" aria-label="В миры" onClick={onLeave}>
          <CreatureMenuIcon name="close" />
        </button>
      ) : null}
      <div className="arcade-coach" aria-label={label}>
        {thumb ? (
          <img className="arcade-coach-art" src={thumb} alt="" draggable={false} />
        ) : (
          <span className="arcade-coach-fallback" aria-hidden="true">
            {FALLBACK[step]}
          </span>
        )}
        <span className="arcade-coach-label">{label}</span>
        {left > 1 ? <span className="arcade-coach-left">ещё {left}</span> : null}
        {hint ? <span className="arcade-coach-tap">{hint}</span> : null}
      </div>
    </>
  );
}
