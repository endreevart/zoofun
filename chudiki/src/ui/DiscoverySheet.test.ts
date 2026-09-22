import assert from 'node:assert/strict';
import { discoveryProgress } from './discoveryCopy.ts';

assert.equal(discoveryProgress(1, 95), '1 из 95');
assert.equal(discoveryProgress(95, 95), '95 из 95');
assert.equal(discoveryProgress(120, 95), '95 из 95');
assert.equal(discoveryProgress(0, 95), '0 из 95');
assert.equal(discoveryProgress(3, 0), '');
assert.equal(discoveryProgress(1, -1), '');
