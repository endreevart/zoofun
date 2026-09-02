type CareHudProps = {
  joy: number;
  feeding: boolean;
  onFeed: () => void;
};

/**
 * Feed sits in the main toolbar. A bowl plus a filling bar: empty means
 * tap to feed, full means everyone ate. No faces, no “они кушают”.
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
      aria-label={`Покормить, еды ${level}`}
    >
      <span className="icon" aria-hidden="true">
        🥣
      </span>
      <span className="food-bar" aria-hidden="true">
        <span className="food-bar-fill" style={{ width: `${food * 100}%` }} />
      </span>
      <span>Покормить</span>
    </button>
  );
}
