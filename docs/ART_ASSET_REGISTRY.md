# Art asset registry

Virtual Zoo only uses assets with a recorded source, author or supplier, license text, commercial permission, and permission to ship in a mobile game. A file marked only “free” is not enough.

Store per-pack licenses at `client/VirtualZoo/Assets/ThirdParty/<Provider>/<Pack>/LICENSE.md`. First-party prototype art lives next to the meshes.

| Asset | Location | Author / supplier | License | Commercial + mobile | Date | Changes |
| --- | --- | --- | --- | --- | --- | --- |
| Premium Prototype environment kit (FBX + painterly textures) | `client/VirtualZoo/Assets/VirtualZoo/Art/PremiumPrototype/` | Virtual Zoo (Blender 5.1.2 pipeline `tools/blender/build_premium_prototype.py`) | Original project artwork; see `PremiumPrototype/LICENSE.md` | Yes, for Virtual Zoo | 2026-08-27 | Bevel, smooth normals, triangulate, URP materials, colliders, LOD not required at this density |
| Premium Prototype source scene | `art-source/blender/premium_prototype.blend` | Virtual Zoo | Original project artwork | Yes, for Virtual Zoo | 2026-08-27 | Authoring file only; not loaded at runtime |
| Pilot fixture drawings (20 PNG + JSON) | `client/VirtualZoo/Assets/StreamingAssets/VirtualZoo/Fixtures/` | Virtual Zoo (`FixtureRecipes` rasterizer) | Original project artwork | Yes, for Virtual Zoo | 2026-08-26 | Rasterized ellipses kept as drawing identity |
| Web island props (Meshy + exported Idyllic GLBs) | `chudiki/public/models/props/`, `chudiki/public/models/idyllic/` | Mixed; see filenames | Used only as runtime web assets | Yes, for this playground | 2026-09-02 | Only models placed on the island or in the layout catalog |

Unity Asset Store environment packs (Idyllic Fantasy Nature, TriForge, Kenney Nature Kit, rocks, fog, etc.) were removed from disk. They were not loaded by the web zoo. The live island uses the exported GLBs under `chudiki/public/`.

## Import checklist (premium meshes)

Each mesh in `ZooArtDirection` was produced by the Blender pipeline, then imported in Unity URP:

- Visual check in the hero scene (`ZooArtDirection`)
- Extra interior faces avoided by construction (solid, joined, triangulated)
- Normals recalculated / auto-smooth
- Smart UV unwrap in Blender
- Poly count kept to game-ready (no raw neural-mesh dumps)
- Material slots merged to bark/leaf, wood/glass, stem/petal, lily pad/bloom where needed
- LOD skipped: hero fragment is compact
- Simple colliders on large props; hidden ground collider for NavMesh
- Scale and pivot: origin at bottom for placeable props; world-space for meadow/path/pond/bridge/hills
- URP Lit, foliage, and opaque `PremiumWater` in the Game view
- 60-second Mac run on the hero scene targeting 60 FPS
