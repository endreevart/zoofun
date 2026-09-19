import assert from 'node:assert/strict';
import { assetUrl } from '../assetUrl.ts';

assert.ok(assetUrl('/plaza/pick-sign.png').endsWith('/plaza/pick-sign.png'));
assert.ok(assetUrl('/plaza/pick-hint.png').endsWith('/plaza/pick-hint.png'));
assert.ok(assetUrl('/plaza/pick-prev.png').endsWith('/plaza/pick-prev.png'));
assert.ok(assetUrl('/plaza/pick-next.png').endsWith('/plaza/pick-next.png'));
assert.ok(assetUrl('/ui/bg-meadow.webp').endsWith('/ui/bg-meadow.webp'));
assert.equal(assetUrl('plaza/pick-sign.png'), assetUrl('/plaza/pick-sign.png'));
