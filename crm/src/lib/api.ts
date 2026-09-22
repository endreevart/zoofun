import { periodQueryString, type PeriodQuery } from "@/lib/period";

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
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch {
    throw new Error("API не запущен на http://127.0.0.1:8080");
  }
  if (response.status === 401) {
    writeToken(null);
    throw new Error(path.includes("/login") ? "Неверный логин или пароль" : "Нужен вход");
  }
  if (response.status === 503) {
    throw new Error("Оператор не настроен. Задайте OPERATOR_LOGIN и OPERATOR_PASSWORD в .env");
  }
  if (!response.ok) {
    let message = `crm_failed (${response.status})`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string" && body.detail) message = body.detail;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

function crmPath(
  path: string,
  period?: PeriodQuery,
  extra?: Record<string, string | number | undefined>,
): string {
  const query = new URLSearchParams(periodQueryString(period ?? { range: "month" }));
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value === undefined || value === "") continue;
      query.set(key, String(value));
    }
  }
  return `${path}?${query}`;
}

export type { PeriodQuery };

export const crmApi = {
  login: (login: string, password: string) =>
    request<{ token: string }>("/v1/crm/login", {
      method: "POST",
      body: JSON.stringify({ login, password }),
    }),
  me: () => request<{ ok: boolean; display_name: string }>("/v1/crm/me"),
  overview: (period?: PeriodQuery) => request<Overview>(crmPath("/v1/crm/analytics/overview", period)),
  growthSpeed: (period?: PeriodQuery) =>
    request<GrowthSpeed>(crmPath("/v1/crm/analytics/growth-speed", period)),
  traffic: (period?: PeriodQuery) => request<Traffic>(crmPath("/v1/crm/analytics/traffic", period)),
  usage: (period?: PeriodQuery) => request<Usage>(crmPath("/v1/crm/analytics/usage", period)),
  usageCopies: (period?: PeriodQuery, page?: ListQuery & { q?: string; sort?: string; order?: string }) =>
    request<Paged<DiyWorldRow>>(crmPath("/v1/crm/analytics/usage/copies", period, page)),
  usageBuyers: (period?: PeriodQuery, page?: ListQuery & { q?: string; sort?: string; order?: string }) =>
    request<Paged<WorldBuyerRow>>(crmPath("/v1/crm/analytics/usage/buyers", period, page)),
  usageEvents: (period?: PeriodQuery, page?: ListQuery & { q?: string; sort?: string; order?: string }) =>
    request<Paged<{ event: string; count: number }>>(crmPath("/v1/crm/analytics/usage/events", period, page)),
  features: (period?: PeriodQuery) => request<FeatureSnapshot>(crmPath("/v1/crm/analytics/features", period)),
  usagePeople: (
    period?: PeriodQuery,
    query?: ListQuery & {
      scope?: string;
      world?: string;
      metric?: string;
      q?: string;
      sort?: string;
      order?: string;
    },
  ) => request<Paged<UsagePersonRow> & { title?: string; metric?: string }>(crmPath("/v1/crm/analytics/usage/people", period, query)),
  packs: (period?: PeriodQuery) => request<Packs>(crmPath("/v1/crm/packs", period)),
  funnelSummary: (period?: PeriodQuery) =>
    request<FunnelSummary>(crmPath("/v1/crm/analytics/funnels/summary", period)),
  funnel: (key: string, period?: PeriodQuery, extra?: { days?: number }) =>
    request<FunnelDetail>(crmPath(`/v1/crm/analytics/funnels/${encodeURIComponent(key)}`, period, extra)),
  parents: (
    period?: PeriodQuery,
    page?: ListQuery & {
      q?: string;
      consent?: string;
      login?: string;
      remaining_min?: number;
      remaining_max?: number;
      creatures_min?: number;
      creatures_max?: number;
      sort?: string;
      order?: string;
    },
  ) => request<Paged<ParentRow>>(crmPath("/v1/crm/parents", period, page)),
  parent: (id: string, page?: ListQuery) => {
    const query = new URLSearchParams();
    if (page?.limit != null) query.set("limit", String(page.limit));
    if (page?.offset != null) query.set("offset", String(page.offset));
    const suffix = query.toString() ? `?${query}` : "";
    return request<ParentCard>(`/v1/crm/parents/${encodeURIComponent(id)}${suffix}`);
  },
  payments: (period?: PeriodQuery, page?: ListQuery & { status?: string }) =>
    request<Paged<PaymentRow> & { revenue_rub: number }>(crmPath("/v1/crm/payments", period, page)),
  creatures: (period?: PeriodQuery, page?: ListQuery & { kind?: CreatureKind; q?: string }) =>
    request<Paged<CreatureRow>>(crmPath("/v1/crm/creatures", period, page)),
  mailMeta: () => request<MailMeta>("/v1/crm/mail/meta"),
  mailSets: () => request<{ items: MailSet[] }>("/v1/crm/mail/sets"),
  mailSetCreate: (body: MailSetIn) =>
    request<MailSet>("/v1/crm/mail/sets", { method: "POST", body: JSON.stringify(body) }),
  mailSetUpdate: (id: string, body: MailSetIn) =>
    request<MailSet>(`/v1/crm/mail/sets/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  mailSetDelete: (id: string) =>
    request<{ ok: boolean }>(`/v1/crm/mail/sets/${encodeURIComponent(id)}`, { method: "DELETE" }),
  mailSetPreview: (body: MailSetPreviewIn) =>
    request<MailPreview>("/v1/crm/mail/sets/preview", { method: "POST", body: JSON.stringify(body) }),
  mailCampaigns: (page?: ListQuery) =>
    request<Paged<MailCampaign>>(crmPath("/v1/crm/mail/campaigns", undefined, page)),
  mailCampaignCreate: (body: MailCampaignIn) =>
    request<MailCampaign>("/v1/crm/mail/campaigns", { method: "POST", body: JSON.stringify(body) }),
  mailPreview: (recipe: MailRecipe) =>
    request<MailPreview>("/v1/crm/mail/preview", { method: "POST", body: JSON.stringify({ recipe }) }),
  mailRender: (subject: string, body: string) =>
    request<{ html: string }>("/v1/crm/mail/render", {
      method: "POST",
      body: JSON.stringify({ subject, body }),
    }),
  mailImage: async (file: File) => {
    const headers = new Headers();
    const token = readToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const form = new FormData();
    form.append("file", file);
    let response: Response;
    try {
      response = await fetch("/v1/crm/mail/images", { method: "POST", headers, body: form });
    } catch {
      throw new Error("API не запущен на http://127.0.0.1:8080");
    }
    if (response.status === 401) {
      writeToken(null);
      throw new Error("Нужен вход");
    }
    if (!response.ok) throw new Error(`crm_failed (${response.status})`);
    return (await response.json()) as { id: string; url: string };
  },
  mailSend: (id: string) =>
    request<MailCampaign>(`/v1/crm/mail/campaigns/${encodeURIComponent(id)}/send`, { method: "POST" }),
  mailOffers: () => request<{ items: MailOffer[]; note?: string }>("/v1/crm/mail/offers"),
  mailOfferDraft: (id: string) =>
    request<MailCampaign>(`/v1/crm/mail/offers/${encodeURIComponent(id)}/draft`, { method: "POST" }),
  mailDeliveries: (id: string, page?: ListQuery) =>
    request<Paged<MailDelivery> & { campaign_id: string; clicked: number }>(
      crmPath(`/v1/crm/mail/campaigns/${encodeURIComponent(id)}/deliveries`, undefined, page),
    ),
  mailRules: () => request<{ items: MailRule[] }>("/v1/crm/mail/rules"),
  mailRuleCreate: (body: MailRuleIn) =>
    request<MailRule>("/v1/crm/mail/rules", { method: "POST", body: JSON.stringify(body) }),
  mailRuleUpdate: (id: string, body: MailRuleIn) =>
    request<MailRule>(`/v1/crm/mail/rules/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  mailRuleDelete: (id: string) =>
    request<{ ok: boolean }>(`/v1/crm/mail/rules/${encodeURIComponent(id)}`, { method: "DELETE" }),
  mailRulePreview: (id: string) =>
    request<MailPreview>(`/v1/crm/mail/rules/${encodeURIComponent(id)}/preview`, { method: "POST" }),
  mailRuleRun: (id: string) =>
    request<MailRuleRun>(`/v1/crm/mail/rules/${encodeURIComponent(id)}/run`, { method: "POST" }),
  abandoned: (period?: PeriodQuery, page?: ListQuery) =>
    request<Paged<AbandonedRow>>(crmPath("/v1/crm/ops/abandoned", period, page)),
  stuck: (page?: ListQuery) =>
    request<Paged<StuckJob>>(crmPath("/v1/crm/ops/stuck", undefined, page)),
  promos: () => request<{ items: PromoRow[] }>("/v1/crm/promos"),
    promoCreate: (body: PromoIn) =>
    request<PromoRow>("/v1/crm/promos", { method: "POST", body: JSON.stringify(body) }),
  promoUpdate: (code: string, body: PromoWrite) =>
    request<PromoRow>(`/v1/crm/promos/${encodeURIComponent(code)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  promoDeactivate: (code: string) =>
    request<PromoRow>(`/v1/crm/promos/${encodeURIComponent(code)}/deactivate`, { method: "POST" }),
  promoActivate: (code: string) =>
    request<PromoRow>(`/v1/crm/promos/${encodeURIComponent(code)}/activate`, { method: "POST" }),
  discoveries: (page?: ListQuery & { status?: string; provider?: string; kind?: string; category?: string; q?: string }) => {
    const query = new URLSearchParams();
    if (page?.limit != null) query.set("limit", String(page.limit));
    if (page?.offset != null) query.set("offset", String(page.offset));
    if (page?.status) query.set("status", page.status);
    if (page?.provider) query.set("provider", page.provider);
    if (page?.kind) query.set("kind", page.kind);
    if (page?.category) query.set("category", page.category);
    if (page?.q) query.set("q", page.q);
    const suffix = query.toString() ? `?${query}` : "";
    return request<Paged<DiscoveryRow> & { status_counts: DiscoveryStatusCounts }>(`/v1/crm/discoveries${suffix}`);
  },
  discovery: (id: string) => request<DiscoveryRow>(`/v1/crm/discoveries/${encodeURIComponent(id)}`),
  discoveryCreate: (body: DiscoveryWrite) =>
    request<DiscoveryRow>("/v1/crm/discoveries", { method: "POST", body: JSON.stringify(body) }),
  discoveryUpdate: (id: string, body: DiscoveryWrite) =>
    request<DiscoveryRow>(`/v1/crm/discoveries/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  discoveryPublish: (id: string) =>
    request<DiscoveryPublishResult>(`/v1/crm/discoveries/${encodeURIComponent(id)}/publish`, { method: "POST" }),
  discoveryReject: (id: string, body?: { reason?: string }) =>
    request<DiscoveryRow>(`/v1/crm/discoveries/${encodeURIComponent(id)}/reject`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),
  discoveryDelete: (id: string) =>
    request<{ ok: boolean }>(`/v1/crm/discoveries/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

export type Overview = {
  parents_total: number;
  children_total: number;
  creatures_total: number;
  new_parents: number;
  children_new: number;
  creatures_new: number;
  active_parents: number;
  dau: number;
  wau: number;
  mau: number;
  dau_delta_pct: number | null;
  site_sessions: number;
  island_sessions: number;
  island_parents?: number;
  pageviews: number;
  paid_orders: number;
  revenue_rub: number;
  pack_orders?: number;
  world_orders?: number;
  pack_revenue_rub?: number;
  world_revenue_rub?: number;
  plaza_toy_orders?: number;
  plaza_toy_revenue_rub?: number;
  plaza_visits?: number;
  plaza_parents?: number;
  plaza_toys?: number;
  live_island?: number;
  live_plaza?: number;
  deferred_stills?: number;
  only_free_parents?: number;
  abandoned_checkouts?: number;
  stuck_meshes?: number;
  charts: { parents: Point[]; dau: Point[] };
  sections: { key: string; label: string }[];
  window?: { range: string; from: string; to: string };
  retention?: {
    d1: number | null;
    d7: number | null;
    d30: number | null;
    days: number;
    returned_pct: number | null;
    eligible: number;
    returned: number;
  };
};

export type GrowthSpeed = {
  as_of: string;
  cards: {
    parents_total: number;
    parents_last_hour: number;
    parents_today: number;
    parents_week: number;
    avg_per_day: number;
    growth_rate_pct: number | null;
    peak_day_count: number;
    peak_day_date: string;
    children_total: number;
    children_today: number;
    creatures_total: number;
    creatures_today: number;
    parents_period: number;
    parents_prev_period: number;
  };
  peaks: {
    top_parent_days: Point[];
    peak_hour_today: Point;
    max_velocity: Point;
    days_with_growth: number;
  };
  recent_parents: { id: string; email: string; created_at: number }[];
  charts: {
    daily_parents: Point[];
    daily_children: Point[];
    daily_creatures: Point[];
    cumulative_parents: Point[];
    hourly_today: Point[];
    velocity: Point[];
  };
};

export type Point = { date: string; count: number };

export type CountSlice = { key: string; count: number; label?: string };

export type Traffic = {
  sessions: number;
  pageviews: number;
  avg_duration_sec: number;
  unique_ips: number;
  unique_parents?: number;
  play_opens?: number;
  ip_note?: string;
  by_source: CountSlice[];
  by_device: CountSlice[];
  by_locale: CountSlice[];
  by_country: CountSlice[];
  by_utm_source?: CountSlice[];
  by_utm_campaign?: CountSlice[];
  paid_by_utm_source?: CountSlice[];
  paid_by_utm_campaign?: CountSlice[];
  top_pages: { path: string; views: number }[];
  island_events?: { event: string; count: number }[];
  charts: { sessions: Point[]; site?: Point[]; island?: Point[] };
};

export type LawnRow = {
  id: string;
  world_id: string;
  title: string;
  kind: string;
  creatures: number;
  creatures_new: number;
  visits: number;
  parents?: number;
  time_sec: number;
  leading: boolean;
};

export type DiyWorldRow = {
  id: string;
  title: string;
  sku: string;
  kind_id: string;
  kind_title: string;
  parent_id: string;
  parent_email: string;
  creatures: number;
  creatures_new: number;
  props: number;
  visits: number;
  time_sec: number;
};

export type WorldBuyerRow = {
  parent_id: string;
  email: string;
  copies: number;
  bought: number;
  spent_rub: number;
  last_bought_at: number | null;
};

export type UsagePersonRow = {
  parent_id: string;
  email: string;
  title?: string;
  creatures?: number;
  creatures_new?: number;
  visits?: number;
  time_sec?: number;
  last_visit_at?: number | null;
  copies?: number;
  bought?: number;
  spent_rub?: number;
  last_bought_at?: number | null;
  props?: number;
  parent_email?: string;
  kind_title?: string;
  id?: string;
};

export type LivePerson = {
  parent_id: string;
  email: string | null;
  last_at: number;
};

export type LiveNow = {
  count: number;
  people: LivePerson[];
};

export type Usage = {
  island_sessions: number;
  island_parents?: number;
  live?: { plaza: LiveNow; island: LiveNow };
  visitors?: { parent_id: string; email: string | null; visits: number; last_at: number }[];
  creatures_new: number;
  events: { event: string; count: number }[];
  lawns: LawnRow[];
  diy: {
    copies: number;
    buyers: number;
    creatures: number;
    props: number;
    items: DiyWorldRow[];
  };
  buyers: WorldBuyerRow[];
};

export type PackCatalogRow = {
  id: string;
  title: string;
  kind: "pack" | "world" | string;
  animals: number;
  price_rub: number;
  sold: number;
  revenue_rub: number;
  last_bought_at: number | null;
};

export type Packs = {
  items: PackCatalogRow[];
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
  days?: number;
  return_pct?: number | null;
  eligible?: number;
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

export type ListQuery = {
  limit?: number;
  offset?: number;
  parent_id?: string;
};

export type Paged<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};

export type CreatureKind =
  | "all"
  | "image"
  | "painted"
  | "model"
  | "postcard"
  | "garden"
  | "meadow"
  | "grove"
  | "diy";

export type ParentRow = {
  id: string;
  email: string;
  remaining: number;
  still_remaining?: number;
  still_quota?: number;
  still_used?: number;
  creatures: number;
  plaza_toys?: number;
  created_at: number;
  last_login_at: number | null;
  marketing_consent?: boolean;
  yandex?: boolean;
  utm_source?: string;
  utm_campaign?: string;
  utm_content?: string;
};

export type ParentWorldRow = {
  id: string;
  title: string;
  sku: string;
  kind_id: string;
  kind_title: string;
  diy: boolean;
  creatures: number;
};

export type ParentCard = {
  parent: ParentRow;
  items: CreatureRow[];
  total: number;
  limit?: number;
  offset?: number;
  worlds?: ParentWorldRow[];
  payments?: PaymentRow[];
  timeline?: TimelineEvent[];
};

export type TimelineEvent = {
  ts: number;
  kind: string;
  title: string;
  detail: string;
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
  has_postcard?: boolean;
  postcard_url?: string | null;
  world_id?: string;
  lawn_title?: string;
  lawn_kind?: string;
  diy?: boolean;
};

export type PaymentRow = {
  id: string;
  parent_id: string;
  parent_email: string | null;
  pack_id: string;
  title?: string;
  animals: number;
  amount_rub: number;
  discount_rub?: number;
  promo_code?: string;
  status: string;
  created_at: number;
};

export type MailCondition = { field: string; op: string; value: boolean | number | string };

export type MailGroup = { combinator: string; conditions: MailCondition[] };

export type MailSet = {
  id: string;
  name: string;
  combinator: "and" | "or" | string;
  conditions: MailCondition[];
  groups?: MailGroup[];
  is_system: boolean;
  created_at: number;
};

export type MailSetIn = {
  name: string;
  combinator: string;
  conditions?: MailCondition[];
  groups?: MailGroup[];
};

export type MailSetPreviewIn = {
  combinator: string;
  conditions?: MailCondition[];
  groups?: MailGroup[];
};

export type MailRecipePart = {
  set_id?: string;
  join: "and" | "or" | string;
  combinator?: string;
  groups?: MailGroup[];
  conditions?: MailCondition[];
};

export type MailRecipe = { parts: MailRecipePart[] };

export type MailCampaign = {
  id: string;
  subject: string;
  body: string;
  recipe: MailRecipe;
  status: string;
  created_at: number;
  sent_at: number | null;
  sent_count: number;
  skipped_count: number;
  rule_id?: string | null;
  effect?: CampaignEffect;
};

export type CampaignEffect = {
  window_hours: number;
  recipients: number;
  returned: number;
  drew: number;
  paid: number;
  clicked?: number;
};

export type MailOffer = {
  id: string;
  set_id: string;
  title: string;
  why: string;
  promo_hint: string;
  subject: string;
  body: string;
  matching: number;
  sendable: number;
};

export type MailDelivery = {
  parent_id: string;
  email: string;
  status: string;
  reason: string;
  created_at: number;
  hop_url: string;
  clicked_at: number | null;
  click_count: number;
};

export type FeatureToy = {
  id: string;
  parent_id: string | null;
  email: string | null;
  mesh_status: string;
  has_mesh: boolean;
  placed: boolean;
  created_at: number;
  title: string;
};

export type FeatureSnapshot = {
  plaza: {
    visits: number;
    parents: number;
    opens: number;
    enters: number;
    emotes: number;
    digs: number;
    stamps: number;
    catalog_stamps: number;
    toy_stamps: number;
    visitors: { parent_id: string; email: string | null; visits: number; last_at: number }[];
  };
  live?: { plaza: LiveNow; island: LiveNow };
  toys: {
    total: number;
    new: number;
    parents: number;
    preview_unpaid: number;
    draws: number;
    paid_orders: number;
    revenue_rub: number;
    ready: number;
    pending: number;
    skipped: number;
    failed: number;
    items: FeatureToy[];
  };
  stills: {
    used_total: number;
    jobs: number;
    deferred: number;
    deferred_parents: number;
    only_free_parents: number;
    items: { id: string; parent_id: string | null; email: string | null; mesh_status: string; created_at: number }[];
  };
  charts: { plaza_parents?: Point[]; plaza_visits: Point[] };
};

export type MailCampaignIn = {
  subject: string;
  body: string;
  recipe: MailRecipe;
};

export type MailRule = {
  id: string;
  name: string;
  set_id: string;
  set_name: string;
  subject: string;
  body: string;
  enabled: boolean;
  cooldown_hours: number;
  created_at: number;
  last_run_at: number | null;
};

export type MailRuleIn = {
  name: string;
  set_id: string;
  subject: string;
  body: string;
  enabled: boolean;
  cooldown_hours: number;
};

export type MailRuleRun = {
  id?: string;
  skipped?: string;
  status?: string;
  sent_count?: number;
  last_run_at?: number | null;
  preview?: MailPreview;
};

export type MailPreview = {
  matching: number;
  sendable: number;
  skipped: { no_consent: number; bad_email: number; cooldown?: number; recent_mail?: number };
  sample_emails: string[];
  capped: boolean;
  cap: number;
};

export type AbandonedRow = {
  source: string;
  id: string;
  parent_id: string;
  parent_email: string | null;
  pack_id: string;
  title: string;
  amount_rub: number;
  status: string;
  created_at: number;
  kind: string;
};

export type StuckJob = {
  id: string;
  parent_id: string;
  parent_email: string | null;
  status: string;
  mesh_status: string;
  kind_id: string;
  reserved: boolean;
  created_at: number;
  updated_at: number;
};

export type MailMeta = {
  fields: { key: string; ops: string[]; type: string; label: string }[];
  op_labels?: Record<string, string>;
  combinators: string[];
};

export type PromoRow = {
  code: string;
  kind: string;
  value: number;
  max_redemptions: number;
  starts_at: number | null;
  ends_at: number | null;
  active: boolean;
  created_at: number;
  note: string;
  pack_ids: string[];
  redemptions: number;
  revenue_rub: number;
};

export type PromoWrite = {
  kind: string;
  value: number;
  max_redemptions: number;
  starts_at?: number | null;
  ends_at?: number | null;
  note?: string;
  active: boolean;
  pack_ids: string[];
};

export type PromoIn = PromoWrite & {
  code: string;
};

export type DiscoveryStatusCounts = {
  all: number;
  needs_review: number;
  fetched: number;
  approved: number;
  rejected: number;
};

export type DiscoveryRow = {
  id: string;
  title: string;
  title_ru: string;
  title_en: string;
  body: string;
  kind: string;
  suggested_type: string;
  age: string;
  suggested_age_group: string;
  category: string;
  suggested_category: string;
  status: string;
  is_active: boolean;
  provider: string;
  sort_order: number;
  rejection_reason: string;
  created_at: number;
  updated_at: number;
};

export type DiscoveryWrite = {
  title: string;
  body: string;
  kind: string;
  age: string;
  category: string;
  sort_order?: number;
};

export type DiscoveryPublishResult = {
  discovery: { id: string; title: string };
  draft: DiscoveryRow;
};
