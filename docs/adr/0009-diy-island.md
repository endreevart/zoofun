# ADR-0009: Paid DIY twin of the authored island

- Status: superseded by ADR-0010
- Date: 2026-09-09
- Relates to: D-016 / ADR-0006, D-003

## Context

ADR-0006 kept extra worlds as a legal hook and forbade a world shop. The owner now wants a second way into the current island: the authored zoo stays free; a empty twin of the same shell can be arranged by the child. That twin is a one-time additional world. Later authored islands will each ship with their own empty twin.

The adult layout studio (`?studio=1`) stays an authoring tool. It is not the child UI.

## Decision

1. Opening the zoo shows two choices: «Волшебный остров» (the free authored garden) and «Собери сам» (paid).
2. SKU `world_diy_garden` is 1190 RUB once per parent account, T-Bank, parent-session only. The price is shown in the UI; legal copy does not freeze the number.
3. Credits still live on the account and work in every world the parent owns. Buying the DIY island does not add generation credits.
4. The DIY island is the same terrain, light, and walkable shell with no authored props. The child stamps plants, houses, and objects from the island catalog. Grass stamps (`grass_a`, `grass_b`) are not in that catalog; the lawn is already on the island.
5. Stamp count is capped at the authored garden's prop count (258).
6. The child's layout is saved on the parent account and cached locally. The baked `island-layout.json` is never overwritten by a child.
7. A future authored island ships with a new empty twin and its own world SKU.
8. No StoreKit, subscriptions, or child-facing card forms.

## Consequences

- Catalog checkout grows a `worlds` list beside generation packs.
- Operators set `price_rub` / `list_price_rub` on the world SKU in `/staff` → Острова, same as generation packs. Legal copy still does not freeze the number.
- Settlement grants `owned_worlds` when `pack_id` starts with `world_`, and must not increment `quota_total`.
- The island delays world load until the family picks a garden.
