import assert from 'node:assert/strict';
import { mayWriteFamilyZoo } from './guestPersist.ts';

assert.equal(mayWriteFamilyZoo({ guestVisit: false }), true);
assert.equal(mayWriteFamilyZoo({ guestVisit: true }), false);
