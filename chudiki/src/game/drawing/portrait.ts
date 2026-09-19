import type { DrawingData } from '../creatures/ChudikSpec';

/** Tiny 1×1 placeholders are not a child's picture. */
const MIN_DATA_URL = 240;
/** Clay eggs from `blankEggDrawing` are ~410 chars. A real still is far larger. */
const MIN_PERSISTED_STILL = 800;

export function portraitFromImage(image: HTMLImageElement): string | undefined {
  if (image.src.startsWith('data:image/')) return image.src;
  return undefined;
}

/** Album tile: the child's still, else a live toy snapshot. */
export function rosterPhoto(
  drawing: DrawingData | undefined,
  thumb: string | undefined,
): string | null {
  return portraitUrlOf(drawing) ?? thumb ?? null;
}

export function portraitUrlOf(drawing: DrawingData | undefined): string | null {
  if (!drawing || drawing.placeholder) return null;
  if (usableDataUrl(drawing.portraitUrl)) return drawing.portraitUrl!;
  if (usableHostedImage(drawing.portraitUrl)) return drawing.portraitUrl!;
  if (usableDataUrl(drawing.textureUrl)) return drawing.textureUrl;
  if (usableHostedImage(drawing.postcardUrl)) return drawing.postcardUrl!;
  if (usableHostedImage(drawing.textureUrl)) return drawing.textureUrl;
  return null;
}

/** Resolve `/v1/...` stills and attach the parent token for a garden <img>. */
export function displayStillUrl(url: string | null): string | null {
  if (!url) return null;
  const resolved = resolveStillPath(url);
  const token = readParentToken();
  if (!token) return resolved;
  const needsToken =
    /\/v1\/zoo\/creatures\/[^/?#]+\/(?:portrait|postcard)(?:\?|$)/.test(resolved) ||
    /\/v1\/plaza\/portraits\/[^/?#]+(?:\?|$)/.test(resolved) ||
    /\/v1\/plaza\/toys\/[^/?#]+\/still(?:\?|$)/.test(resolved);
  if (!needsToken) return resolved;
  const sep = resolved.includes('?') ? '&' : '?';
  return `${resolved}${sep}access_token=${encodeURIComponent(token)}`;
}

function apiBase(): string {
  const fromEnv = (import.meta as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE;
  return fromEnv?.replace(/\/$/, '') || '/api/zoo';
}

function resolveStillPath(url: string): string {
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  if (url.startsWith('/v1/')) return `${apiBase()}${url}`;
  return url;
}

function readParentToken(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const dedicated = localStorage.getItem('zoofun-parent-token') ?? sessionStorage.getItem('zoofun-parent-token');
    if (dedicated) return dedicated;
    const raw = localStorage.getItem('zoofun-session') ?? sessionStorage.getItem('zoofun-session');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: unknown };
    return typeof parsed.token === 'string' ? parsed.token : null;
  } catch {
    return null;
  }
}

/** True when the drawing holds a real still, not the hatching clay egg. */
export function hasPersistedStill(drawing: DrawingData | undefined): boolean {
  if (!drawing || drawing.placeholder) return false;
  if (usableDataUrl(drawing.portraitUrl) && drawing.portraitUrl!.length >= MIN_PERSISTED_STILL) {
    return true;
  }
  if (usableDataUrl(drawing.textureUrl) && drawing.textureUrl.length >= MIN_PERSISTED_STILL) {
    return true;
  }
  return Boolean(
    usableHostedImage(drawing.postcardUrl) ||
      usableHostedImage(drawing.portraitUrl) ||
      usableHostedImage(drawing.modelUrl),
  );
}

export function portraitFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]+/g, '').trim() || 'chudik';
  return `${cleaned}.png`;
}

/** Whatever the source encoding was, the saved file is an honest PNG. */
async function toPngBlob(url: string): Promise<Blob> {
  const image = new Image();
  // Backend-hosted postcards live on the API origin; without CORS opt-in the
  // canvas would taint and toBlob would throw.
  if (/^https?:/.test(url)) image.crossOrigin = 'anonymous';
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
    image.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || 1024;
  canvas.height = image.naturalHeight || 1024;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no canvas');
  context.drawImage(image, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('no blob'))), 'image/png');
  });
}

export async function downloadPortrait(
  url: string,
  fileName: string,
  opts?: { share?: boolean },
): Promise<void> {
  let blob: Blob;
  try {
    blob = await toPngBlob(url);
  } catch {
    blob = await (await fetch(url)).blob();
  }

  // On phones and tablets the share sheet saves straight to Photos. Desktop
  // browsers keep the plain download: their share dialog can hang the page.
  const wantShare = opts?.share !== false;
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const file = new File([blob], fileName, { type: 'image/png' });
  if (wantShare && touch && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (error) {
      // The child closed the sheet: that is an answer, not an error.
      if ((error as DOMException)?.name === 'AbortError') return;
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}

function usableDataUrl(value: string | undefined): boolean {
  return Boolean(value && value.startsWith('data:image/') && value.length >= MIN_DATA_URL);
}

function usableHostedImage(value: string | undefined): boolean {
  return Boolean(value && /^(https?:|\/v1\/)/i.test(value));
}
