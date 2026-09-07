export function resolveModelUrl(path: string, apiBase: string): string {
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  if (path.startsWith('/v1/')) return `${apiBase.replace(/\/$/, '')}${path}`;
  return path;
}
