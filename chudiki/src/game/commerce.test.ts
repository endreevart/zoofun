import assert from 'node:assert/strict';
import {
  applyRemaining,
  canStartCreation,
  checkoutFailFromStatus,
  checkoutFailFromDetail,
  spendOneCredit,
  type Quota,
} from './commerceQuota.ts';

assert.equal(checkoutFailFromStatus(401), 'not_signed_in');
assert.equal(checkoutFailFromStatus(503), 'unavailable');
assert.equal(checkoutFailFromStatus(502), 'failed');
assert.equal(checkoutFailFromDetail('promo_invalid'), 'promo');
assert.equal(checkoutFailFromDetail('promo_not_for_pack'), 'promo');
assert.equal(checkoutFailFromDetail('nope'), null);

const one: Quota = { remaining: 1, quotaTotal: 1, used: 0, ownedWorlds: [], worlds: [] };

assert.equal(canStartCreation({ remaining: 1, pendingBirth: false }), true);
assert.equal(canStartCreation({ remaining: 0, pendingBirth: false }), false);
assert.equal(canStartCreation({ remaining: 1, pendingBirth: true }), false);
assert.equal(canStartCreation({ remaining: null, pendingBirth: false }), true);

assert.deepEqual(spendOneCredit(one), { remaining: 0, quotaTotal: 1, used: 1, ownedWorlds: [], worlds: [] });
assert.equal(spendOneCredit(null), null);
assert.deepEqual(applyRemaining(one, 0), { remaining: 0, quotaTotal: 1, used: 1, ownedWorlds: [], worlds: [] });
