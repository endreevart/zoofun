const MOSCOW = "Europe/Moscow";

export function formatDuration(sec: number): string {
  const n = Math.max(0, Math.round(sec));
  if (n < 60) return `${n} с`;
  const minutes = Math.floor(n / 60);
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

export function formatWhen(ts: number | null | undefined, withTime = false): string {
  if (ts == null || ts <= 1) return "—";
  const date = new Date(ts * 1000);
  if (Number.isNaN(date.getTime())) return "—";
  if (withTime) {
    return date.toLocaleString("ru-RU", {
      timeZone: MOSCOW,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return date.toLocaleDateString("ru-RU", { timeZone: MOSCOW });
}

export type LoginFlag = "today" | "week" | "old" | "never";

export function loginFlag(ts: number | null | undefined, nowSec = Date.now() / 1000): LoginFlag {
  if (ts == null || ts <= 1) return "never";
  const age = nowSec - ts;
  if (age < 86400) return "today";
  if (age < 7 * 86400) return "week";
  return "old";
}

export const LOGIN_FLAG_LABEL: Record<LoginFlag, string> = {
  today: "сегодня",
  week: "на неделе",
  old: "давно",
  never: "не входил",
};
