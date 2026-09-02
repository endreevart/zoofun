#!/usr/bin/env python3
"""Decimate a packed Meshy GLB and shrink its textures for the web zoo.

  blender --background --python scripts/optimize-prop-glb.py -- \
    SRC.glb --ratio 0.04 --max-image 1024 --out public/models/props/NAME.glb

One pass only. A second collapse on the same file tears UVs and leaves
cracks in lily pads, arches and anything thin.
Hero props want --ratio 0.035–0.05 (~80–150k faces). Do not stack 0.025 then 0.4.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bpy


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("glb", type=Path)
    parser.add_argument("--ratio", type=float, default=0.018)
    parser.add_argument("--max-image", type=int, default=1024)
    parser.add_argument("--out", type=Path)
    return parser.parse_args(argv)


def main() -> None:
    args = parse_args()
    src = args.glb.resolve()
    dest = (args.out or args.glb).resolve()

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(src))

    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    before = sum(len(obj.data.polygons) for obj in meshes)
    for obj in meshes:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        dec = obj.modifiers.new(name="web_lod", type="DECIMATE")
        dec.decimate_type = "COLLAPSE"
        dec.ratio = args.ratio
        bpy.ops.object.modifier_apply(modifier=dec.name)
        obj.select_set(False)
    after = sum(len(obj.data.polygons) for obj in meshes)

    for image in bpy.data.images:
        if image.size[0] <= args.max_image and image.size[1] <= args.max_image:
            continue
        image.scale(args.max_image, args.max_image)

    bpy.ops.export_scene.gltf(
        filepath=str(dest),
        export_format="GLB",
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_animations=False,
        export_apply=True,
    )
    print(f"[optimize] {src.name} -> {dest.name}: {before} faces -> {after} faces")


if __name__ == "__main__":
    main()
