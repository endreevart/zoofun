import assert from 'node:assert/strict';
import {
  canRegisterWorker,
  INSTALL_LABEL,
  installKind,
  isIosSafari,
  isStandaloneDisplay,
  PWA_HIDE_KEY,
  pwaHidden,
  rememberPwaHide,
} from './pwa.ts';

assert.equal(isStandaloneDisplay('standalone'), true);
assert.equal(isStandaloneDisplay('browser', true), true);
assert.equal(isStandaloneDisplay('browser', false), false);

assert.equal(isIosSafari('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'), true);
assert.equal(
  isIosSafari(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1',
  ),
  false,
);
assert.equal(isIosSafari('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 5), true);
assert.equal(isIosSafari('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 0), false);
assert.equal(isIosSafari('Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0 Mobile'), false);

assert.equal(canRegisterWorker('https:', 'zooo.fun'), true);
assert.equal(canRegisterWorker('http:', '127.0.0.1'), true);
assert.equal(canRegisterWorker('http:', 'zooo.fun'), false);

assert.equal(installKind({ standalone: true, hidden: false, deferred: true, ios: true }), 'none');
assert.equal(installKind({ standalone: false, hidden: true, deferred: true, ios: false }), 'none');
assert.equal(installKind({ standalone: false, hidden: false, deferred: true, ios: false }), 'prompt');
assert.equal(installKind({ standalone: false, hidden: false, deferred: false, ios: true }), 'ios');
assert.equal(installKind({ standalone: false, hidden: false, deferred: false, ios: false }), 'none');
assert.equal(INSTALL_LABEL, 'Установить приложение');

const store = new Map<string, string>();
const memory = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
} as Storage;
assert.equal(pwaHidden(memory), false);
rememberPwaHide(memory);
assert.equal(memory.getItem(PWA_HIDE_KEY), '1');
assert.equal(pwaHidden(memory), true);
