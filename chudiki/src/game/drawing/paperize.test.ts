import assert from 'node:assert/strict';
import { inkBounds, isPaperPixel } from './paperize.ts';

assert.equal(isPaperPixel(255, 250, 240, 255), true);
assert.equal(isPaperPixel(0, 0, 0, 0), true);
assert.equal(isPaperPixel(255, 122, 47, 255), false);

const width = 8;
const height = 8;
const data = new Uint8ClampedArray(width * height * 4);
for (let i = 0; i < data.length; i += 4) {
  data[i] = 255;
  data[i + 1] = 250;
  data[i + 2] = 240;
  data[i + 3] = 255;
}
assert.equal(inkBounds(data, width, height), null);

const paint = (x: number, y: number) => {
  const i = (y * width + x) * 4;
  data[i] = 255;
  data[i + 1] = 122;
  data[i + 2] = 47;
  data[i + 3] = 255;
};
paint(2, 3);
paint(3, 3);
paint(3, 4);
assert.deepEqual(inkBounds(data, width, height), { minX: 2, minY: 3, maxX: 3, maxY: 4 });
