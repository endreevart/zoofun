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
