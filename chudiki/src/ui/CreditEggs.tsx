import { assetUrl } from '../assetUrl';

type CreditEggsProps = {
  count: number;
  /** Show a dim figurine when nothing is left, so the tray still reads. */
  emptyMark?: boolean;
  showCount?: boolean;
};

/** Remaining creations as one chudik token plus a number. */
export function CreditEggs({ count, emptyMark = true, showCount = true }: CreditEggsProps) {
  const n = Math.max(0, Math.floor(count));
  if (n <= 0 && !emptyMark) return null;
  return (
    <span className={`credit-chudiks${n <= 0 ? ' is-empty' : ''}`} aria-hidden="true">
      <img
        className="credit-chudik"
        src={assetUrl('hud/credit-chudik.png')}
        alt=""
        draggable={false}
      />
      {showCount ? <span className="credit-chudik-count">{n}</span> : null}
    </span>
  );
}
