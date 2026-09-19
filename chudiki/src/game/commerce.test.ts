import assert from 'node:assert/strict';
import {
  applyRemaining,
  applyStillRemaining,
  canStartCreation,
  checkoutFailFromStatus,
  checkoutFailFromDetail,
  spendOneCredit,
  spendOneStill,
  stillQuotaOf,
  type Quota,
} from './commerceQuota.ts';

assert.equal(checkoutFailFromStatus(401), 'not_signed_in');
assert.equal(checkoutFailFromStatus(503), 'unavailable');
assert.equal(checkoutFailFromStatus(502), 'failed');
assert.equal(checkoutFailFromStatus(409), 'full');
assert.equal(checkoutFailFromDetail('promo_invalid'), 'promo');
assert.equal(checkoutFailFromDetail('promo_not_for_pack'), 'promo');
assert.equal(checkoutFailFromDetail('nope'), null);

assert.equal(stillQuotaOf(1), 10);
assert.equal(stillQuotaOf(2), 20);
assert.equal(stillQuotaOf(11), 110);

const one: Quota = {
  remaining: 1,
  quotaTotal: 1,
  used: 0,
  stillUsed: 0,
  stillQuota: 10,
  stillRemaining: 10,
  plazaToyQuota: 0,
  plazaToyUsed: 0,
  plazaToyRemaining: 0,
  plazaToyCap: 10,
  ownedWorlds: [],
  worlds: [],
};

assert.equal(canStartCreation({ remaining: 1, pendingBirth: false, used: 0, stillRemaining: 10 }), true);
assert.equal(canStartCreation({ remaining: 0, pendingBirth: false, used: 1, stillRemaining: 10 }), true);
assert.equal(canStartCreation({ remaining: 0, pendingBirth: false, used: 1, stillRemaining: 0 }), false);
assert.equal(
  canStartCreation({ remaining: 0, pendingBirth: false, used: 1, stillRemaining: 0, inviteFriend: true }),
  true,
);
assert.equal(
  canStartCreation({ remaining: 2, pendingBirth: false, used: 1, stillRemaining: 0 }),
  false,
);
assert.equal(canStartCreation({ remaining: 0, pendingBirth: true, inviteFriend: true, stillRemaining: 0 }), false);
assert.equal(canStartCreation({ remaining: 1, pendingBirth: true }), false);
assert.equal(canStartCreation({ remaining: null, pendingBirth: false }), true);

assert.deepEqual(spendOneCredit(one), {
  remaining: 0,
  quotaTotal: 1,
  used: 1,
  stillUsed: 0,
  stillQuota: 10,
  stillRemaining: 10,
  plazaToyQuota: 0,
  plazaToyUsed: 0,
  plazaToyRemaining: 0,
  plazaToyCap: 10,
  ownedWorlds: [],
  worlds: [],
});
assert.equal(spendOneCredit(null), null);
assert.deepEqual(applyRemaining(one, 0), {
  remaining: 0,
  quotaTotal: 1,
  used: 1,
  stillUsed: 0,
  stillQuota: 10,
  stillRemaining: 10,
  plazaToyQuota: 0,
  plazaToyUsed: 0,
  plazaToyRemaining: 0,
  plazaToyCap: 10,
  ownedWorlds: [],
  worlds: [],
});

const afterFirst: Quota = {
  remaining: 0,
  quotaTotal: 1,
  used: 1,
  stillUsed: 0,
  stillQuota: 10,
  stillRemaining: 10,
  plazaToyQuota: 0,
  plazaToyUsed: 0,
  plazaToyRemaining: 0,
  plazaToyCap: 10,
  ownedWorlds: [],
  worlds: [],
};
assert.deepEqual(spendOneStill(afterFirst), {
  remaining: 0,
  quotaTotal: 1,
  used: 1,
  stillUsed: 1,
  stillQuota: 10,
  stillRemaining: 9,
  plazaToyQuota: 0,
  plazaToyUsed: 0,
  plazaToyRemaining: 0,
  plazaToyCap: 10,
  ownedWorlds: [],
  worlds: [],
});
assert.equal(applyStillRemaining(afterFirst, 7)?.stillRemaining, 7);
assert.equal(applyStillRemaining(afterFirst, 7)?.stillUsed, 3);
