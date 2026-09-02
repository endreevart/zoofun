# Virtual Zoo Premium Prototype (first-party)

- Source: authored in this repository
- Author: Virtual Zoo project (original Blender pipeline)
- Supplier: none (not a purchased or downloaded pack)
- Title: Premium Prototype environment kit
- Date obtained: 2026-08-27
- License: original project artwork. Commercial use, modification, and inclusion in a mobile game are allowed for Virtual Zoo.

These meshes and textures were built in Blender 5.1.2 with `tools/blender/build_premium_prototype.py`. They are not Kenney assets and are not Unity primitives.

## Source files

- Blender scene: `art-source/blender/premium_prototype.blend`
- Pipeline: `tools/blender/build_premium_prototype.py`
- Game meshes: `*.fbx` in this folder
- Textures: `Textures/*.png`

## Modifications after generation

- Triangulated on export
- Smooth shading / auto-smooth
- Bevels on hard edges
- Two material slots on trees (bark / canopy), flowers (stem / petal), lanterns (wood / glass), lily pads (pad / bloom), and the story tower (stone / roof)
- Imported in Unity URP with project Lit / foliage / water / creature-card materials
- Pond water uses an original opaque turquoise shader (no scene-color refraction)
- Simple box colliders on large props; meadow walking surface uses a hidden ground collider for NavMesh

No third-party mesh was downloaded or purchased for this spike.
