/** Warm paper the pad actually paints on. Transparent PNG looks empty to Flux. */
export const PAPER_HEX = '#fffaf0';
export const PAPER = { r: 255, g: 250, b: 240 };

const INK_SLOP = 18;

export function isPaperPixel(r: number, g: number, b: number, a: number): boolean {
  if (a < 20) return true;
  return Math.abs(r - PAPER.r) + Math.abs(g - PAPER.g) + Math.abs(b - PAPER.b) <= INK_SLOP;
}

export function inkBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (isPaperPixel(data[i], data[i + 1], data[i + 2], data[i + 3])) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { minX, minY, maxX, maxY };
}

export function fillPaper(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = PAPER_HEX;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/**
 * Flatten transparency onto paper and crop to the doodle, like a scanned sheet.
 * Flux keeps a crayon cat because that photo fills the frame on real paper.
 */
export function paperizeCanvas(source: HTMLCanvasElement, maxSide = 1024): HTMLCanvasElement {
  const ctx = source.getContext('2d', { willReadFrequently: true });
  if (!ctx || source.width < 1 || source.height < 1) return source;
  const { data } = ctx.getImageData(0, 0, source.width, source.height);
  const box = inkBounds(data, source.width, source.height);
  if (!box) return source;

  const pad = Math.round(Math.max(source.width, source.height) * 0.08);
  const left = Math.max(0, box.minX - pad);
  const top = Math.max(0, box.minY - pad);
  const right = Math.min(source.width, box.maxX + 1 + pad);
  const bottom = Math.min(source.height, box.maxY + 1 + pad);
  const cutW = Math.max(8, right - left);
  const cutH = Math.max(8, bottom - top);
  const scale = Math.min(1, maxSide / Math.max(cutW, cutH));

  const out = document.createElement('canvas');
  out.width = Math.max(8, Math.round(cutW * scale));
  out.height = Math.max(8, Math.round(cutH * scale));
  const dest = out.getContext('2d')!;
  fillPaper(dest, out.width, out.height);
  dest.drawImage(source, left, top, cutW, cutH, 0, 0, out.width, out.height);
  return out;
}
