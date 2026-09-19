# ADR-0006: Web commerce via T-Bank, generation credits

- Status: accepted
- Date: 2026-09-03
- Supersedes: D-006, D-013, ADR-0004 (commerce deferral)
- Reactivates and revises: D-005

## Context

The non-commercial pilot for ≤10 children is ending. Legal drafts already describe T-Bank acquiring and generation packs. The owner accepted a commercial model: first creature free, then packs of 5 / 10 / 15 / 20, rubles only, no extra worlds yet. Deleting a creature does not restore a generation.

D-006 excluded Russian acquiring. D-013 and ADR-0004 forbade payments, credits, receipts, and a purchase ledger. Those decisions blocked the public site.

Accounts, zoos, packs, and payments now live in PostgreSQL. SQLAdmin at `/staff` is the operator console (Russian entity names, full CRUD). A later CRM will add visual metrics and does not replace `/staff`. Ready-made SaaS shells (Directus, Forest, Retool) stay out.

## Decision

1. First successful generation on a parent account is free.
2. Further generations consume credits from packs of 1, 5, 10, 15, or 20 animals. After the free creature the island first offers 1 and 5 (D-024).
3. Credits sit on the parent account. Delete does not return a credit.
4. Prices are in RUB and are operator-editable. Foreign acquiring and other currencies come later with different prices.
5. Extra worlds: D-020 DIY gardens of the garden island (`world_diy_garden`, buyable more than once). Further islands are D-021 kinds (own shell + construction SKU). Garden, meadow, and grove (Куболесье) are in the shop; a later kind needs assets and a decision.
6. Checkout is parent-session only. Card data stays on АО «ТБанк». The zoo may open a short pack sheet; it must not collect card numbers.
7. No StoreKit, subscriptions, App Store IAP, or child-facing payment forms.
8. T-Bank keys live only in server `.env`.
9. Operator admin is SQLAdmin at `/staff`, signed in with `OPERATOR_LOGIN` / `OPERATOR_PASSWORD`. The site `/admin` redirects there. `/v1/operator` stays for scripts. Do not add Forest/Directus/Retool. A CRM for charts may follow later.
10. The T-Bank notification is a trigger, not the authority. `GetState` decides whether a payment was paid, and it is asked on every path: when a notification arrives, once when the parent returns from checkout (`POST /v1/commerce/reconcile`), and on a schedule for parents who never came back. A lost notification must never cost a parent their credits, and a forged one must not create them.
11. The island must not claim credits it has not seen. After checkout it reconciles and reports what the ledger actually says.
12. Repeating checkout for the same parent and pack within a short window returns the existing payment link, so a double tap cannot create two payable orders.
13. The bank may return the parent to either the success page configured in its cabinet or the one passed in `Init`. Both lead to the garden, because a parent who paid wants eggs, not a price list.

## Consequences

- Backend stores `quota_total`, `generation_used`, pack catalog, and a payment ledger in PostgreSQL.
- SQLAdmin at `/staff` is the full operator console. CRM is a later metrics layer, not a second source of writes.
- Stylize reserves a 3D credit on the first signed-in job, or a still credit on later jobs (D-031). Revive (`POST .../stylize/{id}/mesh`) reserves 3D. Refunds on technical failure before the model runs; does not refund aesthetic dislike. Still quota is derived: `10 + 10 * max(0, quota_total - 1)`.
- Existing parent zoos migrate: `quota_total = 1`, `generation_used =` current non-resident creature count. Test families may need operator-granted credits.
- Cursor rules and product docs no longer forbid T-Bank commerce.
- Credits are granted through one code path (`app/commerce/settlement.apply_state`) shared by the notification and the reconciliation, so the two can never diverge. Granting stays idempotent through the locked `settle_confirmed`.
- The notification signature only proves the sender knows the terminal password, which lives in a bank cabinet a human can leak or screenshot. Verifying through `GetState` means a leak costs a wasted call, not free credits. It also costs one extra bank call per notification, inside T-Bank's ten-second window.
- When `GetState` cannot be reached the signed notification is trusted and the log says it was unverified. That keeps a T-Bank outage from stalling real credits, at the price of a forgery being possible during one. Nobody outside the bank can arrange that outage, so the trade is accepted.
- The notification endpoint answers with a plain `OK` body, which is the only answer T-Bank accepts as delivery. Anything else and the bank redelivers hourly for a day and then daily for a month.
- A Celery `beat` container runs the reconciliation sweep. Losing it delays credits to parents who close the browser; it does not lose them.
- The API logs every non-health request, because "did T-Bank ever call us?" was unanswerable without it.

## Alternatives

- StoreKit packs (historical D-005): rejected for the web service.
- Directus / Forest / Retool: rejected; extra vendor. SQLAdmin is enough for full CRUD.
- SQLAdmin on JSON: rejected; accounts had to move to PostgreSQL first. That is now done.
- Fake client-side counter: rejected; the API is authoritative.
