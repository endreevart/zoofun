import assert from 'node:assert/strict';
import { hangingLightScale } from './hangingLight.ts';

assert.deepEqual(hangingLightScale(false, 'high'), { sky: 1, fill: 1, bounce: 1 });
assert.deepEqual(hangingLightScale(false, 'low'), { sky: 1, fill: 1, bounce: 1 });
assert.equal(hangingLightScale(true, 'high').fill, 0.78);
assert.deepEqual(hangingLightScale(true, 'low'), { sky: 1, fill: 1, bounce: 1 });
