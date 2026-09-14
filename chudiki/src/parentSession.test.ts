import assert from 'node:assert/strict';
import { shouldSendToAuth } from './parentSession.ts';

assert.equal(shouldSendToAuth('parent-token', '', false), false);
assert.equal(shouldSendToAuth(null, '', false), true);
assert.equal(shouldSendToAuth(null, '?studio=1', false), true, 'shipped island ignores studio');
assert.equal(shouldSendToAuth(null, '?studio=1', true), false);
assert.equal(shouldSendToAuth(null, '?tv=1', false), false);
assert.equal(shouldSendToAuth('parent-token', '?tv=1', false), false);
assert.equal(shouldSendToAuth(null, '', true), true, 'dev without studio still signs in');
