# Iteration 01-A — Premium Art Direction

## Status

`READY_FOR_REVIEW`

This is a visual spike only. It does not assign `PASS`. Iteration 01 (`ZooGarden`) is not declared passed. Iteration 02 was not started. Backend, drawing import, AI generation, web UI, and payments were not touched.

External review of Iteration 01 returned `ART_DIRECTION_REJECTED`. Kenney Nature Kit remains a temporary technical placeholder in `ZooGarden` and is not used in the new scene.

## What this spike is

A separate hero fragment that should read as a modern family 3D animation: soft, volumetric, warm, and original. It is not a copy of any existing studio, film, or location.

Concept target (art properties only, never used as a texture or background):

`handoff/references/virtual-zoo-art-direction-v1.png`

New scene: `client/VirtualZoo/Assets/VirtualZoo/Scenes/ZooArtDirection.unity`  
Unchanged baseline: `ZooGarden.unity`

## Unity version

- Editor: `/Applications/Unity/Hub/Editor/6000.3.22f1/Unity.app/Contents/MacOS/Unity`
- Project: `6000.3.22f1 (1c726e1fb402)`
- Blender: `/Applications/Blender.app` 5.1.2

## Art sources

No packs were downloaded or purchased.

| Asset | Location | License |
| --- | --- | --- |
| Original Blender prototype kit | `client/VirtualZoo/Assets/VirtualZoo/Art/PremiumPrototype/` | First-party; `PremiumPrototype/LICENSE.md` |
| Authoring `.blend` | `art-source/blender/premium_prototype.blend` | First-party |
| Pipeline | `tools/blender/build_premium_prototype.py` | First-party |
| Kenney Nature Kit 2.1 | `ThirdParty/Kenney/NatureKit/` | CC0 — **ZooGarden only**, not in `ZooArtDirection` |
| Eight hero fixtures | `StreamingAssets/VirtualZoo/Fixtures/` | First-party drawings |

Registry: `docs/ART_ASSET_REGISTRY.md`

Folder split in the hero scene: `Art/Environment`, `Art/Props`, `Art/Vegetation`, `Art/Architecture`. Runtime creature cache remains separate. Environment is authored, not generated at play time.

## Hero fragment

One compact zoo corner:

- Soft meadow with a winding terracotta path
- Turquoise pond with lily pads and reeds
- Arched wooden bridge with round rails
- Cloud-like tree canopies (three authored variants, not Kenney copies)
- Bushes, flower clusters, rounded rocks, lanterns
- Stone gate and story tower in the layered background
- Perspective camera, FOV 34°, warm directional light, soft shadows, trilight ambient, reflection probe, light probes, ACES on a **scene volume** (ZooGarden is not restyled), mild bloom, warm grade, linear fog
- Eight fixture creatures with `CreaturePresentationV2`

Creatures keep drawing silhouette, colors, and oddities. Presentation is a thin double card (CreatureCard cutout + wrap lighting), one tail nub, squash-and-stretch, sway, contact shadow, and cylindrical billboard toward the camera.

## Visual check (full-size stills)

Opened and inspected:

1. `handoff/evidence/iteration-01a/art-direction-hero-16x9.png`
2. `handoff/evidence/iteration-01a/art-direction-hero-4x3.png`
3. `handoff/evidence/iteration-01a/art-direction-closeup-creature.png`
4. `handoff/evidence/iteration-01a/art-direction-pond-bridge.png`
5. `handoff/evidence/iteration-01a/art-direction-environment-only.png`

Plus eight motion frames `art-direction-motion-01.png` … `08.png` (camera orbit, foliage sway, water bob, walking/flying/floating creatures).

What reads:

- Pond is opaque turquoise (pond-bridge still has a large turquoise region; earlier captures had zero turquoise pixels)
- Bridge is an arch over water, not a Kenney module
- Foreground / midground / background layers, gate and tower in haze
- Warm sun and fog, not a grey top-light
- Creatures sit in the world with contact shadows
- No Kenney props in this scene (PlayMode check: `KenneyProp` count = 0)

Remaining gap versus the concept target (reviewer must judge class):

- Stylization is still soft-poly / toy-like, not a film-lighting finish
- Meadow reads warmer/tan in the path-centered hero; grass is greener at the sides
- Water is a shaded opaque dish, not refractive depth
- Creature thickness is a thin card, not a clay sculpture

## Technical checks

| Check | Result |
| --- | --- |
| Scene generate | `ZOO_ART_DIRECTION_GENERATE_OK` |
| Evidence | `ZOO_ART_STILLS_OK`, `ZOO_ART_EVIDENCE_CAPTURE_OK frames=8` (`-force-metal`) |
| EditMode | **17 passed**, 0 failed (`editmode-results.xml`) |
| PlayMode | **10 passed**, 1 skipped (Explicit ZooGarden soak), 0 failed. Includes both art tests and all eight ZooGarden runtime tests |
| Missing meshes/materials | 0 (PlayMode art test) |
| Project console errors (FPS run) | 0 |
| 60 s Mac Metal | `fpsAverage=60.02`, `activeCreatures=8`, `secondsBelow30Fps=0.00` — `handoff/evidence/iteration-01a/fps-60s.json` |
| Game View 16:9 / 4:3 | Hero stills 1920×1080 and 1600×1200 |

Unity Editor QuickSearch still throws `ArgumentOutOfRangeException` on an empty index. That is an Editor bug, counted as `EditorSearch`, not a Virtual Zoo project error.

`ZooGarden` was not rebuilt. `ZooArtDirectionGenerator` does not call `ZooContentGenerator`.

## What was not done

- Iteration 02
- Backend, OpenRouter, drawing import, web UI, payments
- All 20 animals in the art scene (eight hero fixtures only)
- Large open world, UI, interactions
- Purchased or downloaded third-party packs
- Five-minute soak (not required for this visual gate)
- `PASS`

## ZIP

`outputs/virtual-zoo-iteration-01a-art-direction.zip`

Excludes `Library`, `Temp`, `Logs`, `Builds`, `UserSettings`, caches, `.git`, `.env`, `outputs/`, and zip files.
