# Working state — Zooofun

Operational snapshot for agents and humans continuing the commercial web launch.
Product truth stays in `PRODUCT.md`, `DECISIONS.md`, and `docs/adr/`.
If this file and those disagree, stop and surface the mismatch.

Last assembled: 2026-09-19.

## What we are shipping

Public name: **Zooofun**. Domain: **https://zooo.fun**. Seller / data operator: **ИП Эндреев Константин Андреевич** (not ООО «Тык Мык Студио»). Legal source answers: `docs/legal/ДАННЫЕ_ДЛЯ_ДОКУМЕНТОВ.md`. OTP mail is `info@zooo.fun` via Mail.ru. Support mailbox in the legal pack is `cio@endreev.ru`.

Audience: children 3–8, parent holds the account and pays. UI must work for pre-readers. Recognition of the child's drawing (or the real pet) beats polish. No friends, chat, leagues, StoreKit, or subscriptions.

The commercial product is **`zoofun-web`** on `https://zooo.fun`. This repo is the API, island, CRM, and infra behind that site. Unity iteration 01 is a separate slice (`docs/PILOT.md`) and does not replace `zoofun-web`.

## Repos

| Repo | Role |
|------|------|
| `/Volumes/Siska/DEVELOP/zoofun-web` | **Commercial site** — landing, auth, pricing, `/play`, legal. This is `zooo.fun`. |
| `/Volumes/Siska/DEVELOP/zoofun` | API, Chudiki island, CRM, Unity, infra, product docs |

Local play path: zoofun-web `:3000` → API `:8000` (or Caddy `:8080`) → island Chudiki `:5178`. Production play path: `zooo.fun` → `/play` → `/island`.

## Production topology

Two VPS roles. Exact IPs stay out of git conversation.

1. **RF edge** — TLS, access logs, Caddy (`infra/Caddyfile.rf-edge`). Postgres listens on localhost there. App host reaches it through an SSH tunnel (`DATABASE_URL` on the app host).
2. **App host** — FastAPI `:8000`, Celery worker + beat, Chudiki nginx `:8081`, Next.js `:3000`, CRM static at `/opt/zoofun-crm/dist`. Host Caddy: `infra/Caddyfile.zooo.fun`.

Routing on `zooo.fun`:

- `/staff*`, `/v1/*`, `/health`, `/api/zoo/*` → API
- `/island*` → Chudiki
- `/landing/*.mp4`, `/mail*` → files from `/opt/zoofun-web/public`
- everything else → Next `:3000`
- `/admin` → `/staff`

`crm.zooo.fun`: `/v1/*` → API, else Vue SPA from `/opt/zoofun-crm/dist`.

There is no GitHub Actions deploy. Compose file `compose.pilot.yaml` is the API/worker/island/backup stack. Next and CRM are host processes / copied dist, not services in that compose. `Caddyfile.pilot` expects a `web` service that **does not exist** in `compose.pilot.yaml` — do not treat it as the live layout.

Nightly `pg_dump` lives in the pilot compose backup service (14-day retention).

Alembic runs on API startup (`init_schema`). Production DB is PostgreSQL.

## Git hygiene (important)

As of 2026-09-15 the live app host is the product truth. Local `main` was brought
in line with that tree (worlds, parent mail, promo, pet path, phone island,
unsigned `/island` → `/auth`). `handoff/evidence` stays untracked.

Do not reset production or this tree to an older `origin/main`. After this
reconciliation, push `main` so GitHub matches the live product.

Last committed zoofun themes: commercial worlds and island, T-Bank settlement by
bank state, Alembic logging, Tripo EU proxy, Flux + Tripo 3.0 hatch.

## Auth

- Parent email OTP: `POST /v1/auth/email/start` + `verify`. Codes from `info@zooo.fun`. Dev without SMTP uses a local outbox.
- Yandex ID: start / callback / complete. Empty `YANDEX_CLIENT_*` hides the button.
- Session is a bearer token. Site stores it; `/play` hands it to `/island` via query then storage (`chudiki/src/parentSession.ts`). Vite `pnpm dev` without a token calls `POST /v1/auth/dev-session` and keeps `dev@zoofun.local` (password `zoofun-dev`) so paint → gift → place can run without the website.
- First-touch UTM is kept until payment (`analytics/utm.py`, site `src/lib/utm.ts`, island `chudiki/src/utm.ts`).
- Password register/login is dev-only and blocked in production.

## Creature pipeline (web)

1. Child draws or photographs. No mode picker.
2. Safety gate (OpenRouter / Gemini) labels `drawing` or `pet` (D-025 / ADR-0025). Uncertain → drawing. Gate down → drawing.
3. Flux.2 Pro still: contour clay-felt for drawings; silly silhouette for a clear real pet photo.
4. Egg in the garden + 4 then 9 piece puzzle while the **first** mesh runs.
5. Mesh: Tripo 3.0 → one retry Tripo 2.5 → Meshy 7. RU host uses `OPENROUTER_HTTP_PROXY` (Tripo can override `TRIPO_HTTP_PROXY`). A transport timeout counts as a Tripo failure. The first free 3D starts Tripo with the still. Later drawings stop at a volumetric postcard (`mesh_status=deferred`) until hatch «В сад!» or «Оживить» spends leftover 3D (D-031). A delayed paid mesh must not open that standee as the 3D result.
6. Quiet extra still: garden postcard (`postcard.png`). Original upload is deleted after the still.
7. Public marketing strip may show those postcards only (`GET /v1/public/garden`, D-022). Never the original drawing or pet photo. Not a social gallery.

First creature is a free 3D (`quota_total` starts at 1) plus ten stills. Later stills follow `10 + 10 * (quota_total - 1)`. Delete does not restore a credit. The island does not seed bundled park animals (Цыпа, Хоботок, Жирафик, Крока).

Unity iteration 01 stays 2.5D fixtures. D-015 is Chudiki only.

## Worlds and shop

| Kind | Authored (free) | DIY SKU | Seed price |
|------|-----------------|---------|------------|
| garden | Волшебный остров (`authored`) | `world_diy_garden` | 1190 ₽ |
| meadow | Висячий луг (`authored_meadow`) | `world_diy_meadow` | 59 ₽ |
| grove | Куболесье (`authored_grove`) | `world_diy_grove` | 59 ₽ |

DIY copies are repeatable and auto-named. The first garden is granted free on `GET /v1/auth/me` (D-027); extra copies stay paid. Cap 20 creatures per world, 258 DIY props. Grass stamps stay out of the child catalog. Move between worlds is offered, never automatic.

Arcade (D-027): built, hidden on prod (`ARCADE_PUBLIC = false`). First garden is a normal free island. Flip the flag to show one-time training; DEV `?arcade` still previews. After `done` the lawn stays under «Мои острова». Record `arcade_*.mp3` from `chudiki/src/game/audio/cues.ts`; missing files stay silent.

Guest visits (D-028): `GET /v1/public/zoos`, `?visit=`, hearts on garden and Zufiks, joy lighting + air, vitrine. No original drawings, no guest download. A guest walk does not write host toys into the visitor's zoo; `PUT /v1/zoo` drops a mesh whose stylize job belongs to another family.

Shared lawn (D-029 / ADR-0029, D-030 / ADR-0030, D-032 / ADR-0032): «Общий зоопарк» from the worlds picker, living Zufik, rooms of 8, pictograms (`hello` `hooray` `wow` `love` `laugh` `play`). Picker cards use garden postcards. No living Zufik → draw/photo pad and `plaza_need`. One global catalog lawn: everyone sees catalog stamps and anyone seated may place/move/delete those (`GET/POST/PATCH/DELETE /v1/plaza/stamps`, `stamps_rev` on heartbeat). Personal drawing-toys (`plaza_toy_1` 59 ₽, tray «Моё») are owner-only lawn objects: OpenRouter still, then Tripo GLB, cap 10 purchased toys per family; a toy in «Моё» stays pickable and may be stamped many times, and those copies count toward 258. Paint preview is free; «Разместить за 59 ₽» always opens the parent gate, then T-Bank (or a local `granted` slot). After pay the island commits the standee, puts it in «Моё», holds a preparing ghost on the lawn, and grows the mesh. Local `ENVIRONMENT=development` grants that slot without T-Bank so paint → gift → Tripo can be tested on the lawn. Stamps auto-save (no Save button). Personal crystals (`crystal.glb`); smash in the centre; 8 generation credits per Moscow day for everyone (`POST /v1/plaza/dig`, `TICKETS_PER_DAY`). Demo currently puts a credit in every mound (`ALL_PRIZES`). A find lifts a glowing ticket on the lawn for a few seconds (everyone sees it), then opens the garden draw/photo pad. Hop on this lawn; no jump into another garden. Not a shop biome. Large grass plane until a small `plaza.glb` exists. Record `plaza_*.mp3` from `chudiki/src/game/audio/cues.ts`; missing files stay silent. Walk / jump / emoji / stamp / smash hits are synth (`plazaSfx.ts`).

Chudiki still has a local **cove** mock (`world_diy_cove`) that is **not** in `backend/app/worlds.py` and must not be sold (D-021).

## Commerce

T-Bank internet acquiring, RUB only. Parent session only. Card data stays on the bank page.

Seed packs in `backend/app/persistence/db.py`:

- `pack_1` 99 ₽
- `pack_5` 399 ₽
- `pack_10` 3490 ₽ (`featured=True` in DB seed)
- `pack_15` 4690 ₽
- plus pack of 20 in catalog
- `plaza_toy_1` 59 ₽ (D-032; not a generation pack; `plaza_toys` in catalog)

D-024 / island UI (`chudiki/src/ui/packShop.ts`): after the free Zufik, offer `pack_1` and `pack_5` («Выгоднее»). Larger packs stay behind a quiet expand. **DB `featured` on pack_10 and the island UI disagree** until an operator/catalog fix.

D-026 / ADR-0026: hatch «Нарисовать ещё» stays while stills remain. Leftover 3D starts Tripo on «В сад!»; when 3D remaining is 0 that button opens PackSheet (`pack_1` / `pack_5`). After the last still, a huge «Создать друга» still opens the pad with remaining 0. Closing it leaves a lawn chip until they draw or pay. «Оживить» stores a local draft and then opens PackSheet. Decline leaves a waiting paper («Ему будет скучно»). Stylize/egg wait for a credit. Later empty-quota visits draw the friend first; the parent `+` still opens the shop.

D-027 / ADR-0027: first empty garden is free. Arcade voice leads a short build, then the same settle path. Catalog is still D-024 (`pack_1` / `pack_5`). Authored lawns stay in the picker.

Promocodes (D-023): percent or fixed RUB on generation packs, DIY worlds, and `plaza_toy_1`. Quote must error instead of silently charging full price. CRM CRUD on the same Postgres. SQLAdmin `/staff` remains the write console for credits and list prices.

Settlement trusts T-Bank `GetState`, not the notification alone (commits `e0408c6`, `35d469d`).

## CRM and analytics

- `crm.zooo.fun` — Vue 3, operator login, same ledger.
- Funnels, traffic, usage, parents, creatures, packs, promos, payments, mail, ops (stuck meshes, abandoned checkout, family timeline). Return funnel + 1/7/30 % and a days control. Growth speed is how fast new families appear.
- Consented parent mail, cooldown rules, 48h effect **without** open-pixels.
- Cookie banner + first-party site visits. `/play`, `/zoo`, `/island` hide the banner. `/island` loads Metrika webvisor unless the parent chose necessary-only. `/play` still posts a first-party `play.open` hop.
- Island always sends product events (screens, shop, draw blocks/fails, visit, care, friend, arcade). The API also writes `auth.*`, `shop.checkout` / `shop.paid` / `shop.pay_fail` into the same `analytics_events` so cookie refusal or a closed tab does not hide the money path. No names, drawings, or mail in the payload.

## Public site (zoofun-web)

Landing: hero film, How band (draw → photo → live Zufik), Worlds band, Zufiki / garden postcard strip, occasions, footer legal links. i18n: ru/en/de/fr/ar.

Pricing: catalog + promo field + T-Bank checkout.

Legal HTML under `public/legal/` (mirrors in `zoofun/docs/legal/`). Consents required at sign-in.

`/zoo/demo` is the Kenney iteration-00 fixture, not the live family zoo.

The island is a PWA (D-033): Chromium can add a home-screen icon after «Установить приложение»; iOS still needs Share → Home Screen on `/island`. The worker does not cache drawings or API calls.

## Quality / mobile (open)

Low-tier phone path is in `chudiki/src/game/render/quality.ts` and `PostFx.ts` (DPR **2**, Save-Data 1.25, safe-mode 1, no MSAA/GTAO/bloom/shafts, FXAA, 30 FPS, 1024 shadows / 512 after context loss). Chrome/ANGLE iPhone emulation on 2026-09-15 held ~30 FPS on garden/meadow/grove; world-switch memory did not grow. Physical iPhone Safari is still unproven — see `handoff/evidence/mobile-optimization-2026-09-14/VERIFY-2026-09-15.md`. Do not collapse `whimsy-isle-mobile.glb` geometry. Packed extras keep quantized attributes on the mesh matrix (`packModel.ts`); `compileAsync` runs before the first frame; GLB loads cap at 2. GPU packs (Meshopt / KTX2) come from `chudiki/scripts/pack-gpu-glb.sh`.

Landing hero uses video (`HeroFilm`) plus stills; Caddy serves `/landing/*.mp4` as files with long cache.

## Local commands

zoofun:

```bash
cp .env.example .env
docker compose up --build
curl http://localhost:8080/health
make test
```

Backend on host: `cd backend && uv sync --frozen --extra dev && uv run pytest && uv run ruff check .`

zoofun-web: `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test`

CRM: `cd crm && pnpm dev` → `:5175`. Chudiki Vite proxy default has been `8010` in places while docs say `8000` — check `chudiki` vite config before assuming.

## Env names (never commit values)

See `.env.example`. Groups: Postgres, Redis, `USE_CELERY`, storage/S3, OpenRouter + proxy + models, Tripo/Meshy, operator/`ADMIN_SECRET_KEY`, T-Bank, `PUBLIC_SITE_URL`, Yandex OAuth, SMTP.

Also used in prod compose / settings but not always in `.env.example`: `CORS_ORIGINS`, `ACCOUNTS_PATH`, `DB_POOL_SIZE`, ElevenLabs keys (settings exist; island uses baked MP3 cues, not live ElevenLabs).

Clients must never hold provider, T-Bank, SMTP, or operator secrets.

## Docs mismatches to remember

| Topic | Treat as |
|-------|----------|
| Root `README.md` “no payments / non-commercial pilot” | Stale vs D-016 and the live site |
| `PILOT.md` | Correct for **Unity** only |
| `ARCHITECTURE.md` single-host diagram | Superseded by RF edge + app VPS + tunnel |
| `Caddyfile.pilot` + `web:3000` | Not the live compose |
| pack_10 `featured` seed vs D-024 island UI | Catalog/operator alignment needed |
| cove mock in Chudiki | Not a shop SKU |
| `backend/README.md` “small foundation” | Understates current API |

## Recent closed work (local tree, not necessarily committed)

- Meadow + grove authored worlds and DIY copies
- World picker, transfer, DIY hammer mode
- Promo field on site and island
- Landing rewrite (hero magic, How / Worlds / Zufiki)
- Yandex ID
- Pet-photo stylize path (D-025), deployed from the last long chat
- CRM mail, promocodes, ops loop, UTM first-touch
- T-Bank reconcile when notification is lost
- Legal pages for the ИП

## Open / next (from last session)

1. pack featured flag vs D-024.
2. cove mock still in the island client.
3. README / ARCHITECTURE drift.
4. No versioned deploy runbook (git pull / build / migrate / reload).

## Hard constraints (do not “helpfully” add)

- No friends list, chat, account discovery, StoreKit, subscriptions, foreign acquiring. Guest hearts/vitrine are D-028. Shared lawn emoji is D-029. Personal lawn 3D toys are D-032.
- No new island kind without assets + a decision.
- No OpenRouter / T-Bank / SMTP keys in Unity, island, website bundle, or MCP.
- Do not publish, deploy, merge, or change production data without an explicit ask.
- A partial or invalid creature must never appear. Cached animals stay playable offline.
- If code and `docs/` disagree, stop and say so.
