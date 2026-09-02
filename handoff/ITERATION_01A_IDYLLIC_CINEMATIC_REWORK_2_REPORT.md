# Iteration 01-A cinematic rework 2 — compact idyllic garden

## Status

`READY_FOR_REVIEW`

This does not assign `PASS`. Iteration 02 was not started. Backend, drawing import, camera/photo picker, OpenRouter, ElevenLabs, creature cards, care, web UI, accounts, payments, and StoreKit were not touched.

## Absolute project path

`/Volumes/Siska/DEVELOP/zoofun`

## Why this rework existed

External review of `outputs/virtual-zoo-iteration-01a-idyllic-cinematic-rework.zip` returned `REWORK` on art quality. Runtime was independently verified. The scene still read as a cheap Asset Store layout: high technical camera, little depth, flat grey-olive light, a muddy pond, a ramp-like bridge, hanging gate stones, a rubber path strip, empty meadow, and 2.5D cards that sat on top of the world.

This pass stays inside Iteration 01-A. The working scene is still `ZooIdyllicGarden`. Vendor files under `Assets/Idyllic Fantasy Nature/` were not edited. Adapted meshes, materials, and settings live in `Assets/VirtualZoo/`.

## Unity

- Editor: `/Applications/Unity/Hub/Editor/6000.3.22f1/Unity.app/Contents/MacOS/Unity`
- Project: `6000.3.22f1`, URP
- Evidence and soak used Metal (`-force-metal`)

## What was rebuilt

Composition was rebuilt as a compact authored garden, not a large empty meadow.

- Camera sits closer to creature height: perspective, FOV 34, pitch about 25° down. Pond and animals occupy the middle ground; the gate sits on the far plane; foreground flowers and grass enter the frame. Pan remains limited.
- Pond is a turquoise URP Lit disc with mild surface motion, lily pads, reeds, cattails, and rock abutments. No plastic bank ring and no cyan hole triangles.
- Bridge (`bridge_round`) is snapped onto both banks with rock feet and shore plants. Tests use renderer bounds, not the offset FBX pivot.
- Gate is a first-party stone arch with two pillars, a semicircular opening, wing walls, and grounded plinths. It is no longer a thin lintel plus floating rocks.
- Path is a blended dirt ribbon with meadow-material shoulders, slight width variation, and grass/flower/stone overlap along an S-curve toward the gate.
- Vegetation is grouped: foreground frame, pond edge, path beds, gate grove, side groves, and a rear tree/hill wall. Quiet lawn remains between groups.
- Light is a warm morning sun, cool fill, contact shadows, ACES, mild bloom, modest contrast, linear haze. Evidence cameras use the same lights, materials, and Volume as play. No gameplay depth of field, no heavy vignette, no motion blur.
- 2.5D cards keep fixture images. Rim/fill on `CreatureCard.shader`, larger contact shadows, slight squash. Not replaced with 3D animal models.
- `CreatureSpacing` no longer calls `FindObjectsByType` every LateUpdate. `CreatureSpacingRegistry` holds the active list; `ZooDirector` ticks it once; `ClearSpawned()` / `Initialize()` clear registration. PlayMode covers re-init without duplicates.

## Vendor assets used

From `Assets/Idyllic Fantasy Nature/` (instanced, not edited):

- Meadow/path/rock albedos and normals; water normal
- Skybox material (copied)
- Grass, reeds, cattails, lilies, flowers, meadow patches
- Bushes, blossom trees, broadleaf, willow, fir
- Rocks and stone clusters
- Copied-and-tinted foliage/bush materials so vendor lime `_Top_Color` overlays are not used on instances

Demo scenes were not added to Player Build Settings.

## First-party meshes, materials, prefabs

Under `Assets/VirtualZoo/Art/IdyllicGarden/` and `Assets/VirtualZoo/Art/PremiumPrototype/`:

- `StoryGate.asset` — grounded arch, pillars, wing walls
- `GatePlinth.asset` — named `GatePillarL` / `GatePillarR` bases
- Irregular pond water, blended dirt path, sculpted meadow
- Turquoise `PondWater.mat`, meadow/path/wood/stone lits, volume profile
- PremiumPrototype `bridge_round`, `lantern`, `story_tower`, `hill_burrow`, `meadow_hills`, `background_hills`

`gate_arch.fbx` is no longer the garden gate (it read as a paper lintel).

## Visual checkpoints

1. Environment stills (4:3, 16:9, pond/bridge) were inspected before treating animals as done. Pond read as teal water; bridge spanned both banks; gate was rebuilt until it read as an arch with an opening.
2. Walk/hop closeup and fly/float zone were inspected for scale, shadows, and zone placement. Fly evidence poses disable NavMeshAgent so Warp cannot slam airborne cards to the ground.
3. Full 20-creature evidence (8/4/4/4) was recaptured from the same Game View as play.

Scratch stills under `handoff/evidence/iteration-01a-idyllic-cinematic-rework-2/scratch/` are not part of the review ZIP.

## Evidence (full-resolution inspection)

Folder: `handoff/evidence/iteration-01a-idyllic-cinematic-rework-2/`

| File | What is in the frame | Visual checks |
| --- | --- | --- |
| `hero-ipad-4x3.png` | Compact garden, turquoise pond, arched bridge, S-path, blossom trees, stone gate in the distance, 12+ readable 2.5D cards | Depth (FG flowers → pond/animals → path → gate). Camera is not a strategy top-down. No world rim. Pond is teal, not grass. Light is warm, not grey-olive. |
| `hero-iphone-landscape.png` | Same world in 16:9, fly/float cards in air/on water, gate on the far plane | World edge hidden by trees/haze. Path leads toward the gate. Animals do not fill the screen. |
| `environment-clean.png` | Same hero framing with creatures hidden | Pond, bridge, path, gate, grouped plants without animal clutter. |
| `pond-bridge-closeup.png` | Water, lily/reeds, wooden arch on rock abutments | Water reads as water (hue, highlight, motion). Bridge sits on both banks. No plastic lip, no blue triangles. |
| `gate-path-closeup.png` | 3/4 view of stone arch, opening, tree beyond, plants at the feet | Two supports, arch, readable passage, bases on the ground. Not hanging stacked rocks. |
| `closeup-walk-hop.png` | Two fixture cards in foreground grass | Walk and hop both readable, contact shadow, no giant scale, no stack. Cards still billboard (expected). |
| `zone-fly-float.png` | Pond/bridge; yellow fly above the bridge; pink float in the water | Fly is in air. Float is on water. Both face camera. |
| `reference-comparison.png` | Left: `handoff/references/virtual-zoo-art-direction-v1.png`. Right: current 4:3 Game View, no extra grade | Honest side-by-side. Same lights/volume as play. |
| `motion-01.png` … `motion-08.png` | Same Game View, 1.8 s steps | Animals move; mix of ground/air/water; no dense pile-up in these frames. |
| `soak-metrics.json` | 300 s Metal soak, no screenshot capture | See soak section. |

ACES/bloom/fog being on is not treated as proof of a cinematic image. The stills were judged by pond, gate, path, camera height, and depth.

## Honest comparison with the reference

Closer than the previous REWORK:

- Compact garden instead of a vacant field
- Turquoise pond and a bridge that actually spans it
- A real gate with an opening instead of floating stones
- Lower camera and a readable FG → mid → far route
- Warmer sun and grouped plants

Still weaker than `virtual-zoo-art-direction-v1.png`:

- The reference is a painterly concept with golden volume light and fully modeled animals. Play uses Idyllic pack trees/plants plus 2.5D drawing cards. That gap is visible, not graded away.
- Dirt path remains a distinct mesh. Shoulders and overlapping grass hide some of the edge; it is not a painted trail.
- Gate stone is a first-party box-and-arch mesh with a tiled rock albedo, not a sculpted storybook portal.
- Lighting is a clear morning, not thick god-ray volume. SSAO is on the PC renderer only.
- Cards stay flat sprites with rim/fill/shadow. They no longer look randomly pasted, but they are not 3D.

Those limits are why this is `READY_FOR_REVIEW`, not a claim of matching the concept frame-for-frame.

## Tests

EditMode: **25/25 passed**, 0 failed. Includes cinematic camera (FOV 30–36, pitch 24–30, camera height 3.9–6.2), compact pond, path-to-gate, vendor demo not in Editor Build Settings, story-gate mesh bounds, blended path, spacing registry.

PlayMode: **22 passed**, **1 skipped** (explicit five-minute `ZooGarden` soak, not this run), 0 failed. Includes:

- 20 unique IDs, `walk 8 / hop 4 / fly 4 / float 4`
- habitat zones
- repeated `Initialize()` releases runtime assets
- spacing registry has no duplicates after re-init
- overview ≥12 animals in 4:3 and 16:9
- pond/bridge share water (renderer bounds)
- gate has supports, opening, grounded arch volume
- no Kenney; cards face the gameplay camera

Tests were not relaxed to hide a high camera or a missing gate. Bridge distance uses visible mesh bounds because the FBX pivot is offset.

## Builds, smoke, soak

| Check | Result |
| --- | --- |
| Scene generate | `ZOO_IDYLLIC_GENERATE_OK scene=Assets/VirtualZoo/Scenes/ZooIdyllicGarden.unity` |
| Evidence | `ZOO_IDYLLIC_STILLS_OK`, `ZOO_IDYLLIC_EVIDENCE_CAPTURE_OK frames=8` |
| EditMode | **25 passed**, 0 failed |
| PlayMode | **22 passed**, 1 skipped, 0 failed |
| macOS Development Player | `Succeeded`, `errors=5`, `Builds/macOS-idyllic/VirtualZoo.app`. Player scenes: only `ZooIdyllicGarden` |
| Player smoke | `ZOO_PLAYER_SMOKE_OK activeCreatures=20 walk=8 hop=4 fly=4 float=4` |
| iOS unsigned Xcode | `Succeeded`, `errors=5`, `Builds/ios-idyllic`. Not code-signed |
| 300 s Metal soak | exit 0; see metrics below |

Build summary `errors=5` are Hub licensing (`Access token is unavailable; failed to update`) and `usbmuxd` listen-thread noise. They are not C# compile errors. The full Editor log is not called clean: those lines are present.

## Soak (300 s Metal, no screenshot capture)

`handoff/evidence/iteration-01a-idyllic-cinematic-rework-2/soak-metrics.json`:

```json
{
  "soakSeconds": 300.02,
  "warmupSeconds": 5.00,
  "capturePerformed": false,
  "totalGameplayFrames": 17989,
  "sampleCount": 17701,
  "fpsAverage": 60.04,
  "fpsMin": 33.48,
  "fpsMax": 436.13,
  "frameMsP50": 16.69,
  "frameMsP95": 16.72,
  "frameMsP99": 16.75,
  "frameMsMax": 29.87,
  "secondsBelow30Fps": 0.00,
  "longestBelow30StreakSeconds": 0.00,
  "memoryBytesStart": 313218551,
  "memoryBytesEnd": 284051049,
  "activeCreatures": 20,
  "projectConsoleErrors": 0,
  "projectConsoleWarnings": 0
}
```

Invariants held: 20 creatures, `capturePerformed=false`, no sub-30 FPS streak, 0 project console errors/warnings. P50/P95/P99 sit on the 60 Hz line. `console-soak.log` contains only the runner enter line.

## Remaining visual limits

- Pack has no authored fairy-tale gate or painted path; those stay first-party meshes.
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

`outputs/virtual-zoo-iteration-01a-idyllic-cinematic-rework-2.zip`. No SHA-256.

This is an internal review archive of the Unity project, not a standalone redistribution of Idyllic Fantasy Nature.

Excluded: `.git/`, `Library/`, `Temp/`, `Logs/`, `UserSettings/`, `Build/`, `Builds/`, `outputs/` and other `*.zip`, `.env`, secrets, Python/Unity caches, evidence `scratch/`.

## Iteration 02

Not started. No drawing import, OpenRouter, ElevenLabs, backend jobs, creature cards, care, web UI, accounts, payments, StoreKit, friends, or ratings.
