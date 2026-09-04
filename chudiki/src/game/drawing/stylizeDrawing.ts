/**
 * Asks the backend to restyle a drawing. OpenRouter stays on the server.
 * Failures are returned as a reason so the parent can be told; the original
 * drawing can still become a chudik.
 */

import { API_BASE, authHeaders } from '../../api';
import { KINDS } from '../creatures/ChudikSpec';

const POLL_MS = 1500;
const MAX_WAIT_MS = 360_000;

type JobResponse = {
  job_id: string;
  status: string;
  error?: string | null;
  image_png_base64?: string | null;
  media_type?: string | null;
  name?: string | null;
  kind_id?: string | null;
  model_url?: string | null;
};

export type StylizeResult =
  | { ok: true; image: HTMLImageElement; name?: string; kindId?: string; modelUrl?: string }
  | { ok: false; reason: 'unavailable' | 'failed' | 'timeout' | 'no_credits'; name?: string; kindId?: string };

export function resolveModelUrl(path: string): string {
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  if (path.startsWith('/v1/')) return `${API_BASE}${path}`;
  return path;
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

function resultFromJob(job: JobResponse, image: HTMLImageElement): Extract<StylizeResult, { ok: true }> {
  const modelUrl = job.model_url ? resolveModelUrl(job.model_url) : undefined;
  return { ok: true, image, modelUrl, ...profileFromJob(job) };
}

/**
 * Returns a stylized still of the drawing, or a reason if the backend cannot help.
 * `onImage` fires as soon as OpenRouter paints, while Meshy may still be running.
 */
export async function stylizeDrawing(
  source: HTMLCanvasElement | HTMLImageElement,
  options?: { onImage?: (result: Extract<StylizeResult, { ok: true }>) => void | Promise<void> },
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
    if (started.status === 402) return { ok: false, reason: 'no_credits' };
    if (!started.ok) return { ok: false, reason: 'failed' };

    const created = (await started.json()) as JobResponse;
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

    while (job.status === 'queued' || job.status === 'running') {
      if (performance.now() > deadline) {
        return image ? resultFromJob(job, image) : { ok: false, reason: 'timeout', ...profileFromJob(job) };
      }
      await new Promise((resolve) => window.setTimeout(resolve, POLL_MS));
      job = await readJobRetry(job.job_id);
      await takeImage(job);
    }

    const profile = profileFromJob(job);
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
