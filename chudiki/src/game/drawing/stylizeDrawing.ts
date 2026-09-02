/**
 * Asks the backend to restyle a drawing. OpenRouter stays on the server.
 * If the API is down or unconfigured, returns null so the original drawing
 * can still become a chudik.
 */

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? '/api/zoo';

const POLL_MS = 900;
const MAX_WAIT_MS = 90_000;

type JobResponse = {
  job_id: string;
  status: string;
  error?: string | null;
  image_png_base64?: string | null;
  media_type?: string | null;
};

function canvasFromSource(source: HTMLCanvasElement | HTMLImageElement): HTMLCanvasElement {
  if (source instanceof HTMLCanvasElement) return source;
  const canvas = document.createElement('canvas');
  const width = source.naturalWidth || source.width;
  const height = source.naturalHeight || source.height;
  const scale = 768 / Math.max(width, height, 1);
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
  const response = await fetch(`${API_BASE}/v1/generation/stylize/${jobId}`);
  if (!response.ok) throw new Error('job missing');
  return (await response.json()) as JobResponse;
}

/**
 * Returns a stylized still of the drawing, or null if the backend cannot help.
 */
export async function stylizeDrawing(
  source: HTMLCanvasElement | HTMLImageElement,
): Promise<HTMLImageElement | null> {
  try {
    const canvas = canvasFromSource(source);
    const blob = await blobToPng(canvas);
    const body = new FormData();
    body.append('file', blob, 'drawing.png');

    const started = await fetch(`${API_BASE}/v1/generation/stylize`, {
      method: 'POST',
      body,
    });
    if (started.status === 503) return null;
    if (!started.ok) return null;

    const created = (await started.json()) as JobResponse;
    const deadline = performance.now() + MAX_WAIT_MS;
    let job = created;

    while (job.status === 'queued' || job.status === 'running') {
      if (performance.now() > deadline) return null;
      await new Promise((resolve) => window.setTimeout(resolve, POLL_MS));
      job = await readJob(job.job_id);
    }

    if (job.status !== 'ready' || !job.image_png_base64) return null;
    const media = job.media_type && job.media_type.startsWith('image/') ? job.media_type : 'image/png';
    return loadImage(`data:${media};base64,${job.image_png_base64}`);
  } catch {
    return null;
  }
}
