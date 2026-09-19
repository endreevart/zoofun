/** Home-screen install. Browsers never place the icon without one parent tap. */

export const PWA_HIDE_KEY = 'zoofun-pwa-hide';
export const INSTALL_LABEL = 'Установить приложение';

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export type InstallKind = 'none' | 'prompt' | 'ios';

type Watcher = () => void;

let deferred: BeforeInstallPromptEvent | null = null;
const watchers = new Set<Watcher>();

export function isStandaloneDisplay(
  displayMode?: string | null,
  navigatorStandalone?: boolean,
): boolean {
  if (navigatorStandalone) return true;
  return displayMode === 'standalone' || displayMode === 'fullscreen' || displayMode === 'minimal-ui';
}

export function isIosSafari(ua: string, maxTouch = 0): boolean {
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouch > 1);
  if (!ios) return false;
  if (/CriOS|FxiOS|EdgiOS|OPiOS|OPT\//i.test(ua)) return false;
  return true;
}

export function canRegisterWorker(protocol: string, hostname: string): boolean {
  return protocol === 'https:' || hostname === 'localhost' || hostname === '127.0.0.1';
}

export function pwaHidden(storage?: Storage | null): boolean {
  try {
    return (storage ?? localStorage).getItem(PWA_HIDE_KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberPwaHide(storage?: Storage | null) {
  try {
    (storage ?? localStorage).setItem(PWA_HIDE_KEY, '1');
  } catch {
    /* private mode */
  }
}

export function installKind(input: {
  standalone: boolean;
  hidden: boolean;
  deferred: boolean;
  ios: boolean;
}): InstallKind {
  if (input.standalone || input.hidden) return 'none';
  if (input.deferred) return 'prompt';
  if (input.ios) return 'ios';
  return 'none';
}

export function deferredInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferred;
}

export function subscribeInstall(listener: Watcher): () => void {
  watchers.add(listener);
  return () => watchers.delete(listener);
}

function tell() {
  watchers.forEach((fn) => fn());
}

export function consumeInstallPrompt(): BeforeInstallPromptEvent | null {
  const event = deferred;
  deferred = null;
  tell();
  return event;
}

export function watchInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    tell();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    rememberPwaHide();
    tell();
  });
}

export function registerIslandWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (!canRegisterWorker(window.location.protocol, window.location.hostname)) return;
  const base = import.meta.env.BASE_URL || '/';
  const sw = `${base.endsWith('/') ? base : `${base}/`}sw.js`;
  void navigator.serviceWorker.register(sw, { scope: base });
}
