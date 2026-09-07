/**
 * Cut the backdrop off a portrait so the toy can stand inside a 2D scene
 * (wash room, feeding game, postcard). The model paints either a warm-paper
 * card or a studio photo with a soft grey gradient and a drop shadow — both
 * are near-neutral, while the toys are saturated felt and clay. Flood from
 * the borders only: white eyes and teeth inside the silhouette must survive.
 */

const PAPER = { r: 255, g: 250, b: 240 };
const SLOP = 44;
/** How far apart the channels may sit and still read as "grey studio air". */
const NEUTRAL_SPREAD = 26;
/** Studio shadows are darker than this; they are background too. */
const NEUTRAL_MIN_LUMA = 108;
/**
 * Drop shadows pick up a warm pink bounce from the toy: r >= g >= b with a
 * moderate spread (30-56) around luma 95-210. Saturated felt sits well above
 * this spread, and the fill only walks in from the borders, so the same tones
 * inside the silhouette (highlights, blush) are unreachable and survive.
 */
const SHADOW_SPREAD = 56;
const SHADOW_MIN_LUMA = 95;

function isBackdrop(data: Uint8ClampedArray, offset: number): boolean {
  if (data[offset + 3] < 20) return true;
  const r = data[offset];
  const g = data[offset + 1];
  const b = data[offset + 2];
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  const luma = (r * 3 + g * 6 + b) / 10;
  if (spread <= NEUTRAL_SPREAD && luma >= NEUTRAL_MIN_LUMA) return true;
  const warm = r >= g && g + 8 >= b;
  if (warm && spread <= SHADOW_SPREAD && luma >= SHADOW_MIN_LUMA) return true;
  return Math.abs(r - PAPER.r) + Math.abs(g - PAPER.g) + Math.abs(b - PAPER.b) <= SLOP;
}

/** BFS from every border pixel across near-paper pixels, clearing alpha. */
export function clearBackdrop(data: Uint8ClampedArray, width: number, height: number): void {
  if (width <= 0 || height <= 0) return;
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  const seed = (x: number, y: number) => {
    const index = y * width + x;
    if (visited[index]) return;
    visited[index] = 1;
    if (isBackdrop(data, index * 4)) queue.push(index);
  };

  for (let x = 0; x < width; x += 1) {
    seed(x, 0);
    seed(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    seed(0, y);
    seed(width - 1, y);
  }

  while (queue.length > 0) {
    const index = queue.pop() as number;
    data[index * 4 + 3] = 0;
    const x = index % width;
    const y = (index - x) / width;
    if (x > 0) seed(x - 1, y);
    if (x + 1 < width) seed(x + 1, y);
    if (y > 0) seed(x, y - 1);
    if (y + 1 < height) seed(x, y + 1);
  }
}

const cache = new Map<string, string>();

/** Browser wrapper: data URL in, transparent data URL out. Falls back to the original. */
export async function cutoutPortrait(src: string): Promise<string> {
  const hit = cache.get(src);
  if (hit) return hit;
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = src;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) return src;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    clearBackdrop(pixels.data, canvas.width, canvas.height);
    context.putImageData(pixels, 0, 0);
    const url = canvas.toDataURL('image/png');
    cache.set(src, url);
    return url;
  } catch {
    return src;
  }
}
