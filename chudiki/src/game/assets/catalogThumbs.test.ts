import assert from 'node:assert/strict';
import { thumbIsBlank } from './catalogThumbs.ts';

const cream = new Uint8Array(64 * 4);
for (let i = 0; i < cream.length; i += 4) {
  cream[i] = 0xf4;
  cream[i + 1] = 0xea;
  cream[i + 2] = 0xd6;
  cream[i + 3] = 255;
}
assert.equal(thumbIsBlank(cream), true);

const black = new Uint8Array(64 * 4);
assert.equal(thumbIsBlank(black), true);

const toy = new Uint8Array(64 * 4);
for (let i = 0; i < toy.length; i += 4) {
  toy[i] = 80;
  toy[i + 1] = 170;
  toy[i + 2] = 70;
  toy[i + 3] = 255;
}
assert.equal(thumbIsBlank(toy), false);
