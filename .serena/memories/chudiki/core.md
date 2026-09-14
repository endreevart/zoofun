# Chudiki island

Playable zoo. `chudiki/src/App.tsx`, game `chudiki/src/game/Game.ts`. Parent token from `/play` query → `parentSession.ts`. API `chudiki/src/api.ts`.

Worlds: `game/world/kinds.ts` + layouts in `public/layout/`. Authored: `authored`, `authored_meadow`, `authored_grove`. DIY SKUs match `mem:backend/core`. Move is offered (`MoveCreaturesSheet.tsx`), never automatic. `world_diy_cove` is a client mock — do not sell.

Draw/photo → stylize → egg + puzzle → GLB. No mode picker. Care: wash/feed 2D mini-games, no fail state. Shop: `ui/packShop.ts` (pack_1 + pack_5 after free hatch), `PromoField.tsx`.

Phone GPU: `game/render/quality.ts`. iPhone Safari is the hard case (half-float composer can go black; cap FPS / shadows / grass). Codex may still be changing this — treat live files as source after that lands.

Audio: baked MP3 cues in `public/audio/cues/`, not live ElevenLabs.

Without a session the zoo is IndexedDB-only.
