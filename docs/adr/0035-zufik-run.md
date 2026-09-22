# ADR-0035: Lawn side-run

- Status: rejected
- Date: 2026-09-21
- Relates: D-007, D-016, D-026, D-030, D-031, D-034, ADR-0006, ADR-0030

## Context

A lawn plinth opened a 2D side-run overlay («Бег») so a child could jump, collect coins, and redeem 150 coins for one 3D credit a day. The overlay sat as a thin landscape strip on a portrait phone, covered itself with a stop card, and was not a game a 3–8-year-old could play.

## Decision

Rejected. Remove the plinth, overlay, profile-sprite job, `run_wallets` / `run_sprites`, and the daily run ticket. Generation credits stay T-Bank packs and crystal tickets (D-016, D-030). Care remains washing and feeding (D-004).

## Consequences

- D-034 and D-035 are rejected.
- Do not put a second WebGL loop or a clipart trail on the live lawn in place of this overlay.
- A later full-screen jumper without credits is ADR-0037, not a revival of this overlay.
