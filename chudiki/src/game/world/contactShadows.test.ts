import assert from 'node:assert/strict';
import { contactShadowOffset, contactShadowRadius } from './contactShadows.ts';

const behind = contactShadowOffset(0, 1);
assert.ok(Math.abs(behind.x) < 1e-6);
assert.ok(Math.abs(behind.z + 1) < 1e-6);

const right = contactShadowOffset(90, 1);
assert.ok(Math.abs(right.x - 1) < 1e-6);
assert.ok(Math.abs(right.z) < 1e-6);

assert.ok(contactShadowRadius(4, 2) > 1);
assert.ok(contactShadowRadius(0.2, 0.2) >= 0.9);
assert.ok(contactShadowRadius(40, 20) <= 5.2);
