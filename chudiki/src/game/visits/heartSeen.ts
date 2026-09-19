const KEY = 'chudiki.heartsSeen';

type Seen = Record<string, number>;

function read(): Seen {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Seen;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function lastSeenJoy(shareId: string): number {
  const n = read()[shareId];
  return Number.isFinite(n) ? n : 0;
}

export function rememberJoy(shareId: string, joy: number): void {
  const store = read();
  store[shareId] = joy;
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* private mode */
  }
}
