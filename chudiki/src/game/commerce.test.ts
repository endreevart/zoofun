import assert from 'node:assert/strict';
import {
  applyRemaining,
  canStartCreation,
  checkoutFailFromStatus,
  creditEggCounts,
  spendOneCredit,
  type Quota,
} from './commerceQuota.ts';

assert.equal(checkoutFailFromStatus(401), 'not_signed_in');
assert.equal(checkoutFailFromStatus(503), 'unavailable');
assert.equal(checkoutFailFromStatus(502), 'failed');

const one: Quota = { remaining: 1, quotaTotal: 1, used: 0 };

assert.equal(canStartCreation({ remaining: 1, pendingBirth: false }), true);
assert.equal(canStartCreation({ remaining: 0, pendingBirth: false }), false);
assert.equal(canStartCreation({ remaining: 1, pendingBirth: true }), false);
assert.equal(canStartCreation({ remaining: null, pendingBirth: false }), true);

assert.deepEqual(spendOneCredit(one), { remaining: 0, quotaTotal: 1, used: 1 });
assert.equal(spendOneCredit(null), null);
assert.deepEqual(applyRemaining(one, 0), { remaining: 0, quotaTotal: 1, used: 1 });

assert.deepEqual(creditEggCounts(0), { filled: 0, extra: 0 });
assert.deepEqual(creditEggCounts(3), { filled: 3, extra: 0 });
assert.deepEqual(creditEggCounts(8), { filled: 8, extra: 0 });
assert.deepEqual(creditEggCounts(20), { filled: 8, extra: 12 });
