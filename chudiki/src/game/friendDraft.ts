/** Waiting friend drawing — on this device only, never sent until a credit exists. */

export const FRIEND_DRAFT_KEY = 'chudiki.friendDraft';

const DRAFT_MAX_EDGE = 768;

export type FriendDraft = {
  worldId: string;
  image: string;
  lonely: boolean;
};

export function loadFriendDraft(): FriendDraft | null {
  try {
    const raw = localStorage.getItem(FRIEND_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FriendDraft>;
    if (typeof parsed.image !== 'string' || !parsed.image) return null;
    if (typeof parsed.worldId !== 'string' || !parsed.worldId) return null;
    return {
      worldId: parsed.worldId,
      image: parsed.image,
      lonely: Boolean(parsed.lonely),
    };
  } catch {
    return null;
  }
}

export function saveFriendDraft(draft: FriendDraft): void {
  try {
    localStorage.setItem(FRIEND_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* private mode */
  }
}

export function clearFriendDraft(): void {
  try {
    localStorage.removeItem(FRIEND_DRAFT_KEY);
  } catch {
    /* private mode */
  }
}

/** No stills and no 3D — keep the paper. Never stylize or reserve. */
export function shouldHoldFriendDraft(input: {
  remaining: number | null | undefined;
  stillRemaining?: number | null;
  inviteFriend?: boolean;
}): boolean {
  const stillsGone = input.stillRemaining != null && input.stillRemaining <= 0;
  const threedGone = input.remaining != null && input.remaining <= 0;
  return stillsGone && threedGone;
}

/** Stills or the free 3D are back — run the usual hatch on the waiting paper. */
export function shouldHatchFriendDraft(input: {
  remaining: number | null | undefined;
  stillRemaining?: number | null;
  used?: number | null;
  hasDraft: boolean;
  pendingBirth: boolean;
}): boolean {
  if (!input.hasDraft || input.pendingBirth) return false;
  if ((input.used ?? 1) === 0 && input.remaining != null && input.remaining > 0) return true;
  return input.stillRemaining != null && input.stillRemaining > 0;
}

export function artworkToDraftImage(source: HTMLCanvasElement | HTMLImageElement): string {
  const srcW =
    source instanceof HTMLCanvasElement ? source.width : source.naturalWidth || source.width;
  const srcH =
    source instanceof HTMLCanvasElement ? source.height : source.naturalHeight || source.height;
  const scale = Math.min(1, DRAFT_MAX_EDGE / Math.max(srcW, srcH, 1));
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#fffaf0';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.86);
}

export function loadDraftImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('friend draft decode failed'));
    image.src = src;
  });
}
