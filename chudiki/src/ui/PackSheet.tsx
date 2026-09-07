import { useEffect, useState } from 'react';
import { fetchPacks, formatRub, startCheckout, type Pack } from '../game/commerce';
import { siteHomeUrl } from '../parentSession';
import { CreditEggs } from './CreditEggs';
import { ParentGate } from './ParentGate';

type PackSheetProps = {
  remaining: number;
  onClose: () => void;
  onError: (message: string) => void;
};

const CATALOG_PREVIEW: Pack[] = [
  { id: 'pack_5', animals: 5, price_rub: 1990, featured: false, buyable: true },
  { id: 'pack_10', animals: 10, price_rub: 3490, featured: true, buyable: true },
  { id: 'pack_15', animals: 15, price_rub: 4690, featured: false, buyable: true },
  { id: 'pack_20', animals: 20, price_rub: 5790, featured: false, buyable: true },
];

const FAIL_TEXT = {
  not_signed_in: 'Сначала зайди с сайта — оплату делает взрослый.',
  unavailable: 'Оплата сейчас не открывается. Попробуй чуть позже.',
  failed: 'Банк не ответил. Попробуй ещё раз.',
} as const;

export function PackSheet({ remaining, onClose, onError }: PackSheetProps) {
  const [packs, setPacks] = useState<Pack[]>(CATALOG_PREVIEW);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<Pack | null>(null);

  useEffect(() => {
    void fetchPacks().then((next) => {
      if (next.length) setPacks(next);
    });
  }, []);

  const pay = async (pack: Pack) => {
    setBusy(pack.id);
    const result = await startCheckout(pack.id);
    if (result.ok) {
      window.location.href = result.url;
      return;
    }
    setBusy(null);
    setPending(null);
    if (result.reason === 'not_signed_in') {
      onError(FAIL_TEXT.not_signed_in);
      window.location.href = `${siteHomeUrl().replace(/\/$/, '')}/auth`;
      return;
    }
    onError(FAIL_TEXT[result.reason]);
  };

  return (
    <div className="pack-shop" role="dialog" aria-labelledby="pack-shop-title">
      <button className="pack-shop-scrim" type="button" aria-label="Закрыть" onClick={onClose} />
      <div className="pack-shop-card">
        <header className="pack-shop-head">
          <button className="icon-button" type="button" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
          <div className="pack-shop-titles">
            <h2 id="pack-shop-title" className="pack-shop-title">
              Пополнить сад
            </h2>
            <p className="pack-shop-remain">
              <CreditEggs count={remaining} />
              <span>
                {remaining > 0 ? `Ещё ${remaining}` : 'Свободных нет'}
              </span>
            </p>
          </div>
        </header>
        <p className="pack-shop-lead">
          {remaining > 0
            ? 'Пакет добавляет новые яйца. Удаление слот не возвращает.'
            : 'Бесплатный зверь уже создан. Пакет открывает новые яйца.'}
        </p>
        <div className="pack-tiles">
          {packs.map((pack) => (
            <button
              key={pack.id}
              className={`pack-tile${pack.featured ? ' is-featured' : ''}`}
              type="button"
              disabled={!pack.buyable || busy === pack.id}
              onClick={() => setPending(pack)}
            >
              {pack.featured ? <span className="pack-tile-badge">часто берут</span> : null}
              <CreditEggs count={pack.animals} emptyMark={false} />
              <strong className="pack-tile-count">{pack.animals} зверей</strong>
              <span className="pack-tile-price">
                {pack.price_rub > 0 ? (
                  <>
                    {formatRub(pack.price_rub)}
                    {(pack.list_price_rub ?? 0) > pack.price_rub ? (
                      <s>{formatRub(pack.list_price_rub ?? 0)}</s>
                    ) : null}
                  </>
                ) : (
                  'скоро'
                )}
              </span>
            </button>
          ))}
        </div>
      </div>
      {pending ? (
        <ParentGate
          question="Оплату делает взрослый. После неё яйца появятся в саду."
          onCancel={() => {
            if (!busy) setPending(null);
          }}
          onPass={() => {
            void pay(pending);
          }}
        />
      ) : null}
    </div>
  );
}
