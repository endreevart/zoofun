import { API_BASE, authHeaders } from '../../api';
import { plazaToyPaintedSrc, type PlazaLawnToy } from './plazaToy';

const POLL_MS = 1500;
const MAX_WAIT_MS = 180_000;

export type PlazaToyJobFail =
  | 'unavailable'
  | 'failed'
  | 'timeout'
  | 'no_plaza_toys'
  | 'plaza_toy_full'
  | 'not_signed_in'
  | 'not_allowed';

export type PlazaToyJob =
  | { ok: true; toy: PlazaLawnToy; remaining: number }
  | { ok: false; reason: PlazaToyJobFail };

export type PlazaToyPreviewJob =
  | { ok: true; jobId: string; painted: string; remaining: number }
  | { ok: false; reason: PlazaToyJobFail };

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

export type PlazaToyJobBody = {
  job_id?: string;
  status?: string;
  error?: string | null;
  toy?: PlazaLawnToy | null;
  plaza_toy_remaining?: number;
  image_png_base64?: string | null;
  media_type?: string | null;
  detail?: unknown;
};

async function readJob(jobId: string): Promise<PlazaToyJobBody> {
  const response = await fetch(`${API_BASE}/v1/plaza/toys/jobs/${encodeURIComponent(jobId)}`, {
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error('job missing');
  return (await response.json()) as PlazaToyJobBody;
}

function failFromStatus(status: number, detail: unknown): PlazaToyJobFail {
  if (status === 401) return 'not_signed_in';
  if (status === 402) return 'no_plaza_toys';
  if (status === 409) return 'plaza_toy_full';
  if (status === 422) return 'not_allowed';
  if (status === 503) return 'unavailable';
  if (detail === 'no_plaza_toys') return 'no_plaza_toys';
  return 'failed';
}

async function postDrawing(
  path: string,
  source: HTMLCanvasElement | HTMLImageElement,
): Promise<{ ok: true; jobId: string } | { ok: false; reason: PlazaToyJobFail }> {
  const blob = await blobToPng(canvasFromSource(source));
  const body = new FormData();
  body.append('file', blob, 'drawing.png');
  const started = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body,
  });
  const payload = (await started.json().catch(() => ({}))) as PlazaToyJobBody;
  if (!started.ok) {
    return { ok: false, reason: failFromStatus(started.status, payload.detail) };
  }
  const jobId = typeof payload.job_id === 'string' ? payload.job_id : '';
  if (!jobId) return { ok: false, reason: 'failed' };
  return { ok: true, jobId };
}

async function waitForPaint(jobId: string): Promise<PlazaToyPreviewJob> {
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    const job = await readJob(jobId);
    if (job.status === 'ready') {
      const painted = plazaToyPaintedSrc(job);
      if (painted) {
        return {
          ok: true,
          jobId,
          painted,
          remaining: Math.max(0, Math.floor(job.plaza_toy_remaining ?? 0)),
        };
      }
    }
    if (job.status === 'failed') return { ok: false, reason: 'failed' };
    await new Promise((resolve) => window.setTimeout(resolve, POLL_MS));
  }
  return { ok: false, reason: 'timeout' };
}

export async function previewPlazaToy(
  source: HTMLCanvasElement | HTMLImageElement,
): Promise<PlazaToyPreviewJob> {
  try {
    const started = await postDrawing('/v1/plaza/toys/preview', source);
    if (!started.ok) return started;
    return await waitForPaint(started.jobId);
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

export async function commitPlazaToy(jobId: string): Promise<PlazaToyJob> {
  try {
    const committed = await fetch(`${API_BASE}/v1/plaza/toys/commit`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ job_id: jobId }),
    });
    const payload = (await committed.json().catch(() => ({}))) as PlazaToyJobBody;
    if (!committed.ok) {
      return { ok: false, reason: failFromStatus(committed.status, payload.detail) };
    }
    if (payload.toy?.id) {
      return {
        ok: true,
        toy: payload.toy,
        remaining: Math.max(0, Math.floor(payload.plaza_toy_remaining ?? 0)),
      };
    }
    const deadline = Date.now() + MAX_WAIT_MS;
    while (Date.now() < deadline) {
      const job = await readJob(jobId);
      if (job.status === 'ready' && job.toy?.id) {
        return {
          ok: true,
          toy: job.toy,
          remaining: Math.max(0, Math.floor(job.plaza_toy_remaining ?? 0)),
        };
      }
      if (job.status === 'failed') return { ok: false, reason: 'failed' };
      await new Promise((resolve) => window.setTimeout(resolve, POLL_MS));
    }
    return { ok: false, reason: 'timeout' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

export async function startPlazaToy(
  source: HTMLCanvasElement | HTMLImageElement,
): Promise<PlazaToyJob> {
  try {
    const started = await postDrawing('/v1/plaza/toys', source);
    if (!started.ok) return started;
    const deadline = Date.now() + MAX_WAIT_MS;
    while (Date.now() < deadline) {
      const job = await readJob(started.jobId);
      if (job.status === 'ready' && job.toy?.id) {
        return {
          ok: true,
          toy: job.toy,
          remaining: Math.max(0, Math.floor(job.plaza_toy_remaining ?? 0)),
        };
      }
      if (job.status === 'failed') return { ok: false, reason: 'failed' };
      await new Promise((resolve) => window.setTimeout(resolve, POLL_MS));
    }
    return { ok: false, reason: 'timeout' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
