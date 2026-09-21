import { useEffect, useRef, useState } from 'react';
import { createCheckoutPrefetch, fetchPacks, formatRub, quoteMany, type Pack, type Quote } from '../game/commerce';
import { track, trackAction } from '../analytics';
import { siteAuthUrl } from '../parentSession';
import { CreditEggs } from './CreditEggs';
import {
  PACK_SHOP_MORE,
  PACK_SHOP_SKIP,
  packShopLead,
  packShopRemainLabel,
  packShopShowsClose,
  packShopShowsSkip,
  packShopTitle,
  packShopView,
  packsForShop,
  packTileBadge,
  packTileLabel,
} from './packShop';
import { ParentGate } from './ParentGate';
import { PromoField } from './PromoField';

type PackSheetProps = {
  remaining: number;
  onClose: () => void;
  onError: (message: string) => void;
  friendPreview?: string | null;
  forRevive?: boolean;
  onSkip?: () => void;
};

const CATALOG_PREVIEW: Pack[] = [
  { id: 'pack_1', animals: 1, price_rub: 99, featured: false, buyable: true },
  { id: 'pack_5', animals: 5, price_rub: 399, featured: false, buyable: true },
  { id: 'pack_10', animals: 10, price_rub: 3490, featured: true, buyable: true },
  { id: 'pack_15', animals: 15, price_rub: 4690, featured: false, buyable: true },
  { id: 'pack_20', animals: 20, price_rub: 5790, featured: false, buyable: true },
];

const FAIL_TEXT = {
  not_signed_in: 'Сначала зайди с сайта — оплату делает взрослый.',
  unavailable: 'Оплата сейчас не открывается. Попробуй чуть позже.',
  failed: 'Банк не ответил. Попробуй ещё раз.',
  owned: 'Этот остров уже открыт.',
  full: 'Этот остров уже открыт.',
  promo: 'Промокод не подошёл.',
} as const;

export function PackSheet({
  remaining,
  onClose,
  onError,
  friendPreview,
  forRevive = false,
  onSkip,
}: PackSheetProps) {
  const forFriend = Boolean(friendPreview) || forRevive;
  const [packs, setPacks] = useState<Pack[]>(CATALOG_PREVIEW);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<Pack | null>(null);
  const [adult, setAdult] = useState(false);
  const [promo, setPromo] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [promoError, setPromoError] = useState('');
  const [quoting, setQuoting] = useState(false);
  const [expanded, setExpanded] = useState(remaining > 0);
  const paying = useRef(false);
  const checkout = useRef(createCheckoutPrefetch());

  useEffect(() => {
    void fetchPacks().then((next) => {
      if (next.length) setPacks(next);
    });
  }, []);

  useEffect(() => {
    track('shop.view', { remaining, firstFriend: remaining <= 0 });
  }, [remaining]);

  const view = packShopView(packs, remaining);
  const shown = packsForShop(packs, remaining, expanded);
  const showMore = remaining <= 0 && view.more.length > 0 && !expanded;
  const showSkip = packShopShowsSkip(remaining, forFriend);
  const showClose = packShopShowsClose(remaining, forFriend);
  const skip = onSkip ?? onClose;

  const promoForPay = () => quote?.promo_code || promo.trim() || undefined;

  const closePay = () => {
    if (paying.current) return;
    checkout.current.reset();
    setPending(null);
    setAdult(false);
    setPromoError('');
  };

  useEffect(() => {
    if (!pending) return;
    void checkout.current.warm(pending.id, promoForPay());
  }, [pending, quote?.promo_code, promo]);

  const applyPromo = async (packId?: string) => {
    const code = promo.trim();
    setPromoError('');
    if (!code) {
      setQuote(null);
      setQuotes({});
      return;
    }
    const ids = packId ? [packId] : packs.filter((item) => item.buyable).map((item) => item.id);
    setQuotes({});
    setQuote(null);
    setQuoting(true);
    try {
      const { quotes: next, failed } = await quoteMany(ids, code, (id, quoted) => {
        setQuotes((current) => ({ ...current, [id]: quoted }));
        if (packId === id || pending?.id === id) setQuote(quoted);
      });
      setQuotes(next);
      const picked = packId ? next[packId] : pending ? next[pending.id] : null;
      setQuote(picked ?? null);
      if (!Object.keys(next).length && failed) setPromoError(FAIL_TEXT.promo);
      else if (Object.keys(next).length) trackAction('shop.quote', { count: Object.keys(next).length });
    } finally {
      setQuoting(false);
    }
  };

  const pay = async (pack: Pack) => {
    if (paying.current) return;
    paying.current = true;
    setBusy(pack.id);
    const result = await checkout.current.warm(pack.id, promoForPay());
    if (result.ok) {
      trackAction('shop.pay', { pack: pack.id, animals: pack.animals });
      window.location.href = result.url;
      return;
    }
    trackAction('shop.checkout_fail', { reason: result.reason, pack: pack.id });
    paying.current = false;
    setBusy(null);
    closePay();
    if (result.reason === 'not_signed_in') {
      onError(FAIL_TEXT.not_signed_in);
      window.location.href = siteAuthUrl();
      return;
    }
    onError(FAIL_TEXT[result.reason]);
  };

  const price = pending ? (quote?.amount_rub ?? quotes[pending.id]?.amount_rub ?? pending.price_rub) : 0;

  return (
    <div className="pack-shop" role="dialog" aria-labelledby="pack-shop-title">
      <button
        className="pack-shop-scrim"
        type="button"
        aria-label={showSkip ? PACK_SHOP_SKIP : 'Закрыть'}
        onClick={showSkip ? skip : onClose}
      />
      <div className="pack-shop-card">
        <header className={`pack-shop-head${showClose ? '' : ' is-plain'}`}>
          {showClose ? (
            <button className="icon-button" type="button" onClick={onClose} aria-label="Закрыть">
              ✕
            </button>
          ) : null}
          <div className="pack-shop-titles">
            <h2 id="pack-shop-title" className="pack-shop-title">
              {packShopTitle(remaining, forFriend)}
            </h2>
            {remaining > 0 ? (
              <p className="pack-shop-remain">
                <CreditEggs count={remaining} showCount={false} />
                <span>{packShopRemainLabel(remaining)}</span>
              </p>
            ) : null}
          </div>
        </header>
        <p className="pack-shop-lead">{packShopLead(remaining, forFriend)}</p>
        {friendPreview ? (
          <div className="pack-shop-friend">
            <img className="pack-shop-friend-art" src={friendPreview} alt="" draggable={false} />
          </div>
        ) : null}
        <PromoField
          value={promo}
          error={promoError}
          busy={quoting}
          onChange={setPromo}
          onApply={() => void applyPromo()}
        />
        <div className={`pack-tiles${shown.length === 1 ? ' is-starter' : ''}`}>
          {shown.map((pack) => {
            const badge = packTileBadge(pack, remaining);
            const quoted = quotes[pack.id];
            const now = quoted?.amount_rub ?? pack.price_rub;
            const was = quoted?.discount_rub ? pack.price_rub : (pack.list_price_rub ?? 0);
            return (
              <button
                key={pack.id}
                className={`pack-tile${badge ? ' is-featured' : ''}`}
                type="button"
                disabled={!pack.buyable || busy === pack.id}
                onClick={() => {
                  track('shop.pick', { pack: pack.id, animals: pack.animals });
                  setAdult(false);
                  setPending(pack);
                  setQuote(quotes[pack.id] ?? null);
                  setPromoError('');
                }}
              >
                {badge ? <span className="pack-tile-badge">{badge}</span> : null}
                <CreditEggs count={pack.animals} emptyMark={false} showCount={false} />
                <strong className="pack-tile-count">{packTileLabel(pack, remaining)}</strong>
                <span className="pack-tile-price">
                  {pack.price_rub > 0 ? (
                    <>
                      {formatRub(now)}
                      {was > now ? <s>{formatRub(was)}</s> : null}
                    </>
                  ) : (
                    'скоро'
                  )}
                </span>
              </button>
            );
          })}
        </div>
        {showMore || showSkip ? (
          <div className="pack-shop-foot">
            {showMore ? (
              <button className="pack-more" type="button" onClick={() => setExpanded(true)}>
                {PACK_SHOP_MORE}
              </button>
            ) : null}
            {showSkip ? (
              <button className="pack-more" type="button" onClick={skip}>
                {PACK_SHOP_SKIP}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {pending && !adult ? (
        <ParentGate
          question="Оплату делает взрослый. После неё в саду появится новый зуфик."
          onCancel={() => {
            track('parent.gate_cancel', { reason: 'shop' });
            closePay();
          }}
          onPass={() => {
            trackAction('parent.gate', { reason: 'shop' });
            setAdult(true);
          }}
        />
      ) : null}
      {pending && adult ? (
        <div className="modal-backdrop" onClick={closePay}>
          <div className="card gate" onClick={(event) => event.stopPropagation()}>
            <h2>{packTileLabel(pending, remaining)}</h2>
            <p className="pack-confirm-price">
              {formatRub(price)}
              {(quote?.discount_rub || quotes[pending.id]?.discount_rub) ? (
                <s>{formatRub(pending.price_rub)}</s>
              ) : null}
            </p>
            <PromoField
              value={promo}
              error={promoError}
              busy={quoting}
              onChange={setPromo}
              onApply={() => void applyPromo(pending.id)}
            />
            <div className="gate-actions">
              <button className="icon-button wide" type="button" onClick={closePay}>
                Отмена
              </button>
              <button
                className="icon-button wide primary"
                type="button"
                disabled={busy === pending.id}
                onClick={() => void pay(pending)}
              >
                {busy === pending.id ? 'Открываю банк…' : 'Оплатить'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
