/** Public files under Vite `base`, so a /zoofun/ site still finds models. */
export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}
