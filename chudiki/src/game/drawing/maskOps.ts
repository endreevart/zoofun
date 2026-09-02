/**
 * Binary mask operations used to turn a child's drawing into a silhouette.
 *
 * A drawing is usually an outline with an empty middle, sometimes with gaps in
 * the strokes. The order here matters: close the gaps first, then fill the
 * inside, then trim back to the original size.
 */

export type Mask = {
  data: Uint8Array;
  width: number;
  height: number;
};

export function createMask(width: number, height: number): Mask {
  return { data: new Uint8Array(width * height), width, height };
}

/** True where the source pixel is part of the drawing rather than the paper. */
export function maskFromImageData(image: ImageData): Mask {
  const { width, height, data } = image;
  const mask = createMask(width, height);

  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 24) transparent++;
  const mostlyTransparent = transparent / (width * height) > 0.05;

  if (mostlyTransparent) {
    // Came from the in-game drawing pad: alpha already tells us everything.
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      mask.data[p] = data[i + 3] > 40 ? 1 : 0;
    }
    return mask;
  }

  return maskFromPhoto(image);
}

/**
 * Photo of a drawing on paper: flood the background in from the borders,
 * matching whatever colour the paper happens to be.
 */
function maskFromPhoto(image: ImageData): Mask {
  const { width, height, data } = image;
  const mask = createMask(width, height);
  const background = estimateBorderColor(image);
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  const tolerance = 58;
  const matchesPaper = (p: number) => {
    const i = p * 4;
    const dr = data[i] - background[0];
    const dg = data[i + 1] - background[1];
    const db = data[i + 2] - background[2];
    return Math.sqrt(dr * dr + dg * dg + db * db) < tolerance;
  };

  for (let x = 0; x < width; x++) {
    queue.push(x, (height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    queue.push(y * width, y * width + width - 1);
  }

  while (queue.length) {
    const p = queue.pop()!;
    if (visited[p]) continue;
    visited[p] = 1;
    if (!matchesPaper(p)) continue;

    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) queue.push(p - 1);
    if (x < width - 1) queue.push(p + 1);
    if (y > 0) queue.push(p - width);
    if (y < height - 1) queue.push(p + width);
  }

  for (let p = 0; p < mask.data.length; p++) {
    mask.data[p] = visited[p] && matchesPaper(p) ? 0 : 1;
  }
  return mask;
}

function estimateBorderColor(image: ImageData): [number, number, number] {
  const { width, height, data } = image;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;

  const sample = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n++;
  };

  const band = Math.max(1, Math.round(Math.min(width, height) * 0.03));
  for (let y = 0; y < band; y++) {
    for (let x = 0; x < width; x += 2) {
      sample(x, y);
      sample(x, height - 1 - y);
    }
  }
  for (let x = 0; x < band; x++) {
    for (let y = 0; y < height; y += 2) {
      sample(x, y);
      sample(width - 1 - x, y);
    }
  }

  return [r / n, g / n, b / n];
}

export function dilate(mask: Mask, radius: number): Mask {
  return morph(mask, radius, true);
}

export function erode(mask: Mask, radius: number): Mask {
  return morph(mask, radius, false);
}

function morph(mask: Mask, radius: number, grow: boolean): Mask {
  if (radius <= 0) return mask;
  const { width, height } = mask;
  let source = mask.data;

  // Separable passes: horizontal then vertical, one pixel of radius at a time.
  for (let pass = 0; pass < radius; pass++) {
    const horizontal = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x;
        const a = source[p];
        const left = x > 0 ? source[p - 1] : grow ? 0 : 1;
        const right = x < width - 1 ? source[p + 1] : grow ? 0 : 1;
        horizontal[p] = grow ? (a || left || right ? 1 : 0) : a && left && right ? 1 : 0;
      }
    }

    const vertical = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x;
        const a = horizontal[p];
        const up = y > 0 ? horizontal[p - width] : grow ? 0 : 1;
        const down = y < height - 1 ? horizontal[p + width] : grow ? 0 : 1;
        vertical[p] = grow ? (a || up || down ? 1 : 0) : a && up && down ? 1 : 0;
      }
    }
    source = vertical;
  }

  return { data: source, width, height };
}

/**
 * Fills enclosed empty regions. This is what turns a hollow outline drawing
 * into a solid body we can extrude.
 */
export function fillHoles(mask: Mask): Mask {
  const { width, height, data } = mask;
  const outside = new Uint8Array(width * height);
  const queue: number[] = [];

  const push = (p: number) => {
    if (!outside[p] && !data[p]) {
      outside[p] = 1;
      queue.push(p);
    }
  };

  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }

  while (queue.length) {
    const p = queue.pop()!;
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) push(p - 1);
    if (x < width - 1) push(p + 1);
    if (y > 0) push(p - width);
    if (y < height - 1) push(p + width);
  }

  const filled = new Uint8Array(width * height);
  for (let p = 0; p < filled.length; p++) filled[p] = data[p] || !outside[p] ? 1 : 0;
  return { data: filled, width, height };
}

/** Keeps only the biggest blob, dropping stray specks and smudges. */
export function largestComponent(mask: Mask): Mask {
  const { width, height, data } = mask;
  const labels = new Int32Array(width * height).fill(-1);
  let best = -1;
  let bestSize = 0;
  let current = 0;

  for (let start = 0; start < data.length; start++) {
    if (!data[start] || labels[start] !== -1) continue;

    let size = 0;
    const queue = [start];
    labels[start] = current;

    while (queue.length) {
      const p = queue.pop()!;
      size++;
      const x = p % width;
      const y = (p - x) / width;

      const neighbours = [
        x > 0 ? p - 1 : -1,
        x < width - 1 ? p + 1 : -1,
        y > 0 ? p - width : -1,
        y < height - 1 ? p + width : -1,
      ];
      for (const n of neighbours) {
        if (n >= 0 && data[n] && labels[n] === -1) {
          labels[n] = current;
          queue.push(n);
        }
      }
    }

    if (size > bestSize) {
      bestSize = size;
      best = current;
    }
    current++;
  }

  const out = createMask(width, height);
  if (best < 0) return out;
  for (let p = 0; p < out.data.length; p++) out.data[p] = labels[p] === best ? 1 : 0;
  return out;
}

export function maskBounds(mask: Mask): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const { width, height, data } = mask;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!data[y * width + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}

export function maskArea(mask: Mask): number {
  let n = 0;
  for (const v of mask.data) n += v;
  return n;
}
