# ADR-0012: Relational owned worlds and creature asset URLs

- Status: accepted
- Date: 2026-09-13
- Relates to: ADR-0007, ADR-0010, ADR-0011

## Context

Owned construction copies and DIY layouts lived in `parents.owned_worlds` / `parents.diy_layouts` JSON. Creature stills and last position sat inside `creatures.payload`. CRM had to parse those blobs, and the first copy of a SKU reuses that SKU as instance id, so counting by `world_id` alone mixed families.

The island wire must stay `{ spec, lastPosition }`. Live families cannot be rewritten in place in one cutover.

## Decision

1. Table `worlds` with composite primary key `(parent_id, id)`. Columns: `sku`, `title`, `layout`, `created_at`. Settlement dual-writes JSON and this row. Reads prefer the table and fall back to JSON when a parent has no rows yet.
2. Creature stills are files under `STORAGE_LOCAL_ROOT` (`creatures/{child_id}/{spec_id}.png`) and a URL column. `GET /v1/zoo` assembles the island record from columns plus leftover payload. Inline data-URLs are extracted on write; the island still sees `portraitUrl` as `/v1/zoo/creatures/{id}/portrait`. The portrait route is session-scoped and does not serve another child's file.
3. `analytics_events.world_id` and `path` are columns. Ingest dual-writes them from `p`. CRM coalesces column then JSON.
4. Do not drop `payload`, `owned_worlds`, or `diy_layouts` in the same deploy.

## Consequences

- First-copy SKU ids stay unique per parent, not globally.
- CRM usage for DIY copies keys creatures and visits by `(parent_id, world_id)`.
- A later revision may drop the JSON shadows after the island and CRM have run on columns in production.
