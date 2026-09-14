import assert from 'node:assert/strict';
import { parseUtm } from './utm.ts';

assert.deepEqual(parseUtm('utm_source=reels&utm_campaign=friend&utm_content=clip-3'), {
  source: 'reels',
  campaign: 'friend',
  content: 'clip-3',
});
assert.deepEqual(parseUtm('?utm_source=ig'), {
  source: 'ig',
  campaign: '',
  content: '',
});
assert.equal(parseUtm('').source, '');
