# Iteration 01-A cinematic rework — Idyllic garden

## Status

`READY_FOR_REVIEW`

This does not assign `PASS`. Iteration 02 was not started. Backend, drawing import, AI generation, creature cards, web UI, accounts, payments, and StoreKit were not touched.

## Absolute project path

`/Volumes/Siska/DEVELOP/zoofun`

## What this rework was for

External review of `ZooIdyllicGarden` returned `REWORK` on visual quality, not runtime. The previous stills read as a cheap Asset Store layout: acid lime meadow, plastic pond, wooden-ribbon path, visible world edges, floating cliffs, and clustered 2.5D cards.

This pass stays inside Iteration 01-A. The working scene is still `ZooIdyllicGarden`. `ZooGarden` and `ZooArtDirection` were not rebuilt. Vendor files under `Assets/Idyllic Fantasy Nature/` were not edited. Adapted materials, meshes, and textures live in `Assets/VirtualZoo/Art/IdyllicGarden/`.

## Unity

- Editor: `/Applications/Unity/Hub/Editor/6000.3.22f1/Unity.app/Contents/MacOS/Unity`
- Project: `6000.3.22f1`
- URP, Metal evidence and soak

## Scene and animals

Working scene: `Assets/VirtualZoo/Scenes/ZooIdyllicGarden.unity`.

20 unique fixtures, all active: walk 8, hop 4, fly 4, float 4. Presentation stays 2.5D drawing cards (`CreaturePresentationV2`), not replacement 3D animal models. Cards billboard toward the gameplay camera. Same-class spacing is applied at spawn and during motion. Contact shadows sit under walk/hop/fly and on the water for float.

Player smoke: `ZOO_PLAYER_SMOKE_OK activeCreatures=20 walk=8 hop=4 fly=4 float=4`.

## Visual changes

- Meadow is a continuous disk with a sculpted pond bowl and rising grass hills at the rim. The water no longer sits over a cut hole (that hole produced the dark-blue triangles).
- Pond water is an irregular disc with a copied depth gradient, mild bob, and shore plants/rocks. The plastic bank ring was removed after it still read as a brown lip.
- Path is a blended dirt mesh: inner earth strip, outer shoulders assigned the meadow material, irregular width, world-space UVs. Dirt albedo was hue-shifted off the original ochre so the trail is warm taupe rather than an orange board.
- Foreground flower/bush frame, path-side beds, pond reeds, gate blossom grove, and a rear tree wall. No cliff prefabs. Corner giant rocks removed.
- Lighting: warm directional sun, lower ambient, linear fog as haze, ACES volume with mild bloom/contrast and reduced saturation. No depth of field. Evidence cameras use the same scene lights and volume as play.
- Copied-and-tinted grass, lily, bush, and canopy materials so vendor `_Top_Color` lime overlays are not used on instances.

## Visual check (full-size stills)

Opened and inspected at full resolution:

1. `handoff/evidence/iteration-01a-idyllic-cinematic/hero-ipad-4x3.png` — path leads to the blossom gate; pond and bridge on the left; 18+ readable 2.5D animals; no cyan pond hole.
2. `handoff/evidence/iteration-01a-idyllic-cinematic/hero-iphone-landscape.png` — hills and haze hide meadow edges; no clipped cliff masses; no empty blue void.
3. `handoff/evidence/iteration-01a-idyllic-cinematic/environment-clean.png` — same world without animals.
4. `handoff/evidence/iteration-01a-idyllic-cinematic/closeup-walk-hop.png` — walk on the path and hop beside it, both facing camera, no overlap.
5. `handoff/evidence/iteration-01a-idyllic-cinematic/zone-fly-float.png` — one fly in air, one float on the pond, both facing camera.
6. `handoff/evidence/iteration-01a-idyllic-cinematic/reference-comparison.png` — approved hero on the left, 4:3 Game View on the right.

Pixel sample on the recaptured stills: lime (high-G yellow-green) is ~0–1% of the frame. Path samples sit around warm taupe `(190, 173, 141)`, not the previous orange ribbon `(185, 119, 61)`.

What still does not match `handoff/references/virtual-zoo-art-direction-v1.png`:

- The reference is a painterly concept with thick grass, golden volume light, and fully modeled animals. The playable scene uses the Idyllic pack’s stylized trees/plants plus 2.5D drawing cards.
- At ground-level closeup the dirt trail is still a distinct mesh against the meadow, even with grass overlapping the shoulders.
- Vendor foliage lighting stays relatively soft; batch `Camera.Render` does not produce studio-grade contact AO on every prop.

Those gaps are visible in the stills. They are not hidden by a screenshot-only grade.

## Tests

EditMode: **22/22 passed**, 0 failed (`editmode-results.xml`). Includes Idyllic layout tests (cinematic pitch 30–38°, compact pond, vendor demo not in Build Settings) and mesh validation for irregular water/bank and blended dirt path.

PlayMode: **19 passed**, **1 skipped** (explicit 5-minute `ZooGarden` soak, not this run), 0 failed. All `IdyllicGardenRuntimeTests` passed, including:

- 20 unique IDs, `walk 8 / hop 4 / fly 4 / float 4`
- habitat zones after 6 s
- shaders/meshes present
- repeated `Initialize()` releases runtime assets
- overview 12+ animals in 4:3 and 16:9
- no Kenney / no visible Unity primitives
- cards face the gameplay camera
- readable spawn interval

macOS Development Player: `ZOO_IDYLLIC_PLAYER_BUILD result=Succeeded errors=5 path=.../Builds/macOS-idyllic/VirtualZoo.app`. Player scenes: only `ZooIdyllicGarden`. Summary `errors=5` are Hub licensing token + `usbmuxd`, not project compile errors.

Player smoke: pass, 20 creatures, all four locomotion classes.

iOS unsigned Xcode: `ZOO_IDYLLIC_IOS_BUILD result=Succeeded errors=5 path=.../Builds/ios-idyllic`. Target supported. Not code-signed. Same class of editor/device noise, not project compile errors.

## Command results

| Check | Result |
| --- | --- |
| Scene generate | `ZOO_IDYLLIC_GENERATE_OK scene=Assets/VirtualZoo/Scenes/ZooIdyllicGarden.unity` |
| Evidence | `ZOO_IDYLLIC_STILLS_OK`, `ZOO_IDYLLIC_EVIDENCE_CAPTURE_OK frames=6` (`-force-metal`) |
| EditMode | **22 passed**, 0 failed |
| PlayMode | **19 passed**, 1 skipped (`ZooGarden` 5-minute soak), 0 failed |
| macOS Development Player | `Succeeded`, Player scene `ZooIdyllicGarden` only |
| Player smoke | `ZOO_PLAYER_SMOKE_OK activeCreatures=20 walk=8 hop=4 fly=4 float=4` |
| iOS unsigned Xcode | `Succeeded` |
| 300 s Metal soak | See below; process exit 0 |

## Soak (300 s Metal, no screenshot capture)

`handoff/evidence/iteration-01a-idyllic-cinematic/soak-metrics.json` after `IdyllicSoakRunner.Run` (`-force-metal`, soak_exit=0):

```json
{
  "soakSeconds": 300.01,
  "warmupSeconds": 5.00,
  "capturePerformed": false,
  "totalGameplayFrames": 17979,
  "sampleCount": 17692,
  "fpsAverage": 60.15,
  "fpsMin": 15.89,
  "fpsMax": 775.99,
  "frameMsP50": 16.69,
  "frameMsP95": 16.72,
  "frameMsP99": 16.79,
  "frameMsMax": 62.92,
  "secondsBelow30Fps": 0.28,
  "longestBelow30StreakSeconds": 0.06,
  "memoryBytesStart": 310270018,
  "memoryBytesEnd": 281113158,
  "activeCreatures": 20,
  "projectConsoleErrors": 0,
  "projectConsoleWarnings": 0
}
```

Invariants held: 20 creatures, `capturePerformed=false`, longest sub-30 FPS streak 0.06 s (threshold is ≥1 s), 0 project console errors/warnings. `fpsMin=15.89` is a hitch, not a sustained drop. P50/P95/P99 sit on the 60 Hz vsync line. `console-soak.log` records only the runner enter line.

Locomotion mix `8 / 4 / 4 / 4` is asserted by PlayMode on this scene and by Player smoke. The soak collector records active count, not per-class totals.

Unity Licensing, QuickSearch, and `usbmuxd` appear in Editor/build logs. Those are Editor noise. The full Editor log is not called clean.

## Known limits

- Pack has no authored wooden bridge or fairy-tale gate; those two pieces stay first-party `PremiumPrototype` meshes with copied wood/stone.
- Vegetation shader wind is unused (vendor `WindControl` writes original materials; it is not instantiated).
- Editor Build Settings still list `ZooGarden` and `ZooArtDirection` so existing tests load. The macOS/iOS Player for this rework includes only `ZooIdyllicGarden`.
- Hidden `Ground` cube collider has MeshRenderer disabled (navmesh).

## Unverified

- Physical iPhone / iPad install, on-device 60 FPS, and real multi-touch
- Interactive Editor Game View (evidence used batchmode Metal `Camera.Render`)
- Developer overlay pixels in stills (`OnGUI` is not in `Camera.Render`)
- Drawing import, camera capture, backend generation, care, cards, audio
- Offline cache of *generated* animals (only bundled fixtures exist)

## Secrets

No provider secrets, PATs, or production credentials were added. `.env` is absent. OpenRouter values in `.env.example` remain empty. OpenRouter is not called from Unity. Vendor Asset Store files stay inside the Unity project copy only.

## ZIP

`outputs/virtual-zoo-iteration-01a-idyllic-cinematic-rework.zip`. No SHA-256.

This is an internal review archive of the project, not a standalone redistribution of Idyllic Fantasy Nature. Vendor content remains at `client/VirtualZoo/Assets/Idyllic Fantasy Nature/` inside the project copy.

Excluded:

- `.git/`
- `Library/`, `Temp/`, `Logs/`, `UserSettings/`
- `Build/`, `Builds/` (macOS `.app` and iOS Xcode output)
- `outputs/` and other `*.zip`
- `.venv/`, `venv/`, `__pycache__/`, `*.pyc`, `*.egg-info/`
- `.DS_Store`, `.env`, secrets, `credentials.json`
- scratch `preview-*.png` under evidence

## Iteration 02

Not started. No drawing import, OpenRouter, ElevenLabs, backend jobs, creature cards, care, web UI, accounts, payments, StoreKit, friends, or ratings.
