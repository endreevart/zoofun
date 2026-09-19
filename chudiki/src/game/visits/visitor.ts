const KEY = 'chudiki.visitorId';

export function visitorId(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing && /^[A-Za-z0-9_-]{8,80}$/.test(existing)) return existing;
    const next = `v_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    localStorage.setItem(KEY, next);
    return next;
  } catch {
    return `v_${Date.now().toString(36)}xxxx`;
  }
}
