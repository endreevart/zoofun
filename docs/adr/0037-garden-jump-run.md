# ADR-0037: Full-screen jump-run on the free garden

- Status: accepted
- Date: 2026-09-22
- Relates: D-001, D-007, D-016, D-030, D-034, D-035, ADR-0035

## Context

ADR-0035 / D-034 / D-035 rejected a lawn «Бег» because the overlay was a thin landscape strip on a portrait phone (unplayable for ages 3–8) and because coins redeemed for a daily 3D credit.

A new art pack is a dedicated portrait (941×1672) and landscape (1672×941) side-run: felt Pushok, one jump, five levels of flowers. The owner wants it started from a stone plinth on the free authored garden when the child walks up to it.

## Decision

1. Put a **stone play-plinth** on the free garden only (`authored` / «Волшебный остров»). Guests, DIY copies, and arcade training do not get it.
2. Walking close (same style as the chest) shows a flower button. That opens a **full-screen** 2D canvas overlay, not a strip over the 3D lawn. Portrait and landscape use the matching layers. The 3D garden is frozen while the overlay is open.
3. The run is auto-run + jump. **Five levels**: flowers scale with the level (`3 / 6 / 9 / 12 / 15`), speed rises gently (~+22% per level, about 1.9× by level 5), and obstacles get denser. Clear a level to go on; after level 5 restart or «back to the garden». Hitting a bush, rock, or log is a bounce with a short invulnerability; flowers already taken stay. No fail card, no lives, no timer.
4. **No coins, no wallet, no 3D ticket.** D-035 stays rejected. Credits remain T-Bank packs and crystal tickets (D-016, D-030). There is no `run_wallets` table and no server API for this game.
5. Character art is the pack's Pushok run/jump poses. This is not a generated profile sprite.
6. Island event: `world.run` on open. CRM timeline may label it. The overlay is client-only.
7. **Public lawn 2026-09-22:** the plinth is hidden (`RUN_PUBLIC=false`). Code and art stay. Flip the flag to plant it again. Dev `?run` still opens the overlay locally.

## Consequences

- D-034's unplayable strip stays rejected. This ADR replaces that overlay with a full-screen jumper, not a revival of coins.
- D-035 stays rejected: playing does not grant a generation credit.
- Unity iteration 01 is unchanged.
- A later island kind does not inherit this plinth until a new decision.
