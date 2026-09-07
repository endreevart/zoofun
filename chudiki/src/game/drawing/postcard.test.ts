import assert from 'node:assert/strict';
import { POSTCARD_SIZE, coverBox, opaqueBox, postcardFileName, toyBox } from './postcard.ts';

// Cover: the backdrop always fills the whole square, centered.
const wide = coverBox(1080, 1440, 810);
assert.equal(wide.h, 1080, 'short side snaps to the canvas');
assert.ok(wide.w > 1080, 'long side overflows');
assert.ok(Math.abs(wide.x + wide.w / 2 - 540) < 0.001, 'centered horizontally');
assert.equal(wide.y, 0);

const tall = coverBox(1080, 810, 1440);
assert.equal(tall.w, 1080);
assert.ok(tall.h > 1080);
assert.ok(tall.y < 0);

const square = coverBox(1080, 512, 512);
assert.deepEqual(square, { x: 0, y: 0, w: 1080, h: 1080 });

// Toy: centered, feet near the bottom, fully inside the canvas for the
// square-ish portraits OpenRouter returns.
const toy = toyBox(POSTCARD_SIZE, 1024, 1024);
assert.ok(Math.abs(toy.x + toy.w / 2 - POSTCARD_SIZE / 2) < 0.001, 'centered');
assert.ok(Math.abs(toy.y + toy.h - POSTCARD_SIZE * 0.92) < 0.001, 'feet near the bottom');
assert.ok(toy.y > 0, 'head stays inside the frame');
assert.ok(toy.w < POSTCARD_SIZE, 'meadow visible on the sides');

const zero = toyBox(POSTCARD_SIZE, 0, 0);
assert.ok(zero.w > 0 && zero.h > 0, 'degenerate image still gets a box');

// Opaque bounding box: transparent studio air around the toy is trimmed.
const sheet = new Uint8ClampedArray(8 * 8 * 4);
const setA = (x: number, y: number) => {
  sheet[(y * 8 + x) * 4 + 3] = 255;
};
setA(2, 3);
setA(5, 3);
setA(4, 6);
assert.deepEqual(opaqueBox(sheet, 8, 8), { x: 2, y: 3, w: 4, h: 4 });

// Fully transparent input falls back to the full image.
assert.deepEqual(opaqueBox(new Uint8ClampedArray(4 * 4 * 4), 4, 4), { x: 0, y: 0, w: 4, h: 4 });

assert.equal(postcardFileName('Зюзя'), 'Зюзя-в-зоопарке.png');
assert.equal(postcardFileName('  '), 'chudik-в-зоопарке.png');
assert.equal(postcardFileName('a/b:c'), 'abc-в-зоопарке.png');
