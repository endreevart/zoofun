/** Resolve a path inside `public/` to the deployed base URL.
 *
 * In dev mode `BASE_URL` is `/`; in the island build it is `/island/`.
 * Vite rewrites CSS `url()` automatically but NOT JS string literals, so
 * every JS/TSX reference to a public asset must go through this helper.
 */
const BASE = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');

export function assetUrl(path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${BASE}${clean}`;
}
