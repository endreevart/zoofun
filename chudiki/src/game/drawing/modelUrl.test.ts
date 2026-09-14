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

function postcardUrlFromJob(
  job: { postcard_status?: string | null; postcard_url?: string | null },
  apiBase: string,
): string | undefined {
  if (job.postcard_status !== 'ready' || !job.postcard_url) return undefined;
  return resolveModelUrl(job.postcard_url, apiBase);
}

assert.equal(postcardUrlFromJob({ postcard_status: 'pending', postcard_url: '/v1/x.png' }, '/api/zoo'), undefined);
assert.equal(postcardUrlFromJob({ postcard_status: 'failed' }, '/api/zoo'), undefined);
assert.equal(
  postcardUrlFromJob({ postcard_status: 'ready', postcard_url: '/v1/generation/stylize/j/postcard.png' }, '/api/zoo'),
  '/api/zoo/v1/generation/stylize/j/postcard.png',
);
