import { creditEggCounts } from '../game/commerceQuota';

type CreditEggsProps = {
  count: number;
  /** Show one dim egg when nothing is left, so the tray still reads. */
  emptyMark?: boolean;
};

/** A row of toy eggs: one egg is one remaining creature. */
export function CreditEggs({ count, emptyMark = true }: CreditEggsProps) {
  const { filled, extra } = creditEggCounts(count);
  if (count <= 0 && emptyMark) {
    return (
      <span className="credit-eggs" aria-hidden="true">
        <span className="credit-egg is-empty" />
      </span>
    );
  }
  return (
    <span className="credit-eggs" aria-hidden="true">
      {Array.from({ length: filled }, (_, index) => (
        <span key={index} className={`credit-egg hue-${index % 6}`} />
      ))}
      {extra > 0 ? <span className="credit-extra">+{extra}</span> : null}
    </span>
  );
}
