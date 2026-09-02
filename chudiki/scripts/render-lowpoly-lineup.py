#!/usr/bin/env python3
"""Blender headless: contact sheet of the Trees Package Lite models.

Run:
  blender --background --python scripts/render-lowpoly-lineup.py

The pack is solid low-poly geometry sharing one 256x256 gradient palette, so
this checks the thing that actually matters before any porting work: whether the
UVs land on the right ramps, and what the silhouettes look like in a row.
"""
import math
import os

import bpy
from mathutils import Vector

PACK = "/Volumes/Siska/DEVELOP/zoofun/client/VirtualZoo/Assets/Trees Package Lite"
MESHES = os.path.join(PACK, "Meshes")
TEXTURE = os.path.join(PACK, "Textures/texture.png")
OUT = "/Volumes/Siska/DEVELOP/zoofun/chudiki/scripts/tree-lineup"

# One row of canopy trees at their own relative proportions, one row of the
# smaller pieces. Normalising everything to a single height, as a first pass did,
# turns a 30 cm pebble into a boulder and tells you nothing about the pack.
ROW_A = ["tree_1", "tree_2", "oak_tree", "pine_tree_1", "sakura_tree", "dragon_tree", "oak_tree"]
ROW_B = ["bush_01", "bush_02", "rock_005", "fence_1", "tree_1_fall_001", "tree_2_fall_001"]

SPACING = 6.4
ROW_GAP = 9.0
# Canopy trees are normalised to this; the small row keeps its source scale.
CANOPY_HEIGHT = 5.0
# The pack authors its trees around 7.8 m tall and the garden plants them at 5.
PACK_SCALE = CANOPY_HEIGHT / 7.8


def build_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.film_transparent = False

    world = bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.62, 0.8, 0.95, 1)

    bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 0, 0))
    ground = bpy.context.active_object
    gmat = bpy.data.materials.new("ground")
    gmat.use_nodes = True
    gmat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (
        0.30, 0.55, 0.16, 1,
    )
    ground.data.materials.append(gmat)

    bpy.ops.object.light_add(type="SUN")
    sun = bpy.context.active_object
    sun.data.energy = 3.4
    sun.data.angle = 0.2
    sun.rotation_euler = (math.radians(52), math.radians(6), math.radians(28))

    bpy.ops.object.camera_add()
    cam = bpy.context.active_object
    cam.data.lens = 26
    cam.data.clip_end = 10000
    scene.camera = cam
    return cam


def palette_material():
    """One material for the whole pack, exactly as the pack itself ships it."""
    mat = bpy.data.materials.new("palette")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.8
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(TEXTURE)
    # Nearest keeps the palette cells from bleeding into each other.
    tex.interpolation = "Closest"
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def bounds(objects):
    lo = Vector((1e18, 1e18, 1e18))
    hi = Vector((-1e18, -1e18, -1e18))
    for obj in objects:
        for corner in obj.bound_box:
            p = obj.matrix_world @ Vector(corner)
            lo.x, lo.y, lo.z = min(lo.x, p.x), min(lo.y, p.y), min(lo.z, p.z)
            hi.x, hi.y, hi.z = max(hi.x, p.x), max(hi.y, p.y), max(hi.z, p.z)
    return lo, hi


def place(name, material, x, y, normalize_to=None, smooth=True):
    path = os.path.join(MESHES, f"{name}.fbx")
    if not os.path.exists(path):
        print("MISSING", path)
        return None

    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path)
    imported = list(set(bpy.data.objects) - before)
    meshes = [o for o in imported if o.type == "MESH"]
    if not meshes:
        print("NO MESH", name)
        return None

    for obj in meshes:
        obj.data.materials.clear()
        obj.data.materials.append(material)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    lo, hi = bounds([obj])
    height = max(hi.z - lo.z, 1e-4)
    # Canopy trees are levelled to a common height so the silhouettes can be
    # compared; everything else takes the pack-wide factor, which is what the
    # garden would actually apply, so a pebble stays a pebble.
    scale = (normalize_to / height) if normalize_to else PACK_SCALE
    obj.scale = (scale, scale, scale)

    if smooth:
        # Auto-smooth: round the canopy facets but keep the trunk/leaf crease.
        for poly in obj.data.polygons:
            poly.use_smooth = True
        modifier = obj.modifiers.new("smooth-by-angle", "EDGE_SPLIT")
        modifier.split_angle = math.radians(38)

    bpy.context.view_layer.update()

    lo, hi = bounds([obj])
    obj.location = (
        x - (lo.x + hi.x) / 2,
        y - (lo.y + hi.y) / 2,
        -lo.z,
    )
    bpy.context.view_layer.update()

    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    print(f"MODEL {name}: {tris} tris, source height {height:.2f} m, uv={bool(obj.data.uv_layers)}")

    # Clean up whatever else came in with the FBX.
    for stale in imported:
        if stale.name in bpy.data.objects and stale is not obj:
            bpy.data.objects.remove(stale, do_unlink=True)
    return obj


def main():
    os.makedirs(OUT, exist_ok=True)
    cam = build_scene()
    material = palette_material()

    for column, name in enumerate(ROW_A):
        place(name, material, (column - (len(ROW_A) - 1) / 2) * SPACING, 0.0, CANOPY_HEIGHT)
    for column, name in enumerate(ROW_B):
        place(name, material, (column - (len(ROW_B) - 1) / 2) * SPACING, -ROW_GAP)

    cam.location = Vector((0, -30.0, 8.0))
    target = Vector((0, -2.0, 2.2))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()

    bpy.context.scene.render.filepath = os.path.join(OUT, "lowpoly-pack-lineup.png")
    bpy.ops.render.render(write_still=True)
    print("RENDER_OK")


if __name__ == "__main__":
    main()
