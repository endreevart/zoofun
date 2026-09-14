import assert from 'node:assert/strict';
import {
  claimCueOnce,
  clampMix,
  DEFAULT_MUSIC,
  DEFAULT_VOICE,
  MUSIC_KEY,
  gainToSlider,
  readMix,
  sliderToGain,
  VOICE_KEY,
  writeMix,
} from './mix.ts';

assert.equal(clampMix(0.4, 0.1), 0.4);
assert.equal(clampMix(-1, 0.1), 0);
assert.equal(clampMix(2, 0.1), 1);
assert.equal(clampMix(Number.NaN, 0.11), 0.11);

class MemoryStore {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

const store = new MemoryStore() as unknown as Storage;
assert.deepEqual(readMix(store), { music: DEFAULT_MUSIC, voice: DEFAULT_VOICE });

const saved = writeMix({ music: 0.4, voice: 0.5 }, store);
assert.equal(saved.music, 0.4);
assert.equal(saved.voice, 0.5);
assert.equal(store.getItem(MUSIC_KEY), '0.4');
assert.equal(store.getItem(VOICE_KEY), '0.5');
assert.deepEqual(readMix(store), { music: 0.4, voice: 0.5 });

assert.deepEqual(writeMix({ music: 9, voice: -2 }, store), { music: 1, voice: 0 });

assert.equal(sliderToGain(0), 0);
assert.equal(sliderToGain(1), 1);
assert.ok(sliderToGain(0.5) < 0.3);
assert.ok(Math.abs(gainToSlider(sliderToGain(0.4)) - 0.4) < 1e-6);
assert.ok(gainToSlider(DEFAULT_MUSIC) > 0.3);

const once = new MemoryStore() as unknown as Storage;
assert.equal(claimCueOnce('worlds', once), true);
assert.equal(claimCueOnce('worlds', once), false);
assert.equal(claimCueOnce('welcome_diy', once), true);
