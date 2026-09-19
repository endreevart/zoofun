/** Same counter as the marketing site. Island sessions were excluded on purpose. */

export const METRIKA_ID = 112277307;
export const CONSENT_KEY = 'zooofun-cookie-consent';

declare global {
  interface Window {
    ym?: ((...args: unknown[]) => void) & { a?: unknown[]; l?: number };
  }
}

let started = false;

/** «Только необходимые» still wins. No prior choice still records the zoo. */
export function islandMetrikaAllowed(raw: string | null): boolean {
  return raw !== 'necessary';
}

function readConsent(): string | null {
  try {
    return localStorage.getItem(CONSENT_KEY);
  } catch {
    return null;
  }
}

export function startIslandMetrika(): void {
  if (started || typeof window === 'undefined') return;
  if (import.meta.env.DEV) return;
  if (!islandMetrikaAllowed(readConsent())) return;
  started = true;

  const src = `https://mc.yandex.ru/metrika/tag.js?id=${METRIKA_ID}`;
  if (typeof window.ym !== 'function') {
    window.ym = function (...args: unknown[]) {
      (window.ym!.a = window.ym!.a || []).push(args);
    };
    window.ym.l = Date.now();
    if (!Array.from(document.scripts).some((script) => script.src === src)) {
      const tag = document.createElement('script');
      tag.async = true;
      tag.src = src;
      const first = document.getElementsByTagName('script')[0];
      if (first?.parentNode) first.parentNode.insertBefore(tag, first);
      else document.head.appendChild(tag);
    }
  }
  window.ym?.(METRIKA_ID, 'init', {
    ssr: true,
    webvisor: true,
    clickmap: true,
    referrer: document.referrer,
    url: location.href,
    accurateTrackBounce: true,
    trackLinks: true,
  });
}
