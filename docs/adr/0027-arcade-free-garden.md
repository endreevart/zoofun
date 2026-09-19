# ADR-0027: Arcade on a free empty garden

- Status: accepted
- Date: 2026-09-17
- Relates: D-020, D-021, D-024, D-026, D-027, ADR-0010, ADR-0011, ADR-0024, ADR-0026

## Context

The empty construction garden already stamps plants and houses. A new family still landed on a chooser, and the first `world_diy_garden` copy cost 1190 ₽ (D-020). That left the “build a home, then invite someone to live there” story behind a paid world and a free catalog tray.

Arcade is not a mini-game. It is the zoo: the child enters an empty «Собери сам», a recorded voice puts one toy in hand, and only then does the existing first-draw / friend-then-pay path settle the lawn.

## Decision

1. `GET /v1/auth/me` grants the first `world_diy_garden` if the parent has none. Extra garden copies, meadow, and grove stay paid. Register still returns an empty world list so existing tests and the shop SKU remain honest.
2. Arcade is one-time training on the first `world_diy_garden`, gated by `ARCADE_PUBLIC` (off for the first prod ship). While off, families get the free garden as a normal island and the picker. DEV `?arcade` still forces the quest. After the flag is on: an unfinished quest opens that garden; after `done` it is a normal island in «Мои острова». Later garden copies are not arcade. `?studio=1` does not run arcade unless DEV `?arcade`.
3. First pass plants five different pretty trees (`sunlit-canopy`, `blossom-tree`, `whimsywood-tree`, `lantern-leaf-tree`, `giant-tree`), one `lotus-pond`, then two houses (`mossy-burrow`, `acorn-cottage`). The DIY tray and trash stay hidden. A failed stamp plays `arcade_wrong`. «В миры» or coach leave mid-build or at settle speaks `arcade_pause` and keeps the step. Closing the hatch sheet at settle stays on that lawn, marks the quest `done`, and uses the normal pad. Worlds are rooms of one zoo: arcade is the first empty garden, not a fourth kind.
4. No `pack_2`. After settle, unused free credit uses the normal pad and hatch; a spent free credit uses D-026 (draw → waiting paper → PackSheet `pack_1` / `pack_5`). Stylize does not start without a credit.
5. Arcade voice lines live in `cues.ts` as `arcade_*`. Missing MP3s stay silent. No child names, no prices in the child voice.
6. Meadow, grove, and later garden copies are not arcade worlds.

## Consequences

- Island events: `arcade.start`, `arcade.step`, `arcade.done`, `arcade.skip` (leave during build). Conversion to count is still `draw.open` / `friend.draw` / `friend.pay_sheet` after arcade.
- D-020’s 1190 ₽ price is for another garden, not the first empty zoo.
- Unity iteration 01 is unchanged.
