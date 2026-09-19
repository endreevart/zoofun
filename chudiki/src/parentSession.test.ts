import assert from 'node:assert/strict';
import { forgetParentToken } from './api.ts';
import { ensureLocalParentSession, shouldSendToAuth } from './parentSession.ts';

if (typeof globalThis.localStorage === 'undefined') {
  const memory = new Map<string, string>();
  const stub = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: stub });
  Object.defineProperty(globalThis, 'sessionStorage', { value: stub });
}

assert.equal(shouldSendToAuth('parent-token', '', false), false);
assert.equal(shouldSendToAuth(null, '', false), true);
assert.equal(shouldSendToAuth(null, '?studio=1', false), true, 'shipped island ignores studio');
assert.equal(shouldSendToAuth(null, '?studio=1', true), false);
assert.equal(shouldSendToAuth(null, '?arcade=1', true), false);
assert.equal(shouldSendToAuth(null, '?tv=1', false), false);
assert.equal(shouldSendToAuth(null, '?visit=abc12345', false), false);
assert.equal(shouldSendToAuth('parent-token', '?tv=1', false), false);
assert.equal(shouldSendToAuth(null, '', true), true, 'dev without studio still signs in');

forgetParentToken();
{
  const token = await ensureLocalParentSession({
    dev: false,
    request: async () => new Response('{}', { status: 200 }),
  });
  assert.equal(token, null);
}

forgetParentToken();
{
  const token = await ensureLocalParentSession({
    dev: true,
    request: async (input) => {
      const url = String(input);
      if (url.includes('/v1/auth/dev-session')) {
        return new Response(JSON.stringify({ token: 'dev-token' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('no', { status: 500 });
    },
  });
  assert.equal(token, 'dev-token');
}
forgetParentToken();
