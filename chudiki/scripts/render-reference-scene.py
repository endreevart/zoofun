#!/usr/bin/env python3
"""Blender headless: recreate the painted-garden reference using the newly
downloaded packs (Stylized Nature MegaKit, Ultimate Stylized Nature,
Plants.glb) plus the bridge from the project prototype assets.

Renders one hero frame for approval before any game-code work.
"""
import math
import os
import random

import bpy
from mathutils import Euler, Matrix, Vector

DL = "/Users/endreev/Downloads"
MEGA = os.path.join(DL, "Stylized Nature MegaKit[Standard]/glTF")
ULT = os.path.join(DL, "Ultimate Stylized Nature - May 2022/glTF")
PLANTS = os.path.join(DL, "Plants.glb")
ZOO = "/Volumes/Siska/DEVELOP/zoofun/exports/unity-assets"
PROTO = os.path.join(ZOO, "VirtualZoo/Art/PremiumPrototype")
GRASS_TEX = os.path.join(ZOO, "Handpainted_Grass_and_Ground_Textures/Textures/Grass/Grass_normal/Grass_normal_up.png")
DIRT_TEX = os.path.join(ZOO, "Handpainted_Grass_and_Ground_Textures/Textures/Dirt/dirt_clay/dirt_clay_up.png")
OUT = "/Volumes/Siska/DEVELOP/zoofun/chudiki/scripts/tree-lineup/reference-scene.png"

rng = random.Random(11)

# ---------------------------------------------------------------- materials
MATS = {}


def color_material(name, color, roughness=0.85, emission=None, emission_strength=0.0):
    key = (name,)
    if key in MATS:
        return MATS[key]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        for k in ("Emission Color", "Emission"):
            if k in bsdf.inputs:
                bsdf.inputs[k].default_value = (*emission, 1.0)
                break
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    MATS[key] = mat
    return mat


def textured_material(name, tex_path, tint, tile=1.0, roughness=0.95):
    key = (name,)
    if key in MATS:
        return MATS[key]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = roughness
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(tex_path, check_existing=True)
    if tile != 1.0:
        mapping = mat.node_tree.nodes.new("ShaderNodeMapping")
        coords = mat.node_tree.nodes.new("ShaderNodeTexCoord")
        mapping.inputs["Scale"].default_value = (tile, tile, 1)
        mat.node_tree.links.new(coords.outputs["UV"], mapping.inputs["Vector"])
        mat.node_tree.links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
    mix = mat.node_tree.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.inputs[7].default_value = (*tint, 1.0)
    mat.node_tree.links.new(tex.outputs["Color"], mix.inputs[6])
    mat.node_tree.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    MATS[key] = mat
    return mat


# ---------------------------------------------------------------- importers
TEMPLATES = {}


def import_model(path):
    """Import a glTF/FBX model, join it into one mesh, re-center its base at
    the origin. Keeps the materials that ship with the file."""
    if path in TEMPLATES:
        return TEMPLATES[path]
    if not os.path.exists(path):
        print("MISSING", path)
        TEMPLATES[path] = None
        return None
    before = set(bpy.data.objects)
    if path.lower().endswith((".gltf", ".glb")):
        bpy.ops.import_scene.gltf(filepath=path)
    else:
        bpy.ops.import_scene.fbx(filepath=path)
    imported = list(set(bpy.data.objects) - before)
    meshes = [o for o in imported if o.type == "MESH"]
    if not meshes:
        for o in imported:
            bpy.data.objects.remove(o, do_unlink=True)
        TEMPLATES[path] = None
        return None
    extra = [o.name for o in imported if o not in meshes]
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    for name in extra:
        stale = bpy.data.objects.get(name)
        if stale is not None and stale is not obj:
            bpy.data.objects.remove(stale, do_unlink=True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    xs = [v.co.x for v in obj.data.vertices]
    ys = [v.co.y for v in obj.data.vertices]
    zs = [v.co.z for v in obj.data.vertices]
    obj.data.transform(Matrix.Translation((-(min(xs) + max(xs)) / 2, -(min(ys) + max(ys)) / 2, -min(zs))))
    obj.location = (0, 0, -1000)
    TEMPLATES[path] = obj
    return obj


PLANT_TEMPLATES = {}


def load_plants():
    """Plants.glb holds many separate plants; keep each as its own template."""
    if PLANT_TEMPLATES:
        return
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=PLANTS)
    for o in set(bpy.data.objects) - before:
        if o.type != "MESH":
            continue
        o.location = (o.location.x, o.location.y, -1000)
        PLANT_TEMPLATES[o.name] = o


def place(tpl, x, y, height, yaw_deg=0.0, z=0.0):
    if tpl is None:
        return None
    copy = bpy.data.objects.new(tpl.name + "_i", tpl.data)
    bpy.context.collection.objects.link(copy)
    s = height / max(tpl.dimensions.z, 1e-4)
    copy.scale = (s, s, s)
    copy.rotation_euler = Euler((0, 0, math.radians(yaw_deg)))
    copy.location = (x, y, z)
    return copy


def place_model(path, x, y, height, yaw_deg=0.0, z=0.0):
    return place(import_model(path), x, y, height, yaw_deg, z)


def place_plant(name, x, y, height, yaw_deg=0.0):
    load_plants()
    tpl = PLANT_TEMPLATES.get(name)
    if tpl is None:
        print("MISSING PLANT", name)
        return None
    return place(tpl, x, y, height, yaw_deg)


# ---------------------------------------------------------------- layout
PATH_POINTS = [
    (0.6, -11.0),
    (1.6, -7.0),
    (2.5, -3.6),
    (2.0, -0.6),
    (2.6, 2.4),
    (3.4, 5.4),
    (3.8, 8.0),
]
SIDE_PATH = [(2.0, -1.4), (0.2, -1.8), (-1.6, -2.1)]
POND_C = (-3.9, -0.3)
POND_R = (2.5, 1.95)
GATE = (3.8, 8.4)
BURROW = (-5.3, 4.6)


def path_point(t, pts=None):
    pts = pts or PATH_POINTS
    n = len(pts) - 1
    f = t * n
    i = min(int(f), n - 1)
    u = f - i
    a = pts[max(i - 1, 0)]
    b = pts[i]
    c = pts[i + 1]
    d = pts[min(i + 2, n)]

    def cr(p0, p1, p2, p3):
        return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3)

    return cr(a[0], b[0], c[0], d[0]), cr(a[1], b[1], c[1], d[1])


def ribbon(pts_fn, steps, half_width, z, material, name):
    verts, faces = [], []
    for i in range(steps + 1):
        t = i / steps
        x, y = pts_fn(t)
        x2, y2 = pts_fn(min(t + 0.01, 1.0))
        tx, ty = x2 - x, y2 - y
        L = math.hypot(tx, ty) or 1.0
        nx, ny = -ty / L, tx / L
        verts.append((x + nx * half_width, y + ny * half_width, z))
        verts.append((x - nx * half_width, y - ny * half_width, z))
        if i < steps:
            k = i * 2
            faces.append((k, k + 1, k + 3, k + 2))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    uv = mesh.uv_layers.new()
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            vi = mesh.loops[li].vertex_index
            uv.data[li].uv = (vi % 2, (vi // 2) * 0.22)
    obj.data.materials.append(material)
    return obj


# ---------------------------------------------------------------- scene
def build_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1728
    scene.render.resolution_y = 972
    scene.view_settings.view_transform = "Standard"
    eevee = scene.eevee
    for attr, val in (("use_gtao", True), ("gtao_distance", 1.0), ("use_bloom", True), ("bloom_intensity", 0.04), ("bloom_threshold", 1.1)):
        if hasattr(eevee, attr):
            setattr(eevee, attr, val)

    world = bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.98, 0.88, 0.7, 1)  # golden haze
    bg.inputs[1].default_value = 0.75

    # golden key light from the upper right/back like the painting
    bpy.ops.object.light_add(type="SUN", location=(12, 10, 16))
    sun = bpy.context.active_object
    sun.data.energy = 2.9
    sun.data.color = (1.0, 0.82, 0.55)
    sun.data.angle = 0.5
    sun.rotation_euler = Euler((math.radians(52), math.radians(-8), math.radians(-142)))

    # soft warm bounce so shadows stay friendly
    bpy.ops.object.light_add(type="SUN", location=(-8, -10, 10))
    fill = bpy.context.active_object
    fill.data.energy = 0.9
    fill.data.color = (1.0, 0.9, 0.78)
    fill.data.angle = 1.4
    fill.rotation_euler = Euler((math.radians(60), 0, math.radians(28)))

    bpy.ops.object.camera_add(location=(-0.6, -13.2, 6.6))
    cam = bpy.context.active_object
    cam.rotation_euler = Euler((math.radians(67.5), 0, math.radians(-5)))
    cam.data.lens = 30
    scene.camera = cam


def build_ground():
    bpy.ops.mesh.primitive_plane_add(size=70, location=(0, 4, 0))
    ground = bpy.context.active_object
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.subdivide(number_cuts=48)
    bpy.ops.object.mode_set(mode="OBJECT")
    for v in ground.data.vertices:
        d = math.hypot(v.co.x, v.co.y - 4)
        v.co.z += 0.03 * math.sin(v.co.x * 0.8) * math.cos(v.co.y * 0.6)
        if d > 15:
            v.co.z += (d - 15) * 0.2
    mat = textured_material("grass", GRASS_TEX, tint=(0.78, 0.94, 0.36), tile=16)
    ground.data.materials.append(mat)


def build_hills():
    hill = color_material("hill", (0.46, 0.64, 0.34), roughness=1.0)
    far = color_material("hillfar", (0.74, 0.76, 0.58), roughness=1.0)
    mountain = color_material("mount", (0.85, 0.8, 0.66), roughness=1.0)
    for x, y, r, h, mat in [
        (-16, 22, 16, 5.5, hill), (4, 25, 22, 7, hill), (18, 23, 15, 5, hill),
        (-6, 30, 26, 10, far), (14, 32, 24, 12, mountain), (-22, 30, 20, 9, far),
        (28, 30, 18, 8, far),
    ]:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, location=(x, y, -0.6))
        s = bpy.context.active_object
        s.scale = (r, r * 0.7, h)
        bpy.ops.object.shade_smooth()
        s.data.materials.append(mat)


def build_paths():
    dirt = textured_material("dirt", DIRT_TEX, tint=(1.0, 0.78, 0.48), tile=1.0)
    ribbon(path_point, 150, 1.05, 0.07, dirt, "path_main")
    ribbon(lambda t: path_point(t, SIDE_PATH), 40, 0.7, 0.07, dirt, "path_side")

    # round stepping stones down the middle of the path
    stone_paths = [os.path.join(MEGA, f"RockPath_Round_Small_{i}.gltf") for i in (1, 2, 3)]
    stone_paths.append(os.path.join(MEGA, "RockPath_Round_Wide.gltf"))
    for i in range(9):
        t = 0.08 + i * 0.1
        x, y = path_point(t)
        place_model(stone_paths[i % len(stone_paths)], x + rng.uniform(-0.2, 0.2), y, 0.045, rng.uniform(0, 360), z=0.075)


def build_pond():
    bpy.ops.mesh.primitive_circle_add(vertices=56, radius=1.0, fill_type="NGON", location=(POND_C[0], POND_C[1], 0.05))
    pond = bpy.context.active_object
    pond.scale = (POND_R[0], POND_R[1], 1)
    water = color_material("water", (0.02, 0.4, 0.42), roughness=0.5, emission=(0.1, 0.62, 0.65), emission_strength=0.65)
    pond.data.materials.append(water)

    # stacked stone rim like the painting (retinted to warm grey)
    warm_stone = color_material("warmstone", (0.6, 0.56, 0.5), roughness=0.9)
    rocks = [os.path.join(MEGA, f"Rock_Medium_{i}.gltf") for i in (1, 2, 3)]
    pebbles = [os.path.join(MEGA, f"Pebble_Round_{i}.gltf") for i in (1, 2, 3, 4, 5)]
    for path in rocks + pebbles:
        tpl = import_model(path)
        if tpl is not None:
            tpl.data.materials.clear()
            tpl.data.materials.append(warm_stone)
    n = 26
    for i in range(n):
        a = i / n * 2 * math.pi
        if -0.9 < a - 0.5 < 0.35:  # gap where the bridge lands
            continue
        x = POND_C[0] + math.cos(a) * (POND_R[0] + 0.25)
        y = POND_C[1] + math.sin(a) * (POND_R[1] + 0.25)
        place_model(rocks[i % 3], x, y, rng.uniform(0.28, 0.5), rng.uniform(0, 360))
        if i % 2 == 0:
            place_model(pebbles[i % 5], x + rng.uniform(-0.3, 0.3), y + rng.uniform(-0.3, 0.3), 0.14, rng.uniform(0, 360))

    # lily pads: flattened green disks + pink blossom
    pad = color_material("pad", (0.24, 0.62, 0.28), roughness=0.7)
    bloom = color_material("bloom", (0.95, 0.5, 0.68), roughness=0.6)
    for i in range(9):
        a = i * 1.9 + 0.4
        px = POND_C[0] + math.cos(a) * rng.uniform(0.5, 1.7)
        py = POND_C[1] + math.sin(a) * rng.uniform(0.4, 1.3)
        bpy.ops.mesh.primitive_cylinder_add(radius=rng.uniform(0.22, 0.38), depth=0.03, location=(px, py, 0.065), vertices=20)
        p = bpy.context.active_object
        p.data.materials.append(pad)
        if i % 2 == 0:
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.1, location=(px + 0.1, py + 0.08, 0.12))
            b = bpy.context.active_object
            b.data.materials.append(bloom)


def build_fence():
    wood = color_material("fencewood", (0.52, 0.32, 0.16), roughness=0.8)
    runs = [
        [(3.4, -10.5), (4.2, -7.0), (4.9, -3.6)],   # right of the path, foreground
        [(5.0, 0.5), (5.6, 3.4), (5.9, 6.2)],       # right of the path, midground
        [(-2.4, -10.8), (-3.4, -8.2), (-4.6, -6.2)],  # bottom left corner
    ]
    for run in runs:
        posts = []
        segs = 3
        for i in range(len(run) - 1):
            for k in range(segs + 1):
                t = k / segs
                posts.append((run[i][0] + (run[i + 1][0] - run[i][0]) * t, run[i][1] + (run[i + 1][1] - run[i][1]) * t))
        seen = []
        for p in posts:
            if seen and math.hypot(p[0] - seen[-1][0], p[1] - seen[-1][1]) < 0.4:
                continue
            seen.append(p)
        for x, y in seen:
            bpy.ops.mesh.primitive_cylinder_add(radius=0.09, depth=0.85, location=(x, y, 0.42), vertices=10)
            bpy.context.active_object.data.materials.append(wood)
            bpy.ops.mesh.primitive_uv_sphere_add(radius=0.11, location=(x, y, 0.86), segments=12, ring_count=8)
            cap = bpy.context.active_object
            cap.scale = (1, 1, 0.7)
            cap.data.materials.append(wood)
        for i in range(len(seen) - 1):
            (x1, y1), (x2, y2) = seen[i], seen[i + 1]
            for rz in (0.62, 0.34):
                mx, my = (x1 + x2) / 2, (y1 + y2) / 2
                length = math.hypot(x2 - x1, y2 - y1)
                bpy.ops.mesh.primitive_cylinder_add(radius=0.045, depth=length, location=(mx, my, rz), vertices=8)
                rail = bpy.context.active_object
                rail.rotation_euler = Euler((math.radians(90), 0, math.atan2(y2 - y1, x2 - x1) + math.pi / 2))
                rail.data.materials.append(wood)


def build_gate():
    stone = color_material("gatestone", (0.42, 0.35, 0.27), roughness=0.95)
    bpy.ops.mesh.primitive_torus_add(major_radius=2.0, minor_radius=0.4, location=(GATE[0], GATE[1], 1.3), major_segments=40, minor_segments=14, rotation=(math.radians(90), 0, math.radians(-12)))
    arch = bpy.context.active_object
    bpy.ops.object.shade_smooth()
    arch.data.materials.append(stone)
    # lantern posts flanking the gate
    wood = color_material("lampwood", (0.45, 0.28, 0.14), roughness=0.8)
    glow = color_material("lampglow", (1.0, 0.8, 0.35), roughness=0.4, emission=(1.0, 0.7, 0.25), emission_strength=0.9)
    for side in (-1, 1):
        x = GATE[0] + side * 2.9
        y = GATE[1] - 0.6
        bpy.ops.mesh.primitive_cylinder_add(radius=0.07, depth=1.5, location=(x, y, 0.75), vertices=10)
        bpy.context.active_object.data.materials.append(wood)
        bpy.ops.mesh.primitive_cube_add(size=0.22, location=(x, y, 1.58))
        lamp = bpy.context.active_object
        lamp.data.materials.append(glow)


def build_burrow():
    grass = textured_material("burrowgrass", GRASS_TEX, tint=(0.5, 0.74, 0.3), tile=4)
    wood = color_material("doorwood", (0.5, 0.3, 0.14), roughness=0.8)
    rim = color_material("doorrim", (0.66, 0.45, 0.24), roughness=0.8)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=2.3, location=(BURROW[0], BURROW[1], 0.0), segments=28, ring_count=16)
    mound = bpy.context.active_object
    mound.scale = (1.25, 1.0, 0.78)
    bpy.ops.object.shade_smooth()
    mound.data.materials.append(grass)
    # round door standing at the mound base, leaning back into the slope
    door_dir = math.radians(-52)
    dx = BURROW[0] + math.cos(door_dir) * 2.62
    dy = BURROW[1] + math.sin(door_dir) * 2.02
    for radius, depth, mat, off in ((0.68, 0.35, rim, -0.12), (0.56, 0.4, wood, 0.06)):
        bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, location=(dx + math.cos(door_dir) * off, dy + math.sin(door_dir) * off, 0.6), vertices=24)
        door = bpy.context.active_object
        door.rotation_euler = Euler((math.radians(78), 0, door_dir + math.pi / 2), "ZYX")
        door.location.z = 0.5
        door.data.materials.append(mat)


def dress_nature():
    # broccoli trees from the MegaKit
    trees = [os.path.join(MEGA, f"CommonTree_{i}.gltf") for i in (1, 2, 3, 4, 5)]
    # clusters of 2-3 overlapping trees to get the dense painted canopies
    clusters = [
        (-7.4, 7.4, 5.4), (-2.8, 9.0, 4.6), (1.0, 10.2, 4.0), (7.0, 9.6, 4.2),
        (-8.8, 1.6, 5.6), (7.8, 3.4, 5.2), (8.8, -1.4, 5.6), (-8.6, -4.2, 5.2),
        (6.8, -6.8, 5.4), (-6.6, 11.0, 4.4), (4.8, 11.6, 4.0), (10.0, 5.6, 5.0),
    ]
    # lift the canopy color toward the sunny yellow-green of the painting
    for path in trees:
        tpl = import_model(path)
        if tpl is None:
            continue
        for mat in tpl.data.materials:
            if mat and "Leaves" in mat.name and mat.use_nodes:
                bsdf = mat.node_tree.nodes.get("Principled BSDF")
                if bsdf:
                    for k in ("Emission Color", "Emission"):
                        if k in bsdf.inputs:
                            bsdf.inputs[k].default_value = (0.14, 0.3, 0.04, 1)
                            break
                    if "Emission Strength" in bsdf.inputs:
                        bsdf.inputs["Emission Strength"].default_value = 1.0
    ti = 0
    for cx, cy, ch in clusters:
        for k in range(rng.choice((2, 2, 3))):
            x = cx + rng.uniform(-1.2, 1.2)
            y = cy + rng.uniform(-1.0, 1.0)
            h = ch + rng.uniform(-0.5, 0.7)
            place_model(trees[ti % len(trees)], x, y, h, rng.uniform(0, 360))
            ti += 1

    # hedges along the path edges
    bush_big = os.path.join(ULT, "Bush_Large.gltf")
    bush = os.path.join(ULT, "Bush.gltf")
    bush_fl = os.path.join(ULT, "Bush_Large_Flowers.gltf")
    mega_bush_fl = os.path.join(MEGA, "Bush_Common_Flowers.gltf")
    # continuous hedge lines hugging both sides of the path, like the painting
    for i in range(56):
        t = 0.02 + (i // 2) * 0.035
        x, y = path_point(min(t, 0.98))
        side = 1 if i % 2 == 0 else -1
        bx = x + side * rng.uniform(1.45, 1.9)
        by = y + rng.uniform(-0.25, 0.25)
        if math.hypot(bx - POND_C[0], by - POND_C[1]) < POND_R[0] + 0.9:
            continue
        if math.hypot(bx - GATE[0], by - GATE[1]) < 2.4 or math.hypot(bx - BURROW[0], by - BURROW[1]) < 2.6:
            continue
        variant = [bush_big, bush, bush_fl, bush_big, mega_bush_fl][i % 5]
        place_model(variant, bx, by, rng.uniform(0.5, 0.85), rng.uniform(0, 360))
    # second looser row behind the hedges
    for i in range(20):
        t = rng.uniform(0.04, 0.96)
        x, y = path_point(t)
        side = 1 if i % 2 == 0 else -1
        bx = x + side * rng.uniform(2.4, 3.4)
        by = y + rng.uniform(-0.5, 0.5)
        if math.hypot(bx - POND_C[0], by - POND_C[1]) < POND_R[0] + 0.9:
            continue
        if math.hypot(bx - GATE[0], by - GATE[1]) < 2.4 or math.hypot(bx - BURROW[0], by - BURROW[1]) < 2.6:
            continue
        place_model([bush_big, bush_fl][i % 2], bx, by, rng.uniform(0.7, 1.1), rng.uniform(0, 360))

    # bushes hugging the pond rim
    for i in range(8):
        a = i / 8 * 2 * math.pi + 0.2
        x = POND_C[0] + math.cos(a) * (POND_R[0] + 1.1)
        y = POND_C[1] + math.sin(a) * (POND_R[1] + 1.1)
        if -1.2 < a - 0.5 < 0.6:
            continue
        place_model([bush, bush_fl][i % 2], x, y, rng.uniform(0.5, 0.8), rng.uniform(0, 360))

    # flower clumps: saturated accents like the painting
    flowers = [os.path.join(ULT, f"Flower_{i}_Clump.gltf") for i in (1, 2, 3, 4, 5)]
    flowers += [os.path.join(MEGA, "Flower_3_Group.gltf"), os.path.join(MEGA, "Flower_4_Group.gltf")]
    for i in range(60):
        t = rng.uniform(0.02, 0.98)
        x, y = path_point(t)
        side = 1 if i % 2 == 0 else -1
        fx = x + side * rng.uniform(1.15, 3.4)
        fy = y + rng.uniform(-0.6, 0.6)
        if math.hypot(fx - POND_C[0], fy - POND_C[1]) < POND_R[0] + 0.6:
            continue
        place_model(flowers[i % len(flowers)], fx, fy, rng.uniform(0.32, 0.5), rng.uniform(0, 360))
    # flowers around the burrow and pond edge
    for i in range(12):
        a = rng.uniform(0, 2 * math.pi)
        if i < 6:
            fx = BURROW[0] + math.cos(a) * rng.uniform(2.4, 3.4)
            fy = BURROW[1] + math.sin(a) * rng.uniform(2.0, 2.8)
        else:
            fx = POND_C[0] + math.cos(a) * (POND_R[0] + rng.uniform(0.6, 1.4))
            fy = POND_C[1] + math.sin(a) * (POND_R[1] + rng.uniform(0.6, 1.4))
        place_model(flowers[i % len(flowers)], fx, fy, rng.uniform(0.3, 0.45), rng.uniform(0, 360))

    # grass tufts along path and pond
    tufts = [os.path.join(MEGA, "Grass_Common_Tall.gltf"), os.path.join(ULT, "Grass_Large.gltf"), os.path.join(MEGA, "Grass_Wispy_Tall.gltf")]
    for i in range(26):
        t = rng.uniform(0.02, 0.98)
        x, y = path_point(t)
        side = 1 if i % 2 == 0 else -1
        gx = x + side * rng.uniform(1.1, 1.6)
        gy = y + rng.uniform(-0.5, 0.5)
        place_model(tufts[i % 3], gx, gy, rng.uniform(0.25, 0.4), rng.uniform(0, 360))

    # lush leafy plants near the pond and foreground corners (Plants.glb)
    lush = [
        ("Planta_05_Monstera_Estilizada", -6.6, -2.6, 1.1), ("Planta_01_Tropical_Ancha", -6.9, 1.4, 1.2),
        ("Planta_02_Mata_Hosta", -1.4, 0.6, 0.8), ("Planta_18_Canna_Flor_Naranja", -6.2, -3.6, 1.3),
        ("Planta_13_Caladio_Rosa", -5.9, 2.3, 0.9), ("Planta_04_Hierba_Alta", -7.8, -3.0, 1.0),
        ("Planta_01_Helecho_Arboreo", -7.4, -1.0, 1.2), ("Planta_11_Bromelia_Roja", -6.0, -4.8, 0.7),
        ("Planta_06_Flores_Silvestres", -0.6, -7.8, 0.7), ("Planta_10_Brote_Niveles", 4.4, -5.4, 0.9),
        ("Planta_09_Palmita_Radial", -7.2, -5.6, 1.0), ("Planta_12_Croton_Multicolor", 5.2, -8.4, 1.0),
    ]
    for name, x, y, h in lush:
        place_plant(name, x, y, h, rng.uniform(0, 360))

    # mushrooms near the burrow
    mush = os.path.join(MEGA, "Mushroom_Common.gltf")
    for i in range(3):
        place_model(mush, BURROW[0] + 2.6 + i * 0.5, BURROW[1] - 2.2 + i * 0.3, 0.3, rng.uniform(0, 360))

    # bright foreground blooms along the bottom edge, like the painting
    fg_flowers = [os.path.join(ULT, f"Flower_{i}_Clump.gltf") for i in (1, 2, 4)]
    for i, (x, y) in enumerate([(-1.6, -9.6), (2.6, -10.2), (3.4, -8.6), (-0.4, -10.6), (4.6, -10.8), (-2.6, -8.6)]):
        place_model(fg_flowers[i % 3], x, y, rng.uniform(0.4, 0.55), rng.uniform(0, 360))


def build_bridge():
    wood_tex = os.path.join(PROTO, "Textures/wood.png")
    mat = textured_material("bridgewood", wood_tex, tint=(1.0, 0.8, 0.55), tile=1.0, roughness=0.75)
    obj = place_model(os.path.join(PROTO, "bridge_round.fbx"), -1.7, -1.9, 1.4, 142)
    if obj is not None:
        obj.data = obj.data.copy()
        obj.data.materials.clear()
        obj.data.materials.append(mat)


def main():
    build_scene()
    build_ground()
    build_hills()
    build_paths()
    build_pond()
    build_fence()
    build_gate()
    build_burrow()
    build_bridge()
    dress_nature()
    bpy.context.scene.render.filepath = OUT
    bpy.ops.render.render(write_still=True)
    print("RENDER_OK", OUT)


if __name__ == "__main__":
    main()
