# ADR-0030: Island crystal credit

- Status: accepted
- Date: 2026-09-18
- Revised: 2026-09-21
- Relates: D-016, D-021, D-026, D-029, ADR-0007, ADR-0029

## Context

Families asked for a small hunt on the grass, not only building. Generation credits are otherwise T-Bank packs (D-016) after the first free Zufik. The first version lived only on the shared lawn (D-029): 30 crystals and eight credits a day for everyone. That lawn is hidden from the picker for now. The hunt should still exist where the child actually walks: every family island.

A per-family lifetime ticket was too tight: the hunt felt empty after one find.

## Decision

1. **Every family zoo** (free authored lawns and owned DIY copies of garden / meadow / grove) keeps **five** personal crystals on the grass. A smash removes that crystal and a new empty one appears, so five may stay visible all day. Coordinates sit in a ring around the lawn centre (`0, -5`, radius 6–18 m on the garden isle). Guests never see or smash them.
2. Walking the camera (or a driven Zufik) up to a crystal shows a centre **ломать** control. Arcade training and DIY build hide that button. Breaking a crystal is a local smash. Two crystals in a hunt may hide a ticket; the rest are empty. Which ones pay is chosen server-side (`GET /v1/zoo/crystals`, `POST /v1/zoo/crystals/dig`) and never sent to the client.
3. **Two generation credits per Moscow calendar day per zoo.** `WORLD_TICKETS_PER_DAY = 2` in `app/plaza/tickets.py`. Ledger is `world_tickets` keyed by `(parent_id, world_id)` with `ticket_day` / `ticket_used`. Each find is `quota_total += 1` while that row is under the cap, locked with the parent row. When the two are gone, crystals stay smashable but empty until tomorrow. A second zoo the same day has its own two.
4. A find waits a short beat, then opens the garden draw / photo / close pad. There is no explosion. `plaza_found.mp3` is not a real recording yet; the find plays a short chime until an ElevenLabs clip is dropped.
5. Unsigned play may still smash five local crystals; it does not invent a ledger credit. At most two local “finds” a day, same as the signed cap.
6. Plaza APIs keep the older hunt (30 crystals, eight credits a day for everyone on `plaza_meta`) while «Общий зоопарк» is hidden. Do not delete that path until the lawn is public again or a later decision drops it.

## Consequences

- D-016 stays the shop. This is a small daily pool, not a farm.
- Three authored lawns plus many DIY copies each grant two tickets a day. That is the asked per-zoo cap. A later family-wide cap needs a new decision.
- Unity iteration 01 is unchanged.
- Island events: `world.dig` with `{found, world_id}`. Plaza still emits `plaza.dig` if that lawn is listed.
