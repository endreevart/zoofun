type FullscreenDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenNode = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  webkitRequestFullScreen?: () => Promise<void> | void;
};

export type CinemaBox = {
  top: string;
  left: string;
  width: string;
  height: string;
};

export function nativeFullscreenOn(): boolean {
  const doc = document as FullscreenDocument;
  return Boolean(document.fullscreenElement || doc.webkitFullscreenElement);
}

export function documentAllowsFullscreen(
  doc: Pick<Document, 'fullscreenEnabled'> & { webkitFullscreenEnabled?: boolean },
): boolean {
  return Boolean(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
}

export function isIphone(ua: string): boolean {
  return /iPhone/i.test(ua) && !/iPad/i.test(ua);
}

/** Safari on iOS, not Chrome/Firefox/Edge skins. */
export function isIosSafari(ua: string): boolean {
  return isIphone(ua) && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
}

/**
 * iPhone never actually enters element fullscreen (Safari and Chrome share WebKit).
 * Android Chrome, foldables, and iPad usually can.
 */
export function fullscreenBlockedMessage(ua: string, tried: boolean): string {
  if (isIphone(ua)) {
    if (isIosSafari(ua)) {
      return 'Safari на iPhone полный экран не открывает. На Android в Chrome — можно.';
    }
    return 'На iPhone полный экран закрыт. На Android в Chrome — можно.';
  }
  if (tried) return 'Полный экран не открылся. Попробуй Chrome.';
  return 'Этот браузер полный экран не открывает.';
}

/** Keep CSS cinema if native fullscreen never actually started (iPhone). */
export function cinemaAfterNativeChange(
  nativeOn: boolean,
  hadNative: boolean,
  cinema: boolean,
): { cinema: boolean; hadNative: boolean } {
  if (nativeOn) return { cinema: true, hadNative: true };
  if (hadNative) return { cinema: false, hadNative: false };
  return { cinema, hadNative: false };
}

export function cinemaViewportVars(
  vv: { offsetTop: number; offsetLeft: number; width: number; height: number } | null,
): CinemaBox {
  if (!vv) {
    return { top: '0px', left: '0px', width: '100vw', height: '100dvh' };
  }
  return {
    top: `${Math.round(vv.offsetTop)}px`,
    left: `${Math.round(vv.offsetLeft)}px`,
    width: `${Math.round(vv.width)}px`,
    height: `${Math.round(vv.height)}px`,
  };
}

export function writeCinemaViewport(root: HTMLElement, on: boolean): void {
  root.classList.toggle('is-cinema', on);
  if (!on) {
    root.style.removeProperty('--cinema-top');
    root.style.removeProperty('--cinema-left');
    root.style.removeProperty('--cinema-w');
    root.style.removeProperty('--cinema-h');
    return;
  }
  const box = cinemaViewportVars(window.visualViewport);
  root.style.setProperty('--cinema-top', box.top);
  root.style.setProperty('--cinema-left', box.left);
  root.style.setProperty('--cinema-w', box.width);
  root.style.setProperty('--cinema-h', box.height);
}

async function tryRequest(el: HTMLElement): Promise<boolean> {
  const node = el as FullscreenNode;
  try {
    if (node.requestFullscreen) {
      try {
        await node.requestFullscreen({ navigationUI: 'hide' });
      } catch {
        await node.requestFullscreen();
      }
      return nativeFullscreenOn();
    }
    const webkit = node.webkitRequestFullscreen ?? node.webkitRequestFullScreen;
    if (webkit) {
      await webkit.call(node);
      return nativeFullscreenOn();
    }
  } catch {
    return false;
  }
  return false;
}

export async function requestNativeFullscreen(node: HTMLElement): Promise<boolean> {
  const seen = new Set<HTMLElement>();
  for (const target of [node, document.documentElement]) {
    if (seen.has(target)) continue;
    seen.add(target);
    if (await tryRequest(target)) return true;
  }
  return nativeFullscreenOn();
}

export async function leaveNativeFullscreen(): Promise<void> {
  const doc = document as FullscreenDocument;
  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen();
      return;
    }
    if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) {
      await doc.webkitExitFullscreen();
    }
  } catch {
    /* already left */
  }
}
