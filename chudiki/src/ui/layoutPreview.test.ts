import assert from 'node:assert/strict';
import { PREVIEW_FULL_WORLDS, PREVIEW_TOYS, previewMoveSpecs, readLayoutPreview } from './layoutPreview.tsx';

assert.equal(readLayoutPreview(''), null);
assert.equal(readLayoutPreview('?shop=1', true), null);
assert.equal(readLayoutPreview('?ui', true), 'hub');
assert.equal(readLayoutPreview('?ui=', true), 'hub');
assert.equal(readLayoutPreview('?ui=pick', true), 'pick');
assert.equal(readLayoutPreview('?ui=move', true), 'move');
assert.equal(readLayoutPreview('?ui=hatch', true), 'hatch');
assert.equal(readLayoutPreview('?ui=pick', false), null);
assert.equal(PREVIEW_TOYS.length >= 4, true);
assert.equal(previewMoveSpecs().length, 10);
assert.equal(PREVIEW_FULL_WORLDS.length, 4);
