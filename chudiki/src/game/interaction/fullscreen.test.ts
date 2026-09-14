import assert from 'node:assert/strict';
import {
  cinemaAfterNativeChange,
  cinemaViewportVars,
  documentAllowsFullscreen,
  fullscreenBlockedMessage,
  isIosSafari,
  isIphone,
} from './fullscreen.ts';

assert.deepEqual(cinemaAfterNativeChange(true, false, false), {
  cinema: true,
  hadNative: true,
});
assert.deepEqual(cinemaAfterNativeChange(false, true, true), {
  cinema: false,
  hadNative: false,
});
assert.deepEqual(cinemaAfterNativeChange(false, false, true), {
  cinema: true,
  hadNative: false,
});
assert.deepEqual(cinemaAfterNativeChange(false, false, false), {
  cinema: false,
  hadNative: false,
});

assert.deepEqual(cinemaViewportVars(null), {
  top: '0px',
  left: '0px',
  width: '100vw',
  height: '100dvh',
});
assert.deepEqual(
  cinemaViewportVars({ offsetTop: 47.2, offsetLeft: 0, width: 390.4, height: 660.8 }),
  { top: '47px', left: '0px', width: '390px', height: '661px' },
);

const iphoneSafari =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const iphoneChrome =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1';
const androidChrome =
  'Mozilla/5.0 (Linux; Android 14; Pixel Fold) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

assert.equal(isIphone(iphoneSafari), true);
assert.equal(isIosSafari(iphoneSafari), true);
assert.equal(isIosSafari(iphoneChrome), false);
assert.equal(isIphone(androidChrome), false);
assert.ok(fullscreenBlockedMessage(iphoneSafari, false).includes('Safari'));
assert.ok(fullscreenBlockedMessage(iphoneChrome, false).includes('iPhone'));
assert.ok(fullscreenBlockedMessage(androidChrome, true).includes('Chrome'));
assert.equal(documentAllowsFullscreen({ fullscreenEnabled: false }), false);
assert.equal(documentAllowsFullscreen({ fullscreenEnabled: true }), true);
assert.equal(
  documentAllowsFullscreen({ fullscreenEnabled: false, webkitFullscreenEnabled: true }),
  true,
);
