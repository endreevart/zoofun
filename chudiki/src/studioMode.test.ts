import assert from 'node:assert/strict';
import { STUDIO_GROVE_KIND, STUDIO_MEADOW_KIND, WORLD_AUTHORED } from './game/world/kinds.ts';
import { studioShell, studioWorldId } from './studioMode.ts';

assert.equal(studioShell(''), 'garden');
assert.equal(studioShell('?studio=1'), 'garden');
assert.equal(studioShell('?studio=1&kind=meadow'), 'meadow');
assert.equal(studioShell('?studio=1&kind=grove'), 'grove');
assert.equal(studioShell('kind=garden'), 'garden');
assert.equal(studioWorldId('?kind=meadow'), STUDIO_MEADOW_KIND.authoredId);
assert.equal(studioWorldId('?kind=grove'), STUDIO_GROVE_KIND.authoredId);
assert.equal(studioWorldId('?studio=1'), WORLD_AUTHORED);
