import assert from 'node:assert/strict';
import { clearBackdrop } from './cutout.ts';

// 7×7 paper sheet with a 3×3 red toy in the middle; its center pixel is
// white (an eye). The border must go transparent, the eye must survive.
const size = 7;
const data = new Uint8ClampedArray(size * size * 4);
const put = (x: number, y: number, r: number, g: number, b: number) => {
  const o = (y * size + x) * 4;
  data[o] = r;
  data[o + 1] = g;
  data[o + 2] = b;
  data[o + 3] = 255;
};
for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) put(x, y, 255, 250, 240);
for (let y = 2; y <= 4; y += 1) for (let x = 2; x <= 4; x += 1) put(x, y, 220, 40, 40);
put(3, 3, 255, 255, 255);

clearBackdrop(data, size, size);

const alpha = (x: number, y: number) => data[(y * size + x) * 4 + 3];
assert.equal(alpha(0, 0), 0, 'corner paper cleared');
assert.equal(alpha(6, 3), 0, 'edge paper cleared');
assert.equal(alpha(1, 3), 0, 'paper next to the toy cleared');
assert.equal(alpha(2, 2), 255, 'toy body stays');
assert.equal(alpha(3, 3), 255, 'white eye inside the toy stays');

// Degenerate input must not throw.
clearBackdrop(new Uint8ClampedArray(0), 0, 0);

// Studio photo: a grey gradient with a soft shadow under the toy. All of the
// neutral background must clear, including the darker shadow ring, while the
// saturated toy and its white eye survive.
const photo = new Uint8ClampedArray(size * size * 4);
const putP = (x: number, y: number, r: number, g: number, b: number) => {
  const o = (y * size + x) * 4;
  photo[o] = r;
  photo[o + 1] = g;
  photo[o + 2] = b;
  photo[o + 3] = 255;
};
for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    const shade = 235 - y * 8; // vertical studio gradient 235 → 187
    putP(x, y, shade, shade, shade + 2);
  }
}
putP(3, 6, 175, 175, 178); // drop shadow pixel, still neutral
putP(1, 6, 232, 214, 196); // warm-tinted soft shadow edge, bright but not grey
for (let y = 2; y <= 4; y += 1) for (let x = 2; x <= 4; x += 1) putP(x, y, 220, 40, 40);
putP(3, 3, 255, 255, 255);

clearBackdrop(photo, size, size);
const alphaP = (x: number, y: number) => photo[(y * size + x) * 4 + 3];
assert.equal(alphaP(0, 0), 0, 'bright studio corner cleared');
assert.equal(alphaP(0, 6), 0, 'darker studio floor cleared');
assert.equal(alphaP(3, 6), 0, 'drop shadow cleared');
assert.equal(alphaP(1, 6), 0, 'warm shadow edge cleared');
assert.equal(alphaP(2, 2), 255, 'toy body stays on the photo');
assert.equal(alphaP(3, 3), 255, 'white eye stays on the photo');
