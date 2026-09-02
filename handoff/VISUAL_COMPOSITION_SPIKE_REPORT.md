# Visual composition spike — one authored hero zone

## Status

`READY_FOR_VISUAL_REVIEW`

This does not assign `PASS`. Iteration 02 was not started. Backend, import, generation, OpenRouter, ElevenLabs, creature cards, care, web, and payments were not touched.

`ZooIdyllicGarden`, `ZooGarden`, `ZooArtDirection`, `ZooVisualHeroSpike`, and `Assets/Idyllic Fantasy Nature/` were not edited.

Animals were left out on purpose. This pass is environment, camera, and route only.

## What this pass is

One small authored hero zone in a cloned demo lighting host — not three camera/grade variants.

The previous A/B/C stills and `baseline-comparison.png` were left on disk. They are not this review’s subject.

Working scene: `client/VirtualZoo/Assets/VirtualZoo/Scenes/ZooVisualCompositionSpike.unity`  
Builder: `client/VirtualZoo/Assets/VirtualZoo/Editor/VisualCompositionSpikeBuilder.cs`  
Single camera: `CamHero`, FOV 36  
Layout: `AuthoredComposition/SetHero`

## Camera (matches the demo still)

Last capture:

- `CamHero eye=(133.10, 19.93, 143.00) focus=(133.10, 16.58, 168.70) fov=36`
- Water center in frame: `vp=(0.50, 0.45)`

That is the same eye/focus as `asset-demo-baseline.png`. Lighting, skybox, fog, sun, URP, Volume, terrain, lake mesh family, God Rays, and pack particles stay on the demo copies. The Volume copy is no longer regraded (the earlier Channel Mixer cut was making grass yellower).

## What was combined

| from | kept |
|---|---|
| baseline | camera height, contrast, left-edge trunk, pond as the mid-ground, demo volume |
| B | open pond, no trunk through the center |
| C | a path that starts in the lower-left, instead of an empty meadow |
| this pass | green willow pair as a near-shore gate, far-shore broadleaf + fir as a destination, foam disabled on a lake *copy* |

The pack has no house, gazebo, or lanterns. The landmark is a large green `BroadleafTree_05_Green` with `Fir_04` on the far bank.

## Water / shore

Pack `Lake.mat` was not edited. A copy lives at `Assets/VirtualZoo/Art/VisualCompositionSpike/LakeSoftFoam.mat`.

`_FoamAmount`, `_Foam_Amount`, `_CoastOpacity`, `_Coast_Opacity`, `_FoamColor`, `_Foam_Color`, and `_RimColor` are zeroed on that copy.

The remaining pale band around the pond is **terrain sand**, not shader foam. Grass clumps sit on the camera-facing rim; they do not fully hide the sand.

## Magenta

Name-based hide for blossom trees and waterlilies. Material hide for `Willow_Branch_*` pink/red/purple, `Broadleaf_Red` / `_Purple` / `_Blue`, and `Tree_Leaf_Pink` / `_Red` / `_Purple`. Green lily pads stay.

A red bush in the lower-right is part of the demo layout and is still in frame.

## Evidence (Unity Game View 1920×1080, no Photoshop)

- `/Volumes/Siska/DEVELOP/zoofun/handoff/evidence/visual-hero-spike/hero-zone-clean.png`
- `/Volumes/Siska/DEVELOP/zoofun/handoff/evidence/visual-hero-spike/baseline-hero-comparison.png` (baseline \| hero, 3840×1080, no stretch)
- `/Volumes/Siska/DEVELOP/zoofun/handoff/evidence/visual-hero-spike/asset-demo-baseline.png` (unchanged north star)

Mean RGB of this still is about `(100, 98, 76)` vs baseline `(91, 91, 75)`. Stddev `61.4` vs `61.7`.

## Last layout log

- path start `vp=(0.28, 0.07)`
- log `vp=(0.48, 0.36)` world `(132.75, 15.78, 161.50)` — `Branch_03` bounds `(1.23, 0.34, 2.63)` (flat, not a pole)
- left willow `vp=(0.20, 0.17)`
- right willow `vp=(0.75, 0.06)` (too low-right to read as an arch)
- far landmark `vp=(0.40, 0.57)`

## Remaining visual faults (self-review)

- The log sits in open water. At ~2.6 m it reads as driftwood, not a crossing from path to destination.
- The stone path is only a lower-left fragment. It does not carry the eye across the pond.
- The willow “arch” is not a gate: one tree is a left-side filler, the other sits on the bottom-right edge.
- The far broadleaf/fir are on the correct bank but do not dominate as a destination.
- Tan sand around the far shore is still a bright band.
- A few small willows still sit on the waterline.
- Greens are a bit brighter/lime than the baseline olive. Midtones are slightly lifted.
- The red foreground bush is still there.
- The shot is still closer to an authored pack pond than to a finished fairy-tale zoo.

Do not start the next product iteration until visual review returns a decision. If this still fails as a zoo hero, the next move is to keep this camera and rebuild only the route (path on the left bank, a log that actually spans land↔rock or land↔land, one landmark on the far bank) — not three new grades.
