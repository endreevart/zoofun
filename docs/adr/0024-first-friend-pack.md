# ADR-0024: First paid Zufik after the free creature

- Status: accepted
- Date: 2026-09-14
- Relates: D-005, D-016, D-023, D-024, ADR-0006, ADR-0013

## Context

The first creature is free. The next paid offer was only a pack of five. After a successful hatch the island showed that pack, and the CRM “free → paid” funnel counted any confirmed payment, including a 59 ₽ construction island. Landing copy said “your child’s zoo” before it said that a drawing becomes a living 3D animal.

## Decision

1. Catalog includes `pack_1` (1 credit, seed 99 ₽) alongside 5 / 10 / 15 / 20. Seed for a new database sets `pack_5` to 399 ₽. A live catalog keeps its current `pack_5` until the operator sets the test price.
2. After the free hatch, when remaining credits are 0, the island pack sheet shows two offers: one Zufik and five, with “Выгоднее” on five. A quiet link expands 10 / 15 / 20. Construction SKUs stay in the world picker, not on this sheet.
3. Copy sells the next friend, not slots. Construction copies remain a complement after animals, not an equal first offer.
4. Funnels that say “купил пакет” count only `pack_*`. `world_diy_*` is not a pack conversion.
5. First-touch `utm_source` / `utm_campaign` / `utm_content` is stored on the parent, the analytics session, and the payment. A later reel does not overwrite the first source.

## Consequences

- Promocodes with an empty `pack_ids` list cover all five generation packs.
- Legal purchases list 1, 5, 10, 15, or 20 credits. Prices stay in the UI, not in the offer.
- The test metric is revenue per impression of the post-hatch sheet, not purchase count. If 99 ₽ steals too much from 399 ₽, keep the single credit only after a declined five-pack.
