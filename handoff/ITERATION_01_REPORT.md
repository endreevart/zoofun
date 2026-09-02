# Iteration 01 — Unity Zoo Runtime (rework 3)

## Status

`READY_FOR_REVIEW`

External review of `outputs/virtual-zoo-iteration-01-unity-zoo-rework-2.zip` returned `REWORK`. This report covers the third rework only. It does not assign `PASS`. Iteration 02 was not started.

## Workspace check

```bash
pwd
# /Volumes/Siska/DEVELOP/zoofun

git status --short
# ?? .cursor/
# ?? .env.example
# ?? .gitignore
# ?? AGENTS.md
# ?? Makefile
# ?? README.md
# ?? backend/
# ?? client/
# ?? compose.yaml
# ?? docs/
# ?? handoff/
# ?? infra/
# ?? scripts/
```

The repository still has no commits. Backend, Docker, and commerce files were not edited in this rework. Accepted rework-2 results were kept: Unity 6000.3.22f1 + URP, 20 fixture animals (walk 8 / hop 4 / fly 4 / float 4), StreamingAssets fixtures, macOS Player smoke, `CreatureRuntimeAssets.Release()`, sampler (one sample per gameplay `Update`, no capture), Kenney Nature Kit 2.1 CC0 (61 FBX).

## Why this rework existed

Technical checks passed on rework-2, but the visual gate failed. Overview frames showed a mosaic of rotated `ground_grass` tiles, a path assembled from deformed Kenney path modules, overlapping/squashed props, oversized animals clipped at the frame edge, and a fly/float shot where the bridge and garden hid the pair. This rework rebuilds garden geometry, Kenney placement, and evidence cameras. It is not a color tweak.

## Unity version

- Editor binary: `/Applications/Unity/Hub/Editor/6000.3.22f1/Unity.app/Contents/MacOS/Unity`
- `ProjectSettings/ProjectVersion.txt`: `6000.3.22f1 (1c726e1fb402)`
- License: Unity Personal, resolved by the local licensing client
- Architecture: Apple Silicon (`NamedBuildTarget.Standalone` / `iOS` architecture value `1`)
- Input: New Input System (`activeInputHandler: 1`)

Resolved packages (unchanged):

| Package | Version |
| --- | --- |
| `com.unity.render-pipelines.universal` | 17.3.0 |
| `com.unity.inputsystem` | 1.20.0 |
| `com.unity.ai.navigation` | 2.0.14 |
| `com.unity.test-framework` | 1.6.0 |

## Art assets — source and license

Unchanged from rework-2:

- Official page: https://kenney.nl/assets/nature-kit
- Official download used: `https://kenney.nl/media/pages/assets/nature-kit/37ac38a37b-1677698939/kenney_nature-kit.zip`
- Pack: Kenney Nature Kit (2.1), 2020, CC0 1.0
- License text: `client/VirtualZoo/Assets/ThirdParty/Kenney/NatureKit/LICENSE.md`
- 61 FBX only under `Assets/ThirdParty/Kenney/NatureKit/Models/`

Kenney models are decorations (trees, bushes, flowers, rocks, mushrooms, fence, distant cliffs, one bridge with rails, rare `path_wood`). They are no longer the meadow, path, or pond surface.

## Fixed review issues

1. **Meadow.** Removed the mosaic of rotated/offset `ground_grass` tiles and the extra meadow disc. The lawn is one deterministically generated mesh (`MeadowSurface`): a 48×48 low-poly grid with a pond-shaped hole, mild relief, a calm untextured green material, and no checker tiling. Kenney grass tufts stay as sparse plants on the perimeter, not as the ground.
2. **Path.** The walking surface is one Catmull-Rom ribbon mesh (`PathRibbon`) of constant width, continuous triangles, rounded caps, and a small height offset above the meadow. Kenney `ground_pathStraight` / `ground_pathBend` are not used. One `path_wood` plank remains as rare décor, not as the path surface.
3. **Pond and bridge.** One water mesh, one bank ring, lily pads and reeds as décor, one `bridge_wood` span with `bridge_side_wood` rails. River-module sandwiches are gone. The bridge sits on the east bank so the fly/float evidence camera (from the south) does not cover the pair.
4. **Kenney scale.** `KenneyKit.Place` measures bounds at identity rotation, then applies uniform scale only (`extraScale` and optional `targetHeight`). `fitWidth` / `fitLength` are removed. Trees, rocks, plants, fence, and cliffs are no longer squashed per axis. Each placed root gets `KenneyProp` for PlayMode scale checks.
5. **Cameras and animals.** Overview camera is farther/higher (`ZooLayout.OverviewCamera` ≈ `(0.15, 6.95, -15.1)`, FOV 32). Creature sprite height is `Clamp(scale * 1.38, 1.08, 1.62)`. Ground waypoints stay inside the garden, not in the foreground. Float waypoints stay on the west water, off the bridge. Evidence capture checks overview viewport bounds (`CreatureViewport`: ≥12 fully inside, no clipped visible animals, no dominant sprite). Pair shots use line-of-sight occlusion checks. Extra QA still: `environment-clean.png` (same garden, animals hidden).

## Architecture notes

Fixtures still load from `Application.streamingAssetsPath/VirtualZoo/Fixtures`. OpenRouter is not called from the client. Default scene: `Assets/VirtualZoo/Scenes/ZooGarden.unity`. Generated garden meshes live in `Assets/VirtualZoo/Art/`.

## Creature table (20)

Unchanged mix: **8 walk / 4 hop / 4 fly / 4 float**.

## Tests

Unity CLI **without** `-quit` (Test Runner exits itself after writing XML):

```bash
# EditMode — XML total=15 passed=15 failed=0 skipped=0
# PlayMode filter ZooRuntimeTests — XML total=8 passed=8 failed=0 skipped=0
```

### EditMode — 15 passed, 0 failed, 0 skipped (2026-08-27 08:40:24Z)

Previous 12 kept: `FixtureManifestTests` (8) plus `FrameTimeSamplerTests` (4). New `GardenMeshFactoryTests` (3): meadow mesh valid and continuous, path ribbon valid, water and bank valid (finite vertices, valid triangles).

### PlayMode — 8 passed, 0 failed, 0 skipped (2026-08-27 08:36:24Z – 08:36:33Z)

Previous 5 kept, plus:

- Garden_has_one_meadow_one_path_one_water_and_no_grass_mosaic (exactly one `MeadowSurface`, `PathRibbon`, `PondWater`; zero `ground_grass` / path / river mosaic instances)
- Kenney_props_use_uniform_scale_and_meshes_are_finite
- Overview_shows_at_least_twelve_animals_fully_inside_the_frame (viewport bounds; no clip; no dominant animal)
- Repeated_reinitialize_releases_runtime_assets_and_leaves_twenty_active (unchanged project-wide `VZRuntime.*` census)

`SoakEvidenceTests` is `[Explicit]` and was not included. The five-minute soak is `ZooSoakRunner` with no capture.

## Player build and smoke

macOS Development Build from CLI:

```
ZOO_PLAYER_BUILD result=Succeeded errors=0 path=.../client/VirtualZoo/Builds/macOS-dev/VirtualZoo.app
```

`BuildResult.Succeeded`. Build output is **not** in the ZIP.

Player run (`ZOO_PLAYER_SMOKE=1`, `-batchmode -nographics`):

```
ZOO_PLAYER_SMOKE_OK activeCreatures=20 walk=8 hop=4 fly=4 float=4
```

Process exit 0. Real Player process, not an inspection of files inside the `.app`.

iPhone install was not required and was not done.

## Performance soak (no capture)

Metal, batchmode, 300 s, camera nudged. **No** `Camera.Render`, PNG encoding, or evidence capture. Sampling from runtime `MonoBehaviour.Update` only.

From `handoff/evidence/iteration-01/soak-metrics.json`:

| Metric | Value |
| --- | --- |
| Soak duration | 300.01 s |
| Warmup | 5.00 s (excluded from FPS metrics) |
| Capture performed | false |
| Total gameplay frames | 18000 |
| Sample count | 17699 (≤ frames) |
| Average FPS | 60.11 |
| Min sampled FPS | 16.98 |
| Max FPS | 1626.35 |
| Frame time p50 / p95 / p99 | 16.69 / 16.71 / 16.73 ms |
| Max frame time | 58.90 ms |
| Seconds below 30 FPS | 0.06 (≤ 300) |
| Longest below-30 streak | 0.06 s (< 1.0) |
| Memory start → end | 269 251 064 → 241 935 857 |
| Active creatures | 20 |
| Project console errors | 0 |
| Project console warnings | 0 |

Heartbeat at 299.99 s: `creatures=20`. Soak started with `mode=performance` and `capture=false`. All four locomotion classes remain in the live zoo (8/4/4/4 spawn mix).

## Separate capture hitch

Visual evidence is a different Metal Editor run (`ZooEvidenceRunner.Capture`). It does not write soak metrics.

From `handoff/evidence/iteration-01/evidence-hitch.json`:

```
capturePerformed: true
captureHitchMs: 482.67
```

That hitch is **not** in `soak-metrics.json`.

## Evidence (opened full-size and visually checked)

Metal `Camera.Render` frames. File existence was not treated as a pass. Each PNG was opened at full resolution (1600×1200, 1920×886, or 1440×1080), inspected in the viewer, and cross-checked with pixel sampling on the meadow (horizontal green-channel absdiff p95 = 0 on `environment-clean.png` — no tile mosaic).

| File | Check |
| --- | --- |
| `handoff/evidence/iteration-01/gameview-ipad-4x3.png` | Overview 4:3: continuous meadow, continuous path, pond, east-bank bridge, plants; ≥12 animals fully in frame; none dominant or clipped |
| `handoff/evidence/iteration-01/gameview-iphone-landscape.png` | Wide overview of the same garden; animals fully inside; lawn/path/pond readable |
| `handoff/evidence/iteration-01/closeup-walk-hop.png` | Full purple hop on grass and green walk on the ribbon path; plants do not cover them; meadow and path behind are continuous |
| `handoff/evidence/iteration-01/zone-fly-float.png` | Yellow fly clearly in the air; pink float on readable pond water; bridge on the right, not covering the pair |
| `handoff/evidence/iteration-01/environment-clean.png` | Same garden with animals hidden: one meadow, one ribbon path, one water disc, one bank ring, one bridged span |

Pair shots freeze locomotion and hide non-target animals so the required classes fill the frame. Overviews show the live zoo.

## Unverified

- iPhone / iPad device install and on-device 60 FPS
- Real multi-touch pinch on hardware
- Interactive Game View window (this session used batchmode Metal `Camera.Render`)
- Developer overlay pixels in screenshots (OnGUI is not in `Camera.Render`)
- Drawing import, camera capture, backend generation, care, cards, audio
- Offline cache of *generated* animals (only bundled fixtures exist)

## Remaining limits

- Kenney Nature Kit is chunky low-poly. Distant cliffs read as blocky tan volumes. The garden is a pastel diorama and must not compete with the child drawings.
- Fence pieces use native Kenney proportions (uniform scale), so the ring is a ring of posts/rails, not a stretched continuous wall.
- Evidence pair shots hide non-target animals; overviews show all 20.
- Unity Editor QuickSearch still throws on an empty search index. That is an Editor bug, not Virtual Zoo gameplay. Soak metrics count it as EditorSearch, not a project error.
- `-nographics` PlayMode cannot produce valid zoo screenshots; evidence needs `-force-metal`.
- macOS Development `.app` is a local verification artifact only.

## ZIP exclusions

Packaged as `outputs/virtual-zoo-iteration-01-unity-zoo-rework-3.zip`. No SHA-256.

Excluded by packaging rules:

- `Library/`, `Temp/`, `Logs/`, `UserSettings/`
- `Build/`, `Builds/` (including the macOS `.app` and Burst debug folder)
- Original Kenney zip and non-FBX model formats
- `.git/`
- `outputs/` and other `*.zip`
- `.venv/`, `venv/`, `__pycache__/`, `*.pyc`, `*.egg-info/`
- `.DS_Store`, `.env`, secrets, `credentials.json`
- IDE caches

## Backend / AI / payments

This rework did not add drawing, image import, backend, OpenRouter, ElevenLabs, cards, care, payments, or StoreKit.

## Stop

Rework-3 ZIP packaged. Iteration 02 was not started.
