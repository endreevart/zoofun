import { CreditEggs } from './CreditEggs';

type QuotaDockProps = {
  remaining: number;
  onTopUp: () => void;
};

/** Remaining creations as eggs, plus a parent top-up. Lives in the corner. */
export function QuotaDock({ remaining, onTopUp }: QuotaDockProps) {
  const empty = remaining <= 0;
  return (
    <div className={`quota-dock${empty ? ' is-empty' : ''}`}>
      <div className="quota-dock-tray" aria-label={`Можно создать ещё ${remaining}`}>
        <CreditEggs count={remaining} />
      </div>
      <button className="quota-topup" type="button" onClick={onTopUp}>
        Пополнить
      </button>
    </div>
  );
}
