import assert from 'node:assert/strict';
import {
  lookForHeavyIsland,
  lookForPlaza,
  lookForShell,
  plazaPixelRatio,
  settingsFromHints,
  type QualityHints,
} from './quality.ts';

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
assert.equal(desk.composerHalfFloat, true);
assert.equal(desk.composerSamples, 0);
assert.equal(desk.fxaa, false);
assert.equal(desk.maxFps, 0);

const phone = settingsFromHints(iphone);
assert.equal(phone.tier, 'low');
assert.equal(phone.bloom, false);
assert.equal(phone.shafts, false);
assert.equal(phone.shadows, true);
assert.equal(phone.softShadows, false, 'PCFSoft plus a 2048 map is the iPhone hitch');
assert.equal(phone.antialias, false, 'canvas MSAA is unused once PostFx owns the frame');
assert.equal(phone.fxaa, true, 'FXAA is the cheap edge filter on the low composer');
assert.equal(phone.pixelRatio, 2);
assert.equal(phone.shadowMapSize, 1024);
assert.equal(phone.composerHalfFloat, false, 'HalfFloat MSAA targets go black on iOS');
assert.equal(phone.composerSamples, 0);
assert.equal(phone.maxFps, 30);
assert.equal(phone.grassReceivesShadow, false);
assert.ok(phone.grassStep > desk.grassStep);
assert.ok(phone.grassBlades < desk.grassBlades);

const safari = settingsFromHints({ ...iphone, deviceMemory: undefined });
assert.equal(safari.tier, 'low');
assert.equal(safari.pixelRatio, 2);

const forcedLow = settingsFromHints(desktop, 'low');
assert.equal(forcedLow.tier, 'low');
assert.equal(forcedLow.composerHalfFloat, false);
const forcedHigh = settingsFromHints(iphone, 'high');
assert.equal(forcedHigh.tier, 'high');

const recovered = settingsFromHints(desktop, 'high', true);
assert.equal(recovered.tier, 'low');
assert.equal(recovered.shadows, false);
assert.equal(recovered.pixelRatio, 1);
assert.equal(recovered.composerHalfFloat, false);
assert.equal(recovered.maxFps, 30);

const tablet = settingsFromHints(ipad);
assert.equal(tablet.tier, 'low');
assert.equal(tablet.bloom, false);
assert.equal(tablet.maxFps, 30);

const ipadOs = settingsFromHints({
  coarsePointer: true,
  shortSide: 1024,
  saveData: false,
  deviceMemory: 8,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
  devicePixelRatio: 2,
});
assert.equal(ipadOs.tier, 'low');

const saver = settingsFromHints({ ...desktop, saveData: true });
assert.equal(saver.tier, 'low');
assert.equal(saver.pixelRatio, 1.25);

const heavy = lookForHeavyIsland(desk);
assert.equal(heavy.gtao, false);
assert.equal(heavy.bloom, false);
assert.equal(heavy.shafts, false);
assert.equal(heavy.pixelRatio, 1);
assert.ok(heavy.shadowMapSize <= 1024);
assert.equal(heavy.softShadows, false);
assert.equal(desk.bloom, true);
assert.equal(desk.softShadows, true);

const gardenPhone = lookForShell(phone, false);
assert.equal(gardenPhone.pixelRatio, 2);
assert.equal(gardenPhone.composerHalfFloat, false);
assert.equal(gardenPhone.softShadows, false);

const gardenDesk = lookForShell(desk, false);
assert.equal(gardenDesk.bloom, true);
assert.equal(gardenDesk.pixelRatio, 1.5);

const meadowDesk = lookForShell(desk, true);
assert.equal(meadowDesk.bloom, false);
assert.equal(meadowDesk.pixelRatio, 1);
assert.equal(meadowDesk.shadowMapSize, 1024);
assert.equal(meadowDesk.softShadows, true);

const meadowPhone = lookForShell(phone, true);
assert.equal(meadowPhone.softShadows, true);
assert.equal(meadowPhone.pixelRatio, 2);
assert.equal(gardenPhone.softShadows, false);

const twoX = settingsFromHints({ ...iphone, devicePixelRatio: 2 });
assert.equal(twoX.pixelRatio, 2);
const oneX = settingsFromHints({ ...iphone, devicePixelRatio: 1 });
assert.equal(oneX.pixelRatio, 1);

const plazaPhone = lookForPlaza(phone);
assert.equal(plazaPhone.pixelRatio, 1.5);
assert.equal(plazaPhone.fxaa, true);
assert.equal(plazaPhone.antialias, false);
assert.equal(plazaPhone.composerSamples, 0);

const plazaPad = lookForPlaza(tablet);
assert.equal(plazaPad.bloom, false);
assert.equal(plazaPad.shafts, false);
assert.equal(plazaPad.pixelRatio, 1.25);
assert.equal(plazaPad.antialias, false);
assert.equal(plazaPad.composerSamples, 0);
assert.equal(plazaPad.fxaa, true);
assert.equal(plazaPad.softShadows, false);
assert.equal(plazaPad.shadowMapSize, 512);
assert.equal(plazaPad.maxFps, 30);

const plazaDesk = lookForPlaza(desk);
assert.equal(plazaDesk.pixelRatio, 1.25);
assert.equal(plazaDesk.antialias, false);
assert.equal(plazaDesk.composerSamples, 0);
assert.equal(plazaDesk.fxaa, true);

assert.equal(plazaPixelRatio(recovered), 1);
assert.equal(lookForPlaza(recovered).pixelRatio, 1);
assert.equal(plazaPixelRatio(oneX), 1);
