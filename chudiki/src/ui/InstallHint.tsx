import { useEffect, useState } from 'react';
import { assetUrl } from '../assetUrl';
import { trackAction } from '../analytics';
import {
  consumeInstallPrompt,
  deferredInstallPrompt,
  INSTALL_LABEL,
  installKind,
  isIosSafari,
  isStandaloneDisplay,
  pwaHidden,
  rememberPwaHide,
  subscribeInstall,
  type InstallKind,
} from '../pwa';
import { CreatureMenuIcon } from './CreatureMenuIcon';

type Props = {
  quiet: boolean;
};

function currentKind(): InstallKind {
  const standalone = isStandaloneDisplay(
    window.matchMedia('(display-mode: standalone)').matches
      ? 'standalone'
      : window.matchMedia('(display-mode: fullscreen)').matches
        ? 'fullscreen'
        : 'browser',
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone),
  );
  return installKind({
    standalone,
    hidden: pwaHidden(),
    deferred: Boolean(deferredInstallPrompt()),
    ios: isIosSafari(window.navigator.userAgent, window.navigator.maxTouchPoints),
  });
}

function IosShareGlyph() {
  return (
    <svg className="install-guide-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3v11M8.2 6.8 12 3l3.8 3.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 11.5v7.2A2.3 2.3 0 0 0 8.3 21h7.4A2.3 2.3 0 0 0 18 18.7v-7.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IosHomeGlyph() {
  return (
    <svg className="install-guide-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4.2" y="3.2" width="15.6" height="17.6" rx="4" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M12 8.2v7.6M8.2 12h7.6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/** Same install button on Chrome and iPhone. iOS cannot open Apple's sheet from the page. */
export function InstallHint({ quiet }: Props) {
  const [kind, setKind] = useState<InstallKind>('none');
  const [ready, setReady] = useState(false);
  const [guide, setGuide] = useState(false);

  useEffect(() => subscribeInstall(() => setKind(currentKind())), []);

  useEffect(() => {
    setKind(currentKind());
    const timer = window.setTimeout(() => setReady(true), 1800);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (quiet) setGuide(false);
  }, [quiet]);

  if (quiet || !ready || kind === 'none') return null;

  const hide = () => {
    rememberPwaHide();
    setGuide(false);
    setKind('none');
    trackAction('pwa.hide', { kind });
  };

  const install = () => {
    if (kind === 'ios') {
      setGuide(true);
      trackAction('pwa.ios_guide');
      return;
    }
    const prompt = consumeInstallPrompt();
    if (!prompt) return;
    trackAction('pwa.install_tap');
    void prompt.prompt().then(() =>
      prompt.userChoice.then((choice) => {
        if (choice.outcome === 'accepted') rememberPwaHide();
        setKind(currentKind());
        trackAction('pwa.install', { outcome: choice.outcome });
      }),
    );
  };

  if (guide) {
    return (
      <div className="install-guide" role="dialog" aria-label={INSTALL_LABEL}>
        <button className="first-draw-close" type="button" aria-label="Закрыть" onClick={hide}>
          <CreatureMenuIcon name="close" />
        </button>
        <img className="install-hint-icon" src={assetUrl('icon-192.png')} alt="" draggable={false} />
        <div className="install-guide-steps">
          <div className="install-guide-step">
            <IosShareGlyph />
            <span>Поделиться</span>
          </div>
          <span className="install-guide-next" aria-hidden="true">
            →
          </span>
          <div className="install-guide-step">
            <IosHomeGlyph />
            <span>Домой</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="install-hint" role="dialog" aria-label={INSTALL_LABEL}>
      <button className="first-draw-close" type="button" aria-label="Закрыть" onClick={hide}>
        <CreatureMenuIcon name="close" />
      </button>
      <img className="install-hint-icon" src={assetUrl('icon-192.png')} alt="" draggable={false} />
      <button className="big-button primary install-hint-go" type="button" onClick={install}>
        {INSTALL_LABEL}
      </button>
    </div>
  );
}
