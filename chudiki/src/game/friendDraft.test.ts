import assert from 'node:assert/strict';
import {
  clearFriendDraft,
  FRIEND_DRAFT_KEY,
  loadFriendDraft,
  saveFriendDraft,
  shouldHatchFriendDraft,
  shouldHoldFriendDraft,
} from './friendDraft.ts';

const store = new Map<string, string>();
const memory = {
  getItem(key: string) {
    return store.has(key) ? store.get(key)! : null;
  },
  setItem(key: string, value: string) {
    store.set(key, value);
  },
  removeItem(key: string) {
    store.delete(key);
  },
};
Object.defineProperty(globalThis, 'localStorage', { value: memory, configurable: true });

assert.equal(shouldHoldFriendDraft({ remaining: 0, stillRemaining: 0 }), true);
assert.equal(shouldHoldFriendDraft({ remaining: 0, stillRemaining: 10 }), false);
assert.equal(shouldHoldFriendDraft({ remaining: 2, stillRemaining: 0 }), false);
assert.equal(shouldHoldFriendDraft({ remaining: 3, stillRemaining: 10 }), false);
assert.equal(shouldHoldFriendDraft({ remaining: null }), false);

assert.equal(
  shouldHatchFriendDraft({ remaining: 1, stillRemaining: 10, used: 1, hasDraft: true, pendingBirth: false }),
  true,
);
assert.equal(
  shouldHatchFriendDraft({ remaining: 0, stillRemaining: 10, used: 1, hasDraft: true, pendingBirth: false }),
  true,
);
assert.equal(
  shouldHatchFriendDraft({ remaining: 5, stillRemaining: 0, used: 1, hasDraft: true, pendingBirth: false }),
  false,
);
assert.equal(
  shouldHatchFriendDraft({ remaining: 0, stillRemaining: 0, used: 1, hasDraft: true, pendingBirth: false }),
  false,
);
assert.equal(
  shouldHatchFriendDraft({ remaining: 2, stillRemaining: 10, hasDraft: false, pendingBirth: false }),
  false,
);
assert.equal(
  shouldHatchFriendDraft({ remaining: 2, stillRemaining: 10, hasDraft: true, pendingBirth: true }),
  false,
);

assert.equal(loadFriendDraft(), null);
const draft = { worldId: 'authored', image: 'data:image/jpeg;base64,xx', lonely: false };
saveFriendDraft(draft);
assert.deepEqual(loadFriendDraft(), draft);
saveFriendDraft({ ...draft, lonely: true });
assert.equal(loadFriendDraft()?.lonely, true);
clearFriendDraft();
assert.equal(loadFriendDraft(), null);
assert.equal(store.has(FRIEND_DRAFT_KEY), false);
