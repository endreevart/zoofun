# ADR-0008: Visual CRM on crm.zooo.fun, first-party site analytics

- Status: accepted
- Date: 2026-09-03
- Relates: D-017, ADR-0006, ADR-0007

## Context

SQLAdmin at `/staff` stays the write console. Kid/MIO CRM already had a visual metrics shell: overview KPIs, funnels, traffic. The public site had no first-party pageviews and hid the cookie banner until Metrika existed.

## Decision

1. `crm.zooo.fun` is a read-only Vue CRM (kid Finexy layout). It authenticates with the same operator login as `/staff`.
2. CRM reads Postgres only. Credits, packs, and payments are still written by the API and SQLAdmin.
3. Ported from kid: shell, dashboard cards, funnel hub/detail, traffic, usage, parent and payment lists. Not ported: partners, blog, banners, push, discoveries, mascot, money-flow bank cards — those products do not exist here.
4. Zooofun funnels: `site`, `pricing`, `product`, `freemium`, `island`, `commerce`, `repeat`, `death`. They read ledger rows and first-party events only.
5. The marketing site shows a cookie banner. Analytics cookies enable first-party `source=site` events on `POST /v1/t` and Yandex Metrika counter `112277307` (clickmap, webvisor, ecommerce dataLayer). Child paths `/play`, `/zoo`, `/island` do not show the banner and do not load the site tracker or Metrika.

## Consequences

- Caddy serves the CRM static build on `crm.zooo.fun` and proxies `/v1` to the API.
- CORS includes `https://crm.zooo.fun`.
- Island analytics stay first-party product telemetry and are not gated by the marketing cookie banner.
