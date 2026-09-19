import { useState } from 'react';

type Props = {
  hearts?: number;
  code?: number;
  guest?: boolean;
  catchup?: boolean;
  onWorlds?: () => void;
  onHeart?: () => void;
  onShare?: () => void;
  onVitrine?: () => void;
  onLogout?: () => void;
};

function BackMark() {
  return (
    <svg className="heart-hud-ico" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.8 5.2 8 12l6.8 6.8" />
    </svg>
  );
}

function EyeMark() {
  return (
    <svg className="heart-hud-ico" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.8 12C4.6 7.8 8 5.4 12 5.4S19.4 7.8 21.2 12C19.4 16.2 16 18.6 12 18.6S4.6 16.2 2.8 12z" />
      <circle cx="12" cy="12" r="3.1" />
    </svg>
  );
}

function ShopMark() {
  return (
    <svg className="heart-hud-ico" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 10.2h16v9.2H4z" />
      <path d="M4 10.2 6.2 5h11.6L20 10.2" />
      <path d="M9.2 19.4v-5h5.6v5" />
    </svg>
  );
}

function LeaveMark() {
  return (
    <svg className="heart-hud-ico" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 5.4H5.4v13.2H10" />
      <path d="M10 12h8.6" />
      <path d="M16.2 8.6 19.6 12l-3.4 3.4" />
    </svg>
  );
}

function Rule() {
  return <span className="heart-hud-rule" aria-hidden="true" />;
}

/** Garden heart + count. Pre-readers read the heart; the number is for counting. */
export function HeartHud({
  hearts = 0,
  code = 0,
  guest,
  catchup,
  onWorlds,
  onHeart,
  onShare,
  onVitrine,
  onLogout,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pop, setPop] = useState(0);
  const shop = Boolean(onVitrine);
  const heart = Boolean(onHeart);
  const close = () => setOpen(false);

  return (
    <div className={`heart-hud-dock${open ? ' is-open' : ''}${catchup ? ' is-catchup' : ''}`}>
      <button className="heart-hud-scrim" type="button" aria-label="Закрыть" onClick={close} />
      <div className={`heart-hud${catchup ? ' is-catchup' : ''}`}>
        {onWorlds ? (
          <button
            className="heart-hud-share is-back"
            type="button"
            aria-label={guest ? 'Домой' : 'В миры'}
            onClick={() => {
              close();
              onWorlds();
            }}
          >
            <BackMark />
          </button>
        ) : null}
        {code > 0 ? (
          <>
            {onWorlds ? <Rule /> : null}
            <span className="heart-hud-code" aria-label={`Номер сада ${code}`}>
              № {code}
            </span>
          </>
        ) : null}
        {onWorlds && heart ? <Rule /> : null}
        {heart ? (
          <button
            className={`heart-hud-btn${pop ? ' is-pop' : ''}`}
            type="button"
            aria-label="Сердце саду"
            onClick={() => {
              setPop((n) => n + 1);
              onHeart();
            }}
            onAnimationEnd={() => setPop(0)}
          >
            <span className="heart-hud-mark" aria-hidden="true">
              ♥
            </span>
            <span className="heart-hud-count">{hearts}</span>
            {pop ? (
              <span className="heart-hud-plus" key={pop} aria-hidden="true">
                +1
              </span>
            ) : null}
          </button>
        ) : null}
        {onShare ? (
          <>
            <Rule />
            <button
              className="heart-hud-share is-show"
              type="button"
              onClick={() => {
                close();
                onShare();
              }}
            >
              <EyeMark />
              <span>Показать</span>
            </button>
          </>
        ) : null}
        {shop ? (
          <>
            <Rule />
            <button
              className="heart-hud-share is-shop"
              type="button"
              onClick={() => {
                close();
                onVitrine?.();
              }}
            >
              <ShopMark />
              <span>Витрина</span>
            </button>
          </>
        ) : null}
        {onLogout ? (
          <>
            <Rule />
            <button
              className="heart-hud-share is-leave"
              type="button"
              onClick={() => {
                close();
                onLogout();
              }}
            >
              <LeaveMark />
              <span>Выйти</span>
            </button>
          </>
        ) : null}
      </div>
      <button
        className={`heart-hud-fab${!open ? ' is-waiting' : ''}${pop ? ' is-pop' : ''}`}
        type="button"
        aria-label={open ? 'Закрыть' : 'Сад'}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? (
          <span className="heart-hud-fab-x" aria-hidden="true">
            ✕
          </span>
        ) : (
          <>
            <span className="heart-hud-mark" aria-hidden="true">
              ♥
            </span>
            {heart ? <span className="heart-hud-count">{hearts}</span> : null}
          </>
        )}
      </button>
    </div>
  );
}
