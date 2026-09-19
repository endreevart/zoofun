import assert from 'node:assert/strict';
import { hasPersistedStill, portraitFileName, portraitUrlOf, rosterPhoto, displayStillUrl } from './portrait.ts';

const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
const fat = `data:image/png;base64,${'A'.repeat(240)}`;
const egg = `data:image/png;base64,${'A'.repeat(300)}`;
const still = `data:image/png;base64,${'A'.repeat(800)}`;

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
assert.equal(rosterPhoto(undefined, undefined), null);
assert.equal(rosterPhoto(undefined, fat), fat);
assert.equal(
  rosterPhoto(
    {
      contour: [],
      textureUrl: fat,
      aspect: 1,
      eyeAnchor: [0, 0],
      eyeSpacing: 0,
      eyeRadius: 0,
      sideColor: '#fff',
      accentColor: '#000',
    },
    'thumb',
  ),
  fat,
);

assert.equal(portraitFileName('Тяпа'), 'Тяпа.png');
assert.equal(portraitFileName('a/b:c'), 'abc.png');
assert.equal(portraitFileName('   '), 'chudik.png');

const blank = {
  contour: [] as Array<[number, number]>,
  textureUrl: egg,
  aspect: 1,
  eyeAnchor: [0, 0] as [number, number],
  eyeSpacing: 0,
  eyeRadius: 0,
  sideColor: '#fff',
  accentColor: '#000',
  painted: true,
};
assert.equal(hasPersistedStill(undefined), false);
assert.equal(hasPersistedStill({ ...blank, placeholder: true, textureUrl: still }), false);
assert.equal(hasPersistedStill(blank), false);
assert.equal(hasPersistedStill({ ...blank, textureUrl: still }), true);
assert.equal(hasPersistedStill({ ...blank, textureUrl: png, portraitUrl: still }), true);
assert.equal(
  portraitUrlOf({
    ...blank,
    textureUrl: '',
    postcardUrl: 'https://s3.example/postcards/x.png',
    modelUrl: 'https://s3.example/meshes/x.glb',
  }),
  'https://s3.example/postcards/x.png',
);
assert.equal(
  hasPersistedStill({
    ...blank,
    textureUrl: '',
    postcardUrl: 'https://s3.example/postcards/x.png',
    modelUrl: 'https://s3.example/meshes/x.glb',
  }),
  true,
);

const wireStill = '/v1/zoo/creatures/ch_mesh/portrait';
assert.equal(
  portraitUrlOf({
    ...blank,
    textureUrl: '',
    portraitUrl: wireStill,
    modelUrl: 'https://s3.example/meshes/x.glb',
  }),
  wireStill,
);
assert.equal(displayStillUrl(wireStill), '/api/zoo/v1/zoo/creatures/ch_mesh/portrait');
assert.equal(
  displayStillUrl('/v1/zoo/creatures/ch_mesh/postcard'),
  '/api/zoo/v1/zoo/creatures/ch_mesh/postcard',
);
assert.equal(displayStillUrl('https://s3.example/postcards/x.png'), 'https://s3.example/postcards/x.png');
assert.equal(
  displayStillUrl('/v1/plaza/toys/ab12/still'),
  '/api/zoo/v1/plaza/toys/ab12/still',
);
assert.equal(displayStillUrl('/v1/plaza/models/spot-1'), '/api/zoo/v1/plaza/models/spot-1');
assert.equal(displayStillUrl(null), null);
