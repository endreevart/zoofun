# ADR-0008: Visual CRM on crm.zooo.fun, first-party site analytics

- Status: accepted
- Date: 2026-09-03
- Revised: 2026-09-20 (plaza toys, postcard stills, hop clicks, PRIVET; family KPIs vs visits, live presence)
- Relates: D-017, D-018, D-023, D-029, D-031, D-032, ADR-0006, ADR-0007, ADR-0013

## Context

SQLAdmin at `/staff` stays the write console. Kid/MIO CRM already had a visual metrics shell: overview KPIs, funnels, traffic. The public site had no first-party pageviews and hid the cookie banner until Metrika existed.

## Decision

1. `crm.zooo.fun` is a Vue CRM (kid Finexy layout). It authenticates with the same operator login as `/staff`.
2. Credits, packs, and payments stay on the same Postgres ledger. CRM may send consented parent mail and CRUD promocodes through the API. It is not a second cash register; SQLAdmin `/staff` remains the write console for credits and prices.
3. Ported from kid: shell, dashboard cards, funnel hub/detail, traffic, usage, parent and payment lists. Not ported: partners, blog, banners, push, discoveries, mascot, money-flow bank cards — those products do not exist here.
4. Zooofun funnels: `site`, `pricing`, `product`, `freemium`, `island`, `plaza`, `commerce`, `repeat`, `return`, `death`. They read ledger rows and first-party events only. Site «play» is island sessions (`source=island`), not Metrika or `/play` pageviews. Island «engaged» is `creature.view` or `creature.add` or `world.open` — first-draw does not need a prior view. Product ends at paid; it does not count a later island visit as a return step after payment. `plaza` is shared-lawn visit → emote/dig → toy draw → `plaza_toy_1` pay. Plaza and island KPI cards count **families** (distinct `parent_id`); sessions stay a separate visit count. Live plaza is Redis/memory seats; live island is a heartbeat in the last 90 seconds minus `session.end` and minus who is already on the plaza. `return` is first island day → second island day → second day within N days (operator-set, default 7). Return % is that N-day share among families whose N days have already passed. Dashboard shows 1 / 7 / 30. Growth speed (`GET /v1/crm/analytics/growth-speed`) is parent/child/creature velocity, same idea as kid. Features page (`GET /v1/crm/analytics/features`) shows plaza families and visits, who is on the lawn now, drawing-toys, and postcard-only stills.
5. The marketing site shows a cookie banner. Analytics cookies enable first-party `source=site` events on `POST /v1/t` and Yandex Metrika counter `112277307` (clickmap, webvisor, ecommerce dataLayer). Child paths `/play`, `/zoo`, and `/island` do not show the banner. The playable `/island` loads the same counter with webvisor unless the parent chose necessary-only. A signed-in parent hop on `/play` posts first-party `play.open` (and a `/play` page.view) with the parent token.
6. Mail audiences are named sets. A set is one or more condition blocks (AND/OR inside a block, AND/OR between blocks). Fields include used the free creature, bought a generation pack, bought a construction island, only the free Zufik, abandoned checkout, deferred postcard, plaza visit, and plaza toy. A campaign recipe left-folds those sets — or an inline email — with AND/OR. The CRM shows a garden-template preview and may attach operator-uploaded photos; child names, drawings, voice, and location never enter the template. Send only if `marketing_consent_at` is set. Unsubscribe clears consent. `ops_logs` records parent ids and counts, not the body. Return offers are draft campaigns; the operator sends. Each sent mail gets a personal hop (`GET /v1/public/mail-go/{token}`) that records `mail.click` and redirects to `/play` with `utm_source=crm_mail`. No parent id in the public URL. No open-tracking pixel.
7. Promocodes (D-023 / ADR-0013) live in the same Postgres. Generation packs, construction worlds, and `plaza_toy_1`; a code may name a subset or leave `pack_ids` empty for all shop SKUs. API startup keeps named code `PRIVET`: 25% on packs 5/10/15/20 and DIY worlds, not `pack_1` and not plaza toys. Return-mail offer templates include that code.
8. Mail rules send one named set on a cooldown (minimum 24h) and skip a parent who received any mail in the last 24h. Celery beat runs enabled rules every 15 minutes, at most once an hour per rule. Without Celery the operator presses «Запустить». Campaign effect is hop click / island session / new creature / confirmed payment in the 48 hours after send — not an open-tracking pixel.
9. The family card is a workbench: a timeline of register, island, plaza, shop, draw, зуфик, generation job, payment, mail (including hop clicks). Dashboard counts abandoned checkouts (T-Bank `created`/`pending` older than 20 minutes, or `shop.open` without a payment), stylize jobs whose mesh is still pending or failed, plaza families and visits, who is in the garden or on the lawn now, drawing-toys, and postcard-only stills. CRM still does not write credits or prices.

## Consequences

- Caddy serves the CRM static build on `crm.zooo.fun` and proxies `/v1` to the API.
- Island events may include `worldId` so CRM can split time between authored lawns and construction copies. Island tracks screens and actions (`shop`, `draw` including blocks/fails, `photo`, roster, vitrine, visit, worlds, first-draw, logout) plus care. The API writes the same table for auth and checkout (`shop.checkout`, `shop.paid`, `shop.pay_fail`) so a closed tab or cookie refusal does not hide the money path. Payloads stay ids and counts — no child names, drawings, or mail.
- Sessions store a country code at ingest (edge header or a local prefix table). Raw IPs stay hashed. Unique IP counts are not unique visitors behind one edge.
- CORS includes `https://crm.zooo.fun`.
- Island analytics stay first-party product telemetry and are not gated by the marketing cookie banner.
