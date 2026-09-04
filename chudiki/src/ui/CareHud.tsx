import { HudIcon } from './HudIcon';

type CareHudProps = {
  joy: number;
  feeding: boolean;
  onFeed: () => void;
};

/**
 * Feed sits in the main toolbar. A bowl plus a filling bar: empty means
 * tap to feed. While they eat the button pulses so the child sees it worked.
 */
export function CareHud({ joy, feeding, onFeed }: CareHudProps) {
  const food = Math.max(0.08, Math.min(1, joy));
  const level = food < 0.34 ? 'мало' : food < 0.7 ? 'есть' : 'полно';

  return (
    <button
      className={`big-button feed-button${feeding ? ' is-feeding' : ''}`}
      type="button"
      disabled={feeding}
      onClick={onFeed}
      aria-label={feeding ? 'Чудики кушают' : `Покормить, еды ${level}`}
    >
      <HudIcon name="feed" />
      <span className="food-bar" aria-hidden="true">
        <span className="food-bar-fill" style={{ width: `${food * 100}%` }} />
      </span>
      <span>{feeding ? 'Кушают' : 'Покормить'}</span>
    </button>
  );
}
