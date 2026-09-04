import { useEffect, useState } from 'react';
import { fetchPacks, formatRub, startCheckout, type Pack } from '../game/commerce';

type PackSheetProps = {
  remaining: number;
  onClose: () => void;
};

export function PackSheet({ remaining, onClose }: PackSheetProps) {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void fetchPacks().then(setPacks);
  }, []);

  return (
    <div className="sheet pack-sheet">
      <div className="sheet-header">
        <button className="icon-button" type="button" onClick={onClose} aria-label="Закрыть">
          ✕
        </button>
        <h2 className="sheet-title">Ещё звери</h2>
        <span className="icon-button wide ghost" aria-hidden="true">
          {remaining}
        </span>
      </div>
      <div className="sheet-body">
        <p className="pack-lead">
          {remaining > 0
            ? `Можно нарисовать ещё ${remaining}. Пакет докупает генерации.`
            : 'Бесплатный зверь уже создан. Пакет открывает новые генерации.'}
        </p>
        <p className="pack-lead">Удаление зверя слот не возвращает.</p>
        <div className="pack-list">
          {packs.map((pack) => (
            <button
              key={pack.id}
              className={`pack-row${pack.featured ? ' is-featured' : ''}`}
              type="button"
              disabled={!pack.buyable || busy === pack.id}
              onClick={() => {
                setBusy(pack.id);
                void startCheckout(pack.id).then((url) => {
                  if (url) {
                    window.location.href = url;
                    return;
                  }
                  setBusy(null);
                });
              }}
            >
              <span>
                {pack.animals} зверей
              </span>
              <strong>
                {pack.buyable ? (
                  <>
                    {formatRub(pack.price_rub)}
                    {(pack.list_price_rub ?? 0) > pack.price_rub ? (
                      <>
                        {' '}
                        <s>{formatRub(pack.list_price_rub ?? 0)}</s>
                      </>
                    ) : null}
                  </>
                ) : (
                  'скоро'
                )}
              </strong>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
