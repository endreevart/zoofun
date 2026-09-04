export const FUNNEL_NAV_TABS = [
  { label: "Сводка", name: "funnels" as const },
  { label: "Сайт", name: "funnel-detail" as const, params: { key: "site" } },
  { label: "Витрина", name: "funnel-detail" as const, params: { key: "pricing" } },
  { label: "Продукт", name: "funnel-detail" as const, params: { key: "product" } },
  { label: "Бесплатный", name: "funnel-detail" as const, params: { key: "freemium" } },
  { label: "Остров", name: "funnel-detail" as const, params: { key: "island" } },
  { label: "Оплата", name: "funnel-detail" as const, params: { key: "commerce" } },
  { label: "Повтор", name: "funnel-detail" as const, params: { key: "repeat" } },
  { label: "Отток", name: "funnel-detail" as const, params: { key: "death" } },
];
