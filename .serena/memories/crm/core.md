# CRM

`crm/` Vue SPA. Prod `crm.zooo.fun` → `/opt/zoofun-crm/dist`, `/v1/*` proxied to API.

Same Postgres as the API. Operator login (`POST /v1/crm/login`). SQLAdmin `/staff` stays the write console for credits and list prices. CRM may CRUD promocodes and send consented mail. No second ledger.

Surfaces: dashboard, funnels (generation packs only for “купил пакет”, D-024), traffic, usage, parents, creatures, packs, promos, payments, mail, ops (stuck meshes, abandoned checkout, family timeline).

Mail: cooldown rules, 48h effect without open-pixels. Unsubscribe `GET /v1/public/unsubscribe`.

First-touch UTM lives on the parent until payment.
