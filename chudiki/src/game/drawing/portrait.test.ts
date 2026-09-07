import assert from 'node:assert/strict';
import { portraitFileName, portraitUrlOf } from './portrait.ts';

const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
const fat = `data:image/png;base64,${'A'.repeat(240)}`;

assert.equal(portraitUrlOf(undefined), null);
assert.equal(
  portraitUrlOf({
    contour: [],
    textureUrl: png,
    aspect: 1,
    eyeAnchor: [0, 0],
    eyeSpacing: 0,
    eyeRadius: 0,
    sideColor: '#fff',
    accentColor: '#000',
    painted: true,
    placeholder: true,
  }),
  null,
);
assert.equal(
  portraitUrlOf({
    contour: [],
    textureUrl: fat,
    aspect: 1,
    eyeAnchor: [0, 0],
    eyeSpacing: 0,
    eyeRadius: 0,
    sideColor: '#fff',
    accentColor: '#000',
    painted: false,
  }),
  fat,
);
assert.equal(
  portraitUrlOf({
    contour: [],
    textureUrl: png,
    portraitUrl: fat,
    aspect: 1,
    eyeAnchor: [0, 0],
    eyeSpacing: 0,
    eyeRadius: 0,
    sideColor: '#fff',
    accentColor: '#000',
    painted: true,
  }),
  fat,
);
assert.equal(
  portraitUrlOf({
    contour: [],
    textureUrl: fat,
    aspect: 1,
    eyeAnchor: [0, 0],
    eyeSpacing: 0,
    eyeRadius: 0,
    sideColor: '#fff',
    accentColor: '#000',
    painted: true,
  }),
  fat,
);
assert.equal(portraitFileName('Тяпа'), 'Тяпа.png');
assert.equal(portraitFileName('a/b:c'), 'abc.png');
assert.equal(portraitFileName('   '), 'chudik.png');
