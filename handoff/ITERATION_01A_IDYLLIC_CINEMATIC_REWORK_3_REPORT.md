# Iteration 01-A cinematic rework 3 — idyllic garden landmark pass

## Status

`READY_FOR_REVIEW`

This does not assign `PASS`. Iteration 02 was not started. Backend, drawing import, camera/photo picker, OpenRouter, ElevenLabs, creature cards, care, web UI, accounts, payments, and StoreKit were not touched.

## Absolute project path

`/Volumes/Siska/DEVELOP/zoofun`

## Why this rework existed

External review of `outputs/virtual-zoo-iteration-01a-idyllic-cinematic-rework-2.zip` returned `REWORK` on art quality. Runtime was already independently verified. The scene still read as a cheap pack layout: flat grey-green light, intersecting gate boxes, a pond buried under rocks and reeds, a ribbon path, and animals that did not sit in the world.

This pass stays inside Iteration 01-A. The working scene is still `Assets/VirtualZoo/Scenes/ZooIdyllicGarden.unity` (`IdyllicLayout.ScenePath`). Vendor files under `Assets/Idyllic Fantasy Nature/` were not edited. Adapted meshes, materials, and settings live in `Assets/VirtualZoo/`. No new assets were bought or downloaded.

## Unity

- Editor: `/Applications/Unity/Hub/Editor/6000.3.22f1/Unity.app/Contents/MacOS/Unity`
- Project: `6000.3.22f1`, URP
- Evidence and soak used Metal (`-force-metal`)
- Evidence, Player, and soak all use the same `ZooIdyllicGarden` scene. There is no screenshot-only lighting profile.

## What was actually changed

### Lighting and depth

- Key sun from the upper right (`Euler(36, -42, 0)`), warm `FFE6B0`, intensity 2.05, soft shadows at 0.72 so they stay readable instead of black.
- Cool fill and a separate rim directional (additional URP lights) so animals and props get a backlight kiss without a second sun washing the frame.
- Cream linear fog (`E8DCC8`, start 13, end 34) for far-tree haze instead of blue-grey.
- ACES volume: temperature 14, contrast 22, saturation 6, mild bloom (0.11 / threshold 1.08).
- Meadow and path albedos shifted warmer; foliage copies use less lime overlay.
- `CreatureCard.shader` now loops additional lights (`_FORWARD_PLUS` / `LIGHT_LOOP`) and applies rim unshadowed so cards keep an edge in shade. Fixture images were not redrawn.

### Gate

- First-party `CreateStoryGate()` is now wings + springers + a thick semicircular arch only. It no longer stacks extra pillar boxes on the same volume.
- Named `GatePillarL` / `GatePillarR` are children of `ZooGate`, terracotta stone, flush under the cream springers. Opening ~2.44 m.
- Lanterns sit beside the wings. Story tower is background-right, not competing with the arch.
- Original `Assets/Idyllic Fantasy Nature/` files were not modified.

### Pond and bridge

- Pond moved left-of-path (`PondCenter` -2.02, 1.08; extents 1.48 × 1.68). More open water toward camera; irregular disc plus a thin sandy bank ring.
- `bridge_round` scaled to height 0.82, aligned on XZ by renderer bounds, then meadow pads and small rocks at the actual mesh ends so both feet sit on banks.
- Large `Stone_Medium` abutments, near-shore rock piles, cattails, and acid-yellow flowers were removed. One far reed, two lily pads, one waterlily in open water.
- Turquoise URP Lit water (deeper teal, smoothness 0.90) with normal map and `WaterMotion` 0.010 / 0.46.

### Path, plants, camera

- Blended path is two submeshes: a narrow dirt strip and wide meadow shoulders (same meadow material as the lawn). No dark verge bands.
- Plants are grouped: modest FG flowers (no yellow), path-edge grass, pond willows, side groves, gate blossoms. Route is kept clear.
- Hero camera FOV 34, pitch ~24°, height 4.0. Gate closer (`z = 6.45`) so it reads as the far landmark on 4:3 and 16:9.

### Animals

- Still 20 active, `walk=8 / hop=4 / fly=4 / float=4`, fixture images, 2.5D, same locomotion classes.
- Spawn spots pulled onto the path / open lawn / air / open water. Spacing registry unchanged in behavior.
- Fly evidence poses still disable `NavMeshAgent` before setting Y.

### Habitat zone cache

- `HabitatZone.Find` / `FindAll` no longer call `FindObjectsByType`. Zones register in `OnEnable` / `Configure` and unregister in `OnDisable`.
- `CreatureSpacingRegistry.Tick()` looks up the four zones once per tick, then reuses them. Locomotion push logic is unchanged.
- EditMode `HabitatZoneRegistryTests` and PlayMode `Habitat_zone_registry_updates_on_create_and_destroy` cover create/destroy.

## Vendor assets used

From `Assets/Idyllic Fantasy Nature/` (instanced, not edited): meadow/path/rock albedos, water normal, skybox copy, grass, one reed, lilies, flowers, bushes, blossom/broadleaf/willow/fir, small rocks.

Demo scenes were not added to the Player.

## First-party meshes and materials

Under `Assets/VirtualZoo/Art/IdyllicGarden/`:

- `StoryGate.asset` — wings, springers, arch, keystone
- `GatePlinth.asset` — named pillars
- `BridgePad.asset` — meadow landings under bridge ends
- Irregular pond water, sandy bank, blended dirt path, sculpted meadow
- `PondWater.mat`, `GateArch.mat`, `GatePillar.mat`, volume profile
- PremiumPrototype `bridge_round`, `lantern`, `story_tower`, `hill_burrow`, `meadow_hills`, `background_hills`

## Visual checkpoints

1. Environment stills (4:3, 16:9, pond, gate) were opened at full size and compared with `handoff/references/virtual-zoo-art-direction-v1.png`.
2. Walk/hop, creature lighting, and fly/float stills were opened at full size.
3. Remaining pack/2.5D limits are listed below. The scene was not replaced with a screenshot-only setup.

Scratch stills under `handoff/evidence/iteration-01a-idyllic-cinematic-rework-3/scratch/` are not part of the review ZIP.

## Evidence (full-resolution inspection)

Folder: `handoff/evidence/iteration-01a-idyllic-cinematic-rework-3/`

| File | What is in the frame | Visual checks |
| --- | --- | --- |
| `hero-ipad-4x3.png` | Compact garden, teal pond, smaller arched bridge, S-path, cream/terracotta gate, 12+ readable cards | FG flowers → pond/animals → path → gate. Camera is not a strategy top-down. |
| `hero-iphone-landscape.png` | Same world in landscape | Gate, pond, bridge, and path remain in frame. |
| `environment-clean.png` | Same hero framing, creatures hidden | Pond, bridge, path, gate, grouped plants. |
| `pond-bridge-closeup.png` | Water, lilies, wooden arch on both banks | Open water visible. Bridge feet on pads/rocks. |
| `gate-path-closeup.png` | 3/4 of the stone arch and opening | Two supports, arch, passage, grounded bases. Closeup still shows first-party box construction. |
| `closeup-walk-hop.png` | Two fixture cards in grass | Walk and hop readable, contact shadows, no stack. |
| `creature-lighting-closeup.png` | One walker in open light | Rim/fill and a ground blob shadow. Still a 2.5D card. |
| `zone-fly-float.png` | Pond; fly in air; float on water | Fly is airborne. Float is on the water plane. |
| `reference-comparison.png` | Left: art-direction PNG. Right: current 4:3 Game View | Same lights/volume as play. Comparable scale. |
| `motion-01.png` … `motion-08.png` | Same Game View, 1.8 s steps | Animals move; mix of ground/air/water. |
| `soak-metrics.json` | 300 s Metal soak, no screenshot capture | See soak section. |

ACES/bloom/fog being on is not treated as proof of a cinematic image.

## Honest comparison with the reference

Closer than rework 2:

- Warm key from the upper right, cream haze, and a rim light on cards
- Gate is an arch with two supports and a readable opening, not overlapping plinths
- Pond shows a clear water disc; bridge is smaller and sits on both banks
- Path is a narrower dirt trail with meadow shoulders instead of a dark-banded ribbon
- Animals are spaced on path/lawn/air/water rather than in bushes

Still weaker than `virtual-zoo-art-direction-v1.png`:

- The reference is a painterly concept with golden volume light and fully modeled animals. Play uses Idyllic pack trees/plants plus 2.5D drawing cards.
- The gate is a first-party box-and-arch mesh with tiled rock albedo. Closeups still show assembled pieces, not a sculpted storybook portal.
- The path remains a mesh. Shoulders hide some of the edge; it is not a painted trail.
- Water is opaque URP Lit with a normal and a bob, not refractive reflections.
- Lighting is a clear morning, not thick god-ray volume.

Those limits are why this is `READY_FOR_REVIEW`, not a claim of matching the concept frame-for-frame.

## Tests

EditMode: **26/26 passed**, 0 failed. Includes cinematic camera (FOV 30–36, pitch 24–30, camera height 3.9–6.2), compact pond, path-to-gate, vendor demo not in Editor Build Settings, story-gate mesh bounds and open passage, blended path (2 submeshes), spacing registry, **habitat zone registry create/destroy**.

PlayMode: **23 passed**, **1 skipped** (explicit five-minute `ZooGarden` soak, not this run), 0 failed. Includes:

- 20 unique IDs, `walk 8 / hop 4 / fly 4 / float 4`
- habitat zones
- habitat registry updates on create and destroy
- repeated `Initialize()` releases runtime assets
- spacing registry has no duplicates after re-init
- overview ≥12 animals in 4:3 and 16:9
- pond/bridge share water (renderer bounds, opposite banks)
- gate has supports, opening, grounded arch volume
- no Kenney; cards face the gameplay camera

Tests were not relaxed to hide a high camera or a missing gate. Bridge checks use visible mesh bounds because the FBX pivot is offset.

## Builds, smoke, soak

| Check | Result |
| --- | --- |
| Scene generate | `ZOO_IDYLLIC_GENERATE_OK scene=Assets/VirtualZoo/Scenes/ZooIdyllicGarden.unity` |
| Evidence | `ZOO_IDYLLIC_STILLS_OK`, `ZOO_IDYLLIC_EVIDENCE_CAPTURE_OK frames=8` |
| EditMode | **26 passed**, 0 failed |
| PlayMode | **23 passed**, 1 skipped, 0 failed |
| macOS Development Player | `Succeeded`, `errors=5`, `Builds/macOS-idyllic/VirtualZoo.app`. Player scenes: only `ZooIdyllicGarden` |
| Player smoke | `ZOO_PLAYER_SMOKE_OK activeCreatures=20 walk=8 hop=4 fly=4 float=4` |
| iOS unsigned Xcode | `Succeeded`, `errors=5`, `Builds/ios-idyllic`. Not code-signed |
| 300 s Metal soak | exit 0; see metrics below |

Build summary `errors=5` are Hub licensing (`Access token is unavailable; failed to update`) and `usbmuxd` listen-thread noise. They are not C# compile errors. The full Editor log is not called clean: those lines are present.

## Soak (300 s Metal, no screenshot capture)

`handoff/evidence/iteration-01a-idyllic-cinematic-rework-3/soak-metrics.json`:

```json
{
  "soakSeconds": 300.01,
  "warmupSeconds": 5.00,
  "capturePerformed": false,
  "totalGameplayFrames": 17995,
  "sampleCount": 17701,
  "fpsAverage": 60.02,
  "fpsMin": 36.34,
  "fpsMax": 238.01,
  "frameMsP50": 16.69,
  "frameMsP95": 16.72,
  "frameMsP99": 16.78,
  "frameMsMax": 27.52,
  "secondsBelow30Fps": 0.00,
  "longestBelow30StreakSeconds": 0.00,
  "memoryBytesStart": 310947631,
  "memoryBytesEnd": 282891308,
  "activeCreatures": 20,
  "projectConsoleErrors": 0,
  "projectConsoleWarnings": 0
}
```

Invariants held: 20 creatures, `capturePerformed=false`, no sub-30 FPS streak, 0 project console errors/warnings. P50/P95/P99 sit on the 60 Hz line.

## Remaining visual limits

- Pack has no authored fairy-tale gate or painted path; those stay first-party meshes.
- Gate closeups still read as constructed boxes with a tiled albedo.
- Vendor foliage wind is unused (`WindControl` would write original materials).
- Editor Build Settings still list `ZooGarden` and `ZooArtDirection` so existing tests load. The macOS/iOS Player for this rework includes only `ZooIdyllicGarden`.
- Hidden `Ground` cube collider has MeshRenderer disabled (navmesh).
- 2.5D cards will never match the reference’s volumetric creatures.

## Unverified

- Physical iPhone / iPad install and on-device 60 FPS
- Interactive Editor Game View (evidence used batchmode Metal `Camera.Render`)
- Drawing import, live camera, backend generation, care, cards, audio
- Offline cache of generated animals (only bundled fixtures exist)

## Secrets

No provider secrets, PATs, or production credentials were added. `.env` is absent. OpenRouter is not called from Unity.

## ZIP

`outputs/virtual-zoo-iteration-01a-idyllic-cinematic-rework-3.zip`. No SHA-256.

This is an internal review archive of the Unity project, not a standalone redistribution of Idyllic Fantasy Nature.

Excluded: `.git/`, `Library/`, `Temp/`, `Logs/`, `UserSettings/`, `Build/`, `Builds/`, `outputs/` and other `*.zip`, `.env`, secrets, Python/Unity caches, evidence `scratch/`.

## Iteration 02

Not started. No drawing import, OpenRouter, ElevenLabs, backend jobs, creature cards, care, web UI, accounts, payments, StoreKit, friends, or ratings.
