import { useEffect, useRef, useState } from 'react';
import { assetUrl } from '../assetUrl';
import { createCheckoutPrefetch, fetchPlazaToyOffer, formatRub, quotePack, type Pack, type Quote } from '../game/commerce';
import {
  PLAZA_GIFT_ADULT,
  PLAZA_GIFT_APPLY,
  PLAZA_GIFT_ASK,
  PLAZA_GIFT_CLOSE,
  PLAZA_GIFT_FRAME,
  PLAZA_GIFT_HINT,
  PLAZA_GIFT_PLAQUE,
  PLAZA_GIFT_PROMO,
  PLAZA_TOY_PLACE,
} from '../game/plaza/plazaCopy';
import { PLAZA_TOY_SKU } from '../game/plaza/plazaToy';
import { track, trackAction } from '../analytics';
import { siteAuthUrl } from '../parentSession';
import { ParentGate } from './ParentGate';

type Props = {
  preview?: string | null;
  remaining: number;
  onClose(): void;
  onError(message: string): void;
  onPlace(): void | Promise<void>;
};

const FAIL_TEXT = {
  not_signed_in: 'Сначала зайди с сайта — оплату делает взрослый.',
  unavailable: 'Оплата сейчас не открывается. Попробуй чуть позже.',
  failed: 'Банк не ответил. Попробуй ещё раз.',
  owned: 'Уже десять штук на поляне.',
  full: 'Уже десять штук на поляне.',
  promo: 'Промокод не подошёл.',
} as const;

const FALLBACK: Pack = {
  id: PLAZA_TOY_SKU,
  animals: 0,
  price_rub: 59,
  featured: false,
  buyable: true,
};

export function PlazaToySheet({ preview, remaining, onClose, onError, onPlace }: Props) {
  const [offer, setOffer] = useState<Pack>(FALLBACK);
  const [busy, setBusy] = useState(false);
  const [adult, setAdult] = useState(false);
  const [promo, setPromo] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [promoError, setPromoError] = useState('');
  const paying = useRef(false);
  const checkout = useRef(createCheckoutPrefetch());
  const paidSlot = remaining > 0;

  useEffect(() => {
    void fetchPlazaToyOffer().then((next) => {
      if (next) setOffer(next);
    });
    track('shop.view', { pack: PLAZA_TOY_SKU });
  }, []);

  const promoForPay = () => quote?.promo_code || promo.trim() || undefined;
  const price = quote?.amount_rub ?? offer.price_rub;

  const applyPromo = async () => {
    const code = promo.trim();
    setPromoError('');
    if (!code) {
      setQuote(null);
      return;
    }
    const quoted = await quotePack(offer.id, code);
    if ('ok' in quoted && quoted.ok === false) {
      setPromoError(FAIL_TEXT.promo);
      return;
    }
    setQuote(quoted as Quote);
  };

  const pay = async () => {
    if (paying.current) return;
    paying.current = true;
    setBusy(true);
    const result = await checkout.current.warm(offer.id, promoForPay());
    if (result.ok && result.granted) {
      trackAction('shop.pay', { pack: offer.id, animals: 0, via: 'dev' });
      paying.current = false;
      checkout.current.reset();
      try {
        await Promise.resolve(onPlace());
      } finally {
        setBusy(false);
      }
      return;
    }
    if (result.ok) {
      trackAction('shop.pay', { pack: offer.id, animals: 0 });
      window.location.href = result.url;
      return;
    }
    trackAction('shop.checkout_fail', { reason: result.reason, pack: offer.id });
    paying.current = false;
    setBusy(false);
    if (result.reason === 'not_signed_in') {
      onError(FAIL_TEXT.not_signed_in);
      window.location.href = siteAuthUrl();
      return;
    }
    onError(FAIL_TEXT[result.reason] ?? FAIL_TEXT.failed);
  };

  return (
    <div className="plaza-gift" role="dialog" aria-labelledby="plaza-gift-ask">
      <button className="plaza-gift-scrim" type="button" aria-label="Закрыть" onClick={onClose} />
      <div className="plaza-gift-card">
        <img
          className="plaza-gift-plaque"
          src={assetUrl(PLAZA_GIFT_PLAQUE)}
          alt="Подарок для поляны"
          draggable={false}
        />
        <button className="plaza-gift-close" type="button" onClick={onClose} aria-label="Закрыть">
          <img src={assetUrl(PLAZA_GIFT_CLOSE)} alt="" draggable={false} />
        </button>
        <div className="plaza-gift-body">
          <div className="plaza-gift-art">
            <img className="plaza-gift-frame" src={assetUrl(PLAZA_GIFT_FRAME)} alt="" draggable={false} />
            {preview ? <img className="plaza-gift-still" src={preview} alt="" draggable={false} /> : null}
          </div>
          <div className="plaza-gift-copy">
            <h2 id="plaza-gift-ask" className="plaza-gift-ask">
              {PLAZA_GIFT_ASK}
            </h2>
            <p className="plaza-gift-hint">{PLAZA_GIFT_HINT}</p>
            {paidSlot ? (
                <button
                  className="plaza-gift-pay"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void Promise.resolve(onPlace()).finally(() => setBusy(false));
                  }}
                >
                {PLAZA_TOY_PLACE}
              </button>
            ) : (
              <>
                <span className="plaza-gift-price">{formatRub(price)}</span>
                <button
                  className="plaza-gift-pay"
                  type="button"
                  disabled={!offer.buyable || busy}
                  onClick={() => setAdult(true)}
                >
                  {`Разместить за ${formatRub(price)}`}
                </button>
                <p className="plaza-gift-adult">
                  <span aria-hidden="true">🔒</span> {PLAZA_GIFT_ADULT}
                </p>
                <form
                  className="plaza-gift-promo"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void applyPromo();
                  }}
                >
                  <input
                    value={promo}
                    onChange={(event) => setPromo(event.target.value)}
                    placeholder={PLAZA_GIFT_PROMO}
                    autoComplete="off"
                    spellCheck={false}
                    aria-label={PLAZA_GIFT_PROMO}
                    disabled={busy}
                  />
                  <button type="submit" disabled={busy}>
                    {PLAZA_GIFT_APPLY}
                  </button>
                </form>
                {promoError ? <p className="plaza-gift-promo-error">{promoError}</p> : null}
              </>
            )}
          </div>
        </div>
      </div>
      {adult ? (
        <ParentGate
            question="Оплату делает взрослый. Штука станет объёмной на общей поляне."
          onCancel={() => setAdult(false)}
          onPass={() => {
            trackAction('parent.gate', { reason: 'plaza_toy' });
            setAdult(false);
            void pay();
          }}
        />
      ) : null}
    </div>
  );
}
