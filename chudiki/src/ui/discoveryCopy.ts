export function discoveryProgress(opened: number, total: number): string {
  if (total <= 0) return '';
  return `${Math.min(Math.max(opened, 0), total)} из ${total}`;
}
