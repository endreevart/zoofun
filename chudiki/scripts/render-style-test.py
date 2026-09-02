#!/usr/bin/env python3
"""Blender headless STYLE TEST: same garden composition as
render-reference-scene.py, but rendered the way the painted reference works:

- Cycles with GI (Metal GPU if available) instead of flat Eevee
- custom sculpted "broccoli" trees and plump bushes (overlapping displaced
  spheres) instead of angular low-poly pack trees
- gradient ramp materials (dark base -> sunny top) instead of flat colors
- flowering hedges, camera depth of field, warm golden key light

Goal: show the realistic quality ceiling before porting anything to Three.js.
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
OUT = "/Volumes/Siska/DEVELOP/zoofun/chudiki/scripts/tree-lineup/style-test.png"

rng = random.Random(21)

# ---------------------------------------------------------------- materials
MATS = {}


def color_material(name, color, roughness=0.85, emission=None, emission_strength=0.0):
    if name in MATS:
        return MATS[name]
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
    MATS[name] = mat
    return mat


def textured_material(name, tex_path, tint, tile=1.0, roughness=0.95):
    if name in MATS:
        return MATS[name]
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
    MATS[name] = mat
    return mat


def ramp_material(name, stops, zmin, zmax, roughness=0.75):
    """Painted gradient: color ramp driven by object-space height."""
    if name in MATS:
        return MATS[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = roughness
    coords = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = zmin
    mr.inputs["From Max"].default_value = zmax
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (*stops[0][1], 1.0)
    ramp.color_ramp.elements[1].position = stops[-1][0]
    ramp.color_ramp.elements[1].color = (*stops[-1][1], 1.0)
    for pos, col in stops[1:-1]:
        el = ramp.color_ramp.elements.new(pos)
        el.color = (*col, 1.0)
    nt.links.new(coords.outputs["Object"], sep.inputs["Vector"])
    nt.links.new(sep.outputs["Z"], mr.inputs["Value"])
    nt.links.new(mr.outputs["Result"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    MATS[name] = mat
    return mat


# ---------------------------------------------------------------- puff builder
def displace(obj, strength, size, seed):
    tex = bpy.data.textures.new(f"clouds{seed}", type="CLOUDS")
    tex.noise_scale = size
    mod = obj.modifiers.new("disp", "DISPLACE")
    mod.texture = tex
    mod.strength = strength
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)


def join_objects(objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    return bpy.context.view_layer.objects.active


def build_broccoli_tree(seed, h=4.0):
    """Plump layered canopy of overlapping displaced spheres + thick trunk."""
    r = random.Random(seed)
    parts = []
    trunk_h = h * 0.34
    bpy.ops.mesh.primitive_cone_add(radius1=h * 0.075, radius2=h * 0.045, depth=trunk_h, location=(0, 0, trunk_h / 2), vertices=12)
    trunk = bpy.context.active_object
    bpy.ops.object.shade_smooth()
    trunk.data.materials.append(ramp_material("bark", [(0.0, (0.23, 0.12, 0.05)), (1.0, (0.45, 0.26, 0.12))], 0.0, h * 0.6))
    parts.append(trunk)

    canopy_mat = ramp_material(
        "canopy",
        [(0.0, (0.08, 0.26, 0.07)), (0.45, (0.22, 0.5, 0.1)), (0.8, (0.45, 0.72, 0.16)), (1.0, (0.7, 0.88, 0.3))],
        h * 0.3, h * 1.05,
    )
    lobes = [(0, 0, h * 0.68, h * 0.34)]
    n = r.randint(7, 9)
    for i in range(n):
        a = i / n * 2 * math.pi + r.uniform(-0.3, 0.3)
        rad = h * r.uniform(0.14, 0.26)
        d = h * r.uniform(0.16, 0.28)
        z = h * r.uniform(0.56, 0.82)
        lobes.append((math.cos(a) * d, math.sin(a) * d, z, rad))
    lobes.append((r.uniform(-0.3, 0.3), r.uniform(-0.3, 0.3), h * 0.94, h * r.uniform(0.16, 0.22)))
    canopy_parts = []
    for x, y, z, rad in lobes:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=rad, location=(x, y, z), segments=24, ring_count=16)
        s = bpy.context.active_object
        s.scale = (1, 1, r.uniform(0.82, 0.95))
        bpy.ops.object.shade_smooth()
        canopy_parts.append(s)
    canopy = join_objects(canopy_parts)
    bpy.ops.object.transform_apply(scale=True)
    displace(canopy, h * 0.03, h * 0.22, seed)
    bpy.ops.object.shade_smooth()
    canopy.data.materials.append(canopy_mat)
    parts.append(canopy)
    tree = join_objects(parts)
    tree.location = (0, 0, -1000)
    return tree


def build_puff_bush(seed, flower_color=None, h=0.8):
    r = random.Random(seed)
    mat = ramp_material(
        "bushramp",
        [(0.0, (0.1, 0.3, 0.06)), (0.55, (0.32, 0.6, 0.12)), (1.0, (0.62, 0.85, 0.24))],
        0.0, h * 1.1,
    )
    parts = []
    for i in range(r.randint(4, 6)):
        a = i * 1.4 + r.uniform(-0.4, 0.4)
        d = h * r.uniform(0.1, 0.4)
        rad = h * r.uniform(0.32, 0.5)
        z = h * r.uniform(0.28, 0.5)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=rad, location=(math.cos(a) * d, math.sin(a) * d, z), segments=20, ring_count=12)
        s = bpy.context.active_object
        s.scale = (1, 1, 0.8)
        bpy.ops.object.shade_smooth()
        parts.append(s)
    bush = join_objects(parts)
    bpy.ops.object.transform_apply(scale=True)
    displace(bush, h * 0.05, h * 0.3, seed + 100)
    bpy.ops.object.shade_smooth()
    bush.data.materials.append(mat)

    if flower_color is not None:
        bloom_mat = color_material(f"bloom{flower_color}", flower_color, roughness=0.6)
        verts = [v for v in bush.data.vertices if v.normal.z > 0.3 and v.co.z > h * 0.4]
        blossoms = []
        for v in r.sample(verts, min(14, len(verts))):
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=h * r.uniform(0.05, 0.08), location=(v.co.x, v.co.y, v.co.z + 0.02))
            blossoms.append(bpy.context.active_object)
            blossoms[-1].data.materials.append(bloom_mat)
        bush = join_objects([bush] + blossoms)
    bush.location = (0, 0, -1000)
    return bush


# ---------------------------------------------------------------- importers
TEMPLATES = {}


def import_model(path):
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
    obj = join_objects(meshes)
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
    (0.6, -11.0), (1.6, -7.0), (2.5, -3.6), (2.0, -0.6), (2.6, 2.4), (3.4, 5.4), (3.8, 8.0),
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
    a, b, c, d = pts[max(i - 1, 0)], pts[i], pts[i + 1], pts[min(i + 2, n)]

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
def setup_cycles(scene):
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 128
    scene.cycles.use_denoising = True
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for dev in prefs.devices:
            dev.use = True
        scene.cycles.device = "GPU"
        print("CYCLES_GPU_OK")
    except Exception as exc:  # noqa: BLE001
        print("CYCLES_GPU_FALLBACK", exc)
        scene.cycles.device = "CPU"
        scene.cycles.samples = 64


def build_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.resolution_x = 1728
    scene.render.resolution_y = 972
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.exposure = 0.55
    setup_cycles(scene)

    world = bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.6, 0.78, 0.95, 1)  # soft blue sky fill
    bg.inputs[1].default_value = 0.6

    # golden key light, low-ish sun from the back right for rim light
    bpy.ops.object.light_add(type="SUN", location=(12, 10, 16))
    sun = bpy.context.active_object
    sun.data.energy = 4.2
    sun.data.color = (1.0, 0.82, 0.52)
    sun.data.angle = math.radians(3)
    sun.rotation_euler = Euler((math.radians(55), math.radians(-6), math.radians(-140)))

    bpy.ops.object.camera_add(location=(-0.6, -13.2, 6.6))
    cam = bpy.context.active_object
    cam.rotation_euler = Euler((math.radians(67.5), 0, math.radians(-5)))
    cam.data.lens = 30
    cam.data.dof.use_dof = True
    cam.data.dof.focus_distance = 12.5
    cam.data.dof.aperture_fstop = 4.5
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
    mat = textured_material("grass", GRASS_TEX, tint=(0.78, 0.96, 0.36), tile=16)
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
    water = color_material("water", (0.05, 0.55, 0.55), roughness=0.12, emission=(0.05, 0.4, 0.42), emission_strength=0.25)
    pond.data.materials.append(water)

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
        if -0.9 < a - 0.5 < 0.35:
            continue
        x = POND_C[0] + math.cos(a) * (POND_R[0] + 0.25)
        y = POND_C[1] + math.sin(a) * (POND_R[1] + 0.25)
        place_model(rocks[i % 3], x, y, rng.uniform(0.28, 0.5), rng.uniform(0, 360))
        if i % 2 == 0:
            place_model(pebbles[i % 5], x + rng.uniform(-0.3, 0.3), y + rng.uniform(-0.3, 0.3), 0.14, rng.uniform(0, 360))

    pad = color_material("pad", (0.24, 0.62, 0.28), roughness=0.7)
    bloom = color_material("lilybloom", (0.95, 0.5, 0.68), roughness=0.6)
    for i in range(9):
        a = i * 1.9 + 0.4
        px = POND_C[0] + math.cos(a) * rng.uniform(0.5, 1.7)
        py = POND_C[1] + math.sin(a) * rng.uniform(0.4, 1.3)
        bpy.ops.mesh.primitive_cylinder_add(radius=rng.uniform(0.16, 0.28), depth=0.03, location=(px, py, 0.065), vertices=20)
        p = bpy.context.active_object
        p.data.materials.append(pad)
        if i % 2 == 0:
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.1, location=(px + 0.1, py + 0.08, 0.12))
            b = bpy.context.active_object
            b.data.materials.append(bloom)


def build_fence():
    wood = color_material("fencewood", (0.52, 0.32, 0.16), roughness=0.8)
    runs = [
        [(3.4, -10.5), (4.2, -7.0), (4.9, -3.6)],
        [(5.0, 0.5), (5.6, 3.4), (5.9, 6.2)],
        [(-2.4, -10.8), (-3.4, -8.2), (-4.6, -6.2)],
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
    wood = color_material("lampwood", (0.45, 0.28, 0.14), roughness=0.8)
    glow = color_material("lampglow", (1.0, 0.8, 0.35), roughness=0.4, emission=(1.0, 0.7, 0.25), emission_strength=4.0)
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
    door_dir = math.radians(-52)
    dx = BURROW[0] + math.cos(door_dir) * 2.62
    dy = BURROW[1] + math.sin(door_dir) * 2.02
    for radius, depth, mat, off in ((0.68, 0.35, rim, -0.12), (0.56, 0.4, wood, 0.06)):
        bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, location=(dx + math.cos(door_dir) * off, dy + math.sin(door_dir) * off, 0.5), vertices=24)
        door = bpy.context.active_object
        door.rotation_euler = Euler((math.radians(78), 0, door_dir + math.pi / 2), "ZYX")
        door.data.materials.append(mat)


def dress_nature():
    # sculpted broccoli trees instead of pack trees
    tree_templates = [build_broccoli_tree(seed) for seed in (3, 7, 12)]
    clusters = [
        (-7.6, 7.6, 4.6), (-2.8, 9.2, 4.2), (1.0, 10.4, 3.8), (7.2, 9.8, 4.0),
        (-9.4, 1.6, 4.6), (8.2, 3.6, 4.4), (9.6, -1.6, 4.6), (-9.4, -4.6, 4.4),
        (7.4, -7.4, 4.4), (-6.6, 11.2, 4.2), (4.8, 11.8, 3.8), (10.6, 5.8, 4.2),
    ]
    ti = 0
    for cx, cy, ch in clusters:
        for k in range(rng.choice((2, 2, 3))):
            x = cx + rng.uniform(-1.2, 1.2)
            y = cy + rng.uniform(-1.0, 1.0)
            h = ch + rng.uniform(-0.5, 0.7)
            place(tree_templates[ti % len(tree_templates)], x, y, h, rng.uniform(0, 360))
            ti += 1

    # plump hedges: green + flowering variants
    bush_templates = [
        build_puff_bush(31), build_puff_bush(32),
        build_puff_bush(33, flower_color=(0.95, 0.42, 0.2)),
        build_puff_bush(34, flower_color=(0.9, 0.35, 0.55)),
        build_puff_bush(35, flower_color=(0.6, 0.4, 0.9)),
    ]
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
        place(bush_templates[i % 5], bx, by, rng.uniform(0.5, 0.85), rng.uniform(0, 360))
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
        place(bush_templates[(i + 2) % 5], bx, by, rng.uniform(0.7, 1.1), rng.uniform(0, 360))
    # bushes around the pond
    for i in range(8):
        a = i / 8 * 2 * math.pi + 0.2
        x = POND_C[0] + math.cos(a) * (POND_R[0] + 1.1)
        y = POND_C[1] + math.sin(a) * (POND_R[1] + 1.1)
        if -1.2 < a - 0.5 < 0.6:
            continue
        place(bush_templates[i % 5], x, y, rng.uniform(0.5, 0.8), rng.uniform(0, 360))

    # flower clumps from the packs (they read well) around everything
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
    for i in range(12):
        a = rng.uniform(0, 2 * math.pi)
        if i < 6:
            fx = BURROW[0] + math.cos(a) * rng.uniform(2.4, 3.4)
            fy = BURROW[1] + math.sin(a) * rng.uniform(2.0, 2.8)
        else:
            fx = POND_C[0] + math.cos(a) * (POND_R[0] + rng.uniform(0.6, 1.4))
            fy = POND_C[1] + math.sin(a) * (POND_R[1] + rng.uniform(0.6, 1.4))
        place_model(flowers[i % len(flowers)], fx, fy, rng.uniform(0.3, 0.45), rng.uniform(0, 360))

    tufts = [os.path.join(MEGA, "Grass_Common_Tall.gltf"), os.path.join(ULT, "Grass_Large.gltf"), os.path.join(MEGA, "Grass_Wispy_Tall.gltf")]
    for i in range(26):
        t = rng.uniform(0.02, 0.98)
        x, y = path_point(t)
        side = 1 if i % 2 == 0 else -1
        place_model(tufts[i % 3], x + side * rng.uniform(1.1, 1.6), y + rng.uniform(-0.5, 0.5), rng.uniform(0.25, 0.4), rng.uniform(0, 360))

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

    mush = os.path.join(MEGA, "Mushroom_Common.gltf")
    for i in range(3):
        place_model(mush, BURROW[0] + 2.6 + i * 0.5, BURROW[1] - 2.2 + i * 0.3, 0.3, rng.uniform(0, 360))

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
