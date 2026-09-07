import assert from 'node:assert/strict';
import { resolveModelUrl } from './modelUrl.ts';

assert.equal(
  resolveModelUrl('https://zooo.fun/api/zoo/v1/generation/stylize/x/model.glb', '/api/zoo'),
  'https://zooo.fun/api/zoo/v1/generation/stylize/x/model.glb',
);
assert.equal(
  resolveModelUrl('/v1/generation/stylize/x/model.glb', '/api/zoo'),
  '/api/zoo/v1/generation/stylize/x/model.glb',
);
assert.equal(
  resolveModelUrl('/api/zoo/v1/generation/stylize/x/model.glb', '/api/zoo'),
  '/api/zoo/v1/generation/stylize/x/model.glb',
);
