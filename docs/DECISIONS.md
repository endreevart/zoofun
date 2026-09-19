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
| D-007 | Friends list, chat, leagues, and search by person stay out. Guest walks, hearts, and the vitrine are D-028. A shared lawn with a chosen Zufik and emoji (no text) is D-029 | Accepted (revised 2026-09-18) |
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
| D-015 | Web island attaches an image-to-3D GLB after stylize or Revive; a deferred postcard/standee is the garden result until 3D is paid (D-031); Unity pilot and ADR-0003 stay 2.5D | Accepted (revised 2026-09-19) |
| D-017 | PostgreSQL + Alembic is the account and payment ledger; SQLAdmin at `/staff` is the operator console; CRM may send consented mail and CRUD promocodes in the same database, not a second ledger | Accepted (revised 2026-09-14) |
| D-018 | Visual CRM at crm.zooo.fun reads the same Postgres; cookie banner + first-party site visits; `/island` Metrika webvisor unless necessary-only; `/play` first-party hop; consented parent mail, cooldown mail rules, promocodes; family timeline; 48h mail effect without open-pixels; no second ledger | Accepted (revised 2026-09-16) |
| D-022 | Marketing site may show a live, anonymous strip of garden postcards (`GET /v1/public/garden`): OpenRouter “toy in the garden” stills only, no names, no original drawings, no account ids. Not a social gallery and not in the child UI | Accepted |
| D-023 | Promocodes: percent or fixed RUB on generation packs 1/5/10/15/20, construction worlds, and `plaza_toy_1`; a code may cover all shop SKUs or a subset; quote must error instead of silently charging full price; T-Bank amount is the discounted payment | Accepted (revised 2026-09-19) |
| D-024 | After the free Zufik, the first paid offers are `pack_1` (seed 99 ₽) and `pack_5` (seed 399 ₽, marked «Выгоднее»). 10/15/20 stay behind a quiet expand. CRM “купил пакет” is generation packs only. First-touch UTM stays until payment. Construction copies stay a complement, not the first offer | Accepted |
| D-025 | A camera photo of a real pet is a second paint path: classify on the safety gate, keep that animal's silhouette, add small cartoon foolishness. Not the drawing clay-felt contour prompt. Child UI does not pick a mode. Uncertain uploads stay on the drawing path. Same credit, egg, mesh, and postcard flow | Accepted |
| D-026 | After stills run out, «Создать друга» stays on the lawn until they draw or a 3D pack lands: draw first, PackSheet on «Оживить», no stylize until stills exist. Hatch «Нарисовать ещё» while stills remain; leftover 3D starts Tripo on «В сад!»; 3D remaining 0 → «В сад!» opens `pack_1` / `pack_5`. Empty stills with leftover 3D block drawing (garden / Revive). ADR-0024 catalog unchanged | Accepted (revised 2026-09-19) |
| D-027 | Arcade is the empty garden zoo: first `world_diy_garden` is granted free on `GET /v1/auth/me`; voice leads 5 pretty trees + 1 pond + 2 houses; settle reuses first-draw or D-026. Extra DIY copies and authored lawns stay. No pack_2. Arcade UI is off on the first prod ship (`ARCADE_PUBLIC`) | Accepted |
| D-028 | Guest visit of a snapshot lawn: child share link, short zoo number for search, hearts with counts, joy look, vitrine ranked by joy. No chat, no original drawings, no download for guests | Accepted |
| D-029 | Shared lawn «Общий зоопарк»: enter from the worlds picker with a living Zufik, rooms of 8, portraits + emoji, one global catalog lawn everyone sees and builds; personal drawing-toys are D-032 and owner-only | Accepted (revised 2026-09-19) |
| D-030 | Plaza mounds: personal crystals, centre smash; 8 generation credits per Moscow day for everyone on the lawn (raise `TICKETS_PER_DAY` later); find opens the garden draw/photo pad; plaza stamps auto-save, no Save button | Accepted |
| D-031 | Two ledgers: 3D `quota_total`/`generation_used` and derived stills `still_quota = 10 + 10 * max(0, quota_total - 1)`. First stylize bundles still+mesh and spends only 3D. Later drawings spend a still and sit as postcards; leftover 3D starts Tripo on hatch «В сад!» (or Revive). When 3D remaining is 0, «В сад!» opens PackSheet | Accepted (revised 2026-09-19) |
| D-032 | Personal plaza drawing-toy: SKU `plaza_toy_1` seed 59 ₽, T-Bank, then Tripo mesh without spending `quota_total`, cap 10/family, copies on the lawn, counts toward lawn 258, owner-only edit, originals stay hidden | Accepted (revised 2026-09-19) |
| D-033 | Island is a home-screen web app: Chromium can prompt, iOS needs Share → Home Screen, worker does not cache drawings or API, not StoreKit | Accepted |

D-015 is the Chudiki island only. It does not replace ADR-0003 or change the Unity iteration gate. Image-to-3D keys stay backend-only and never ship in the client. The first stylize on an account still waits as an egg until a GLB is stored. After that, a drawing may finish as a volumetric postcard (`mesh_status=deferred`) until Revive grows the mesh (D-031). A paid mesh job that is merely delayed must not open that standee as the 3D result: the worker keeps `mesh_status` pending and re-enqueues until `model_url` exists, and the island polls that job. The island paints with FLUX.2 Pro and the contour prompt, then asks Tripo 3.0. If that call fails, it retries once with Tripo 2.5. Meshy 7 stays as a spare if both Tripo calls fail. A photograph classified as a real pet (D-025) uses the silly-silhouette prompt instead of contour, then the same Tripo/Meshy chain. Tripo traffic leaves the RU API host through `OPENROUTER_HTTP_PROXY` (or `TRIPO_HTTP_PROXY` if set); a transport timeout counts as a Tripo failure so the 2.5 / Meshy 7 chain still runs. Mesh queue/compute timings are recorded to `ops_logs` as `stylize.mesh_timing`. Alongside the mesh, the backend quietly paints one more OpenRouter still — the same figurine in the garden — stored on the API host and served as `postcard.png`; the roster's «Открытка из сада» button downloads it (owner request, 2026-09-06; one extra image call per creature).

D-025 is the Chudiki island only. The child camera does not grow a second button. After the existing safety gate, Gemini labels the upload `drawing` or `pet`. `pet` is only a clear photograph of a real domestic animal. A drawing of a dog, a photo of paper, a toy, or an uncertain frame stays on contour. The pet still keeps that animal's outline, markings, and colors and adds only small foolish cartoon features (mismatched eyes, a lopsided grin). It must not become a clay-felt potato or a catalog breed. The original photo is deleted after the still, like a drawing. If the gate is down, the job is a drawing. Unity iteration 01 is unchanged.

D-026 is the Chudiki island only. Local paper without stylize exists only when `still_remaining` is 0 and 3D remaining is also 0. While stills remain, a drawing goes to the API as a postcard creature. If leftover 3D remains, hatch «В сад!» spends it and starts Tripo. If stills are gone and 3D credits remain, drawing is blocked; Revive or hatch «В сад!» spends 3D. When 3D remaining is 0, «В сад!» opens PackSheet (`pack_1` / `pack_5`). The catalog is still D-024. Unity iteration 01 is unchanged.

D-031 is the Chudiki island only. Harmonization and revive are separate ledgers. Still capacity is `10 + 10 * max(0, quota_total - 1)` and is not stored. The first stylize spends the free 3D credit and does not increment `still_used`. Later stylize jobs reserve a still and set `mesh_status=deferred`. Hatch «В сад!» with leftover 3D, or `POST /v1/generation/stylize/{id}/mesh`, spends 3D and starts the mesh. When remaining is 0, «В сад!» opens PackSheet. Packs, operator grants, and plaza crystals raise `quota_total` and therefore still capacity. Delete restores neither. Unity iteration 01 is unchanged.

D-027 is the Chudiki island only. The first empty garden is granted free. Authored worlds stay in the picker. Extra `world_diy_garden` copies stay 1190 ₽. Arcade does not generate a Zufik; settle is the existing pad, and a spent free credit uses D-026. The arcade quest stays hidden until `ARCADE_PUBLIC` is flipped. Unity iteration 01 is unchanged.

D-029 is the Chudiki island only. The shared lawn is not a sold biome. The child enters with a living Zufik from the worlds picker. Other families see the stylized toy and optional nickname, not the original drawing. Emoji only. Construction uses catalog GLBs on one global lawn: everyone sees those stamps and anyone seated may place, move, or delete them. Personal drawing-toys (`toy_*`, D-032) are owner-only. Stamps auto-save; there is no Save control. Unity iteration 01 is unchanged.

D-030 is the Chudiki island only. Crystals on the shared lawn are a small hunt. Walking close shows smash. Eight generation credits per Moscow day are shared by every family (`TICKETS_PER_DAY`, `plaza_meta.ticket_day` / `ticket_used`). That is not a farm and does not replace T-Bank packs (D-016). A find uses the same draw/photo/close pad as the garden start. Unity iteration 01 is unchanged.

D-032 is the Chudiki island only. A parent may buy `plaza_toy_1` (seed 59 ₽) so a child's drawing becomes a 3D object on the shared lawn. It is not a generation pack and not a world. Settlement increments `plaza_toy_quota` only — Tripo runs after commit without spending `quota_total`. Draw first; OpenRouter paints a free preview; pay (or an unused slot) commits the standee and starts the mesh. The lawn shows a preparing still until the GLB is ready. Ten toys per family; copies of each may stand on the lawn and count toward cap 258 with catalog stamps. Others see the hosted still or mesh, never the original. Delete of the stamp does not refund. Unity iteration 01 is unchanged.

D-033 is the Chudiki island (and the same-origin `zooo.fun` manifest). A parent may pin the zoo to the home screen. The browser still asks once; the site cannot place the icon by itself. iOS uses Share → Home Screen while `/island` is open. The island service worker must not cache drawings or `/v1`. Unity iteration 01 is unchanged.

## Pending decisions

- Minimum supported Apple devices and OS versions after profiling the technical spike.
- Exact Zoo Stars formula after observing the pilot.
- Production cloud vendor and data region after privacy/legal review.
- App name, visual identity, and final narrator voice.
- Foreign acquiring and non-RUB prices (D-016 is RUB / T-Bank only).
- Extra biomes: D-021. Garden, meadow, and grove (Куболесье) are in the shop. Do not add a later kind until that island's assets exist.
- Extra CRM modules from kid that have no Zooofun counterpart (partners, blog CMS, push).
