import assert from 'node:assert/strict';
import { floodFill, hexRgb } from './floodFill.ts';

assert.deepEqual(hexRgb('#e8362c'), { r: 232, g: 54, b: 44 });

const width = 6;
const height = 5;
const paper = { r: 255, g: 250, b: 240 };
const ink = { r: 36, g: 28, b: 36 };
const fill = { r: 232, g: 54, b: 44 };

const data = new Uint8ClampedArray(width * height * 4);
for (let i = 0; i < data.length; i += 4) {
  data[i] = paper.r;
  data[i + 1] = paper.g;
  data[i + 2] = paper.b;
  data[i + 3] = 255;
}

const paint = (x: number, y: number, color: { r: number; g: number; b: number }) => {
  const i = (y * width + x) * 4;
  data[i] = color.r;
  data[i + 1] = color.g;
  data[i + 2] = color.b;
  data[i + 3] = 255;
};

// Closed box of ink around the centre.
for (let x = 1; x <= 4; x += 1) {
  paint(x, 1, ink);
  paint(x, 3, ink);
}
paint(1, 2, ink);
paint(4, 2, ink);

assert.equal(floodFill(data, width, height, 2, 2, fill), true);
assert.deepEqual([...data.slice((2 * width + 2) * 4, (2 * width + 2) * 4 + 4)], [232, 54, 44, 255]);
assert.deepEqual([...data.slice((2 * width + 3) * 4, (2 * width + 3) * 4 + 4)], [232, 54, 44, 255]);
assert.deepEqual([...data.slice(0, 4)], [255, 250, 240, 255]);
assert.deepEqual([...data.slice((1 * width + 1) * 4, (1 * width + 1) * 4 + 4)], [36, 28, 36, 255]);

assert.equal(floodFill(data, width, height, 2, 2, fill), false);

const outside = floodFill(new Uint8ClampedArray(data), width, height, -1, 0, fill);
assert.equal(outside, false);
