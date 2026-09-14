# ADR-0010: Repeatable DIY gardens and creature homes

- Status: accepted
- Date: 2026-09-11
- Relates to: D-016 / ADR-0006, D-019 / ADR-0009
- Supersedes: ADR-0009 on “one DIY twin once per account”

## Context

ADR-0009 sold one empty twin of the authored island (`world_diy_garden`) once. The owner now wants:

1. A chooser of **my worlds** (the free garden plus every purchased construction garden) and a separate **shop** row that always offers that same SKU.
2. The construction SKU can be bought as many times as the parent wants. Each purchase mints a new empty garden with an automatic name («Сад 1», «Сад 2», …).
3. Child-made creatures live on one world. When the free garden is full, tell the family and offer another construction garden. Buying one must not dump every creature onto it — offer a move, all or one by one.

Park animals stay fixtures on every lawn. Credits stay on the parent and work in every owned garden. No new biomes, StoreKit, or child-facing cards.

## Decision

1. Opening the zoo shows **Мои миры**: ready authored lawns («Готовый мир» / «Готовые миры») and owned construction copies («Мои острова»). A new garden is a buy slot in that row, not a separate shop strip. The construction SKU stays buyable many times.
2. Checkout of `world_diy_garden` is allowed even if the parent already owns an instance. Settlement mints a new instance id (`world_diy_garden` for the first, then `world_diy_<hex>`), auto-title «Сад N», and an empty layout. Buying does not add generation credits.
3. Child-made creatures carry `worldId`. Missing `worldId` is the free garden (`authored`). Each world holds at most 20 child-made creatures. The account may hold more creatures than that across worlds. Walk, wash, and feed work on every owned lawn. A construction garden opens in play; stamping plants is a separate build mode.
4. After a garden is paid for, the island may open the new empty lawn and must offer to move creatures. It must not move them by itself.
5. Stamp rules, prop cap, grass exclusion, and parent-session checkout from ADR-0009 stay.

## Consequences

- `owned_worlds` on the parent row is a list of instance records `{id, sku, title}` (legacy string ids still parse). Dual-write also stores each copy in `worlds` (ADR-0012).
- `GET /v1/auth/me` and reconcile echo instance ids and titles.
- The island filters the zoo by the open world and keeps a move sheet. Care (walk, wash, feed) works on a construction garden the same as on the free lawn.
- Island kinds (D-021 / ADR-0011): a later authored island is a new kind with its own construction SKU, not another «Сад N» of this garden.
- Legal copy: each paid construction garden is a separate world; the SKU may be bought more than once.
