import { CreditEggs } from './CreditEggs';

type QuotaDockProps = {
  remaining: number;
  stillRemaining?: number;
  showStills?: boolean;
  onTopUp: () => void;
};

/** Remaining revives and stills. Lives in the corner after the first Zufik. */
export function QuotaDock({ remaining, stillRemaining = 0, showStills = false, onTopUp }: QuotaDockProps) {
  const empty = remaining <= 0 && (!showStills || stillRemaining <= 0);
  return (
    <div className={`quota-dock${empty ? ' is-empty' : ''}`}>
      <div className="quota-dock-meters">
        <div className="quota-dock-tray" aria-label={`Можно оживить ещё ${remaining}`}>
          <CreditEggs count={remaining} />
        </div>
        {showStills ? (
          <div className="quota-dock-tray quota-dock-stills" aria-label={`Картинок ещё ${stillRemaining}`}>
            <span className={`quota-still${stillRemaining <= 0 ? ' is-empty' : ''}`} aria-hidden="true">
              <span className="quota-still-mark">🖼</span>
              <span className="quota-still-count">{Math.max(0, Math.floor(stillRemaining))}</span>
            </span>
          </div>
        ) : null}
      </div>
      <span className="quota-dock-rule" aria-hidden="true" />
      <button className="quota-topup" type="button" aria-label="Пополнить" onClick={onTopUp}>
        +
      </button>
    </div>
  );
}
