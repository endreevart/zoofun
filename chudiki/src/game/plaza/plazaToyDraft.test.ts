import assert from 'node:assert/strict';
import {
  PLAZA_TOY_DRAFT_KEY,
  clearPlazaToyDraft,
  loadPlazaToyDraft,
  savePlazaToyDraft,
  shouldCommitPlazaToyDraft,
  shouldHatchPlazaToyDraft,
} from './plazaToyDraft.ts';

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

assert.equal(shouldHatchPlazaToyDraft({ remaining: 1, hasDraft: true, pending: false }), true);
assert.equal(shouldHatchPlazaToyDraft({ remaining: 0, hasDraft: true, pending: false }), false);
assert.equal(shouldHatchPlazaToyDraft({ remaining: 2, hasDraft: false, pending: false }), false);
assert.equal(shouldHatchPlazaToyDraft({ remaining: 2, hasDraft: true, pending: true }), false);
assert.equal(shouldCommitPlazaToyDraft({ remaining: 1, jobId: 'toy-job-1', pending: false }), true);
assert.equal(shouldCommitPlazaToyDraft({ remaining: 1, jobId: '', pending: false }), false);
assert.equal(shouldCommitPlazaToyDraft({ remaining: 0, jobId: 'toy-job-1', pending: false }), false);
assert.equal(shouldCommitPlazaToyDraft({ remaining: 1, jobId: 'toy-job-1', pending: true }), false);

assert.equal(loadPlazaToyDraft(), null);
savePlazaToyDraft({ image: 'data:image/png;base64,xx', painted: 'data:image/png;base64,yy', jobId: 'toy-job-1' });
assert.deepEqual(loadPlazaToyDraft(), {
  image: 'data:image/png;base64,xx',
  painted: 'data:image/png;base64,yy',
  jobId: 'toy-job-1',
});
clearPlazaToyDraft();
assert.equal(loadPlazaToyDraft(), null);
assert.equal(store.has(PLAZA_TOY_DRAFT_KEY), false);
