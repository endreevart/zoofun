/**
 * A postcard from the zoo: the cutout chudik standing on the garden meadow,
 * ready to be downloaded and shown to grandma. The plain photo download is
 * the raw OpenRouter still; this one adds the world around the toy.
 */

export const POSTCARD_SIZE = 1080;

/** Cover-crop a backdrop image over a square canvas. */
export function coverBox(
  canvas: number,
  imgW: number,
  imgH: number,
): { x: number; y: number; w: number; h: number } {
  const scale = Math.max(canvas / imgW, canvas / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  return { x: (canvas - w) / 2, y: (canvas - h) / 2, w, h };
}

/**
 * Where the toy stands: centered, feet on the meadow, garden visible around.
 * The incoming size is the trimmed silhouette, so the fractions are the real
 * share of the frame the toy takes.
 */
export function toyBox(
  canvas: number,
  imgW: number,
  imgH: number,
): { x: number; y: number; w: number; h: number } {
  const w = canvas * 0.62;
  const h = imgW > 0 ? w * (imgH / imgW) : w;
  return { x: (canvas - w) / 2, y: canvas * 0.92 - h, w, h };
}

/**
 * Bounding box of the opaque pixels, so the toy is laid out by its real
 * silhouette and not by the transparent studio air around it. Without this
 * the feet float above the grounding shadow.
 */
export function opaqueBox(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number } {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < 20) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return { x: 0, y: 0, w: width, h: height };
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

/** Compose the postcard; falls back to the raw still if anything fails. */
export async function composePostcard(src: string): Promise<string> {
  try {
    // Imported lazily so the pure layout math stays runnable in node tests.
    const { cutoutPortrait } = await import('./cutout');
    const { assetUrl } = await import('../../assetUrl');
    const backdropSrc = assetUrl('/ui/bg-meadow.webp');
    const [backdrop, toy] = await Promise.all([
      loadImage(backdropSrc),
      cutoutPortrait(src).then(loadImage),
    ]);
    const canvas = document.createElement('canvas');
    canvas.width = POSTCARD_SIZE;
    canvas.height = POSTCARD_SIZE;
    const context = canvas.getContext('2d');
    if (!context) return src;

    const bg = coverBox(POSTCARD_SIZE, backdrop.naturalWidth, backdrop.naturalHeight);
    context.drawImage(backdrop, bg.x, bg.y, bg.w, bg.h);

    // Trim the transparent margins so the feet sit exactly on the shadow.
    const scratch = document.createElement('canvas');
    scratch.width = toy.naturalWidth;
    scratch.height = toy.naturalHeight;
    const scratchCtx = scratch.getContext('2d');
    if (!scratchCtx) return src;
    scratchCtx.drawImage(toy, 0, 0);
    const pixels = scratchCtx.getImageData(0, 0, scratch.width, scratch.height);
    const trim = opaqueBox(pixels.data, scratch.width, scratch.height);

    const box = toyBox(POSTCARD_SIZE, trim.w, trim.h);

    // A soft grounding shadow so the toy stands on the meadow, not floats.
    context.save();
    context.translate(box.x + box.w / 2, box.y + box.h * 0.97);
    context.scale(1, 0.28);
    const shadow = context.createRadialGradient(0, 0, 0, 0, 0, box.w * 0.4);
    shadow.addColorStop(0, 'rgba(38, 66, 32, 0.34)');
    shadow.addColorStop(1, 'rgba(38, 66, 32, 0)');
    context.fillStyle = shadow;
    context.beginPath();
    context.arc(0, 0, box.w * 0.4, 0, Math.PI * 2);
    context.fill();
    context.restore();

    context.drawImage(toy, trim.x, trim.y, trim.w, trim.h, box.x, box.y, box.w, box.h);
    return canvas.toDataURL('image/png');
  } catch {
    return src;
  }
}

export function postcardFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]+/g, '').trim() || 'chudik';
  return `${cleaned}-в-зоопарке.png`;
}
