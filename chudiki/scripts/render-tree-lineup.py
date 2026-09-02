#!/usr/bin/env python3
"""Blender headless: render each candidate tree from exports/unity-assets to
its own image, camera auto-framed, so the user can compare packs with the
painted reference."""
import math
import os

import bpy
from mathutils import Vector

ROOT = "/Volumes/Siska/DEVELOP/zoofun/exports/unity-assets"
OUT = "/Volumes/Siska/DEVELOP/zoofun/chudiki/scripts/tree-lineup"

CANDIDATES = [
    (
        "idyllic-broadleaf",
        "Idyllic Fantasy Nature/Models/Trees/BroadleafTree_01.fbx",
        "Idyllic Fantasy Nature/Textures/Trees/BroadleafTree_Leaves.png",
        True,
    ),
    (
        "hqp-simple-tree",
        "HQP STUDIOS/Low Poly Trees and Vegetation - Pack/Models/Trees/Simple Trees/Simple Trees/Simple_Tree_1.fbx",
        "HQP STUDIOS/Low Poly Trees and Vegetation - Pack/Textures/ColorGrid.png",
        False,
    ),
    (
        "palmov-spherical",
        "Palmov Island/Low Poly Environment Park/Models/Trees/spherical tree.fbx",
        "Palmov Island/Low Poly Environment Park/Textures/texture main.png",
        False,
    ),
    (
        "palmov-round",
        "Palmov Island/Low Poly Environment Park/Models/Trees/tree round foliage.fbx",
        "Palmov Island/Low Poly Environment Park/Textures/texture main.png",
        False,
    ),
    (
        "jc-stylized-tree",
        "JC_StylizedNature_Lite/Models/SM_Tree_01.fbx",
        "JC_StylizedNature_Lite/Textures/Tree_01/T_Tree_01_Base.png",
        True,
    ),
    (
        "toon-env-tree",
        "Selcuk Gerceker/Toon Environments - World Creator Pack Lite/Models/Props/Tree.fbx",
        "Selcuk Gerceker/Toon Environments - World Creator Pack Lite/Textures/Summer.png",
        False,
    ),
    (
        "symphonie-oak",
        "Symphonie/StylizedForestKit Samples/Model/M_Oak01.fbx",
        "Symphonie/StylizedForestKit Samples/Texture/Oak/T_Oak01_D.png",
        True,
    ),
    (
        "cozyfarm-bush",
        "CozyFarmAssetPack/cozy farm/Models/bushesgreen.fbx",
        "CozyFarmAssetPack/cozy farm/Textures/styloomodifiedimphezia-256-Gradient.png",
        False,
    ),
]


def make_material(name, texture_path, alpha_clip):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.75
    if texture_path and os.path.exists(texture_path):
        tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(texture_path)
        mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        if alpha_clip:
            mat.node_tree.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
            mat.blend_method = "CLIP"
    else:
        bsdf.inputs["Base Color"].default_value = (0.35, 0.6, 0.3, 1.0)
    mat.use_backface_culling = False
    return mat


def build_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900

    world = bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.78, 0.9, 0.98, 1)

    bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 0, 0))
    ground = bpy.context.active_object
    gmat = bpy.data.materials.new("ground")
    gmat.use_nodes = True
    gmat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (
        0.32,
        0.62,
        0.2,
        1,
    )
    ground.data.materials.append(gmat)

    bpy.ops.object.light_add(type="SUN", location=(10, -10, 20))
    sun = bpy.context.active_object
    sun.data.energy = 3.2
    sun.data.angle = 0.25
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(35))

    bpy.ops.object.camera_add(location=(0, -10, 3))
    cam = bpy.context.active_object
    cam.data.lens = 42
    cam.data.clip_end = 10000
    scene.camera = cam
    return cam


def world_bounds(objects):
    lo = Vector((1e18, 1e18, 1e18))
    hi = Vector((-1e18, -1e18, -1e18))
    for obj in objects:
        for corner in obj.bound_box:
            p = obj.matrix_world @ Vector(corner)
            lo.x, lo.y, lo.z = min(lo.x, p.x), min(lo.y, p.y), min(lo.z, p.z)
            hi.x, hi.y, hi.z = max(hi.x, p.x), max(hi.y, p.y), max(hi.z, p.z)
    return lo, hi


def render_one(cam, label, fbx_rel, tex_rel, alpha_clip):
    fbx = os.path.join(ROOT, fbx_rel)
    if not os.path.exists(fbx):
        print("MISSING", fbx)
        return
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=fbx)
    imported = [o for o in set(bpy.data.objects) - before]
    meshes = [o for o in imported if o.type == "MESH"]
    if not meshes:
        print("NO MESH", fbx)
        for o in imported:
            bpy.data.objects.remove(o, do_unlink=True)
        return

    tex = os.path.join(ROOT, tex_rel) if tex_rel else None
    override = make_material(label, tex, alpha_clip)
    for obj in meshes:
        has_texture = False
        for slot in obj.material_slots:
            m = slot.material
            if m and m.use_nodes and any(
                n.type == "TEX_IMAGE" and n.image for n in m.node_tree.nodes
            ):
                has_texture = True
        if not has_texture:
            obj.data.materials.clear()
            obj.data.materials.append(override)

    bpy.context.view_layer.update()
    lo, hi = world_bounds(meshes)
    size = hi - lo
    height = max(size.z, 1e-3)
    scale = 4.0 / height
    center = (lo + hi) / 2

    for obj in meshes:
        if obj.parent in meshes or obj.parent in imported:
            continue
        obj.location = (obj.location - center) * scale + Vector((0, 0, 0))
        obj.scale = obj.scale * scale
    bpy.context.view_layer.update()
    lo, hi = world_bounds(meshes)
    dz = -lo.z
    for obj in meshes:
        if obj.parent in meshes or obj.parent in imported:
            continue
        obj.location.z += dz
    bpy.context.view_layer.update()

    lo, hi = world_bounds(meshes)
    center = (lo + hi) / 2
    radius = max((hi - lo).length / 2, 1.0)
    cam.location = center + Vector((0, -radius * 2.3, radius * 0.55))
    direction = center - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

    bpy.context.scene.render.filepath = os.path.join(OUT, f"{label}.png")
    bpy.ops.render.render(write_still=True)
    print("RENDER_OK", label)

    for o in imported:
        bpy.data.objects.remove(o, do_unlink=True)


def main():
    os.makedirs(OUT, exist_ok=True)
    cam = build_scene()
    for label, fbx, tex, clip in CANDIDATES:
        render_one(cam, label, fbx, tex, clip)


if __name__ == "__main__":
    main()
