import assert from 'node:assert/strict';
import { hatchPreviewMode, hatchPreviewSrc } from './hatchView.ts';

assert.equal(hatchPreviewSrc(null, null, false), null);
assert.equal(hatchPreviewSrc('toy.png', null, true), 'toy.png');
assert.equal(hatchPreviewSrc('toy.png', 'garden.png', false), 'toy.png');
assert.equal(hatchPreviewSrc('toy.png', 'garden.png', true), 'garden.png');

assert.equal(hatchPreviewMode(null, null, true), 'empty');
assert.equal(hatchPreviewMode('toy.png', null, true), 'toy');
assert.equal(hatchPreviewMode('toy.png', 'garden.png', false), 'toy');
assert.equal(hatchPreviewMode('toy.png', 'garden.png', true), 'garden');
