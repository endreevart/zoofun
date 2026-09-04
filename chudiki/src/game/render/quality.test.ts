import assert from 'node:assert/strict';
import { settingsFromHints, type QualityHints } from './quality.ts';

const desktop: QualityHints = {
  coarsePointer: false,
  shortSide: 900,
  saveData: false,
  deviceMemory: 16,
  userAgent: 'Macintosh',
  devicePixelRatio: 2,
};

const iphone: QualityHints = {
  coarsePointer: true,
  shortSide: 390,
  saveData: false,
  deviceMemory: 4,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
  devicePixelRatio: 3,
};

const ipad: QualityHints = {
  coarsePointer: true,
  shortSide: 768,
  saveData: false,
  deviceMemory: 8,
  userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)',
  devicePixelRatio: 2,
};

const desk = settingsFromHints(desktop);
assert.equal(desk.tier, 'high');
assert.equal(desk.bloom, true);
assert.equal(desk.shadows, true);
assert.equal(desk.pixelRatio, 1.5);

const phone = settingsFromHints(iphone);
assert.equal(phone.tier, 'low');
assert.equal(phone.bloom, false);
assert.equal(phone.shafts, false);
assert.equal(phone.shadows, false);
assert.equal(phone.antialias, false);
assert.equal(phone.pixelRatio, 1);
assert.ok(phone.grassStep > desk.grassStep);
assert.ok(phone.grassBlades < desk.grassBlades);

const tablet = settingsFromHints(ipad);
assert.equal(tablet.tier, 'high');
assert.equal(tablet.gtao, false);
assert.equal(tablet.bloom, true);

const saver = settingsFromHints({ ...desktop, saveData: true });
assert.equal(saver.tier, 'low');
