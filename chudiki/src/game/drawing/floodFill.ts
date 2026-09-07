/** Paint-bucket fill for the child pad. One tap, no drag. */

export type Rgb = { r: number; g: number; b: number };

const MATCH_SLOP = 28;

export function hexRgb(hex: string): Rgb {
  const raw = hex.replace('#', '');
  return {
    r: Number.parseInt(raw.slice(0, 2), 16),
    g: Number.parseInt(raw.slice(2, 4), 16),
    b: Number.parseInt(raw.slice(4, 6), 16),
  };
}

function same(data: Uint8ClampedArray, index: number, color: Rgb, slop: number): boolean {
  return (
    Math.abs(data[index] - color.r) +
      Math.abs(data[index + 1] - color.g) +
      Math.abs(data[index + 2] - color.b) <=
    slop
  );
}

/**
 * 4-way scanline fill. Paints every pixel that matches the tap colour
 * with `fill`. Returns false when the tap is already that colour.
 */
export function floodFill(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  fill: Rgb,
  slop = MATCH_SLOP,
): boolean {
  const x0 = Math.floor(startX);
  const y0 = Math.floor(startY);
  if (x0 < 0 || y0 < 0 || x0 >= width || y0 >= height) return false;

  const seed = (y0 * width + x0) * 4;
  const target: Rgb = { r: data[seed], g: data[seed + 1], b: data[seed + 2] };
  if (same(data, seed, fill, slop)) return false;

  const stack = [x0, y0];
  let changed = false;

  while (stack.length > 0) {
    const y = stack.pop() as number;
    let x = stack.pop() as number;
    let index = (y * width + x) * 4;
    while (x > 0 && same(data, index - 4, target, slop)) {
      x -= 1;
      index -= 4;
    }

    let spanUp = false;
    let spanDown = false;
    while (x < width && same(data, index, target, slop)) {
      data[index] = fill.r;
      data[index + 1] = fill.g;
      data[index + 2] = fill.b;
      data[index + 3] = 255;
      changed = true;

      if (y > 0) {
        const up = same(data, index - width * 4, target, slop);
        if (up && !spanUp) {
          stack.push(x, y - 1);
          spanUp = true;
        } else if (!up) {
          spanUp = false;
        }
      }
      if (y + 1 < height) {
        const down = same(data, index + width * 4, target, slop);
        if (down && !spanDown) {
          stack.push(x, y + 1);
          spanDown = true;
        } else if (!down) {
          spanDown = false;
        }
      }

      x += 1;
      index += 4;
    }
  }

  return changed;
}
