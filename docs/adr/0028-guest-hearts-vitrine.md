# ADR-0028: Guest walks, hearts, and the zoo vitrine

- Status: accepted
- Date: 2026-09-17
- Relates: D-007, D-022, D-026, D-027, D-028

## Context

Families wanted to show a finished garden and receive only warm feedback. D-007 kept friends, chat, and ranking out of the pilot. D-022 is still a nameless postcard strip on the marketing site, not a walk.

## Decision

1. A lawn with at least one living Zufik gets a stable public share id. The child may copy or system-share `?visit={id}`. The id is not rotated.
2. A guest opens a snapshot: stamps, stylized toys, hosted stills/postcards. No original drawings, no parent email, no download, no shop, no arcade, no care. The snapshot is not copied into the visitor's family zoo (client skips persist; the API rejects another family's mesh).
3. Hearts only. One heart per visitor per garden and per Zufik. Counts are visible. Garden joy = garden hearts + Zufik hearts. Joy changes sky warmth, air specks, and how lively the lawn feels. Guest entry rains hearts by count. The owner sees a quiet catch-up on the heart, not a timed push.
4. The vitrine (`GET /v1/public/zoos?offset=&limit=&q=`) is the ranking shelf: cards ordered by joy, heart number on the card, no “you are 847th”, no total cap. Pages of 24. Top three may glow. A family’s own card may say «Это твой». Each lawn has a short public number (`№ 1042`) for search and `?visit=1042`. The opaque share id stays; the number is not a parent or child name.
5. Guest album is the roster shell without download: stylized face, name, heart + count. The owner sees the same numbers on nameplates and the garden heart.

D-022 stays the site strip. This is the playable visit. Chat, nicknames, search by person, and leagues stay out.

## Consequences

- Island events: `visit.open`, `visit.heart`, `visit.share`.
- Terms that said families do not meet need a legal pass; the visit is still not chat.
- Unity iteration 01 is unchanged.
