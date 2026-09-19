/** First-party action payloads. Never put names, drawings, or raw search text here. */

export function vitrineSearchLog(query: string): {
  is_code: boolean;
  empty: boolean;
  q_len: number;
} {
  const q = query.trim();
  return {
    is_code: /^\d{4,6}$/.test(q),
    empty: q.length === 0,
    q_len: Math.min(q.length, 64),
  };
}
