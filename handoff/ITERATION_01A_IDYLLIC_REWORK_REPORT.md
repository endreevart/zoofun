# Iteration 01-A rework — Idyllic Fantasy Nature

## Status

`READY_FOR_REVIEW`

This does not assign `PASS`. Iteration 02 was not started. Backend, drawing import, AI generation, creature cards, web UI, accounts, payments, and StoreKit were not touched.

## Absolute project path

`/Volumes/Siska/DEVELOP/zoofun`

## What changed

A new working scene `ZooIdyllicGarden` replaces `ZooArtDirection` as the visual pilot zoo. `ZooGarden` is unchanged as the technical Kenney baseline. `ZooArtDirection` is kept as a failed visual attempt and is not polished.

Animals keep the existing contracts: `ZooDirector`, locomotion motors, fixture catalog, 2.5D card presentation (`CreaturePresentationV2`). Movement is bound to `HabitatZone` kinds (Ground, Hop, Flight, Water, Spawn), not to Idyllic object names.

## Unity

- Editor: `/Applications/Unity/Hub/Editor/6000.3.22f1/Unity.app/Contents/MacOS/Unity`
- Project: `6000.3.22f1 (1c726e1fb402)`
- URP, Metal evidence and soak

## Idyllic Fantasy Nature

| Field | Value |
| --- | --- |
| Name | Idyllic Fantasy Nature |
| Publisher | Edenity |
| Store | https://assetstore.unity.com/packages/3d/environments/fantasy/idyllic-fantasy-nature-260042 |
| Product ID | 260042 |
| Version | 1.0 (packageVersion in importer meta; Asset Store date 2023-10-03) |
| Import path | `client/VirtualZoo/Assets/Idyllic Fantasy Nature/` |
| License | Standard Unity Asset Store EULA; used inside this project only |

Vendor originals were not edited. The demo scene `Assets/Idyllic Fantasy Nature/Demo/Demo.unity` is not in Editor Build Settings and is not in the Player.

Project copies and authored meshes live in `Assets/VirtualZoo/Art/IdyllicGarden/`.

### Models used from the pack (instances in `ZooIdyllicGarden`)

Trees: BroadleafTree green variants 01–05, BlossomTree 01–05, WillowTree green 01/02/04, Fir 02/03/05.

Shrubs and ground cover: Bush_01/02 variants, FlowerMeadow white/blue/pink/blue-purple, Flower orange/pink/purple/white/blue, Grass 01–03, Plant 01/03/06/08.

Water plants: Reeds 01–03, Cattail 01–03, LilyPads 01–03, Waterlily 01–02, FloatingLeafs green/yellow.

Rocks: Rock big/medium/small, Stone big/medium, Stones 01–02, Branch 02/05, Cliff 01–05.

Not used: vendor Water plane prefab, VegetationBendControl, WindControl, butterflies, beach/sand layers, demo terrain, red/orange autumn trees.

### Materials adapted (copies only)

| Copy | Source | Change |
| --- | --- | --- |
| `PondWater.mat` | `Materials/Waterplants/Ocean.mat` | Turquoise shallow/deep/surface colors |
| `IdyllicSkybox.mat` | `Materials/Skybox/Skybox.mat` | Assigned as scene skybox |
| `BushGreenA/B/C.mat` | `Materials/Bushes/Bush_01/02/03.mat` | Leaf tint set to garden green (vendor Bush_01 is yellow, Bush_03 has a red top) |
| `Meadow.mat` | Grass albedo/normal | URP Lit, green tint |
| `Path.mat` | Cobblestone albedo/normal | URP Lit, warm path |
| `PondBank.mat` | Dirt albedo/normal | URP Lit |
| `PondDeep.mat` / `PondFoam.mat` | — | Opaque turquoise / foam Lit |
| `Wood.mat` / `Stone.mat` | Bark / rock albedo | URP Lit for first-party bridge and gate |

Vendor vegetation shaders stayed on tree/flower/grass prefabs. No magenta InternalError shaders in stills (0% magenta pixels).

Bridge and gate are first-party `PremiumPrototype` meshes (`bridge_round`, `gate_arch`) with Idyllic-copied wood/stone. The pack has no wooden bridge or zoo arch.

## Animals

20 unique fixtures, all active: walk 8, hop 4, fly 4, float 4. Card 2.5D, sway, squash, contact shadows. Player smoke: `ZOO_PLAYER_SMOKE_OK activeCreatures=20 walk=8 hop=4 fly=4 float=4`.

## Tests

EditMode: 22/22 passed (includes 5 Idyllic layout tests).

PlayMode: 17 passed, 1 skipped (explicit 5-minute soak test for `ZooGarden`, not this run). All 7 `IdyllicGardenRuntimeTests` passed: load, 20 unique IDs, 8/4/4/4, habitat zones, shaders/meshes, stay in zones after 6s, reinitialize releases runtime assets, overview 12+ animals in 4:3 and 16:9, no Kenney / no visible Unity primitives.

macOS Development Player: succeeded (`Builds/macOS-idyllic/VirtualZoo.app`). Player scenes: only `ZooIdyllicGarden`. Summary `errors=2` are Hub licensing token + usbmuxd, not project compile errors.

Player smoke: pass, 20 creatures, all four locomotion classes.

iOS unsigned Xcode project: `ZOO_IDYLLIC_IOS_BUILD result=Succeeded errors=5 path=.../Builds/ios-idyllic`. The iOS build target was supported (no `ZOO_IDYLLIC_IOS_SKIP`). Not code-signed. Summary `errors=5` are the same class of editor/device noise (Hub licensing token, usbmuxd), not project compile errors.

## Command results

| Check | Result |
| --- | --- |
| Scene generate | `ZOO_IDYLLIC_GENERATE_OK scene=Assets/VirtualZoo/Scenes/ZooIdyllicGarden.unity` |
| Evidence | `ZOO_IDYLLIC_STILLS_OK`, `ZOO_IDYLLIC_EVIDENCE_CAPTURE_OK frames=6` (`-force-metal`) |
| EditMode | **22 passed**, 0 failed (`editmode-results.xml`) |
| PlayMode | **17 passed**, 1 skipped (explicit `ZooGarden` 5-minute soak), 0 failed. All 7 `IdyllicGardenRuntimeTests` passed |
| macOS Development Player | `ZOO_IDYLLIC_PLAYER_BUILD result=Succeeded errors=2` |
| Player smoke | `ZOO_PLAYER_SMOKE_OK activeCreatures=20 walk=8 hop=4 fly=4 float=4` |
| iOS unsigned Xcode | `ZOO_IDYLLIC_IOS_BUILD result=Succeeded errors=5` |
| 300 s Metal soak | See below; process exit 0 |

## Soak (300 s Metal, no screenshot capture)

`handoff/evidence/iteration-01a-idyllic/soak-metrics.json` after `IdyllicSoakRunner.Run` (`-force-metal`, soak_exit=0):

```json
{
  "soakSeconds": 300.01,
  "warmupSeconds": 5.00,
  "capturePerformed": false,
  "totalGameplayFrames": 17946,
  "sampleCount": 17692,
  "fpsAverage": 60.03,
  "fpsMin": 13.40,
  "fpsMax": 598.89,
  "frameMsP50": 16.69,
  "frameMsP95": 16.71,
  "frameMsP99": 16.73,
  "frameMsMax": 74.60,
  "secondsBelow30Fps": 0.26,
  "longestBelow30StreakSeconds": 0.07,
  "memoryBytesStart": 382916314,
  "memoryBytesEnd": 323627708,
  "activeCreatures": 20,
  "projectConsoleErrors": 0,
  "projectConsoleWarnings": 0
}
```

Invariants held: 20 creatures, `capturePerformed=false`, longest sub-30 FPS streak 0.07 s (threshold is ≥1 s), 0 project console errors/warnings. `fpsMin=13.40` is a sub-frame hitch, not a sustained drop. P50/P95/P99 sit on the 60 Hz vsync line (~16.7 ms). `console-soak.log` records only the runner enter line.

## Visual check (full-size stills)

Opened and inspected:

1. `handoff/evidence/iteration-01a-idyllic/hero-ipad-4x3.png`
2. `handoff/evidence/iteration-01a-idyllic/hero-iphone-landscape.png`
3. `handoff/evidence/iteration-01a-idyllic/environment-clean.png`
4. `handoff/evidence/iteration-01a-idyllic/closeup-walk-hop.png`
5. `handoff/evidence/iteration-01a-idyllic/zone-fly-float.png`
6. `handoff/evidence/iteration-01a-idyllic/reference-comparison.png` (reference on the left, unchanged; new 4:3 hero on the right)

First capture pass had ~26% saturated red in the 4:3 hero: vendor Bush_01/Bush_03 tints. Fixed with garden-green material copies. Recaptured.

Second pass: closeup and pond cameras sat inside foliage. Moved grass/willows off those rays and recaptured.

What reads now:

- Green meadow, S-path, turquoise pond, wooden bridge, blossom trees at the gate, mixed-scale trees on the borders
- 2.5D creatures with contact shadows; closeup shows walk/hop on the path
- Pond still shows water, lily, cattails, bridge; float/fly visible in the distance
- No Kenney props; no magenta shaders

Remaining gap versus `handoff/references/virtual-zoo-art-direction-v1.png` (reviewer must judge class):

- The pack is stylized low/mid poly with lime canopies, not painterly volume lighting. Geometry cannot match the concept’s studio look.
- Pond shoreline is a smooth ellipse, not an irregular bank.
- Cliff walls still read as a quarry rim more than rolling hills.
- Lighting is bright and relatively flat; shadows exist but are not cinematic haze.
- Center meadow is intentionally open for animals, so border density is higher than the middle.
- Path cobble can read as warm boards from overview.

This is closer to a compact children’s garden than Kenney or the rejected beige meadow. It is not the concept painting.

## Known limits

- Pack has no authored wooden bridge or fairy-tale gate; those two pieces stay first-party.
- Vegetation shader wind is unused (WindControl writes vendor materials in OnValidate; we do not instantiate it).
- Editor Build Settings still list `ZooGarden` and `ZooArtDirection` so existing tests load. The macOS/iOS Player for this rework includes only `ZooIdyllicGarden`.
- Hidden `Ground` cube collider has MeshRenderer disabled (navmesh). Creature contact shadows remain small spheres.

## Unverified

- Physical iPhone / iPad install, on-device 60 FPS, and real multi-touch
- Interactive Editor Game View (evidence used batchmode Metal `Camera.Render`)
- Developer overlay pixels in stills (`OnGUI` is not in `Camera.Render`)
- Drawing import, camera capture, backend generation, care, cards, audio
- Offline cache of *generated* animals (only bundled fixtures exist)
- Concept-class match versus `handoff/references/virtual-zoo-art-direction-v1.png` — reviewer judgment

## Secrets

No provider secrets, PATs, or production credentials were added. `.env` is absent. OpenRouter values in `.env.example` remain empty. OpenRouter is not called from Unity. Vendor Asset Store files stay inside the Unity project copy only.

## ZIP

`outputs/virtual-zoo-iteration-01a-idyllic-rework.zip`. No SHA-256.

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
