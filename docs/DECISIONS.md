# Accepted product and architecture decisions

This file is the concise decision register. Detailed engineering decisions live in `docs/adr/`.

| ID | Decision | Status |
|---|---|---|
| D-001 | Audience is children aged 3–8 with a parent gate | Accepted |
| D-002 | Unity 6.3 LTS + URP is the primary client stack | Accepted |
| D-003 | The zoo is authored 3D; generated creatures are constrained 2.5D assets | Accepted |
| D-004 | Pilot care contains only feeding, water, and washing | Accepted |
| D-005 | First creation is free; further credits are T-Bank packs of 1/5/10/15/20, RUB only | Accepted (revised 2026-09-14) |
| D-006 | Russian external acquiring is excluded | Superseded by D-016 |
| D-007 | Friends, social content, leagues, and public ranking are post-pilot | Accepted |
| D-008 | Backend uses Docker, FastAPI, PostgreSQL, Redis, Celery, and object storage | Accepted |
| D-009 | OpenRouter and ElevenLabs are backend-only replaceable providers | Accepted |
| D-010 | Existing cached zoo content works offline | Accepted |
| D-011 | iPhone/iPad vertical slice precedes macOS stabilization | Accepted |
| D-012 | Official MCP servers are preferred; GitHub MCP is read-only by default | Accepted |
| D-013 | Current work is a non-commercial pilot for ≤10 children; no payments, StoreKit, credits, receipts, or purchase ledger; zoo must hold 20+ active animals | Superseded by D-016 |
| D-016 | Exit the non-commercial pilot: T-Bank web acquiring, generation credits, packs 1/5/10/15/20, first creature free, delete does not restore a credit; extra worlds later; no StoreKit or subscriptions | Accepted (worlds: D-019; pack of 1: D-024) |
| D-019 | Paid DIY twin of the current island: chooser «Волшебный остров» vs «Собери сам»; `world_diy_garden` 1190 ₽ once; child stamps without grass; cap 258; later islands get their own empty twin | Superseded by D-020 |
| D-020 | Repeatable DIY gardens: my-worlds vs shop; `world_diy_garden` may be bought many times; auto-named instances; creatures live on one world (20 each); care works on every owned lawn; move is offered, never automatic | Accepted |
| D-021 | Island kinds: each authored lawn has its own construction SKU, stamp catalog, and shop card. Garden is `world_diy_garden`. Meadow is `world_diy_meadow` (Висячий луг / Собери луг). Grove is `world_diy_grove` (Куболесье / Собери куболесье, 59 ₽). A later kind still needs assets and a decision | Accepted |
| D-014 | The public website signs a parent in with a one-time email code from info@zooo.fun or Yandex ID, then opens the Chudiki island; Kenney `/zoo/demo` stays the iteration-00 fixture garden | Accepted |
| D-015 | Web island attaches an image-to-3D GLB after stylize; the garden result is that GLB; Unity pilot and ADR-0003 stay 2.5D | Accepted |
| D-017 | PostgreSQL + Alembic is the account and payment ledger; SQLAdmin at `/staff` is the operator console; CRM may send consented mail and CRUD promocodes in the same database, not a second ledger | Accepted (revised 2026-09-14) |
| D-018 | Visual CRM at crm.zooo.fun reads the same Postgres; cookie banner + first-party site visits; `/play` first-party hop without Metrika; consented parent mail, cooldown mail rules, promocodes; family timeline; 48h mail effect without open-pixels; no second ledger | Accepted (revised 2026-09-14) |
| D-022 | Marketing site may show a live, anonymous strip of garden postcards (`GET /v1/public/garden`): OpenRouter “toy in the garden” stills only, no names, no original drawings, no account ids. Not a social gallery and not in the child UI | Accepted |
| D-023 | Promocodes: percent or fixed RUB on generation packs 1/5/10/15/20 and construction worlds; a code may cover all shop SKUs or a subset; quote must error instead of silently charging full price; T-Bank amount is the discounted payment | Accepted (revised 2026-09-14) |
| D-024 | After the free Zufik, the first paid offers are `pack_1` (seed 99 ₽) and `pack_5` (seed 399 ₽, marked «Выгоднее»). 10/15/20 stay behind a quiet expand. CRM “купил пакет” is generation packs only. First-touch UTM stays until payment. Construction copies stay a complement, not the first offer | Accepted |
| D-025 | A camera photo of a real pet is a second paint path: classify on the safety gate, keep that animal's silhouette, add small cartoon foolishness. Not the drawing clay-felt contour prompt. Child UI does not pick a mode. Uncertain uploads stay on the drawing path. Same credit, egg, mesh, and postcard flow | Accepted |

D-015 is the Chudiki island only. It does not replace ADR-0003 or change the Unity iteration gate. Image-to-3D keys stay backend-only and never ship in the client. The egg stays in the garden until a GLB is stored and attached; a queue delay, worker retry, or a failed Tripo/Meshy call must not open a 2.5D standee as the finished creature. The worker keeps `mesh_status` pending and re-enqueues until `model_url` exists. The island polls the same job until the GLB is on the creature, including after a reload. The island paints with FLUX.2 Pro and the contour prompt, then asks Tripo 3.0. If that call fails, it retries once with Tripo 2.5. Meshy 7 stays as a spare if both Tripo calls fail. A photograph classified as a real pet (D-025) uses the silly-silhouette prompt instead of contour, then the same Tripo/Meshy chain. Tripo traffic leaves the RU API host through `OPENROUTER_HTTP_PROXY` (or `TRIPO_HTTP_PROXY` if set); a transport timeout counts as a Tripo failure so the 2.5 / Meshy 7 chain still runs. Mesh queue/compute timings are recorded to `ops_logs` as `stylize.mesh_timing`. Alongside the mesh, the backend quietly paints one more OpenRouter still — the same figurine in the garden — stored on the API host and served as `postcard.png`; the roster's «Открытка из сада» button downloads it (owner request, 2026-09-06; one extra image call per creature).

D-025 is the Chudiki island only. The child camera does not grow a second button. After the existing safety gate, Gemini labels the upload `drawing` or `pet`. `pet` is only a clear photograph of a real domestic animal. A drawing of a dog, a photo of paper, a toy, or an uncertain frame stays on contour. The pet still keeps that animal's outline, markings, and colors and adds only small foolish cartoon features (mismatched eyes, a lopsided grin). It must not become a clay-felt potato or a catalog breed. The original photo is deleted after the still, like a drawing. If the gate is down, the job is a drawing. Unity iteration 01 is unchanged.

## Pending decisions

- Minimum supported Apple devices and OS versions after profiling the technical spike.
- Exact Zoo Stars formula after observing the pilot.
- Production cloud vendor and data region after privacy/legal review.
- App name, visual identity, and final narrator voice.
- Foreign acquiring and non-RUB prices (D-016 is RUB / T-Bank only).
- Extra biomes: D-021. Garden, meadow, and grove (Куболесье) are in the shop. Do not add a later kind until that island's assets exist.
- Extra CRM modules from kid that have no Zooofun counterpart (partners, blog CMS, push).
