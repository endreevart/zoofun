# ADR-0029: Shared lawn (Общий зоопарк)

- Status: accepted (revised 2026-09-21)
- Date: 2026-09-18
- Revised: 2026-09-21
- Relates: D-007, D-022, D-028, ADR-0028

## Context

D-007 kept friends, chat, and account discovery out. D-028 is a snapshot walk of one family's garden plus hearts. Families asked for a place where children can stand next to other toys without a chat.

A full Idyllic island with live walking and many GLBs would stall phones. One global instance would also stall the product story: empty most of the day, overcrowded at a spike.

Legal copy said families do not meet. The offer and the children-privacy notice are revised with this decision.

## Decision

1. **Общий зоопарк** is a third place: not my garden, not a guest snapshot. It is not a fourth shop biome (D-021) and not for sale.
2. Entry is from the worlds picker when `PLAZA_PUBLIC` is true. The child picks a **living** Zufik (stylized still or mesh). Eggs and the unpaid friend paper cannot enter. The banner is hidden until that flag is flipped.
3. Presence is rooms of **8**. Redis holds seats with a short TTL; the island heartbeats. No WebSocket, no synced walking.
4. On the lawn the child is that Zufik. Other seated toys show the hosted mesh when it exists (`GET /v1/plaza/models/{spec_id}` for the current room). If there is no mesh, a stylized still standee. Original drawings stay off the lawn.
5. Communication is a fixed pictogram set (`hello`, `hooray`, `wow`, `love`, `laugh`, `play`). No text, voice, nick of the child, email, or original drawing. Creature nickname may show.
6. No jump from the lawn into another family's garden. Leave returns to the worlds picker. A hop on this lawn is local (Space or the jump button) and does not open another zoo.
7. The live counter on the banner is the real seat count, never a padded number.
8. A small dedicated GLB (ground, a few props, ~8 spawn marks) may replace the placeholder yard when the art exists. It is not a new island kind. Until then the grass plane is large (`PLAZA_PLANE`).
9. **Everyone sees and everyone builds catalog stamps.** Catalog GLBs (garden + meadow + grove, no grass, no original drawings) live in one global lawn, not per room. Cap **400**. When the lawn is full, the oldest catalog stamp vanishes so a new tree or house can land. Paid drawing-toys (`toy_*`) never auto-yield; if the lawn is only those toys, place returns `plaza_full`. REST place/move/delete plus poll on `stamps_rev`; no WebSocket. Anyone seated may edit any catalog stamp. Personal drawing-toys are D-032 and owner-only. Presence stays rooms of 8; walking is not synced. The island loads and shades only stamps near the walking child. Phone and tablet use a wider load ring so a pulled-back camera still sees trees.

## Consequences

- D-007 is narrowed: no friends list, no chat, no search by person; a presence lawn with emoji is allowed.
- Terms and children-privacy must match this text.
- Unity iteration 01 is unchanged.
- Island events: `plaza.open`, `plaza.enter`, `plaza.emote`, `plaza.leave`.
- Other seated toys may fetch the hosted mesh for the current room (`GET /v1/plaza/models/{spec_id}`). Original drawings stay off the lawn.
- Personal 3D drawing-toys on this lawn are ADR-0032.
