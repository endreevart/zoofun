import type { DrawingData } from '../creatures/ChudikSpec';
import {
  dilate,
  erode,
  fillHoles,
  largestComponent,
  maskArea,
  maskBounds,
  maskFromImageData,
  type Mask,
} from './maskOps';
import {
  normalizeContour,
  resampleClosed,
  simplify,
  smoothClosed,
  traceBoundary,
} from './contour';

/**
 * The drawing-to-creature pipeline.
 *
 * Nothing about the child's drawing is invented or replaced. We only work out
 * *where* the drawing is (silhouette), give it thickness, and note where a pair
 * of eyes should sit so it reads as a living chudik rather than a flat sticker.
 */

/** Working resolution for the mask maths. Big enough for shape, cheap to run. */
const WORK_SIZE = 320;
const TEXTURE_SIZE = 640;
const PAINTED_TEXTURE_SIZE = 896;

export type ProcessResult =
  | { ok: true; drawing: DrawingData; previewUrl: string }
  | { ok: false; reason: 'empty' | 'too-small' | 'too-thin' };

export type ProcessOptions = {
  /** Neural restyle: keep the paint, don't treat it as pencil-on-paper. */
  painted?: boolean;
};

export async function imageToChudik(
  source: HTMLCanvasElement | HTMLImageElement | ImageBitmap,
  options: ProcessOptions = {},
): Promise<ProcessResult> {
  const painted = options.painted === true;
  const sourceWidth = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const sourceHeight = 'naturalHeight' in source ? source.naturalHeight : source.height;
  if (!sourceWidth || !sourceHeight) return { ok: false, reason: 'empty' };

  const scale = WORK_SIZE / Math.max(sourceWidth, sourceHeight);
  const workWidth = Math.max(8, Math.round(sourceWidth * scale));
  const workHeight = Math.max(8, Math.round(sourceHeight * scale));

  const work = document.createElement('canvas');
  work.width = workWidth;
  work.height = workHeight;
  const workCtx = work.getContext('2d', { willReadFrequently: true })!;
  workCtx.drawImage(source, 0, 0, workWidth, workHeight);
  const imageData = workCtx.getImageData(0, 0, workWidth, workHeight);

  let mask = maskFromImageData(imageData);
  if (maskArea(mask) < workWidth * workHeight * 0.004) return { ok: false, reason: 'empty' };

  // Close stroke gaps, fill the hollow middle, then shrink back to size.
  mask = dilate(mask, 3);
  mask = fillHoles(mask);
  mask = erode(mask, 2);
  mask = largestComponent(mask);

  const bounds = maskBounds(mask);
  if (!bounds) return { ok: false, reason: 'empty' };

  const boxWidth = bounds.maxX - bounds.minX + 1;
  const boxHeight = bounds.maxY - bounds.minY + 1;
  const minBox = painted ? 0.08 : 0.12;
  const minFill = painted ? 0.04 : 0.12;
  if (Math.max(boxWidth, boxHeight) < Math.max(workWidth, workHeight) * minBox) {
    return { ok: false, reason: 'too-small' };
  }
  if (maskArea(mask) < boxWidth * boxHeight * minFill) {
    return { ok: false, reason: 'too-thin' };
  }

  const traced = traceBoundary(mask);
  if (traced.length < 8) return { ok: false, reason: 'empty' };

  const simplified = simplify(traced, 1.1);
  const smoothed = smoothClosed(simplified, 2);
  const resampled = resampleClosed(smoothed, Math.min(96, Math.max(28, simplified.length * 2)));
  const { contour, aspect } = normalizeContour(resampled, bounds);

  const palette = extractPalette(imageData, mask);
  const textureUrl = renderTexture(source, bounds, {
    scale,
    baseColor: palette.base,
    sourceWidth,
    sourceHeight,
    fillBase: !painted,
    textureSize: painted ? PAINTED_TEXTURE_SIZE : TEXTURE_SIZE,
  });

  const eyes = findEyeAnchor(mask, bounds);

  return {
    ok: true,
    previewUrl: textureUrl,
    drawing: {
      contour,
      textureUrl,
      aspect,
      eyeAnchor: eyes.anchor,
      eyeSpacing: eyes.spacing,
      eyeRadius: eyes.radius,
      sideColor: palette.side,
      accentColor: palette.accent,
      painted,
    },
  };
}

/** A clay egg on the meadow while OpenRouter and Meshy still work. */
export function makeEggDrawing(drawing: DrawingData): DrawingData {
  const contour: Array<[number, number]> = [];
  const steps = 36;
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const flare = 0.5 - 0.5 * Math.cos(t);
    const rx = 0.26 * (0.76 + 0.24 * flare);
    const ry = 0.4;
    contour.push([Math.sin(t) * rx, Math.cos(t) * ry]);
  }
  const clay = lightenHex(drawing.sideColor, 0.34);
  return {
    contour,
    textureUrl: solidFillTexture(clay),
    aspect: 0.7,
    eyeAnchor: [0, 0.06],
    eyeSpacing: 0.14,
    eyeRadius: 0.05,
    sideColor: clay,
    accentColor: drawing.accentColor,
    painted: true,
    placeholder: true,
  };
}

/** Cream egg before the drawing has been read. */
export function blankEggDrawing(): DrawingData {
  return makeEggDrawing({
    contour: [],
    textureUrl: '',
    aspect: 0.7,
    eyeAnchor: [0, 0],
    eyeSpacing: 0.14,
    eyeRadius: 0.05,
    sideColor: '#f3d7a6',
    accentColor: '#e08a4a',
    painted: true,
  });
}

function solidFillTexture(color: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 64, 64);
  return canvas.toDataURL('image/png');
}

function lightenHex(hex: string, amount: number): string {
  const value = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, ((value >> 16) & 255) + Math.round(255 * amount));
  const g = Math.min(255, ((value >> 8) & 255) + Math.round(255 * amount));
  const b = Math.min(255, (value & 255) + Math.round(255 * amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/**
 * Turns a neural restyle into a chudik. Never drops a painted image just
 * because the silhouette maths were built for pencil-on-paper.
 */
export async function styledToChudik(
  source: HTMLCanvasElement | HTMLImageElement | ImageBitmap,
): Promise<ProcessResult> {
  const painted = await imageToChudik(source, { painted: true });
  if (painted.ok) return painted;
  return paintedFallback(source);
}

/**
 * Crops the drawing to its silhouette box and lays it over a solid base colour
 * pulled from the child's own palette, so unpainted paper reads as body.
 */
function renderTexture(
  source: HTMLCanvasElement | HTMLImageElement | ImageBitmap,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  options: {
    scale: number;
    baseColor: string;
    sourceWidth: number;
    sourceHeight: number;
    fillBase?: boolean;
    textureSize?: number;
  },
): string {
  const boxWidth = bounds.maxX - bounds.minX + 1;
  const boxHeight = bounds.maxY - bounds.minY + 1;
  const aspect = boxWidth / boxHeight;
  const size = options.textureSize ?? TEXTURE_SIZE;

  const outWidth = aspect >= 1 ? size : Math.round(size * aspect);
  const outHeight = aspect >= 1 ? Math.round(size / aspect) : size;

  const canvas = document.createElement('canvas');
  canvas.width = outWidth;
  canvas.height = outHeight;
  const ctx = canvas.getContext('2d')!;

  if (options.fillBase !== false) {
    ctx.fillStyle = options.baseColor;
    ctx.fillRect(0, 0, outWidth, outHeight);
  } else {
    ctx.clearRect(0, 0, outWidth, outHeight);
  }

  // Map the working-resolution box back onto the original pixels.
  const sx = bounds.minX / options.scale;
  const sy = bounds.minY / options.scale;
  const sw = boxWidth / options.scale;
  const sh = boxHeight / options.scale;

  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, outWidth, outHeight);

  return canvas.toDataURL('image/png');
}

/**
 * Last resort for a neural image whose silhouette we cannot trace: crop the
 * painted pixels onto a rounded body so the restyle still reaches the zoo.
 */
function paintedFallback(
  source: HTMLCanvasElement | HTMLImageElement | ImageBitmap,
): ProcessResult {
  const sourceWidth = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const sourceHeight = 'naturalHeight' in source ? source.naturalHeight : source.height;
  if (!sourceWidth || !sourceHeight) return { ok: false, reason: 'empty' };

  const scale = WORK_SIZE / Math.max(sourceWidth, sourceHeight);
  const workWidth = Math.max(8, Math.round(sourceWidth * scale));
  const workHeight = Math.max(8, Math.round(sourceHeight * scale));
  const work = document.createElement('canvas');
  work.width = workWidth;
  work.height = workHeight;
  const workCtx = work.getContext('2d', { willReadFrequently: true })!;
  workCtx.drawImage(source, 0, 0, workWidth, workHeight);
  const imageData = workCtx.getImageData(0, 0, workWidth, workHeight);

  const mask = maskFromImageData(imageData);
  const bounds = maskBounds(mask);
  if (!bounds || maskArea(mask) < 8) return { ok: false, reason: 'empty' };

  const boxWidth = bounds.maxX - bounds.minX + 1;
  const boxHeight = bounds.maxY - bounds.minY + 1;
  const rx = boxWidth / 2;
  const ry = boxHeight / 2;
  const cx = bounds.minX + rx;
  const cy = bounds.minY + ry;
  const oval: Array<[number, number]> = [];
  for (let i = 0; i < 32; i++) {
    const angle = (i / 32) * Math.PI * 2;
    oval.push([cx + Math.cos(angle) * rx * 0.92, cy + Math.sin(angle) * ry * 0.92]);
  }
  const { contour, aspect } = normalizeContour(oval, bounds);
  const palette = extractPalette(imageData, mask);
  const textureUrl = renderTexture(source, bounds, {
    scale,
    baseColor: palette.base,
    sourceWidth,
    sourceHeight,
    fillBase: false,
    textureSize: PAINTED_TEXTURE_SIZE,
  });
  const eyes = findEyeAnchor(mask, bounds);

  return {
    ok: true,
    previewUrl: textureUrl,
    drawing: {
      contour,
      textureUrl,
      aspect,
      eyeAnchor: eyes.anchor,
      eyeSpacing: eyes.spacing,
      eyeRadius: eyes.radius,
      sideColor: palette.side,
      accentColor: palette.accent,
      painted: true,
    },
  };
}

/**
 * Picks the drawing's own dominant hue. Outline greys and paper whites are
 * ignored so a mostly-pencil drawing still gets a friendly body colour.
 */
function extractPalette(image: ImageData, mask: Mask): { base: string; side: string; accent: string } {
  const bins = new Array(12).fill(0).map(() => ({ weight: 0, r: 0, g: 0, b: 0 }));
  const { data } = image;

  for (let p = 0; p < mask.data.length; p++) {
    if (!mask.data[p]) continue;
    const i = p * 4;
    if (data[i + 3] < 120) continue;

    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    if (s < 0.18 || l < 0.14 || l > 0.93) continue;

    const bin = Math.min(11, Math.floor(h * 12));
    const weight = s * (1 - Math.abs(l - 0.55));
    bins[bin].weight += weight;
    bins[bin].r += data[i] * weight;
    bins[bin].g += data[i + 1] * weight;
    bins[bin].b += data[i + 2] * weight;
  }

  let bestIndex = -1;
  let bestWeight = 0;
  for (let i = 0; i < bins.length; i++) {
    if (bins[i].weight > bestWeight) {
      bestWeight = bins[i].weight;
      bestIndex = i;
    }
  }

  // Pencil-only drawing: fall back to a warm, friendly hue.
  let hue = 0.09;
  let saturation = 0.62;
  if (bestIndex >= 0 && bestWeight > 0) {
    const bin = bins[bestIndex];
    const [h, s] = rgbToHsl(bin.r / bin.weight, bin.g / bin.weight, bin.b / bin.weight);
    hue = h;
    saturation = Math.max(0.35, Math.min(0.85, s));
  }

  return {
    base: hslToHex(hue, saturation * 0.75, 0.76),
    side: hslToHex(hue, saturation * 0.85, 0.42),
    accent: hslToHex((hue + 0.42) % 1, 0.68, 0.6),
  };
}

/**
 * Finds a believable place for the eyes: the widest run of silhouette a little
 * below the top edge, which for almost any child's drawing is the head.
 */
function findEyeAnchor(
  mask: Mask,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): { anchor: [number, number]; spacing: number; radius: number } {
  const boxWidth = bounds.maxX - bounds.minX + 1;
  const boxHeight = bounds.maxY - bounds.minY + 1;
  const centerX = bounds.minX + boxWidth / 2;
  const centerY = bounds.minY + boxHeight / 2;

  let bestRow = bounds.minY + Math.round(boxHeight * 0.24);
  let bestStart = bounds.minX;
  let bestLength = boxWidth;
  let found = false;

  // Search the upper third; take the widest solid run we can find there.
  const from = bounds.minY + Math.round(boxHeight * 0.1);
  const to = bounds.minY + Math.round(boxHeight * 0.4);

  for (let y = from; y <= to; y++) {
    let runStart = -1;
    for (let x = bounds.minX; x <= bounds.maxX + 1; x++) {
      const solid = x <= bounds.maxX && mask.data[y * mask.width + x] === 1;
      if (solid && runStart < 0) runStart = x;
      if (!solid && runStart >= 0) {
        const length = x - runStart;
        if (length > bestLength || !found) {
          bestLength = length;
          bestStart = runStart;
          bestRow = y;
          found = true;
        }
        runStart = -1;
      }
    }
  }

  const runCenter = bestStart + bestLength / 2;
  const normalizedRun = bestLength / boxHeight;

  const radius = clamp(normalizedRun * 0.2, 0.07, 0.155);
  const spacing = clamp(normalizedRun * 0.42, radius * 1.9, radius * 2.6);

  return {
    anchor: [(runCenter - centerX) / boxHeight, -(bestRow - centerY) / boxHeight],
    spacing,
    radius,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const delta = max - min;

  if (delta < 1e-6) return [0, 0, l];

  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / delta + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / delta + 2) / 6;
  else h = ((rn - gn) / delta + 4) / 6;

  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const hueToRgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  let r: number;
  let g: number;
  let b: number;

  if (s < 1e-6) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hueToRgb(p, q, h + 1 / 3);
    g = hueToRgb(p, q, h);
    b = hueToRgb(p, q, h - 1 / 3);
  }

  const toHex = (v: number) =>
    Math.round(Math.max(0, Math.min(255, v * 255)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
