#!/usr/bin/env python3
"""Blender headless: assemble a preview of the painted-garden composition from
the packs in exports/unity-assets (Symphonie oak, CozyFarm, Toon Environments,
Idyllic flowers, hand-painted ground textures) and render one hero frame.

The goal is a fast, honest look-test before any game code changes.
"""
import math
import os
import random

import bpy
from mathutils import Euler, Matrix, Vector

ROOT = "/Volumes/Siska/DEVELOP/zoofun/exports/unity-assets"
OUT = "/Volumes/Siska/DEVELOP/zoofun/chudiki/scripts/tree-lineup/garden-preview.png"

OAK = "Symphonie/StylizedForestKit Samples/Model/M_Oak01.fbx"
OAK_TEX = "Symphonie/StylizedForestKit Samples/Texture/Oak/T_Oak01_D.png"
TOON_TREE = "Selcuk Gerceker/Toon Environments - World Creator Pack Lite/Models/Props/Tree.fbx"
TOON_TEX = "Selcuk Gerceker/Toon Environments - World Creator Pack Lite/Textures/Summer.png"
COZY = "CozyFarmAssetPack/cozy farm/Models"
COZY_TEX = "CozyFarmAssetPack/cozy farm/Textures/styloomodifiedimphezia-256-Gradient.png"
FLOWERS_DIR = "Idyllic Fantasy Nature/Models/Flowers"
FLOWER_TEX = "Idyllic Fantasy Nature/Textures/Flowers/Flower.png"
MEADOW_TEX = "Idyllic Fantasy Nature/Textures/Flowers/FlowerMeadow.png"
WATERPLANTS_DIR = "Idyllic Fantasy Nature/Models/Waterplants"
PROTO = "VirtualZoo/Art/PremiumPrototype"
GRASS_TEX = "Handpainted_Grass_and_Ground_Textures/Textures/Grass/Grass_normal/Grass_normal_up.png"
DIRT_TEX = "Handpainted_Grass_and_Ground_Textures/Textures/Dirt/dirt_clay/dirt_clay_up.png"

rng = random.Random(7)

MATS = {}


def texture_material(name, tex_rel, alpha_clip=False, tint=None, roughness=0.8):
    key = (name, tex_rel, alpha_clip, tint)
    if key in MATS:
        return MATS[key]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = roughness
    path = os.path.join(ROOT, tex_rel) if tex_rel else None
    if path and os.path.exists(path):
        tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(path, check_existing=True)
        if tint:
            mix = mat.node_tree.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            mix.inputs["Factor"].default_value = 1.0
            mix.inputs[7].default_value = (*tint, 1.0)
            mat.node_tree.links.new(tex.outputs["Color"], mix.inputs[6])
            mat.node_tree.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
        else:
            mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        if alpha_clip:
            mat.node_tree.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
            mat.blend_method = "CLIP"
    elif tint:
        bsdf.inputs["Base Color"].default_value = (*tint, 1.0)
    mat.use_backface_culling = False
    MATS[key] = mat
    return mat


def color_material(name, color, roughness=0.85):
    return texture_material(name, None, tint=color, roughness=roughness)


def import_fbx(fbx_rel):
    path = os.path.join(ROOT, fbx_rel)
    if not os.path.exists(path):
        print("MISSING", path)
        return None
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path)
    imported = [o for o in set(bpy.data.objects) - before]
    meshes = [o for o in imported if o.type == "MESH"]
    if not meshes:
        for o in imported:
            bpy.data.objects.remove(o, do_unlink=True)
        return None
    extra_names = [o.name for o in imported if o not in meshes]
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    for name in extra_names:
        stale = bpy.data.objects.get(name)
        if stale is not None and stale is not obj:
            bpy.data.objects.remove(stale, do_unlink=True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # Re-center: many pack FBXs carry huge scene offsets (x~200m). Shift the
    # mesh so its footprint center sits at origin and its base at z=0.
    xs = [v.co.x for v in obj.data.vertices]
    ys = [v.co.y for v in obj.data.vertices]
    zs = [v.co.z for v in obj.data.vertices]
    cx = (min(xs) + max(xs)) / 2
    cy = (min(ys) + max(ys)) / 2
    mz = min(zs)
    obj.data.transform(Matrix.Translation((-cx, -cy, -mz)))
    return obj


TEMPLATES = {}


def template(fbx_rel, material):
    """Import once, reuse via linked duplicates."""
    key = fbx_rel
    if key in TEMPLATES:
        return TEMPLATES[key]
    obj = import_fbx(fbx_rel)
    if obj is None:
        TEMPLATES[key] = None
        return None
    obj.data.materials.clear()
    obj.data.materials.append(material)
    obj.location = (0, 0, -1000)  # park the template out of sight
    TEMPLATES[key] = obj
    return obj


def place(fbx_rel, material, x, y, height, yaw_deg=0.0, squash=(1, 1, 1), z=0.0):
    tpl = template(fbx_rel, material)
    if tpl is None:
        return None
    copy = bpy.data.objects.new(tpl.name + "_i", tpl.data)
    bpy.context.collection.objects.link(copy)
    dims = tpl.dimensions
    base = max(dims.z, 1e-4)
    s = height / base
    copy.scale = (s * squash[0], s * squash[1], s * squash[2])
    copy.rotation_euler = Euler((0, 0, math.radians(yaw_deg)))
    copy.location = (x, y, z)  # meshes are re-centered with base at z=0
    return copy


def build_ground():
    bpy.ops.mesh.primitive_plane_add(size=64, location=(0, 4, 0))
    ground = bpy.context.active_object
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.subdivide(number_cuts=48)
    bpy.ops.object.mode_set(mode="OBJECT")
    mesh = ground.data
    for v in mesh.vertices:
        d = math.hypot(v.co.x, v.co.y - 4)
        v.co.z += 0.035 * math.sin(v.co.x * 0.9) * math.cos(v.co.y * 0.7)
        if d > 14:
            v.co.z += (d - 14) * 0.16  # rising rim like the painted hills
    mat = texture_material("grass", GRASS_TEX, tint=(0.6, 0.82, 0.38), roughness=0.95)
    tex_node = next(n for n in mat.node_tree.nodes if n.type == "TEX_IMAGE")
    mapping = mat.node_tree.nodes.new("ShaderNodeMapping")
    coords = mat.node_tree.nodes.new("ShaderNodeTexCoord")
    mapping.inputs["Scale"].default_value = (14, 14, 1)
    mat.node_tree.links.new(coords.outputs["UV"], mapping.inputs["Vector"])
    mat.node_tree.links.new(mapping.outputs["Vector"], tex_node.inputs["Vector"])
    ground.data.materials.append(mat)
    ground.name = "ground"


PATH_POINTS = [
    (1.0, -10.0),
    (1.5, -6.5),
    (1.9, -3.5),
    (1.2, -1.0),
    (0.3, 1.6),
    (-0.4, 3.8),
    (-1.1, 6.2),
]


def path_point(t):
    n = len(PATH_POINTS) - 1
    f = t * n
    i = min(int(f), n - 1)
    u = f - i
    ax, ay = PATH_POINTS[max(i - 1, 0)]
    bx, by = PATH_POINTS[i]
    cx, cy = PATH_POINTS[i + 1]
    dx, dy = PATH_POINTS[min(i + 2, n)]
    # Catmull-Rom
    def cr(a, b, c, d):
        return 0.5 * (
            2 * b
            + (-a + c) * u
            + (2 * a - 5 * b + 4 * c - d) * u * u
            + (-a + 3 * b - 3 * c + d) * u * u * u
        )
    return cr(ax, bx, cx, dx), cr(ay, by, cy, dy)


def build_path():
    steps = 140
    half = 0.95
    verts = []
    faces = []
    uvs = []
    for i in range(steps + 1):
        t = i / steps
        x, y = path_point(t)
        x2, y2 = path_point(min(t + 0.01, 1.0))
        tx, ty = x2 - x, y2 - y
        L = math.hypot(tx, ty) or 1.0
        nx, ny = -ty / L, tx / L
        w = half
        verts.append((x + nx * w, y + ny * w, 0.07))
        verts.append((x - nx * w, y - ny * w, 0.07))
        if i < steps:
            k = i * 2
            faces.append((k, k + 1, k + 3, k + 2))
    mesh = bpy.data.meshes.new("path")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("path", mesh)
    bpy.context.collection.objects.link(obj)
    # UVs along the ribbon
    uv_layer = mesh.uv_layers.new()
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            vi = mesh.loops[li].vertex_index
            row = vi // 2
            side = vi % 2
            uv_layer.data[li].uv = (side, row * 0.25)
    mat = texture_material("dirt", DIRT_TEX, tint=(1.0, 0.82, 0.55), roughness=0.95)
    obj.data.materials.append(mat)


POND_C = (-3.4, 0.6)


def build_pond():
    bpy.ops.mesh.primitive_circle_add(vertices=48, radius=1.0, fill_type="NGON", location=(POND_C[0], POND_C[1], 0.045))
    pond = bpy.context.active_object
    pond.scale = (2.3, 1.75, 1)
    mat = bpy.data.materials.new("water")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.02, 0.3, 0.31, 1)
    bsdf.inputs["Roughness"].default_value = 0.6
    for emission_key in ("Emission Color", "Emission"):
        if emission_key in bsdf.inputs:
            bsdf.inputs[emission_key].default_value = (0.12, 0.6, 0.6, 1)
            break
    if "Emission Strength" in bsdf.inputs:
        bsdf.inputs["Emission Strength"].default_value = 0.55
    pond.data.materials.append(mat)

    # creek flowing from the pond toward the bottom-left, under the bridge
    creek_pts = [(-4.0, -0.4), (-4.8, -2.2), (-5.4, -4.8), (-5.8, -8.0), (-6.1, -11.5)]
    verts, faces = [], []
    for i in range(len(creek_pts)):
        x, y = creek_pts[i]
        nx_, ny_ = creek_pts[min(i + 1, len(creek_pts) - 1)]
        px_, py_ = creek_pts[max(i - 1, 0)]
        tx, ty = nx_ - px_, ny_ - py_
        L = math.hypot(tx, ty) or 1.0
        ox, oy = -ty / L * 0.45, tx / L * 0.45
        verts.append((x + ox, y + oy, 0.04))
        verts.append((x - ox, y - oy, 0.04))
        if i < len(creek_pts) - 1:
            k = i * 2
            faces.append((k, k + 1, k + 3, k + 2))
    cmesh = bpy.data.meshes.new("creek")
    cmesh.from_pydata(verts, [], faces)
    cmesh.update()
    cobj = bpy.data.objects.new("creek", cmesh)
    bpy.context.collection.objects.link(cobj)
    cmat = bpy.data.materials.new("creekwater")
    cmat.use_nodes = True
    cb = cmat.node_tree.nodes["Principled BSDF"]
    cb.inputs["Base Color"].default_value = (0.02, 0.26, 0.27, 1)
    cb.inputs["Roughness"].default_value = 0.6
    for emission_key in ("Emission Color", "Emission"):
        if emission_key in cb.inputs:
            cb.inputs[emission_key].default_value = (0.08, 0.45, 0.46, 1)
            break
    if "Emission Strength" in cb.inputs:
        cb.inputs["Emission Strength"].default_value = 0.35
    cobj.data.materials.append(cmat)


def scatter_flowers():
    flower_files = []
    d = os.path.join(ROOT, FLOWERS_DIR)
    for f in sorted(os.listdir(d)):
        if f.endswith(".fbx"):
            flower_files.append(os.path.join(FLOWERS_DIR, f))
    meadow = [f for f in flower_files if "Meadow" in f]
    singles = [f for f in flower_files if "Meadow" not in f]

    spots = []
    for i in range(26):
        t = rng.uniform(0.05, 0.95)
        x, y = path_point(t)
        side = 1 if i % 2 == 0 else -1
        spots.append((x + side * rng.uniform(1.4, 2.6), y + rng.uniform(-0.4, 0.4)))
    for i in range(10):
        a = rng.uniform(0, 2 * math.pi)
        spots.append((POND_C[0] + math.cos(a) * rng.uniform(2.4, 3.2), POND_C[1] + math.sin(a) * rng.uniform(1.9, 2.6)))

    for i, (x, y) in enumerate(spots):
        if abs(x) > 9 or y > 7.5 or y < -9.5:
            continue
        use_meadow = i % 3 != 0
        pool = meadow if (use_meadow and meadow) else singles
        if not pool:
            continue
        fbx = pool[i % len(pool)]
        tex = MEADOW_TEX if "Meadow" in fbx else FLOWER_TEX
        mat = texture_material("flower" + os.path.basename(tex), tex, alpha_clip=True, roughness=0.7)
        place(fbx, mat, x, y, rng.uniform(0.35, 0.6), rng.uniform(0, 360))


def scatter_lilies():
    d = os.path.join(ROOT, WATERPLANTS_DIR)
    if not os.path.isdir(d):
        return
    pads = [os.path.join(WATERPLANTS_DIR, f) for f in sorted(os.listdir(d)) if f.endswith(".fbx") and ("LilyPads" in f or "Waterlily" in f)]
    tex_dir = "Idyllic Fantasy Nature/Textures/Waterplants"
    tex = None
    td = os.path.join(ROOT, tex_dir)
    if os.path.isdir(td):
        for f in sorted(os.listdir(td)):
            if f.endswith(".png") and ("Lily" in f or "lily" in f):
                tex = os.path.join(tex_dir, f)
                break
    mat = texture_material("lily", tex, alpha_clip=True, roughness=0.6) if tex else color_material("lily", (0.28, 0.62, 0.25))
    for i, fbx in enumerate(pads[:4]):
        a = i * 1.7
        place(fbx, mat, POND_C[0] + math.cos(a) * 0.9, POND_C[1] + math.sin(a) * 0.7, 0.16, rng.uniform(0, 360), z=0.05)


def build_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1728
    scene.render.resolution_y = 972
    scene.view_settings.view_transform = "Standard"
    eevee = scene.eevee
    for attr, val in (("use_gtao", True), ("gtao_distance", 1.2), ("use_ssr", False)):
        if hasattr(eevee, attr):
            setattr(eevee, attr, val)

    world = bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.55, 0.8, 0.98, 1)
    bg.inputs[1].default_value = 0.9

    # warm key light, from upper right like the painting
    bpy.ops.object.light_add(type="SUN", location=(14, -6, 18))
    sun = bpy.context.active_object
    sun.data.energy = 2.6
    sun.data.color = (1.0, 0.87, 0.66)
    sun.data.angle = 0.35
    sun.rotation_euler = Euler((math.radians(48), math.radians(-14), math.radians(-38)))

    # soft cool fill from the left
    bpy.ops.object.light_add(type="SUN", location=(-10, -8, 12))
    fill = bpy.context.active_object
    fill.data.energy = 0.7
    fill.data.color = (0.75, 0.85, 1.0)
    fill.data.angle = 1.2
    fill.rotation_euler = Euler((math.radians(55), 0, math.radians(35)))

    bpy.ops.object.camera_add(location=(0.3, -13.8, 6.4))
    cam = bpy.context.active_object
    cam.rotation_euler = Euler((math.radians(68), 0, math.radians(1.0)))
    cam.data.lens = 30
    scene.camera = cam


def build_hills():
    """Soft distant hill silhouettes so the horizon is not empty."""
    hill_mat = color_material("hill", (0.34, 0.58, 0.28), roughness=1.0)
    far_mat = color_material("hillfar", (0.46, 0.68, 0.46), roughness=1.0)
    hills = [
        (-14, 20, 16, 5.2, hill_mat), (2, 24, 20, 6.5, far_mat),
        (14, 21, 15, 4.6, hill_mat), (-4, 26, 24, 8.0, far_mat),
        (22, 26, 18, 6.0, far_mat), (-24, 24, 18, 5.6, far_mat),
    ]
    for x, y, rx, h, mat in hills:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, location=(x, y, -0.5))
        s = bpy.context.active_object
        s.scale = (rx, rx * 0.7, h)
        bpy.ops.object.shade_smooth()
        s.data.materials.append(mat)


def build_stone_gate(x, y):
    """Stone arch like the painting: a torus sunk into the ground so only the
    upper arch shows, plus two stone feet."""
    stone = color_material("gatestone", (0.34, 0.29, 0.24), roughness=0.95)
    bpy.ops.mesh.primitive_torus_add(major_radius=1.6, minor_radius=0.3, location=(x, y, 1.0), major_segments=36, minor_segments=14, rotation=(math.radians(90), 0, 0))
    arch = bpy.context.active_object
    bpy.ops.object.shade_smooth()
    arch.data.materials.append(stone)
    for side in (-1, 1):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.45, depth=0.6, location=(x + side * 1.35, y, 0.3), vertices=16)
        foot = bpy.context.active_object
        bpy.ops.object.shade_smooth()
        foot.data.materials.append(stone)


def dress_garden():
    oak_mat = texture_material("oak", OAK_TEX, alpha_clip=True, roughness=0.7)
    toon_mat = texture_material("toon", TOON_TEX, roughness=0.8)
    cozy_mat = texture_material("cozy", COZY_TEX, roughness=0.8)
    wood_mat = texture_material("wood", os.path.join(PROTO, "Textures/wood.png").replace(ROOT + "/", ""), roughness=0.75)
    stone_mat = texture_material("stone", os.path.join(PROTO, "Textures/stone.png").replace(ROOT + "/", ""), roughness=0.9)
    grassy_mat = texture_material("burrowgrass", GRASS_TEX, tint=(0.72, 0.92, 0.45), roughness=0.95)
    rock_mat = color_material("rock", (0.62, 0.6, 0.64), roughness=0.92)

    # --- hero trees: Symphonie oaks pushed outward so the meadow and sky read
    oaks = [
        (-5.2, 6.2, 4.2, 80), (-7.8, 6.8, 3.4, 150),
        (5.4, 1.2, 3.6, 40), (6.6, 4.4, 4.1, 120), (4.6, 7.2, 3.5, 200),
        (-3.4, 9.4, 3.9, 60), (2.4, 9.6, 3.7, 260), (-7.6, -1.6, 3.3, 300),
        (8.2, 8.0, 3.8, 20), (-6.2, 10.4, 3.6, 190), (7.6, -3.4, 3.4, 90),
    ]
    for x, y, h, yaw in oaks:
        place(OAK, oak_mat, x, y, h, yaw)

    # toon trees as round accents
    for x, y, h, yaw in [(-9.6, 1.4, 2.8, 15), (9.4, 3.0, 2.9, 70), (0.4, 11.4, 3.2, 0)]:
        place(TOON_TREE, toon_mat, x, y, h, yaw)

    # --- cozy bushes lining the path and pond
    bush_variants = ["bushesgreen.fbx", "bushesyellow.fbx", "bushescubegreen.fbx"]
    for i in range(24):
        t = rng.uniform(0.03, 0.97)
        x, y = path_point(t)
        side = 1 if i % 2 == 0 else -1
        bx = x + side * rng.uniform(1.6, 2.8)
        by = y + rng.uniform(-0.5, 0.5)
        if math.hypot(bx - POND_C[0], by - POND_C[1]) < 2.9:
            continue
        variant = "bushesyellow.fbx" if i % 4 == 3 else bush_variants[i % 2 * 2]
        fbx = os.path.join(COZY, variant)
        place(fbx, cozy_mat, bx, by, rng.uniform(0.8, 1.4), rng.uniform(0, 360))

    # rocks around the pond rim (CozyFarm gradient keeps them stylized-colored)
    for i in range(9):
        a = i / 9 * 2 * math.pi + 0.3
        x = POND_C[0] + math.cos(a) * 2.5
        y = POND_C[1] + math.sin(a) * 1.98
        if 0.8 < a < 1.9:
            continue  # leave the bridge landing clear
        place(os.path.join(COZY, f"rocks_00{i % 7 + 1}.fbx"), cozy_mat, x, y, rng.uniform(0.3, 0.55), rng.uniform(0, 360))

    # fence along the right side of the path
    for i in range(7):
        t = 0.10 + i * 0.115
        x, y = path_point(t)
        x2, y2 = path_point(min(t + 0.02, 1.0))
        yaw = math.degrees(math.atan2(y2 - y, x2 - x))
        place(os.path.join(COZY, "fence_.fbx"), cozy_mat, x + 2.9, y, 0.85, yaw)

    # hero props
    lantern_mat = color_material("lanternwood", (0.42, 0.26, 0.13), roughness=0.8)
    place(os.path.join(PROTO, "bridge_round.fbx"), wood_mat, -4.85, -2.3, 1.35, 72)
    build_stone_gate(-1.1, 7.4)
    place(os.path.join(PROTO, "hill_burrow.fbx"), grassy_mat, -5.8, 1.9, 2.4, 250)
    place(os.path.join(PROTO, "lantern.fbx"), lantern_mat, -2.7, 7.0, 1.1, 10)
    place(os.path.join(PROTO, "lantern.fbx"), lantern_mat, 0.6, 7.1, 1.1, -12)

    scatter_flowers()
    scatter_lilies()


def main():
    build_scene()
    build_ground()
    build_hills()
    build_path()
    build_pond()
    dress_garden()
    bpy.context.scene.render.filepath = OUT
    bpy.ops.render.render(write_still=True)
    print("RENDER_OK", OUT)


if __name__ == "__main__":
    main()
