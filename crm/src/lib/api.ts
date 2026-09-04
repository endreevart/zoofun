const TOKEN_KEY = "zoofun-crm-token";

export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function writeToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = readToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers });
  if (response.status === 401) {
    writeToken(null);
    throw new Error("Нужен вход");
  }
  if (!response.ok) throw new Error("crm_failed");
  return (await response.json()) as T;
}

export const crmApi = {
  login: (login: string, password: string) =>
    request<{ token: string }>("/v1/crm/login", {
      method: "POST",
      body: JSON.stringify({ login, password }),
    }),
  me: () => request<{ ok: boolean; display_name: string }>("/v1/crm/me"),
  overview: (period = 30) => request<Overview>(`/v1/crm/analytics/overview?period=${period}`),
  traffic: (period = 30) => request<Traffic>(`/v1/crm/analytics/traffic?period=${period}`),
  usage: (period = 30) => request<Usage>(`/v1/crm/analytics/usage?period=${period}`),
  funnelSummary: (period = 30) => request<FunnelSummary>(`/v1/crm/analytics/funnels/summary?period=${period}`),
  funnel: (key: string, period = 30) => request<FunnelDetail>(`/v1/crm/analytics/funnels/${key}?period=${period}`),
  parents: () => request<{ items: ParentRow[] }>("/v1/crm/parents"),
  payments: () => request<{ items: PaymentRow[]; revenue_rub: number }>("/v1/crm/payments"),
  creatures: () => request<{ items: CreatureRow[] }>("/v1/crm/creatures"),
};

export type Overview = {
  parents_total: number;
  children_total: number;
  creatures_total: number;
  new_parents: number;
  active_parents: number;
  dau: number;
  wau: number;
  mau: number;
  dau_delta_pct: number | null;
  site_sessions: number;
  island_sessions: number;
  pageviews: number;
  paid_orders: number;
  revenue_rub: number;
  charts: { parents: Point[]; dau: Point[] };
  sections: { key: string; label: string }[];
};

export type Point = { date: string; count: number };

export type Traffic = {
  sessions: number;
  pageviews: number;
  avg_duration_sec: number;
  by_source: { key: string; count: number }[];
  by_device: { key: string; count: number }[];
  top_pages: { path: string; views: number }[];
  charts: { sessions: Point[] };
};

export type Usage = {
  island_sessions: number;
  creatures_new: number;
  events: { event: string; count: number }[];
};

export type FunnelSample = {
  id: string;
  kind: string;
  title: string;
  subtitle: string;
  at: number;
};

export type FunnelStep = {
  key: string;
  label: string;
  count: number;
  pct_of_previous: number;
  drop_pct: number;
  samples?: FunnelSample[];
  samples_total?: number;
};

export type FunnelDetail = {
  key: string;
  label: string;
  description: string;
  inverted?: boolean;
  steps: FunnelStep[];
  end_conversion_pct: number;
  avg_step_drop_pct: number;
};

export type FunnelSummary = {
  cards: { total_funnels: number; healthy: number; attention: number; critical: number };
  headline: { overall_conversion_pct: number; avg_step_drop_pct: number };
  groups: {
    key: string;
    label: string;
    funnels: { key: string; label: string; end_conversion_pct: number; avg_step_drop_pct: number }[];
  }[];
  funnels: { key: string; label: string; end_conversion_pct: number; avg_step_drop_pct: number }[];
};

export type ParentRow = {
  id: string;
  email: string;
  remaining: number;
  creatures: number;
  created_at: number;
  last_login_at: number | null;
};

export type CreatureRow = {
  child_id: string;
  spec_id: string;
  name: string;
  kind_id: string;
  origin: string;
  parent_id: string;
  parent_email: string;
  child_nickname: string;
  created_at: number;
  has_image: boolean;
  painted: boolean;
  has_model: boolean;
};

export type PaymentRow = {
  id: string;
  parent_id: string;
  parent_email: string | null;
  pack_id: string;
  animals: number;
  amount_rub: number;
  status: string;
  created_at: number;
};
