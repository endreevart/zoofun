import { useEffect, useRef, useState } from 'react';
import { assetUrl } from '../assetUrl';
import { createCheckoutPrefetch, fetchWorlds, formatRub, quoteMany, rememberOwnedWorlds, type Quote, type WorldOffer } from '../game/commerce';
import { ARCADE_PUBLIC, arcadePickerLive, withFreeArcadeGarden } from '../game/arcade/arcadeQuest';
import { loadArcadeQuest } from '../game/arcade/arcadeStore';
import { WORLD_AUTHORED, type GardenWorld } from '../game/world/gardens';
import {
  WORLD_DIY_GROVE,
  WORLD_DIY_MEADOW,
  WORLD_DIY_SKU,
  isPreviewKind,
  kindForSku,
  ownedConstruction,
  pickerKinds,
  pickerPreview,
  worldsForPicker,
  emptyIslandLead,
  newIslandHint,
  type IslandKind,
} from '../game/world/kinds';
import { cheapestDeal, moneyDeal, type MoneyDeal } from '../game/world/price';
import { trackAction } from '../analytics';
import { parentToken } from '../api';
import { siteAuthUrl } from '../parentSession';
import { ARCADE_CUE_IDS } from '../game/arcade/arcadeCues';
import { getIslandAudio } from '../game/audio/AudioBus';
import { PLAZA_CUE_IDS } from '../game/plaza/plazaCues';
import { ParentGate } from './ParentGate';
import { PromoField } from './PromoField';
import { fetchPlazaStatus } from '../game/plaza/plazaApi';
import { plazaOnlineLabel } from '../game/plaza/plazaCopy';

type Props = {
  worlds: GardenWorld[];
  onOpen(worldId: string): void;
  onError(message: string): void;
  onVitrine?: () => void;
  onPlaza?: () => void;
};

const FAIL_TEXT = {
  not_signed_in: 'Сначала зайди с сайта — оплату делает взрослый.',
  unavailable: 'Оплата сейчас не открывается. Попробуй чуть позже.',
  failed: 'Банк не ответил. Попробуй ещё раз.',
  owned: 'Этот остров уже открыт.',
  full: 'Этот остров уже открыт.',
  promo: 'Промокод не подошёл.',
} as const;

const FALLBACK_PRICE: Record<string, number> = {
  [WORLD_DIY_SKU]: 1190,
  [WORLD_DIY_MEADOW]: 59,
  [WORLD_DIY_GROVE]: 59,
};

function previewFromWindow(): ReturnType<typeof pickerPreview> {
  try {
    return pickerPreview(window.location.search);
  } catch {
    return 'off';
  }
}

function dealForSku(sku: string, offers: WorldOffer[], quotes: Record<string, Quote> = {}): MoneyDeal {
  const quoted = quotes[sku];
  const hit = offers.find((item) => item.id === sku);
  const base = hit && hit.price_rub > 0 ? hit.price_rub : (FALLBACK_PRICE[sku] ?? 1190);
  const price = quoted?.amount_rub ?? base;
  const list = quoted?.discount_rub ? base : (hit?.list_price_rub ?? 0);
  return moneyDeal(price, list);
}

function buyDeal(kinds: IslandKind[], offers: WorldOffer[], quotes: Record<string, Quote> = {}): MoneyDeal {
  const priced = kinds.filter(
    (kind) => !isPreviewKind(kind) || offers.some((item) => item.id === kind.constructionSku),
  );
  return cheapestDeal((priced.length ? priced : kinds).map((kind) => dealForSku(kind.constructionSku, offers, quotes)));
}

function payLabel(deal: MoneyDeal): string {
  if (deal.list > deal.price) {
    return `${formatRub(deal.price)} (без скидки ${formatRub(deal.list)})`;
  }
  return formatRub(deal.price);
}

export function WorldPicker({ worlds, onOpen, onError, onVitrine, onPlaza }: Props) {
  const preview = previewFromWindow();
  const kinds = pickerKinds(preview === 'kinds');
  const listed = worldsForPicker(worlds, preview);
  const playable = preview === 'empty' ? listed : withFreeArcadeGarden(listed);
  const construction = ownedConstruction(playable, kinds);
  const arcadeGarden =
    construction.find((item) => item.id === WORLD_DIY_SKU) ??
    construction.find((item) => item.kind.constructionSku === WORLD_DIY_SKU);
  const arcadeLive = arcadeGarden
    ? arcadePickerLive(arcadeGarden.id, loadArcadeQuest(arcadeGarden.id)?.step)
    : arcadePickerLive(WORLD_DIY_SKU, loadArcadeQuest(WORLD_DIY_SKU)?.step);
  const extraIslands = construction.filter((item) => !(arcadeLive && item.id === arcadeGarden?.id));
  const [offers, setOffers] = useState<WorldOffer[]>([]);
  const [paySku, setPaySku] = useState<string | null>(null);
  const [styleOpen, setStyleOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adult, setAdult] = useState(false);
  const [promo, setPromo] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [promoError, setPromoError] = useState('');
  const [quoting, setQuoting] = useState(false);
  const [plazaOnline, setPlazaOnline] = useState(0);
  const paying = useRef(false);
  const checkout = useRef(createCheckoutPrefetch());
  const empty = extraIslands.length === 0;
  const manyReady = kinds.length > 1;
  const showTopBuy = manyReady && !empty;
  const deal = buyDeal(kinds, offers, quotes);

  useEffect(() => {
    void fetchWorlds().then((next) => {
      setOffers(next.filter((item) => item.buyable));
    });
    void getIslandAudio().preloadCues(PLAZA_CUE_IDS);
    getIslandAudio().preloadGarden();
    if (ARCADE_PUBLIC) void getIslandAudio().preloadCues(ARCADE_CUE_IDS);
  }, []);

  useEffect(() => {
    if (!onPlaza) return;
    let stop = false;
    const load = () => {
      void fetchPlazaStatus().then((count) => {
        if (!stop) setPlazaOnline(count);
      });
    };
    load();
    const timer = window.setInterval(load, 8000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [onPlaza]);

  const promoForPay = () => quote?.promo_code || promo.trim() || undefined;

  const closePay = () => {
    if (paying.current) return;
    checkout.current.reset();
    setPaySku(null);
    setAdult(false);
    setPromoError('');
  };

  useEffect(() => {
    if (!paySku) return;
    void checkout.current.warm(paySku, promoForPay());
  }, [paySku, quote?.promo_code, promo]);

  const applyPromo = async (sku?: string) => {
    const code = promo.trim();
    setPromoError('');
    if (!code) {
      setQuote(null);
      setQuotes({});
      return;
    }
    const ids = sku
      ? [sku]
      : kinds.filter((kind) => !isPreviewKind(kind)).map((kind) => kind.constructionSku);
    setQuotes({});
    setQuote(null);
    setQuoting(true);
    try {
      const { quotes: next, failed } = await quoteMany(ids, code, (id, quoted) => {
        setQuotes((current) => ({ ...current, [id]: quoted }));
        if (sku === id || paySku === id) setQuote(quoted);
      });
      setQuotes(next);
      const picked = sku ? next[sku] : paySku ? next[paySku] : null;
      setQuote(picked ?? null);
      if (!Object.keys(next).length && failed) setPromoError(FAIL_TEXT.promo);
      else if (Object.keys(next).length) trackAction('shop.quote', { count: Object.keys(next).length });
    } finally {
      setQuoting(false);
    }
  };

  const pay = async (sku: string) => {
    if (paying.current) return;
    if (!parentToken()) {
      onError(FAIL_TEXT.not_signed_in);
      window.location.href = siteAuthUrl();
      return;
    }
    paying.current = true;
    setBusy(true);
    rememberOwnedWorlds(worlds.map((item) => item.id));
    const result = await checkout.current.warm(sku, promoForPay());
    if (result.ok) {
      trackAction('shop.pay', { pack: sku, from: 'worlds' });
      window.location.href = result.url;
      return;
    }
    trackAction('shop.checkout_fail', { reason: result.reason, pack: sku });
    paying.current = false;
    setBusy(false);
    if (result.reason === 'not_signed_in') {
      onError(FAIL_TEXT.not_signed_in);
      window.location.href = siteAuthUrl();
      return;
    }
    onError(FAIL_TEXT[result.reason]);
  };

  const payingKind = paySku ? kinds.find((item) => item.constructionSku === paySku) ?? kindForSku(paySku) : null;

  const openWorld = (id: string, mock: boolean) => {
    if (mock) {
      onError('Это макет второго острова. Его ещё нет в игре.');
      return;
    }
    onOpen(id);
  };

  const startBuy = () => {
    if (busy) return;
    trackAction('shop.world_open');
    if (manyReady) {
      setStyleOpen(true);
      return;
    }
    setPaySku(kinds[0]?.constructionSku ?? null);
    setQuote(quotes[kinds[0]?.constructionSku ?? ''] ?? null);
    setAdult(false);
  };

  const pickStyle = (kind: IslandKind) => {
    setStyleOpen(false);
    if (isPreviewKind(kind)) {
      onError('Это макет второго острова. Его ещё нет в игре.');
      return;
    }
    setPaySku(kind.constructionSku);
    setQuote(quotes[kind.constructionSku] ?? null);
    setAdult(false);
  };

  return (
    <div className="world-picker">
        <div className={`worlds-frame${manyReady ? ' is-many' : ''}${showTopBuy ? ' has-top-buy' : ''}`}>
        <h1 className="worlds-sign">
          <img className="worlds-sign-art" src={assetUrl('/ui/worlds/plaque.png')} alt="Мои миры" />
        </h1>
        {showTopBuy ? (
          <button className="worlds-buy-top" type="button" disabled={busy} onClick={startBuy}>
            <img className="worlds-buy-plus" src={assetUrl('/ui/worlds/plus.png')} alt="" />
            <span className="worlds-buy-label">Купить остров</span>
            <PriceLine deal={deal} />
          </button>
        ) : null}

        <div className="worlds-panel">
          {onPlaza ? (
            <button className="plaza-banner" type="button" onClick={onPlaza}>
              <img className="plaza-banner-art" src={assetUrl('/ui/magic-island.jpg')} alt="" />
              <span className="plaza-banner-copy">
                <span className="plaza-banner-title">
                  <span className="plaza-banner-dot" aria-hidden="true" />
                  Общий зоопарк
                </span>
                <span className="plaza-banner-count">{plazaOnlineLabel(plazaOnline)}</span>
              </span>
              <span className="plaza-banner-go">Войти</span>
            </button>
          ) : null}
          {onVitrine ? (
            <button className="vitrine-banner" type="button" onClick={onVitrine}>
              <span className="vitrine-banner-title">Витрина зоопарков</span>
              <span className="vitrine-banner-go">Смотреть</span>
            </button>
          ) : null}
          <section className="worlds-section">
            <header className="worlds-head">
              <img className="worlds-head-icon" src={assetUrl('/ui/worlds/compass.png')} alt="" />
              <div>
                <h2 className="worlds-title">{manyReady ? 'Готовые миры' : 'Готовый мир'}</h2>
                <p className="worlds-lead">
                  {manyReady ? 'Бесплатные приключения' : 'Бесплатное приключение'}
                </p>
              </div>
            </header>
            <div className={`worlds-ready${manyReady ? ' is-many' : ''}${kinds.length >= 3 ? ' is-three' : ''}`}>
              {kinds.map((kind) => (
                <button
                  key={kind.id}
                  className={`worlds-ready-card${manyReady ? '' : ' is-wide'}`}
                  type="button"
                  onClick={() => openWorld(kind.authoredId || WORLD_AUTHORED, isPreviewKind(kind))}
                >
                  <img className="worlds-ready-art" src={assetUrl(kind.authoredArt)} alt="" />
                  <span className="worlds-ready-name">
                    <strong>{kind.authoredTitle}</strong>
                    <em>Бесплатно</em>
                  </span>
                  <span className="worlds-play">
                    <img className="worlds-play-pic" src={assetUrl('/ui/worlds/play.png')} alt="" />
                    <span className="worlds-play-label">Играть</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="worlds-section">
            <header className="worlds-head">
              <img className="worlds-head-icon" src={assetUrl('/ui/worlds/hammer.png')} alt="" />
              <div>
                <h2 className="worlds-title">Мои острова</h2>
                {empty ? null : <p className="worlds-lead">Стройте и развивайте</p>}
              </div>
            </header>

            {empty ? (
              <div className="worlds-empty">
                <img className="worlds-empty-art" src={assetUrl(kinds[0].constructionArt)} alt="" />
                <div className="worlds-empty-copy">
                  <p className="worlds-empty-title">Создайте свой остров</p>
                  <p className="worlds-empty-lead">{emptyIslandLead(manyReady)}</p>
                  <div className="worlds-promo">
                    <PromoField value={promo} error={promoError} busy={quoting} onChange={setPromo} onApply={() => void applyPromo()} />
                  </div>
                  <button className="worlds-play is-solid is-buy" type="button" disabled={busy} onClick={startBuy}>
                    Купить остров
                    <PriceLine deal={deal} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="worlds-diy">
                {extraIslands.map((garden) => (
                  <button
                    key={garden.id}
                    className="worlds-diy-card"
                    type="button"
                    onClick={() => openWorld(garden.id, isPreviewKind(garden.kind))}
                  >
                    <img className="worlds-diy-art" src={assetUrl(garden.kind.constructionArt)} alt="" />
                    <strong className="worlds-diy-name">{garden.title}</strong>
                    <span className="worlds-diy-style">{garden.kind.styleTitle}</span>
                    <span className="worlds-play is-block">Продолжить</span>
                  </button>
                ))}
                <button className="worlds-diy-new" type="button" disabled={busy} onClick={startBuy}>
                  <span className="worlds-diy-plus-area" aria-hidden="true">
                    <img className="worlds-plus-pic" src={assetUrl('/ui/worlds/plus.png')} alt="" />
                  </span>
                  <strong className="worlds-diy-name">Новый остров</strong>
                  <span className="worlds-diy-style">
                    {newIslandHint(manyReady, kinds[0]?.styleTitle ?? '')}
                  </span>
                  <span className={`worlds-play is-block${manyReady ? '' : ' is-buy'}`}>
                    Купить
                    {manyReady ? null : <PriceLine deal={deal} />}
                  </span>
                </button>
                <div className="worlds-promo is-diy">
                  <PromoField value={promo} error={promoError} busy={quoting} onChange={setPromo} onApply={() => void applyPromo()} />
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {styleOpen ? (
        <div className="worlds-style" role="dialog" aria-labelledby="worlds-style-title">
          <button className="worlds-style-scrim" type="button" aria-label="Закрыть" onClick={() => setStyleOpen(false)} />
          <div className="worlds-style-card">
            <h2 id="worlds-style-title">Какой остров собрать?</h2>
            <PromoField value={promo} error={promoError} busy={quoting} onChange={setPromo} onApply={() => void applyPromo()} />
            <div className="worlds-style-row">
              {kinds.map((kind) => (
                <button
                  key={kind.id}
                  className="worlds-diy-card"
                  type="button"
                  disabled={busy}
                  onClick={() => pickStyle(kind)}
                >
                  <img className="worlds-diy-art" src={assetUrl(kind.constructionArt)} alt="" />
                  <strong className="worlds-diy-name">{kind.styleTitle}</strong>
                  <span className="worlds-play is-block is-buy">
                    Купить
                    <PriceLine deal={dealForSku(kind.constructionSku, offers, quotes)} />
                  </span>
                </button>
              ))}
            </div>
            <button className="worlds-style-cancel" type="button" onClick={() => setStyleOpen(false)}>
              Позже
            </button>
          </div>
        </div>
      ) : null}

      {payingKind && !isPreviewKind(payingKind) && !adult ? (
        <ParentGate
          question={`Купить новый сад «${payingKind.constructionTitle}» за ${payLabel(dealForSku(paySku ?? payingKind.constructionSku, offers, quotes))}? Оплату делает взрослый.`}
          onCancel={closePay}
          onPass={() => setAdult(true)}
        />
      ) : null}
      {payingKind && !isPreviewKind(payingKind) && adult ? (
        <div className="modal-backdrop" onClick={closePay}>
          <div className="card gate" onClick={(event) => event.stopPropagation()}>
            <h2>{payingKind.constructionTitle}</h2>
            <p className="pack-confirm-price">
              {formatRub(quote?.amount_rub ?? dealForSku(paySku ?? payingKind.constructionSku, offers, quotes).price)}
              {quote?.discount_rub ? (
                <s>
                  {formatRub(dealForSku(paySku ?? payingKind.constructionSku, offers).price)}
                </s>
              ) : null}
            </p>
            <PromoField
              value={promo}
              error={promoError}
              busy={quoting}
              onChange={setPromo}
              onApply={() => void applyPromo(paySku ?? payingKind.constructionSku)}
            />
            <div className="gate-actions">
              <button className="icon-button wide" type="button" onClick={closePay}>
                Отмена
              </button>
              <button
                className="icon-button wide primary"
                type="button"
                disabled={busy}
                onClick={() => {
                  const sku = paySku ?? payingKind.constructionSku;
                  if (sku) void pay(sku);
                }}
              >
                {busy ? 'Открываю банк…' : 'Оплатить'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PriceLine({ deal }: { deal: MoneyDeal }) {
  return (
    <span className={`worlds-price${deal.list > deal.price ? ' is-sale' : ''}`}>
      {deal.from ? <span className="worlds-price-from">от</span> : null}
      <span className="worlds-price-now">{formatRub(deal.price)}</span>
      {deal.list > deal.price ? <s className="worlds-price-was">{formatRub(deal.list)}</s> : null}
    </span>
  );
}

