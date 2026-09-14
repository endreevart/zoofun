const MOSCOW = "Europe/Moscow";
const STORAGE_KEY = "zoofun-crm-period";

export type RangeKey = "today" | "yesterday" | "week" | "month" | "custom";

export type PeriodQuery = {
  range: RangeKey;
  from?: string;
  to?: string;
};

export const PERIOD_PRESETS: { key: Exclude<RangeKey, "custom">; label: string }[] = [
  { key: "today", label: "Сегодня" },
  { key: "yesterday", label: "Вчера" },
  { key: "week", label: "Неделя" },
  { key: "month", label: "Месяц" },
];

export function moscowYmd(date = new Date()): string {
  return date.toLocaleDateString("en-CA", { timeZone: MOSCOW });
}

export function shiftDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

export function defaultCustomRange(): { from: string; to: string } {
  const to = moscowYmd();
  return { from: shiftDays(to, -6), to };
}

export function periodQueryString(period: PeriodQuery): string {
  const query = new URLSearchParams();
  query.set("range", period.range);
  if (period.range === "custom" && period.from && period.to) {
    query.set("from", period.from);
    query.set("to", period.to);
  }
  return query.toString();
}

export type StoredPeriod = {
  range: RangeKey;
  from: string;
  to: string;
};

export function defaultPeriod(): StoredPeriod {
  const custom = defaultCustomRange();
  return { range: "month", from: custom.from, to: custom.to };
}

export function loadStoredPeriod(): StoredPeriod {
  const fallback = defaultPeriod();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<StoredPeriod>;
    const range = parsed.range;
    if (range !== "today" && range !== "yesterday" && range !== "week" && range !== "month" && range !== "custom") {
      return fallback;
    }
    return {
      range,
      from: typeof parsed.from === "string" && parsed.from ? parsed.from : fallback.from,
      to: typeof parsed.to === "string" && parsed.to ? parsed.to : fallback.to,
    };
  } catch {
    return fallback;
  }
}

export function persistPeriod(state: StoredPeriod): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}
