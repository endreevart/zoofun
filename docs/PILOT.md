# Current pilot delivery

This file is the source of **current staged delivery** for the non-commercial test group of up to 10 children. It does not change the approved product scope in `docs/PRODUCT.md` and `docs/MVP.md`.

The next product stage starts only after an external review returns `PASS`.

## What the product still is

Virtual Zoo remains a child-first game: a drawing becomes a recognizable 2.5D creature inside one authored zoo. Commerce is deferred. See `docs/MVP.md` for the full included and excluded feature lists.

## What this repository is building now

Delivery is sliced. **Iteration 01 is Unity Zoo Runtime only.**

In iteration 01 the child can open the Unity project and see one compact fairy-tale zoo with at least 20 unique local fixture animals moving with `walk`, `hop`, `fly`, and `float`, plus a limited landscape camera.

The current visual working scene for the Iteration 01-A environment rework is `ZooIdyllicGarden`. `ZooGarden` remains the technical Kenney baseline and must not be deleted. `ZooArtDirection` is kept as a failed visual attempt and is not the pilot look.

## Not in iteration 01

These remain in the approved product scope but are **not implemented in this iteration** and must not be stubbed here:

- in-app drawing and paper-drawing import
- device camera / photo picker
- backend generation, OpenRouter, ElevenLabs
- creature cards, narration, feeding, water, washing
- parent-account cloud save
- payments, StoreKit, subscriptions, credits, receipts

Pilot fixtures are bundled read-only content (`StreamingAssets/VirtualZoo/Fixtures`). That folder is not the writable cache for later generated animals.

The public website (`zoofun-web`) and the Chudiki playground are a separate slice from Unity iteration 01. Parent email login there opens the island world; it does not replace or advance the Unity review gate.

## After `PASS`

Later iterations may add drawing, import, backend generation, and care without changing the product definition in `docs/MVP.md`.
