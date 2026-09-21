/**
 * Asks the backend to restyle a drawing. OpenRouter stays on the server.
 * Failures are returned as a reason so the parent can be told; the original
 * drawing can still become a chudik.
 */

import { API_BASE, authHeaders } from '../../api';
import { KINDS } from '../creatures/ChudikSpec';
import { resolveModelUrl as resolveAgainstApi } from './modelUrl';

const POLL_MS = 1500;
const MAX_WAIT_MS = 360_000;

export type MeshStatus = 'pending' | 'ready' | 'skipped' | 'failed' | 'deferred';

type JobResponse = {
  job_id: string;
  status: string;
  error?: string | null;
  image_png_base64?: string | null;
  media_type?: string | null;
  name?: string | null;
  kind_id?: string | null;
  model_url?: string | null;
  mesh_status?: string | null;
  postcard_url?: string | null;
  postcard_status?: string | null;
  remaining?: number | null;
  still_remaining?: number | null;
};

export type StylizeResult =
  | {
      ok: true;
      jobId: string;
      image: HTMLImageElement;
      name?: string;
      kindId?: string;
      modelUrl?: string;
      postcardUrl?: string;
      mesh: MeshStatus;
      remaining?: number;
      stillRemaining?: number;
    }
  | {
      ok: false;
      reason: 'unavailable' | 'failed' | 'timeout' | 'no_credits' | 'no_stills' | 'not_signed_in' | 'not_allowed';
      name?: string;
      kindId?: string;
      remaining?: number;
      stillRemaining?: number;
    };

export function resolveModelUrl(path: string): string {
  return resolveAgainstApi(path, API_BASE);
}

const KIND_IDS = new Set(KINDS.map((kind) => kind.id));

function usableName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!/^[А-Яа-яЁёA-Za-z][А-Яа-яЁёA-Za-z-]{1,15}$/.test(trimmed)) return undefined;
  return trimmed[0].toUpperCase() + trimmed.slice(1);
}

function usableKind(value: unknown): string | undefined {
  return typeof value === 'string' && KIND_IDS.has(value) ? value : undefined;
}

function profileFromJob(job: JobResponse): { name?: string; kindId?: string } {
  return { name: usableName(job.name), kindId: usableKind(job.kind_id) };
}

function canvasFromSource(source: HTMLCanvasElement | HTMLImageElement): HTMLCanvasElement {
  if (source instanceof HTMLCanvasElement) return source;
  const canvas = document.createElement('canvas');
  const width = source.naturalWidth || source.width;
  const height = source.naturalHeight || source.height;
  const scale = 640 / Math.max(width, height, 1);
  canvas.width = Math.max(8, Math.round(width * Math.min(1, scale)));
  canvas.height = Math.max(8, Math.round(height * Math.min(1, scale)));
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function blobToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('empty drawing blob'));
    }, 'image/png');
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('styled image decode failed'));
    image.src = url;
  });
}

async function readJob(jobId: string): Promise<JobResponse> {
  const response = await fetch(`${API_BASE}/v1/generation/stylize/${jobId}`, {
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error('job missing');
  return (await response.json()) as JobResponse;
}

async function readJobRetry(jobId: string): Promise<JobResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await readJob(jobId);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => window.setTimeout(resolve, 400));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('job missing');
}

function meshFromJob(job: JobResponse): MeshStatus {
  if (
    job.mesh_status === 'ready' ||
    job.mesh_status === 'skipped' ||
    job.mesh_status === 'failed' ||
    job.mesh_status === 'deferred'
  ) {
    return job.mesh_status;
  }
  return 'pending';
}

function remainingFromJob(job: JobResponse): number | undefined {
  return typeof job.remaining === 'number' ? job.remaining : undefined;
}

function stillRemainingFromJob(job: JobResponse): number | undefined {
  return typeof job.still_remaining === 'number' ? job.still_remaining : undefined;
}

/** Garden postcard is a second OpenRouter still, not a client composite. */
export function postcardUrlFromJob(job: {
  postcard_status?: string | null;
  postcard_url?: string | null;
}): string | undefined {
  if (job.postcard_status !== 'ready' || !job.postcard_url) return undefined;
  return resolveModelUrl(job.postcard_url);
}

function resultFromJob(job: JobResponse, image: HTMLImageElement): Extract<StylizeResult, { ok: true }> {
  const modelUrl = job.model_url ? resolveModelUrl(job.model_url) : undefined;
  return {
    ok: true,
    jobId: job.job_id,
    image,
    modelUrl,
    postcardUrl: postcardUrlFromJob(job),
    mesh: meshFromJob(job),
    remaining: remainingFromJob(job),
    stillRemaining: stillRemainingFromJob(job),
    ...profileFromJob(job),
  };
}

/** Keep asking until the GLB is stored. Queues and retries must not open a standee. */
export async function waitForMesh(
  jobId: string,
): Promise<{
  modelUrl?: string;
  mesh: MeshStatus;
  postcardUrl?: string;
  image?: HTMLImageElement;
  name?: string;
  kindId?: string;
}> {
  let delay = POLL_MS;
  for (;;) {
    let job: JobResponse;
    try {
      job = await readJobRetry(jobId);
    } catch {
      await new Promise((resolve) => window.setTimeout(resolve, delay));
      delay = Math.min(delay * 1.2, 8000);
      continue;
    }
    if (job.model_url || job.mesh_status === 'skipped' || job.mesh_status === 'deferred') {
      let image: HTMLImageElement | undefined;
      if (job.image_png_base64) {
        const media = job.media_type && job.media_type.startsWith('image/') ? job.media_type : 'image/png';
        image = await loadImage(`data:${media};base64,${job.image_png_base64}`);
      }
      const profile = profileFromJob(job);
      return {
        mesh: meshFromJob(job),
        modelUrl: job.model_url ? resolveModelUrl(job.model_url) : undefined,
        postcardUrl: postcardUrlFromJob(job),
        image,
        ...profile,
      };
    }
    await new Promise((resolve) => window.setTimeout(resolve, delay));
    delay = Math.min(delay * 1.15, 8000);
  }
}

const POSTCARD_WAIT_MS = 180_000;

/** The garden still is a second paint; the hatch must not wait on it. */
export async function waitForPostcard(jobId: string): Promise<string | undefined> {
  let delay = POLL_MS;
  const deadline = performance.now() + POSTCARD_WAIT_MS;
  for (;;) {
    let job: JobResponse;
    try {
      job = await readJobRetry(jobId);
    } catch {
      if (performance.now() > deadline) return undefined;
      await new Promise((resolve) => window.setTimeout(resolve, delay));
      delay = Math.min(delay * 1.2, 8000);
      continue;
    }
    const ready = postcardUrlFromJob(job);
    if (ready) return ready;
    if (job.postcard_status === 'failed') return undefined;
    if (performance.now() > deadline) return undefined;
    await new Promise((resolve) => window.setTimeout(resolve, delay));
    delay = Math.min(delay * 1.15, 6000);
  }
}

async function readFailDetail(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    return typeof body.detail === 'string' ? body.detail : null;
  } catch {
    return null;
  }
}

/**
 * Returns a stylized still of the drawing, or a reason if the backend cannot help.
 * `onImage` fires as soon as OpenRouter paints, while Meshy may still be running.
 */
export async function stylizeDrawing(
  source: HTMLCanvasElement | HTMLImageElement,
  options?: {
    onImage?: (result: Extract<StylizeResult, { ok: true }>) => void | Promise<void>;
    onAccepted?: (info: {
      remaining?: number;
      stillRemaining?: number;
      jobId: string;
      mesh: MeshStatus;
    }) => void | Promise<void>;
  },
): Promise<StylizeResult> {
  try {
    const canvas = canvasFromSource(source);
    const blob = await blobToPng(canvas);
    const body = new FormData();
    body.append('file', blob, 'drawing.png');

    const started = await fetch(`${API_BASE}/v1/generation/stylize`, {
      method: 'POST',
      headers: authHeaders(),
      body,
    });
    if (started.status === 503) return { ok: false, reason: 'unavailable' };
    if (started.status === 402) {
      const detail = await readFailDetail(started);
      return { ok: false, reason: detail === 'no_stills' ? 'no_stills' : 'no_credits' };
    }
    if (started.status === 401) return { ok: false, reason: 'not_signed_in' };
    if (started.status === 422) return { ok: false, reason: 'not_allowed' };
    if (!started.ok) return { ok: false, reason: 'failed' };

    const created = (await started.json()) as JobResponse;
    await options?.onAccepted?.({
      remaining: remainingFromJob(created),
      stillRemaining: stillRemainingFromJob(created),
      jobId: created.job_id,
      mesh: meshFromJob(created),
    });
    const deadline = performance.now() + MAX_WAIT_MS;
    let job = created;
    let image: HTMLImageElement | null = null;

    const takeImage = async (next: JobResponse): Promise<HTMLImageElement | null> => {
      if (!next.image_png_base64) return image;
      if (image) return image;
      const media = next.media_type && next.media_type.startsWith('image/') ? next.media_type : 'image/png';
      image = await loadImage(`data:${media};base64,${next.image_png_base64}`);
      const painted = resultFromJob(next, image);
      await options?.onImage?.({ ...painted, modelUrl: undefined });
      return image;
    };

    await takeImage(job);

    while (!image && (job.status === 'queued' || job.status === 'running')) {
      if (performance.now() > deadline) {
        return { ok: false, reason: 'timeout', remaining: remainingFromJob(job), ...profileFromJob(job) };
      }
      await new Promise((resolve) => window.setTimeout(resolve, POLL_MS));
      job = await readJobRetry(job.job_id);
      await takeImage(job);
    }

    const profile = profileFromJob(job);
    if (job.status === 'failed') {
      return { ok: false, reason: 'failed', remaining: remainingFromJob(job), ...profile };
    }
    if (!image) {
      if (job.status !== 'ready' || !job.image_png_base64) {
        return { ok: false, reason: 'failed', ...profile };
      }
      await takeImage(job);
    }
    if (!image) return { ok: false, reason: 'failed', ...profile };
    return resultFromJob(job, image);
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

export async function startMesh(jobId: string): Promise<
  | {
      ok: true;
      jobId: string;
      remaining?: number;
      stillRemaining?: number;
      mesh: MeshStatus;
      modelUrl?: string;
    }
  | { ok: false; reason: 'no_credits' | 'failed' | 'not_signed_in' | 'unavailable' }
> {
  try {
    const started = await fetch(`${API_BASE}/v1/generation/stylize/${jobId}/mesh`, {
      method: 'POST',
      headers: authHeaders(),
    });
    if (started.status === 503) return { ok: false, reason: 'unavailable' };
    if (started.status === 401) return { ok: false, reason: 'not_signed_in' };
    if (started.status === 402) return { ok: false, reason: 'no_credits' };
    if (!started.ok) return { ok: false, reason: 'failed' };
    const job = (await started.json()) as JobResponse;
    return {
      ok: true,
      jobId: job.job_id,
      remaining: remainingFromJob(job),
      stillRemaining: stillRemainingFromJob(job),
      mesh: meshFromJob(job),
      modelUrl: job.model_url ? resolveModelUrl(job.model_url) : undefined,
    };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

export async function downloadCreatureGlb(creatureId: string, name: string): Promise<boolean> {
  const response = await fetch(`${API_BASE}/v1/zoo/creatures/${encodeURIComponent(creatureId)}/model`, {
    headers: authHeaders(),
  });
  if (!response.ok) return false;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safe = name.replace(/[^\wа-яё-]+/gi, '_').replace(/^_+|_+$/g, '') || 'zufik';
  link.href = url;
  link.download = `${safe}.glb`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}
