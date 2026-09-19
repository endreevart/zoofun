# ADR-0030: Plaza mound credit

- Status: accepted
- Date: 2026-09-18
- Revised: 2026-09-19
- Relates: D-016, D-026, D-029, ADR-0007, ADR-0029

## Context

The shared lawn (D-029) is a third place with walking, emoji, and catalog stamps. Families asked for a small play loop there, not only building. Generation credits are otherwise T-Bank packs (D-016) after the first free Zufik.

A per-family lifetime ticket was too tight: the hunt felt empty after one find, and later kids that day never saw a prize.

## Decision

1. Crystal prisms appear on the shared lawn for each seated visitor. They are personal (not a PvP race). A hunt keeps **30 crystals** on a walkable lawn of about 280 m radius. A smash removes that crystal and a new empty one appears, so crystals may keep showing up all day.
2. Walking up to a mound shows a centre **ломать** control. Breaking a mound is a local smash. Eight crystals in a hunt may hide a ticket; the rest are empty. Which ones pay is chosen server-side and never sent to the client.
3. **Eight generation credits per Moscow calendar day** are shared by everyone on the lawn. `TICKETS_PER_DAY = 8` in `app/plaza/tickets.py` is the knob to raise later. Each find is `quota_total += 1` while `plaza_meta.ticket_used` for that day is under the cap, locked with the parent row. When the eight are gone, mounds stay smashable but empty until tomorrow.
4. A find lifts the ticket picture on the lawn for a few seconds, glowing, so everyone on the shared lawn can see it. Then the finder gets the garden draw / photo / close pad. There is no explosion. `plaza_found.mp3` is not a real recording yet; the find plays a short chime until an ElevenLabs clip is dropped.
5. Stamps on the lawn stay auto-saved. There is no child Save button on the plaza.
6. Unsigned or unseated play may still smash local mounds; it does not invent a ledger credit.

## Consequences

- D-016 stays the shop. This is a small daily pool, not a farm.
- Unity iteration 01 is unchanged.
- Island events: `plaza.dig` with `{found}`.
