# ADR-0036: Daily ЗУФАН chest

- Status: accepted
- Date: 2026-09-22
- Relates: D-001, D-007, D-030, ADR-0007

## Context

Kid (MIO) already keeps a moderated catalog «Открытия МИО». Zooofun wants a small daily find on the family islands that is not a generation credit. The child should meet a treasure chest, open it, and hear a parent read a short fact. Voice for that text is out for now.

Live queries to the Kid database are not a Zooofun runtime dependency. Credentials for that host must not enter this repo.

## Decision

1. Copy **approved, published facts** from Kid into Zooofun Postgres (`zufan_discoveries`). The child-facing name is **«Открытия ЗУФАН»**. Quizzes, missions, and image quizzes stay out: they need answers or an action. The island shows title + body only. No TTS.
2. Each signed-in family has **at most one unopened chest**. It lands on a **random** lawn the family can enter (the three free authored islands plus owned DIY copies). Coordinates sit in the same ring as crystals. Guests never see it.
3. The chest **stays until opened**, including past Moscow midnight. Opening it is the daily cap: a new chest may spawn on the **next Moscow calendar day**, not the same day.
4. The fact is chosen at spawn. Unseen catalog ids are used first. After the family has opened **every** active fact, later chests may repeat.
5. APIs: `GET /v1/zoo/chest`, `POST /v1/zoo/chest/open`. The fact text is returned only on open. Island event: `world.chest`.
6. The Meshy pawprint chest GLB lives at `chudiki/public/plaza/chest.glb` (textures shrunk). It is a hunt object, not a DIY stamp.
7. Operators moderate the catalog in CRM `crm.zooo.fun` → «Открытия ЗУФАН» (same Kid draft queue: filters, publish, reject). Approved facts are what the chest can pick. Seed JSON only inserts missing ids; it does not overwrite CRM status.

## Consequences

- This is not a credit, pack, or later biome. D-016 / D-030 stay unchanged.
- Unity iteration 01 is unchanged.
- Re-import from Kid is a one-shot ops copy, not a live link.
