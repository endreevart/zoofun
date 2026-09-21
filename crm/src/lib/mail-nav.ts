export const MAIL_NAV_TABS = [
  { label: "Рассылки", name: "mail" as const, query: { tab: "sent" } },
  { label: "Написать", name: "mail" as const, query: { tab: "write" } },
  { label: "Наборы", name: "mail" as const, query: { tab: "sets" } },
  { label: "Правила", name: "mail" as const, query: { tab: "rules" } },
];

export type MailTabId = (typeof MAIL_NAV_TABS)[number]["query"]["tab"];

export function mailTabFromQuery(raw: unknown): MailTabId {
  const value = String(raw || "sent");
  return MAIL_NAV_TABS.some((tab) => tab.query.tab === value)
    ? (value as MailTabId)
    : "sent";
}
