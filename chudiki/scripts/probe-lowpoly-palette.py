#!/usr/bin/env python3
"""Blender headless: report which palette colours each Trees Package Lite mesh
actually uses, and how the faces are split between them.

The pack ships one material and one 256x256 palette; trunk and canopy differ
only by which cell of that palette their UVs land in. Before any gradient can be
baked, the export needs a reliable way to tell those parts apart, so this dumps
the ground truth rather than guessing at a heuristic.
"""
import os
from collections import defaultdict

import bpy

PACK = "/Volumes/Siska/DEVELOP/zoofun/client/VirtualZoo/Assets/Trees Package Lite"
MESHES = os.path.join(PACK, "Meshes")
TEXTURE = os.path.join(PACK, "Textures/texture.png")

NAMES = [
    "tree_1", "tree_2", "oak_tree", "pine_tree_1", "sakura_tree", "dragon_tree",
    "bush_01", "bush_02", "tree_1_fall_001", "tree_2_fall_001",
]


def load_palette():
    image = bpy.data.images.load(TEXTURE)
    width, height = image.size
    pixels = list(image.pixels)
    return width, height, pixels


def sample(width, height, pixels, u, v):
    x = min(max(int(u * width), 0), width - 1)
    y = min(max(int(v * height), 0), height - 1)
    index = (y * width + x) * 4
    return tuple(round(pixels[index + i], 3) for i in range(3))


def main():
    width, height, pixels = load_palette()

    for name in NAMES:
        path = os.path.join(MESHES, f"{name}.fbx")
        if not os.path.exists(path):
            print("MISSING", name)
            continue

        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.fbx(filepath=path)
        meshes = [o for o in bpy.data.objects if o.type == "MESH"]
        if not meshes:
            print("NO MESH", name)
            continue

        buckets = defaultdict(lambda: {"faces": 0, "zmin": 1e9, "zmax": -1e9})
        for obj in meshes:
            mesh = obj.data
            uv = mesh.uv_layers.active.data
            for poly in mesh.polygons:
                us = [uv[i].uv[0] for i in poly.loop_indices]
                vs = [uv[i].uv[1] for i in poly.loop_indices]
                colour = sample(width, height, pixels, sum(us) / len(us), sum(vs) / len(vs))
                zs = [mesh.vertices[mesh.loops[i].vertex_index].co.z for i in poly.loop_indices]
                bucket = buckets[colour]
                bucket["faces"] += 1
                bucket["zmin"] = min(bucket["zmin"], min(zs))
                bucket["zmax"] = max(bucket["zmax"], max(zs))

        print(f"\n=== {name}")
        for colour, info in sorted(buckets.items(), key=lambda kv: -kv[1]["faces"]):
            print(
                f"  rgb={colour} faces={info['faces']:5d} "
                f"z={info['zmin']:.2f}..{info['zmax']:.2f}"
            )


if __name__ == "__main__":
    main()
