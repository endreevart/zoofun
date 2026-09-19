/** Waiting plaza drawing — on this device until a 59 ₽ slot exists. */

export const PLAZA_TOY_DRAFT_KEY = 'chudiki.plazaToyDraft';

export type PlazaToyDraft = {
  image: string;
  painted?: string;
  jobId?: string;
};

export function loadPlazaToyDraft(): PlazaToyDraft | null {
  try {
    const raw = localStorage.getItem(PLAZA_TOY_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PlazaToyDraft>;
    if (typeof parsed.image !== 'string' || !parsed.image) return null;
    const painted =
      typeof parsed.painted === 'string' && parsed.painted ? parsed.painted : undefined;
    const jobId =
      typeof parsed.jobId === 'string' && parsed.jobId.length >= 8 ? parsed.jobId : undefined;
    return { image: parsed.image, painted, jobId };
  } catch {
    return null;
  }
}

export function savePlazaToyDraft(draft: PlazaToyDraft): void {
  try {
    localStorage.setItem(PLAZA_TOY_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* private mode */
  }
}

export function clearPlazaToyDraft(): void {
  try {
    localStorage.removeItem(PLAZA_TOY_DRAFT_KEY);
  } catch {
    /* private mode */
  }
}

export function shouldHatchPlazaToyDraft(input: {
  remaining: number | null | undefined;
  hasDraft: boolean;
  pending: boolean;
}): boolean {
  if (!input.hasDraft || input.pending) return false;
  return (input.remaining ?? 0) > 0;
}

export function shouldCommitPlazaToyDraft(input: {
  remaining: number | null | undefined;
  jobId?: string | null;
  pending: boolean;
}): boolean {
  if (input.pending || !input.jobId) return false;
  return (input.remaining ?? 0) > 0;
}
