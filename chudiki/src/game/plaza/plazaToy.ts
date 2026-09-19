export const PLAZA_TOY_SKU = 'plaza_toy_1';
export const PLAZA_TOY_CAP = 10;
export const PLAZA_TOY_HOLD_KEY = 'chudiki.plazaToyHold';

const PREFIX = 'toy_';

export type PlazaLawnToy = {
  id: string;
  model: string;
  still_url: string;
  height: number;
  placed: boolean;
  preparing?: boolean;
  mesh_status?: string;
  model_url?: string;
  job_id?: string;
};

export function isPlazaToyPreparing(toy: Pick<PlazaLawnToy, 'mesh_status' | 'model_url' | 'preparing'>): boolean {
  if (toy.model_url) return false;
  if (toy.preparing) return true;
  const status = (toy.mesh_status || '').trim();
  return status === 'pending' || status === 'failed';
}

export function isPlazaToySku(packId: string | null | undefined): boolean {
  return packId === PLAZA_TOY_SKU;
}

export function isPlazaToyModel(model: string): boolean {
  return model.startsWith(PREFIX) && model.length > PREFIX.length;
}

export function plazaToyPaintedSrc(job: {
  image_png_base64?: string | null;
  media_type?: string | null;
  toy?: { still_url?: string | null } | null;
}): string | null {
  const still = typeof job.image_png_base64 === 'string' ? job.image_png_base64.trim() : '';
  if (still.length > 20) {
    const media =
      typeof job.media_type === 'string' && job.media_type.startsWith('image/')
        ? job.media_type
        : 'image/png';
    return `data:${media};base64,${still}`;
  }
  const hosted = job.toy?.still_url;
  return typeof hosted === 'string' && hosted ? hosted : null;
}

export function rememberPlazaHold(toy: PlazaLawnToy): void {
  try {
    sessionStorage.setItem(PLAZA_TOY_HOLD_KEY, JSON.stringify(toy));
  } catch {
    /* private mode */
  }
}

export function peekPlazaHold(): PlazaLawnToy | null {
  try {
    const raw = sessionStorage.getItem(PLAZA_TOY_HOLD_KEY);
    if (!raw) return null;
    return readPlazaLawnToy(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function clearPlazaHold(): void {
  try {
    sessionStorage.removeItem(PLAZA_TOY_HOLD_KEY);
  } catch {
    /* private mode */
  }
}

export function takePlazaHold(): PlazaLawnToy | null {
  const hold = peekPlazaHold();
  if (hold) clearPlazaHold();
  return hold;
}

export function readPlazaLawnToy(raw: unknown): PlazaLawnToy | null {
  if (!raw || typeof raw !== 'object') return null;
  const parsed = raw as {
    id?: unknown;
    model?: unknown;
    still_url?: unknown;
    height?: unknown;
    placed?: unknown;
    preparing?: unknown;
    mesh_status?: unknown;
    model_url?: unknown;
    job_id?: unknown;
  };
  if (typeof parsed.model !== 'string' || !isPlazaToyModel(parsed.model)) return null;
  if (typeof parsed.still_url !== 'string' || !parsed.still_url) return null;
  const id =
    typeof parsed.id === 'string' && parsed.id ? parsed.id : parsed.model.slice(PREFIX.length);
  if (!id) return null;
  const toy: PlazaLawnToy = {
    id,
    model: parsed.model,
    still_url: parsed.still_url,
    height: typeof parsed.height === 'number' && Number.isFinite(parsed.height) ? parsed.height : 2,
    placed: Boolean(parsed.placed),
  };
  if (typeof parsed.mesh_status === 'string' && parsed.mesh_status) toy.mesh_status = parsed.mesh_status;
  if (typeof parsed.model_url === 'string' && parsed.model_url) toy.model_url = parsed.model_url;
  if (typeof parsed.job_id === 'string' && parsed.job_id) toy.job_id = parsed.job_id;
  if (isPlazaToyPreparing(toy)) toy.preparing = true;
  return toy;
}

/** Keep a just-bought toy when the server list is still catching up. */
export function absorbPlazaToys(server: PlazaLawnToy[], local: PlazaLawnToy[]): PlazaLawnToy[] {
  const byId = new Map<string, PlazaLawnToy>();
  for (const toy of local) byId.set(toy.id, toy);
  for (const toy of server) {
    const prev = byId.get(toy.id);
    const still =
      prev?.still_url?.startsWith('data:') && prev.still_url.length > 20
        ? prev.still_url
        : toy.still_url || prev?.still_url || '';
    const merged: PlazaLawnToy = {
      ...toy,
      still_url: still,
      model_url: toy.model_url || prev?.model_url,
      mesh_status: toy.mesh_status || prev?.mesh_status,
    };
    if (isPlazaToyPreparing(merged)) merged.preparing = true;
    else delete merged.preparing;
    byId.set(toy.id, merged);
  }
  return [...byId.values()];
}

export function upsertPlazaToy(list: PlazaLawnToy[], toy: PlazaLawnToy): PlazaLawnToy[] {
  return [toy, ...list.filter((row) => row.id !== toy.id && row.model !== toy.model)];
}
