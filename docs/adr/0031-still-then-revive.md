# ADR-0031: Harmonize first, revive on tap

- Status: accepted
- Date: 2026-09-19
- Revised: 2026-09-20 (album postcard until «В сад»; leftover 3D still starts Tripo)
- Relates: D-015, D-016, D-024, D-026, ADR-0006, ADR-0026

## Context

One generation credit currently buys the whole pipeline: FLUX still, garden postcard, and Tripo/Meshy GLB. After the free Zufik, drawing with remaining 0 stays on the device (ADR-0026) until the parent pays. Harmonization is cheap; the mesh is not. Families bounce when the second drawing is blocked or immediately paid.

## Decision

1. Two ledgers on the parent. 3D / revive stays `quota_total` / `generation_used`. Harmonization capacity is derived: `still_quota = 10 + 10 * max(0, quota_total - 1)`. Spent stills are `still_used`. Remaining stills do not reset on a purchase.
2. The first stylize on an account (`generation_used == 0`) is unchanged: one job, still + postcard + mesh, spends only the free 3D credit. It does not spend a still credit.
3. If leftover 3D credits remain, hatch «В сад!» and roster «В сад» spend one and start Tripo (the egg waits for the GLB). The first free stylize still starts the mesh as soon as the still is shown. When 3D remaining is 0, later drawings spend a still and stop at `mesh_status=deferred`. «В сад!» then opens PackSheet (`pack_1` / `pack_5`, 10–20 behind expand). 3D on those postcards can also start on **Оживить**.
4. Packs, operator grants, garden crystals, and plaza crystals still increment `quota_total`. Each extra 3D slot adds ten stills by the formula. A pack of 10 after the free Zufik is 10 revive credits and 110 stills if the starter ten were unused.
5. Delete restores neither ledger. ADR-0024 prices stay. ADR-0026 local paper exists only when `still_remaining` is 0.
6. A postcard without a mesh lives in **«Мои зуфики»** until hatch «В сад!», roster «В сад», or **Оживить**. The lawn egg appears only when leftover 3D starts Tripo. No 3D remaining → PackSheet, no egg. Do not extrude the still as a walkable cookie. A paid mesh job that is merely delayed still must not open a standee as the 3D result.
7. «Мои зуфики» can download the owner GLB. Guests cannot (D-028).

## Consequences

- `parents.still_used` is the only new column. Still quota is not stored.
- `POST /v1/generation/stylize` reserves 3D only on the first free job; later drawings reserve a still (`mesh_status=deferred`). Hatch «В сад!» / `POST /v1/generation/stylize/{id}/mesh` reserves leftover 3D.
- Existing paid families receive `10 + 10 * (quota_total - 1)` stills on migrate. That is accepted.
- Unity iteration 01 is unchanged.
