import type { DrawingData } from '../creatures/ChudikSpec';

/** Tiny 1×1 placeholders are not a child's picture. */
const MIN_DATA_URL = 240;

export function portraitFromImage(image: HTMLImageElement): string | undefined {
  if (image.src.startsWith('data:image/')) return image.src;
  return undefined;
}

export function portraitUrlOf(drawing: DrawingData | undefined): string | null {
  if (!drawing || drawing.placeholder) return null;
  if (usableDataUrl(drawing.portraitUrl)) return drawing.portraitUrl!;
  if (usableDataUrl(drawing.textureUrl)) return drawing.textureUrl;
  return null;
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

export async function downloadPortrait(url: string, fileName: string): Promise<void> {
  let blob: Blob;
  try {
    blob = await toPngBlob(url);
  } catch {
    blob = await (await fetch(url)).blob();
  }

  // On phones and tablets the share sheet saves straight to Photos. Desktop
  // browsers keep the plain download: their share dialog can hang the page.
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const file = new File([blob], fileName, { type: 'image/png' });
  if (touch && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
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
