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
2. Further generations consume credits from packs of 5, 10, 15, or 20 animals.
3. Credits sit on the parent account. Delete does not return a credit.
4. Prices are in RUB and are operator-editable. Foreign acquiring and other currencies come later with different prices.
5. Extra worlds are not sold. Keep the legal hook; do not implement a world shop.
6. Checkout is parent-session only. Card data stays on АО «ТБанк». The zoo may open a short pack sheet; it must not collect card numbers.
7. No StoreKit, subscriptions, App Store IAP, or child-facing payment forms.
8. T-Bank keys live only in server `.env`.
9. Operator admin is SQLAdmin at `/staff`, signed in with `OPERATOR_LOGIN` / `OPERATOR_PASSWORD`. The site `/admin` redirects there. `/v1/operator` stays for scripts. Do not add Forest/Directus/Retool. A CRM for charts may follow later.

## Consequences

- Backend stores `quota_total`, `generation_used`, pack catalog, and a payment ledger in PostgreSQL.
- SQLAdmin at `/staff` is the full operator console. CRM is a later metrics layer, not a second source of writes.
- Stylize reserves a credit when a signed-in parent starts a job; refunds on technical failure before the model runs; does not refund aesthetic dislike.
- Existing parent zoos migrate: `quota_total = 1`, `generation_used =` current non-resident creature count. Test families may need operator-granted credits.
- Cursor rules and product docs no longer forbid T-Bank commerce.

## Alternatives

- StoreKit packs (historical D-005): rejected for the web service.
- Directus / Forest / Retool: rejected; extra vendor. SQLAdmin is enough for full CRUD.
- SQLAdmin on JSON: rejected; accounts had to move to PostgreSQL first. That is now done.
- Fake client-side counter: rejected; the API is authoritative.
