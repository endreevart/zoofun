const STORAGE_KEY = 'zoofun-first-utm';

export type FirstUtm = {
  source: string;
  campaign: string;
  content: string;
};

export function emptyUtm(): FirstUtm {
  return { source: '', campaign: '', content: '' };
}

function clip(value: string, limit: number): string {
  return value.trim().slice(0, limit);
}

export function parseUtm(search: string): FirstUtm {
  const query = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(query);
  return {
    source: clip(params.get('utm_source') || '', 80),
    campaign: clip(params.get('utm_campaign') || '', 120),
    content: clip(params.get('utm_content') || '', 120),
  };
}

function hasUtm(utm: FirstUtm): boolean {
  return Boolean(utm.source || utm.campaign || utm.content);
}

export function readFirstUtm(): FirstUtm {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyUtm();
    const parsed = JSON.parse(raw) as Partial<FirstUtm>;
    return {
      source: String(parsed.source || ''),
      campaign: String(parsed.campaign || ''),
      content: String(parsed.content || ''),
    };
  } catch {
    return emptyUtm();
  }
}

export function captureFirstUtm(search = typeof window === 'undefined' ? '' : window.location.search): FirstUtm {
  const stored = readFirstUtm();
  if (hasUtm(stored)) return stored;
  const incoming = parseUtm(search);
  if (!hasUtm(incoming)) return emptyUtm();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(incoming));
  } catch {
    /* ignore quota */
  }
  return incoming;
}

export function utmPayload(utm: FirstUtm = captureFirstUtm()): Record<string, string> {
  return {
    utm_source: utm.source,
    utm_campaign: utm.campaign,
    utm_content: utm.content,
  };
}
