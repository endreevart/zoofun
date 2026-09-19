# Chudiki island

Playable zoo. `chudiki/src/App.tsx`, game `chudiki/src/game/Game.ts`. Parent token from `/play` query → `parentSession.ts`. Vite without a token calls `POST /v1/auth/dev-session` (`dev@zoofun.local`). API `chudiki/src/api.ts`.

Worlds: `game/world/kinds.ts` + layouts in `public/layout/`. Authored: `authored`, `authored_meadow`, `authored_grove`. DIY SKUs match `mem:backend/core`. First garden is granted free on `/v1/auth/me` (D-027). Move is offered (`MoveCreaturesSheet.tsx`), never automatic. `world_diy_cove` is a client mock — do not sell.

Arcade (D-027): quest on empty garden — 5 pretty trees, pond, 2 houses, then first-draw or friend-then-pay. Tray hidden. Persist `chudiki.arcadeQuest.v2`. Close / «В миры» leaves to picker. Cues `arcade_*` in `cues.ts`.
Shared lawn (D-029 / D-030 / D-032): cues `plaza_*` in `cues.ts`. Walk/jump/emoji/stamp/smash hits are synth in `plazaSfx.ts`. Mounds: `POST /v1/plaza/dig`, 8 credits/day for everyone (`TICKETS_PER_DAY`). Tray «Моё» is drawing-toys 59 ₽ (`plaza_toy_1`), owner-only still then Tripo mesh. A toy in the tray stays pickable; copies may stand on the lawn. After the parent gate the standee is saved into «Моё» as a preparing artifact and held on the lawn until the GLB lands. While Tripo runs, `plaza_toy_wait` shows a plaque. No Save button. Intro card follows plaza_hello..walk.
Guest visits (D-028): vitrine, `?visit=`, hearts with counts, joy look. No original drawings, no guest download.

Draw/photo → stylize → egg + puzzle → GLB. No mode picker. Care: wash/feed 2D mini-games, no fail state. Shop: `ui/packShop.ts` (pack_1 + pack_5 after free hatch), `PromoField.tsx`. After arcade settle with remaining 0, same D-026 hold-draft path.

Phone GPU: `game/render/quality.ts`. iPhone Safari is the hard case (half-float composer can go black; cap FPS / shadows / grass). Codex may still be changing this — treat live files as source after that lands.

Audio: baked MP3 cues in `public/audio/cues/`, not live ElevenLabs.

Without a session the zoo is IndexedDB-only.

PWA (D-033): `public/sw.js` is network-passthrough (no drawing/API cache). `pwa.ts` registers it and captures `beforeinstallprompt`. `InstallHint` shows «Установить приложение»; Chromium runs the install sheet, iOS opens a two-picture Share → Home guide. Icon opens `/island/`.
