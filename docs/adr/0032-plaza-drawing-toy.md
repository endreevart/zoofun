# ADR-0032: Personal drawing-toy on the shared lawn

- Status: accepted (revised 2026-09-20)
- Date: 2026-09-19
- Revised: 2026-09-20
- Relates: D-016, D-023, D-024, D-026, D-029, D-031, ADR-0006, ADR-0029

## Context

Families asked to put a child's own drawing onto the shared lawn, not only catalog GLBs. D-029 hid original drawings and let anyone edit every stamp. A paid personal object cannot stay that open. The first cut was a still standee so 59 ₽ would not undercut `pack_1`. The product now grows that paid toy into a Tripo mesh **without** spending a creature 3D credit.

## Decision

1. **SKU** `plaza_toy_1`, seed **59 ₽**, T-Bank, parent-session only. Not a generation pack (D-024), not a world (D-020 / D-021). Settlement increments `plaza_toy_quota` by one. It must not raise `quota_total` or `still_used`.
2. **Result** is a lawn object: OpenRouter still first, then Tripo GLB (same 3.0 → 2.5 → Meshy 7 chain as a Zufik). No creature row, no Revive, no garden or meadow placement. Others see the hosted still or the mesh, never the original drawing.
3. **One purchase = one toy** in the family tray «Моё». The child may place as many copies of that toy as the lawn cap allows. Delete of a stamp does not refund the 59 ₽.
4. **Caps.** Ten toys per family (`plaza_toy_used` ≤ 10). They also count toward the shared-lawn cap **400**. Oldest catalog stamps yield when a new stamp needs room; paid toys stay. Checkout is refused at ten purchased slots.
5. **Who edits.** Catalog stamps stay “anyone seated may move or delete”. A `toy_*` stamp is owner-only.
6. **Job.** `POST /v1/plaza/toys` spends a plaza-toy slot, not a still or 3D credit. OpenRouter uses a lawn-toy prompt, not the creature contour prompt: glossy polymer-clay storybook sculpture (stacked gumdrop masses, carved clay wood), keep the child's colors and odd features, orbit the camera three-quarter so the still is volumetric, not a cookie of the sketch. After pay/commit the job's `mesh_status` goes pending and Tripo runs. Original upload is deleted after the still, same as a Zufik.
7. **Pay order.** Draw first. `POST /v1/plaza/toys/preview` paints the still without spending a slot and **does not** start Tripo. «Перерисовать» drops that paper. «Далее» opens the 59 ₽ gift sheet and a parent gate. `POST /v1/plaza/toys/commit` spends the slot, stores the standee, and starts the mesh. The island shows a preparing artifact (still + ring) in «Моё» and on the lawn until the GLB lands. If no slot remains, the painted job waits on the device (same idea as D-026) and the parent sees only `plaza_toy_1`, not `pack_1`. `ENVIRONMENT=development` credits the slot without T-Bank (`granted=true`) so commit + Tripo can run in place. Production returns from T-Bank onto the plaza with that preparing artifact.
8. **Promocodes** (D-023) may include `plaza_toy_1`. CRM «купил пакет» stays `pack_*` only.
9. **Legal.** Originals stay hidden. The generated still and mesh may appear on the shared lawn. Parent drawing consent covers a lawn object as well as a creature.

## Consequences

- Ledger columns `parents.plaza_toy_quota` / `plaza_toy_used`, table `plaza_toys`, Alembic `0024_plaza_toys` + `0025_plaza_toy_mesh` (`mesh_status`, `model_url`).
- D-029 is narrowed: everyone builds the catalog; personal toys are owner-edited.
- Unity iteration 01 is unchanged.
