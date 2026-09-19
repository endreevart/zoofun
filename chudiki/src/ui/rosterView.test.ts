import assert from 'node:assert/strict';
import {
  albumSrc,
  collageFaces,
  ownRoster,
  photosInView,
  rosterEntry,
  ROSTER_ALL,
  ROSTER_DOWNLOAD_GLB,
  ROSTER_GO_GARDEN,
  ROSTER_TITLE,
} from './rosterView.ts';

assert.equal(ROSTER_TITLE, 'Мои Зуфики');
assert.equal(ROSTER_DOWNLOAD_GLB, 'Скачать 3D');
assert.equal(ROSTER_GO_GARDEN, 'В сад');

const child = { id: 'ch_one', name: 'Бубуся', origin: 'drawing' as const };
const park = { id: 'resident_cypa', name: 'Цыпа', origin: 'resident' as const };
assert.deepEqual(ownRoster([park, child]).map((item) => item.id), ['ch_one']);

const one = rosterEntry({
  id: 'ch_one',
  name: 'Бубуся',
  postcard: '/v1/zoo/creatures/ch1/postcard',
  still: 'face-a',
});
assert.equal(one.hasPostcard, true);
assert.equal(one.garden, '/v1/zoo/creatures/ch1/postcard');
assert.equal(one.face, 'face-a');

const two = [
  one,
  rosterEntry({ id: 'ch_two', name: 'Прыгуша', postcard: null, still: 'face-b' }),
];
assert.equal(photosInView(two, ROSTER_ALL).length, 2);
assert.equal(photosInView(two, 'ch_one')[0]?.name, 'Бубуся');
assert.equal(photosInView(two, 'missing').length, 0);
assert.deepEqual(collageFaces(two), ['face-a', 'face-b']);
assert.equal(two[1]?.hasPostcard, false);
assert.equal(two[1]?.garden, 'face-b');

assert.equal(albumSrc(one, 'composed'), '/v1/zoo/creatures/ch1/postcard');
assert.equal(albumSrc(two[1]!, 'meadow-b'), 'meadow-b');
assert.equal(albumSrc(two[1]!, null), 'face-b');
