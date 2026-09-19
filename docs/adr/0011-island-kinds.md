# ADR-0011: Island kinds (authored shell + construction SKU)

- Status: accepted
- Date: 2026-09-11
- Updated: 2026-09-13
- Relates to: D-020 / ADR-0010, D-019 / ADR-0009

## Context

ADR-0010 sold repeatable empty twins of the current garden. The next island is not “another Сад N”. It is a new **kind**: its own authored lawn (terrain, light, layout) and a construction SKU that stamps **that** island’s plants, houses, and objects.

## Decision

1. An **island kind** is `{authored lawn, construction SKU, stamp catalog, art, instance title prefix}`.
2. **Мои миры** shows each authored lawn as a free ready world. Owned construction copies sit under «Мои острова», with a buy slot that mints another copy of a kind. Price is on the buy control.
3. The first copy of a SKU keeps that SKU as its instance id. Later copies are `{sku}_{hex}`. Creatures still carry `worldId`. Credits stay on the parent.
4. Construction loads that kind’s shell and stamp list. Grass stays out of the child catalog unless a later kind explicitly adds it.
5. Shipped kinds:
   - `garden`: «Волшебный остров» + `world_diy_garden` («Собери сам» / «Сад N»).
   - `meadow`: «Висячий луг» + `world_diy_meadow` («Собери луг» / «Луг N»). Authored meadow uses the hanging isle, baked `meadow-layout.json`, and the meadow stamp catalog. Construction copies of the meadow are 59 ₽ in the catalog (operator-editable; legal copy does not freeze the number).
   - `grove`: «Куболесье» + `world_diy_grove` («Собери куболесье» / «Куболесье N»). Authored grove uses the voxel hanging isle, baked `grove-layout.json`, and the grove stamp catalog. Construction copies of the grove are 59 ₽ in the catalog (operator-editable; legal copy does not freeze the number).
6. Adult studio may still author a shell locally (`?studio=1&kind=meadow` or `kind=grove`). Layout storage, catalog, and terrain are per shell.
7. A later kind is a new product decision plus assets. Do not invent a fake biome in the shop.

## Consequences

- Backend and island share the same kind ids and construction SKUs.
- `GET /v1/auth/me` and reconcile echo `{id, title, sku}`. Catalog worlds echo `kind_id`.
- A later kind is a registry row, a terrain pack, a stamp list, and a shop card — not a new checkout flow.
- Legal copy names the kinds that are sold; prices stay in the UI.
