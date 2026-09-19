import assert from 'node:assert/strict';
import { islandMetrikaAllowed } from './metrika.ts';

assert.equal(islandMetrikaAllowed(null), true);
assert.equal(islandMetrikaAllowed('analytics'), true);
assert.equal(islandMetrikaAllowed('accepted'), true);
assert.equal(islandMetrikaAllowed('necessary'), false);
