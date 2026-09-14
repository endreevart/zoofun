import type { WorldShell } from './game/world/kinds';

/**
 * The layout studio authors worlds. It is not a child or parent setting.
 * Dev server: always on. A built site: only `?studio=1`, so a shipped
 * zoo never shows 🌲 / 🎛.
 */
export function isStudio(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return new URLSearchParams(window.location.search).has('studio');
  } catch {
    return false;
  }
}

/** Adult authoring: skip the child world chooser. */
export function isAuthoringStudio(): boolean {
  try {
    return new URLSearchParams(window.location.search).has('studio');
  } catch {
    return false;
  }
}

export function studioShell(search = typeof window === 'undefined' ? '' : window.location.search): WorldShell {
  try {
    const kind = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('kind');
    if (kind === 'meadow' || kind === 'grove') return kind;
  } catch {
    /* ignore */
  }
  return 'garden';
}

export function studioWorldId(search?: string): string {
  const shell = studioShell(search);
  if (shell === 'meadow') return 'authored_meadow';
  if (shell === 'grove') return 'authored_grove';
  return 'authored';
}

export function studioKindHref(kind: WorldShell): string {
  const url = new URL(window.location.href);
  url.searchParams.set('studio', '1');
  if (kind === 'garden') url.searchParams.delete('kind');
  else url.searchParams.set('kind', kind);
  return url.toString();
}
