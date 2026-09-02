#!/usr/bin/env python3
"""Blender headless: build the zoo garden entirely from the Idyllic Fantasy
Nature pack (plus Fantasy House, EmaceArt fences and the Palmov bridge from
client/VirtualZoo/Assets) and render one hero frame in Cycles.

Stylization follows the reference painting: warm golden key light, saturated
multi-hue greens, four-tier planting density with no bare grass, chunky stone
work, and the pack's own vertical Bottom_Color -> Top_Color foliage gradient
(the shader the asset author designed the pack around).

Composition echoes the project's IdyllicLayout.cs proportions, widened for a
richer frame; it deliberately does not copy the reference one to one.
"""
import math
import os
import random

import bpy
from mathutils import Euler, Matrix, Vector

A = "/Volumes/Siska/DEVELOP/zoofun/client/VirtualZoo/Assets"
IDY = os.path.join(A, "Idyllic Fantasy Nature")
MODELS = os.path.join(IDY, "Models")
TEX = os.path.join(IDY, "Textures")
OUT = "/Volumes/Siska/DEVELOP/zoofun/chudiki/scripts/tree-lineup/idyllic-world.png"

rng = random.Random(1717)

# The pack's foliage atlases are greyscale masks: every bit of colour comes from
# the shader's Bottom_Color/Top_Color tint. The pack ships very shallow
# gradients, so these are widened into the reference's dark-base -> sunlit-top
# range, which is what gives painted foliage its depth.
C_BROADLEAF = ((0.075, 0.260, 0.055), (0.44, 0.82, 0.09))
C_BROADLEAF_WARM = ((0.100, 0.260, 0.050), (0.72, 0.88, 0.07))
C_BROADLEAF_RED = ((0.10, 0.26, 0.05), (0.52, 0.80, 0.09), (1.0, 0.40, 0.06))
C_WILLOW = ((0.080, 0.26, 0.075), (0.40, 0.78, 0.14))
C_FIR = ((0.050, 0.18, 0.07), (0.22, 0.50, 0.10))
C_BUSH = ((0.090, 0.300, 0.065), (0.40, 0.80, 0.10))
C_BUSH_DEEP = ((0.070, 0.250, 0.060), (0.30, 0.68, 0.08))
# blossom colour only at the very tips: the mid stop keeps the body green so the
# ramp never passes through mud on its way to pink
C_BUSH_BLOOM = ((0.090, 0.300, 0.065), (0.38, 0.76, 0.10), (1.0, 0.20, 0.30))
C_BUSH_BLOOM_WARM = ((0.090, 0.300, 0.065), (0.40, 0.76, 0.10), (1.0, 0.34, 0.02))
C_BUSH_BLOOM_VIOLET = ((0.090, 0.300, 0.065), (0.38, 0.74, 0.12), (0.52, 0.20, 1.0))
C_GRASS = ((0.13, 0.36, 0.05), (0.56, 0.92, 0.11))
C_GRASS2 = ((0.10, 0.29, 0.045), (0.38, 0.72, 0.08))
C_PLANT = ((0.10, 0.30, 0.06), (0.48, 0.84, 0.12))
C_WHITE = ((1.0, 1.0, 1.0), (1.0, 1.0, 1.0))
C_ROCK = (0.60, 0.56, 0.62)
C_BARK = (0.46, 0.30, 0.17)

MATS = {}


def _tex_node(nt, path, non_color=False):
    node = nt.nodes.new("ShaderNodeTexImage")
    node.image = bpy.data.images.load(path, check_existing=True)
    if non_color:
        node.image.colorspace_settings.name = "Non-Color"
    return node


def foliage_material(name, tex_rel, grad, cutoff=0.5, height=1.0, translucency=0.12,
                     top_at=1.0):
    """Replica of the pack's foliage shader: alpha-clipped atlas multiplied by a
    vertical Bottom_Color -> Top_Color gradient in object space."""
    if name in MATS:
        return MATS[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.62
    if "Subsurface Weight" in bsdf.inputs:
        bsdf.inputs["Subsurface Weight"].default_value = translucency
        if "Subsurface Radius" in bsdf.inputs:
            bsdf.inputs["Subsurface Radius"].default_value = (0.3, 0.5, 0.15)

    tex = _tex_node(nt, os.path.join(TEX, tex_rel))

    coords = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = 0.0
    mr.inputs["From Max"].default_value = height
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*grad[0], 1.0)
    ramp.color_ramp.elements[1].position = top_at
    ramp.color_ramp.elements[1].color = (*grad[1], 1.0)
    if len(grad) > 2:
        # three-stop gradient: base -> body -> tip accent
        ramp.color_ramp.elements[1].position = top_at * 0.78
        tip = ramp.color_ramp.elements.new(top_at)
        tip.color = (*grad[2], 1.0)
    nt.links.new(coords.outputs["Object"], sep.inputs["Vector"])
    nt.links.new(sep.outputs["Z"], mr.inputs["Value"])
    nt.links.new(mr.outputs["Result"], ramp.inputs["Fac"])

    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    nt.links.new(tex.outputs["Color"], mix.inputs[6])
    nt.links.new(ramp.outputs["Color"], mix.inputs[7])
    nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])

    # hard cutoff so alpha cards never leave translucent halos
    clip = nt.nodes.new("ShaderNodeMath")
    clip.operation = "GREATER_THAN"
    clip.inputs[1].default_value = cutoff
    nt.links.new(tex.outputs["Alpha"], clip.inputs[0])
    nt.links.new(clip.outputs["Value"], bsdf.inputs["Alpha"])
    MATS[name] = mat
    return mat


def opaque_material(name, tex_rel, tint, normal_rel=None, roughness=0.85, tile=1.0):
    if name in MATS:
        return MATS[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = roughness
    tex = _tex_node(nt, os.path.join(TEX, tex_rel) if not os.path.isabs(tex_rel) else tex_rel)
    if tile != 1.0:
        mapping = nt.nodes.new("ShaderNodeMapping")
        coords = nt.nodes.new("ShaderNodeTexCoord")
        mapping.inputs["Scale"].default_value = (tile, tile, 1)
        nt.links.new(coords.outputs["UV"], mapping.inputs["Vector"])
        nt.links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.inputs[7].default_value = (*tint, 1.0)
    nt.links.new(tex.outputs["Color"], mix.inputs[6])
    nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    if normal_rel:
        npath = normal_rel if os.path.isabs(normal_rel) else os.path.join(TEX, normal_rel)
        if os.path.exists(npath):
            ntex = _tex_node(nt, npath, non_color=True)
            nmap = nt.nodes.new("ShaderNodeNormalMap")
            nmap.inputs["Strength"].default_value = 0.7
            nt.links.new(ntex.outputs["Color"], nmap.inputs["Color"])
            nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    MATS[name] = mat
    return mat


def flat_material(name, color, roughness=0.85, emission=None, strength=0.0):
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
            bsdf.inputs["Emission Strength"].default_value = strength
    MATS[name] = mat
    return mat


# --------------------------------------------------------------- material sets
def bark_material():
    return opaque_material("bark", "Trees/Bark_Albedo.png", C_BARK, "Trees/Bark_Normal.png", 0.8)


def rock_material(albedo, normal=None):
    return opaque_material("rock_" + os.path.basename(albedo), albedo, C_ROCK, normal, 0.9)


# Model kind -> (foliage material factory, bark material or None)
def leaves_for(kind):
    # a lower alpha cutoff keeps more of each leaf card, so canopies read dense
    if kind == "broadleaf":
        return foliage_material("lv_broadleaf", "Trees/BroadleafTree_Leaves.png", C_BROADLEAF, 0.32, 8.6)
    if kind == "broadleaf_warm":
        return foliage_material("lv_broadleaf_warm", "Trees/BroadleafTree_Leaves.png", C_BROADLEAF_WARM, 0.32, 8.6)
    if kind == "broadleaf_red":
        return foliage_material("lv_broadleaf_red", "Trees/BroadleafTree_Leaves.png", C_BROADLEAF_RED,
                                0.32, 8.6, top_at=0.95)
    if kind == "willow":
        return foliage_material("lv_willow", "Trees/WillowTree_Branch.png", C_WILLOW, 0.5, 8.6)
    if kind == "fir":
        return foliage_material("lv_fir", "Trees/Fir_Branch.png", C_FIR, 0.5, 8.6)
    if kind == "bush01":
        return foliage_material("lv_bush01", "Bushes/Bush_01/Bush_Branch.png", C_BUSH, 0.5, 1.95)
    if kind == "bush02":
        return foliage_material("lv_bush02", "Bushes/Bush_02/Bush_Branches.png", C_BUSH_DEEP, 0.5, 1.95)
    if kind == "bush_bloom":
        return foliage_material("lv_bush_bloom", "Bushes/Bush_03/Bush_Branches.png", C_BUSH_BLOOM,
                                0.66, 1.95, top_at=0.96)
    if kind == "bush_bloom_warm":
        return foliage_material("lv_bush_bloom_warm", "Bushes/Bush_03/Bush_Branches.png",
                                C_BUSH_BLOOM_WARM, 0.66, 1.95, top_at=0.96)
    if kind == "bush_bloom_violet":
        return foliage_material("lv_bush_bloom_violet", "Bushes/Bush_03/Bush_Branches.png",
                                C_BUSH_BLOOM_VIOLET, 0.66, 1.95, top_at=0.96)
    if kind == "grass":
        return foliage_material("lv_grass", "Grass/Grass_01.png", C_GRASS, 0.5, 0.7)
    if kind == "grass2":
        return foliage_material("lv_grass2", "Grass/Grass_02.png", C_GRASS2, 0.5, 0.7)
    if kind == "plant":
        return foliage_material("lv_plant", "Plants/Plants_Albedo.png", C_PLANT, 0.5, 1.1)
    if kind == "flower":
        return foliage_material("lv_flower", "Flowers/Flower.png", C_WHITE, 0.5, 0.6)
    if kind == "meadow":
        return foliage_material("lv_meadow", "Flowers/FlowerMeadow.png", C_WHITE, 0.7, 0.6)
    if kind == "lilypad":
        return foliage_material("lv_lilypad", "Waterplants/LilyPad_Albedo.png", C_WHITE, 0.5, 1.4)
    if kind == "waterlily":
        return foliage_material("lv_waterlily", "Waterplants/Waterlily_Leaf.png", C_WHITE, 0.5, 1.4)
    if kind == "cattail":
        return foliage_material("lv_cattail", "Waterplants/Cattail_Albedo.png", C_WHITE, 0.5, 2.0)
    raise ValueError(kind)


# --------------------------------------------------------------- import
TEMPLATES = {}


def _keep_lod0(names):
    """Given imported object names, delete LOD1/LOD2 and non-mesh helpers and
    return the surviving mesh objects."""
    meshes = [n for n in names if bpy.data.objects[n].type == "MESH"]
    lod0 = [n for n in meshes if "LOD0" in n]
    keep = lod0 if lod0 else meshes
    for n in names:
        if n in keep:
            continue
        stale = bpy.data.objects.get(n)
        if stale is not None:
            bpy.data.objects.remove(stale, do_unlink=True)
    return [bpy.data.objects[n] for n in keep]


def _join(objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    return bpy.context.view_layer.objects.active


def import_prop(rel_path, foliage_kind=None, opaque_mat=None, root=MODELS):
    """Import an FBX, drop LODs, assign pack-faithful materials by slot, and
    re-center the mesh so its footprint centre is at the origin with the base
    at z=0."""
    key = (rel_path, foliage_kind, opaque_mat.name if opaque_mat else None)
    if key in TEMPLATES:
        return TEMPLATES[key]
    path = os.path.join(root, rel_path)
    if not os.path.exists(path):
        print("MISSING", path)
        TEMPLATES[key] = None
        return None
    before = {o.name for o in bpy.data.objects}
    bpy.ops.import_scene.fbx(filepath=path)
    imported = [o.name for o in bpy.data.objects if o.name not in before]
    meshes = _keep_lod0(imported)
    if not meshes:
        TEMPLATES[key] = None
        return None

    leaf_mat = leaves_for(foliage_kind) if foliage_kind else None
    for mesh in meshes:
        slot_names = [s.material.name if s.material else "" for s in mesh.material_slots]
        if not slot_names:
            mesh.data.materials.append(opaque_mat or leaf_mat)
            continue
        # A trunk slot only means bark when the same mesh also carries foliage.
        # Single-slot props are one atlas whatever they are called: Flower_Red's
        # only slot is named "Stems" but holds the whole coloured blossom.
        def woody(name):
            return any(tag in name for tag in ("Trunk", "Bark", "Stem", "Wood"))

        has_foliage_slot = any(not woody(s) for s in slot_names)
        for i, sname in enumerate(slot_names):
            use_bark = leaf_mat and has_foliage_slot and woody(sname)
            mesh.material_slots[i].material = bark_material() if use_bark else (opaque_mat or leaf_mat)

    obj = _join(meshes)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    xs = [v.co.x for v in obj.data.vertices]
    ys = [v.co.y for v in obj.data.vertices]
    zs = [v.co.z for v in obj.data.vertices]
    obj.data.transform(Matrix.Translation((-(min(xs) + max(xs)) / 2, -(min(ys) + max(ys)) / 2, -min(zs))))
    obj.location = (0, 0, -1000)
    TEMPLATES[key] = obj
    return obj


def place(tpl, x, y, height=None, yaw=0.0, z=0.0, scale=None, tilt=0.0, wide=1.0):
    """`wide` fattens x/y only, which turns the pack's naturalistic canopies into
    the rounder, chunkier silhouettes the reference uses."""
    if tpl is None:
        return None
    copy = bpy.data.objects.new(tpl.name + "_i", tpl.data)
    bpy.context.collection.objects.link(copy)
    s = scale if scale is not None else height / max(tpl.dimensions.z, 1e-4)
    copy.scale = (s * wide, s * wide, s)
    copy.rotation_euler = Euler((math.radians(tilt), 0, math.radians(yaw)), "XYZ")
    copy.location = (x, y, z)
    return copy


# --------------------------------------------------------------- layout
# Proportions follow IdyllicLayout.cs (pond left of centre, path sweeping to a
# gate at the back) scaled up ~2.4x so the frame can hold reference density.
PATH_MAIN = [
    (1.4, -13.0), (2.0, -9.0), (2.6, -5.4), (2.4, -2.2), (3.2, 1.2), (4.4, 4.6), (5.0, 7.6), (5.2, 10.0),
]
PATH_SIDE = [(2.6, -1.6), (0.9, -0.9), (-0.9, -0.3), (-2.9, 0.2), (-5.2, 0.4)]
POND_C = (-5.4, 3.4)
POND_R = (3.3, 2.4)
CREEK = [(-2.9, 2.4), (-2.3, 1.0), (-2.0, -0.4), (-1.9, -2.0), (-2.0, -4.5), (-2.2, -8.0)]
# where the side path crosses the creek, so the bridge really spans water
BRIDGE = (-2.0, -0.1)
GATE = (3.6, 10.2)
HOUSE = (8.6, 19.5)
BURROW = (-8.4, 6.6)

# Camera is aimed with an explicit look-at so framing is verifiable instead of
# guessed; frame_report() prints where landmarks land in normalised screen space.
CAM_POS = (-0.6, -7.5, 3.9)
CAM_TARGET = (-1.4, 5.2, 0.55)
CAM_LENS = 24.0
FOREGROUND_Y = (-2.4, 0.6)


def spline(pts, t):
    n = len(pts) - 1
    f = t * n
    i = min(int(f), n - 1)
    u = f - i
    a, b, c, d = pts[max(i - 1, 0)], pts[i], pts[i + 1], pts[min(i + 2, n)]

    def cr(p0, p1, p2, p3):
        return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u
                      + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3)

    return cr(a[0], b[0], c[0], d[0]), cr(a[1], b[1], c[1], d[1])


def path_main(t):
    return spline(PATH_MAIN, t)


def path_side(t):
    return spline(PATH_SIDE, t)


def creek(t):
    return spline(CREEK, t)


def ribbon(fn, steps, width_fn, z, material, name, uv_scale=0.3):
    verts, faces = [], []
    for i in range(steps + 1):
        t = i / steps
        x, y = fn(t)
        x2, y2 = fn(min(t + 0.005, 1.0))
        tx, ty = x2 - x, y2 - y
        L = math.hypot(tx, ty) or 1.0
        nx, ny = -ty / L, tx / L
        w = width_fn(t)
        verts.append((x + nx * w, y + ny * w, z))
        verts.append((x - nx * w, y - ny * w, z))
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
            uv.data[li].uv = (vi % 2, (vi // 2) * uv_scale)
    obj.data.materials.append(material)
    return obj


def in_pond(x, y, margin=0.0):
    return ((x - POND_C[0]) / (POND_R[0] + margin)) ** 2 + ((y - POND_C[1]) / (POND_R[1] + margin)) ** 2 < 1.0


def near_path(x, y, dist, fn=path_main, steps=40):
    for i in range(steps + 1):
        px, py = fn(i / steps)
        if math.hypot(px - x, py - y) < dist:
            return True
    return False


def blocked(x, y, margin=1.0):
    if in_pond(x, y, margin):
        return True
    if near_path(x, y, 1.35 + margin * 0.3):
        return True
    if near_path(x, y, 1.0 + margin * 0.3, path_side, 20):
        return True
    if near_path(x, y, 0.9, creek, 24):
        return True
    if math.hypot(x - GATE[0], y - GATE[1]) < 3.0:
        return True
    if math.hypot(x - BURROW[0], y - BURROW[1]) < 3.6:
        return True
    if math.hypot(x - HOUSE[0], y - HOUSE[1]) < 6.0:
        return True
    return False


# --------------------------------------------------------------- scene
def build_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.resolution_x = 1728
    scene.render.resolution_y = 972
    scene.render.film_transparent = False
    try:
        scene.view_settings.view_transform = "Standard"
    except TypeError:
        pass
    # neutral: the numpy grade owns exposure and tone mapping
    scene.view_settings.exposure = 0.0
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 160
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 8
    scene.cycles.transparent_max_bounces = 16
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

    # sky: warm horizon haze fading to blue overhead, as in the reference
    world = bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = 1.7
    grad = nt.nodes.new("ShaderNodeTexGradient")
    grad.gradient_type = "EASING"
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Rotation"].default_value = (math.radians(90), 0, 0)
    mapping.inputs["Location"].default_value = (0, 0, 0.42)
    mapping.inputs["Scale"].default_value = (1, 1, 0.5)
    coords = nt.nodes.new("ShaderNodeTexCoord")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.28
    ramp.color_ramp.elements[0].color = (1.0, 0.86, 0.62, 1)
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (0.30, 0.56, 0.95, 1)
    nt.links.new(coords.outputs["Generated"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], grad.inputs["Vector"])
    nt.links.new(grad.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])

    # A bright sky doubles as a huge ambient source and flattens the frame. The
    # camera sees the bright gradient; bounce rays see a dim version, so the sun
    # stays the dominant light and shadows keep their depth.
    dim = nt.nodes.new("ShaderNodeBackground")
    dim.inputs["Strength"].default_value = 2.2
    nt.links.new(ramp.outputs["Color"], dim.inputs["Color"])
    lp = nt.nodes.new("ShaderNodeLightPath")
    mix_shader = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(lp.outputs["Is Camera Ray"], mix_shader.inputs["Fac"])
    nt.links.new(dim.outputs["Background"], mix_shader.inputs[1])
    nt.links.new(bg.outputs["Background"], mix_shader.inputs[2])
    nt.links.new(mix_shader.outputs["Shader"], out.inputs["Surface"])

    # golden key sun, low and behind-right for rim light on the canopies
    bpy.ops.object.light_add(type="SUN", location=(16, 14, 14))
    sun = bpy.context.active_object
    # The reference's histogram is narrow (p05 0.18 -> p95 0.76): its light is
    # soft and even, with colour doing the work. A hard sun cannot be graded into
    # that, so the key is gentle and the sky carries most of the illumination.
    sun.data.energy = 2.2
    sun.data.color = (1.0, 0.72, 0.36)
    sun.data.angle = math.radians(8.0)
    sun.rotation_euler = Euler((math.radians(62), math.radians(-5), math.radians(-148)))

    # Fills stay deliberately weak: strong fills flatten the frame, and the
    # reference's depth comes from a wide range between lit tops and dark bases.
    bpy.ops.object.light_add(type="AREA", location=(-10, -14, 13))
    fill = bpy.context.active_object
    fill.data.energy = 900
    fill.data.size = 30
    fill.data.color = (0.62, 0.80, 1.0)
    fill.rotation_euler = Euler((math.radians(50), 0, math.radians(24)))

    bpy.ops.object.light_add(type="AREA", location=(3, -16, 5))
    bounce = bpy.context.active_object
    bounce.data.energy = 380
    bounce.data.size = 24
    bounce.data.color = (1.0, 0.84, 0.58)
    bounce.rotation_euler = Euler((math.radians(76), 0, 0))

    # camera: lower and closer than a diorama view, path opening into frame
    bpy.ops.object.camera_add(location=CAM_POS)
    cam = bpy.context.active_object
    cam.rotation_euler = (Vector(CAM_TARGET) - Vector(CAM_POS)).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = CAM_LENS
    cam.data.dof.use_dof = True
    cam.data.dof.focus_distance = (Vector(CAM_TARGET) - Vector(CAM_POS)).length
    cam.data.dof.aperture_fstop = 3.2
    scene.camera = cam


RAW = OUT.replace(".png", "-raw.exr")

# Grade constants, tuned against measured percentiles of the reference painting.
GRADE = {
    # Fitted by grid search against measured percentiles of the reference:
    # p05/p25/med/p75/p95 and mean saturation all land within ~0.02.
    "midpoint": 0.35,   # linear value that maps to 0.5
    "black": 0.0,
    "gamma": 0.70,
    "contrast": 0.75,
    "saturation": 1.60,
    # measured: the reference has LESS local detail than the render (0.094 vs
    # 0.128), so no unsharp pass is warranted
    "local_contrast": 0.0,
    "local_radius": 9,
    "warm": (1.035, 1.0, 0.955),
    "bloom_strength": 0.14,
    "bloom_threshold": 0.72,
    "bloom_radius": 26,
}

LUMA = (0.2126, 0.7152, 0.0722)


def grade_array(rgb, params=None, radius_scale=1.0):
    """Tone-map and grade a linear RGB array.

    Uses out = x / (x + midpoint), which is asymptotic to 1. An extended Reinhard
    curve (x*(1+x/w^2)/(1+x)) diverges above its white point and was clipping
    every sunlit area to pure white.
    """
    import numpy as np

    p = dict(GRADE)
    if params:
        p.update(params)
    luma = np.array(LUMA, dtype=np.float32)
    rgb = np.maximum(np.asarray(rgb, dtype=np.float32), 0.0)

    if p["bloom_strength"] > 0:
        lum = rgb @ luma
        highlights = rgb * np.clip(lum - p["bloom_threshold"], 0, None)[..., None]
        blur = highlights
        r = max(1, int(p["bloom_radius"] * radius_scale))
        for _ in range(3):  # repeated box blur approximates a gaussian
            pad = np.pad(blur, ((0, 0), (r, r), (0, 0)), mode="edge")
            cs = np.cumsum(pad, axis=1)
            blur = (cs[:, 2 * r:] - cs[:, : -2 * r]) / (2 * r)
            pad = np.pad(blur, ((r, r), (0, 0), (0, 0)), mode="edge")
            cs = np.cumsum(pad, axis=0)
            blur = (cs[2 * r:] - cs[: -2 * r]) / (2 * r)
        rgb = rgb + blur * p["bloom_strength"]

    rgb = rgb / (rgb + p["midpoint"])
    rgb = p["black"] + (1.0 - p["black"]) * rgb
    rgb = np.power(rgb, p["gamma"])
    # The reference is lower-contrast than a rendered scene: pulling values
    # toward mid grey lowers highlights and lifts quarter-tones at once, which
    # gamma alone cannot do.
    rgb = np.clip(0.5 + (rgb - 0.5) * p["contrast"], 0.0, 1.0)

    if p.get("local_contrast", 0.0) > 0:
        # Matching the global histogram flattens object reads; a wide unsharp
        # pass puts the separation back without changing the overall tonality.
        blur = rgb
        r = max(1, int(p.get("local_radius", 9) * radius_scale))
        for _ in range(2):
            pad = np.pad(blur, ((0, 0), (r, r), (0, 0)), mode="edge")
            cs = np.cumsum(pad, axis=1)
            blur = (cs[:, 2 * r:] - cs[:, : -2 * r]) / (2 * r)
            pad = np.pad(blur, ((r, r), (0, 0), (0, 0)), mode="edge")
            cs = np.cumsum(pad, axis=0)
            blur = (cs[2 * r:] - cs[: -2 * r]) / (2 * r)
        rgb = np.clip(rgb + (rgb - blur) * p["local_contrast"], 0.0, 1.0)

    lum = (rgb @ luma)[..., None]
    rgb = np.clip(lum + (rgb - lum) * p["saturation"], 0.0, 1.0)
    return np.clip(rgb * np.array(p["warm"], dtype=np.float32), 0.0, 1.0)


def load_linear(src=RAW):
    import numpy as np

    img = bpy.data.images.load(src, check_existing=False)
    w, h = img.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    rgb = buf.reshape(h, w, 4)[:, :, :3].astype(np.float32)
    bpy.data.images.remove(img)
    return rgb


def grade_exr(src=RAW, dst=OUT, params=None):
    import numpy as np

    rgb = grade_array(load_linear(src), params)
    h, w = rgb.shape[:2]
    out = bpy.data.images.new("graded", w, h, alpha=False, float_buffer=False)
    flat = np.concatenate([rgb, np.ones((h, w, 1), dtype=np.float32)], axis=2).ravel()
    out.pixels.foreach_set(flat)
    out.filepath_raw = dst
    out.file_format = "PNG"
    out.save()
    bpy.data.images.remove(out)
    print("GRADED", dst)
    return rgb


def build_grade():
    """Kept for reference: the in-Blender compositor path. Unused because the
    numpy grade above is tunable without re-rendering."""
    scene = bpy.context.scene
    try:
        ng = bpy.data.node_groups.new("grade", "CompositorNodeTree")
        ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
        # A Group Input socket is not bound to the render here and reads as a
        # flat colour; the render has to be pulled in with a Render Layers node.
        gin = ng.nodes.new("CompositorNodeRLayers")
        gout = ng.nodes.new("NodeGroupOutput")

        # In Blender 5 the glare settings are sockets rather than properties.
        glare = ng.nodes.new("CompositorNodeGlare")

        def glare_set(socket, value):
            if socket in glare.inputs:
                try:
                    glare.inputs[socket].default_value = value
                except (TypeError, AttributeError):
                    pass

        for want in ("Bloom", "Fog Glow"):
            try:
                glare.inputs["Type"].default_value = want
                break
            except (TypeError, AttributeError):
                continue
        glare_set("Quality", "High")
        glare_set("Threshold", 1.1)
        glare_set("Strength", 0.12)
        glare_set("Size", 0.58)
        glare_set("Smoothness", 0.4)

        # Cycles output is unbounded and a plain curve extrapolates past its last
        # point, so sunlit areas clip to white. The photoreceptor tonemap gives a
        # smooth shoulder; chromatic adaptation is left at 0 to keep saturation.
        tone = ng.nodes.new("CompositorNodeTonemap")

        def tone_set(socket, value):
            if socket in tone.inputs:
                try:
                    tone.inputs[socket].default_value = value
                except (TypeError, AttributeError):
                    pass

        tone_set("Type", "R/D Photoreceptor")
        tone_set("Intensity", 0.9)
        tone_set("Contrast", 0.10)
        # Light adaptation would auto-compensate and cancel the exposure set on
        # the scene, so it stays off and the curve does the shaping.
        tone_set("Light Adaptation", 0.0)
        tone_set("Chromatic Adaptation", 0.0)

        curve = ng.nodes.new("CompositorNodeCurveRGB")
        c = curve.mapping.curves[3]
        # Shaped against measured percentiles of the reference painting: lifted
        # midtones, a soft highlight shoulder, and shadows that stay open.
        c.points[0].location = (0.0, 0.005)
        c.points[-1].location = (1.0, 0.88)
        c.points.new(0.15, 0.14)
        c.points.new(0.35, 0.42)
        c.points.new(0.55, 0.625)
        c.points.new(0.80, 0.79)
        curve.mapping.update()

        sat = ng.nodes.new("CompositorNodeHueSat")
        for key, val in (("Saturation", 1.6), ("Value", 1.0)):
            if key in sat.inputs:
                sat.inputs[key].default_value = val

        ng.links.new(gin.outputs["Image"], glare.inputs[0])
        ng.links.new(glare.outputs[0], tone.inputs["Image"])
        ng.links.new(tone.outputs["Image"], curve.inputs["Image"])
        ng.links.new(curve.outputs["Image"], sat.inputs["Image"])
        ng.links.new(sat.outputs["Image"], gout.inputs[0])
        scene.compositing_node_group = ng
        scene.render.use_compositing = True
        print("GRADE_OK")
    except Exception as exc:  # noqa: BLE001
        print("GRADE_SKIPPED", type(exc).__name__, exc)


def build_ground():
    bpy.ops.mesh.primitive_plane_add(size=90, location=(0, 8, 0))
    ground = bpy.context.active_object
    ground.name = "ground"
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.subdivide(number_cuts=70)
    bpy.ops.object.mode_set(mode="OBJECT")
    for v in ground.data.vertices:
        x, y = v.co.x, v.co.y
        v.co.z += 0.06 * math.sin(x * 0.55) * math.cos(y * 0.42)
        # gentle mound under the burrow, dish under the pond
        v.co.z += 1.1 * math.exp(-((x - BURROW[0]) ** 2 + (y - BURROW[1]) ** 2) / 18.0)
        v.co.z -= 0.45 * math.exp(-((x - POND_C[0]) ** 2 / 14.0 + (y - POND_C[1]) ** 2 / 9.0))
        d = math.hypot(x, y - 8)
        if d > 20:
            v.co.z += (d - 20) * 0.34
    bpy.ops.object.shade_smooth()

    # grass with large-scale tonal patches so the meadow is not one flat green
    mat = bpy.data.materials.new("ground_grass")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.92
    tex = _tex_node(nt, os.path.join(TEX, "Ground/Grass/Grass_Albedo.png"))
    mapping = nt.nodes.new("ShaderNodeMapping")
    coords = nt.nodes.new("ShaderNodeTexCoord")
    mapping.inputs["Scale"].default_value = (26, 26, 1)
    nt.links.new(coords.outputs["UV"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], tex.inputs["Vector"])

    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 1.4
    noise.inputs["Detail"].default_value = 3.0
    tint = nt.nodes.new("ShaderNodeValToRGB")
    tint.color_ramp.elements[0].position = 0.30
    tint.color_ramp.elements[0].color = (0.17, 0.42, 0.07, 1)
    tint.color_ramp.elements[1].position = 0.72
    tint.color_ramp.elements[1].color = (0.64, 0.90, 0.16, 1)
    nt.links.new(coords.outputs["Object"], noise.inputs["Vector"])
    nt.links.new(noise.outputs["Fac"], tint.inputs["Fac"])

    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    nt.links.new(tex.outputs["Color"], mix.inputs[6])
    nt.links.new(tint.outputs["Color"], mix.inputs[7])

    # The grass albedo has almost no blue (avg 167,164,19), so a plain multiply
    # always lands on lime. A small cool offset restores a believable green.
    lift = nt.nodes.new("ShaderNodeMix")
    lift.data_type = "RGBA"
    lift.blend_type = "ADD"
    lift.inputs["Factor"].default_value = 1.0
    lift.inputs[7].default_value = (0.006, 0.022, 0.045, 1.0)
    nt.links.new(mix.outputs[2], lift.inputs[6])
    nt.links.new(lift.outputs[2], bsdf.inputs["Base Color"])

    nrm = os.path.join(TEX, "Ground/Grass/Grass_Normal.png")
    if os.path.exists(nrm):
        ntex = _tex_node(nt, nrm, non_color=True)
        nt.links.new(mapping.outputs["Vector"], ntex.inputs["Vector"])
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = 0.5
        nt.links.new(ntex.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    ground.data.materials.append(mat)


def build_hills():
    near = flat_material("hill_near", (0.20, 0.40, 0.07), roughness=1.0)
    mid = flat_material("hill_mid", (0.26, 0.46, 0.12), roughness=1.0)
    far = flat_material("hill_far", (0.44, 0.58, 0.36), roughness=1.0)
    haze = flat_material("hill_haze", (0.68, 0.72, 0.58), roughness=1.0)
    for x, y, r, h, mat in [
        (-24, 32, 18, 5.0, near), (2, 36, 24, 6.0, mid), (26, 33, 17, 4.5, near),
        (-10, 46, 30, 9.0, far), (20, 48, 28, 10.0, haze), (-34, 44, 24, 8.0, far),
        (38, 46, 24, 8.5, haze), (0, 62, 44, 14.0, haze),
    ]:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=36, ring_count=18, location=(x, y, -1.0))
        s = bpy.context.active_object
        s.scale = (r, r * 0.68, h)
        bpy.ops.object.shade_smooth()
        s.data.materials.append(mat)


def build_paths():
    dirt = opaque_material("dirt_path", "Ground/Dirt/Dirt_01_Albedo.png", (0.92, 0.82, 0.68),
                           "Ground/Dirt/Dirt_Normal.png", 0.92, tile=3.0)
    # widest where it enters the frame, tapering as it climbs to the gate
    ribbon(path_main, 170, lambda t: 3.2 - 2.25 * t, 0.05, dirt, "path_main")
    ribbon(path_side, 60, lambda t: 0.95 - 0.2 * t, 0.055, dirt, "path_side")

    # stepping stones where the side path leaves the main path
    stones = [import_prop(f"Rocks/Stone_Medium_0{i}.fbx",
                          opaque_mat=rock_material(f"Stones/Stone_Medium_0{i}_Albedo.png",
                                                   f"Stones/Stone_Medium_0{i}_Normal.png"))
              for i in (1, 2, 3)]
    for i in range(7):
        t = 0.12 + i * 0.12
        x, y = path_main(t)
        place(stones[i % 3], x + rng.uniform(-0.35, 0.35), y, height=0.1, yaw=rng.uniform(0, 360), z=0.06)


def build_pond():
    water = flat_material("water", (0.010, 0.20, 0.22), roughness=0.05,
                          emission=(0.03, 0.40, 0.44), strength=0.30)
    bpy.ops.mesh.primitive_circle_add(vertices=64, radius=1.0, fill_type="NGON",
                                      location=(POND_C[0], POND_C[1], 0.02))
    pond = bpy.context.active_object
    pond.name = "pond"
    pond.scale = (POND_R[0], POND_R[1], 1)
    bpy.ops.object.transform_apply(scale=True)
    # nibble the outline so it reads hand-made, not like a perfect ellipse
    for v in pond.data.vertices:
        d = Vector((v.co.x - POND_C[0], v.co.y - POND_C[1]))
        if d.length > 0.01:
            v.co.x += d.x * 0.09 * math.sin(d.to_2d().angle_signed(Vector((1, 0))) * 3.0)
            v.co.y += d.y * 0.09 * math.cos(d.to_2d().angle_signed(Vector((1, 0))) * 2.0)
    pond.data.materials.append(water)
    ribbon(creek, 60, lambda t: 0.62 - 0.1 * t, 0.03, water, "creek", uv_scale=0.2)

    # chunky stone rim, big boulders half-buried like the painting
    bigs = [import_prop(f"Rocks/Rock_Big_0{i}.fbx",
                        opaque_mat=rock_material(f"Rocks/Rock_Big_0{i}_Albedo.png",
                                                 f"Rocks/Rock_Big_0{i}_Normal.png")) for i in (1, 2, 3)]
    meds = [import_prop(f"Rocks/Rock_Medium_0{i}.fbx",
                        opaque_mat=rock_material(f"Rocks/Rock_Medium_0{i}_Albedo.png",
                                                 f"Rocks/Rock_Medium_0{i}_Normal.png")) for i in (1, 2, 3)]
    smalls = [import_prop(f"Rocks/Rock_Small_0{i}.fbx",
                          opaque_mat=rock_material(f"Rocks/Rock_Small_0{i}_Albedo.png",
                                                   f"Rocks/Rock_Small_0{i}_Normal.png")) for i in (1, 2, 3)]
    n = 34
    for i in range(n):
        a = i / n * 2 * math.pi
        x = POND_C[0] + math.cos(a) * (POND_R[0] + 0.1)
        y = POND_C[1] + math.sin(a) * (POND_R[1] + 0.1)
        if near_path(x, y, 1.1, path_side, 20) or near_path(x, y, 0.8, creek, 24):
            continue
        # keep the rim low so it frames the water instead of hiding it
        if i % 11 == 0:
            place(bigs[i % 3], x, y, height=rng.uniform(0.85, 1.15), yaw=rng.uniform(0, 360), z=-0.22)
        elif i % 2 == 0:
            place(meds[i % 3], x, y, height=rng.uniform(0.42, 0.62), yaw=rng.uniform(0, 360), z=-0.12)
        else:
            place(smalls[i % 3], x, y, height=rng.uniform(0.16, 0.28), yaw=rng.uniform(0, 360), z=-0.04)

    # water plants: pads and lilies on the surface, cattails and reeds at the rim
    pads = [import_prop(f"Waterplants/LilyPads_0{i}.fbx", "lilypad") for i in (1, 2, 3)]
    lilies = [import_prop(f"Waterplants/Waterlily_0{i}.fbx", "waterlily") for i in (1, 2)]
    cattails = [import_prop(f"Waterplants/Cattail_0{i}.fbx", "cattail") for i in (1, 2, 3)]
    reeds = import_prop("Waterplants/Reeds.fbx", "cattail")
    for i in range(11):
        a = rng.uniform(0, 2 * math.pi)
        rr = rng.uniform(0.15, 0.78)
        x = POND_C[0] + math.cos(a) * POND_R[0] * rr
        y = POND_C[1] + math.sin(a) * POND_R[1] * rr
        place(pads[i % 3], x, y, height=rng.uniform(0.1, 0.18), yaw=rng.uniform(0, 360), z=0.025)
    for i in range(6):
        a = rng.uniform(0, 2 * math.pi)
        rr = rng.uniform(0.2, 0.7)
        place(lilies[i % 2], POND_C[0] + math.cos(a) * POND_R[0] * rr,
              POND_C[1] + math.sin(a) * POND_R[1] * rr, height=rng.uniform(0.16, 0.26),
              yaw=rng.uniform(0, 360), z=0.03)
    for i in range(22):
        a = i / 22 * 2 * math.pi + 0.15
        x = POND_C[0] + math.cos(a) * (POND_R[0] + rng.uniform(-0.15, 0.35))
        y = POND_C[1] + math.sin(a) * (POND_R[1] + rng.uniform(-0.15, 0.35))
        if near_path(x, y, 1.0, path_side, 20):
            continue
        tpl = reeds if i % 3 == 0 else cattails[i % 3]
        place(tpl, x, y, height=rng.uniform(0.55, 1.05), yaw=rng.uniform(0, 360), z=-0.02)


def build_bridge():
    wood = opaque_material(
        "bridge_wood",
        os.path.join(A, "Palmov Island/Low Poly Environment Park/Textures/texture main.png"),
        (1.0, 0.82, 0.6), roughness=0.78,
    )
    tpl = import_prop("Low Poly Environment Park/Models/Environment/bridge.fbx", opaque_mat=wood,
                      root=os.path.join(A, "Palmov Island"))
    # deck runs along X, the creek along Y at this point
    place(tpl, BRIDGE[0], BRIDGE[1], height=1.15, yaw=4, z=0.02)


def build_gate_and_house():
    rock = rock_material("Rocks/Rock_Big_01_Albedo.png", "Rocks/Rock_Big_01_Normal.png")
    # stone arch built as a torus so it reads as one sculpted piece
    bpy.ops.mesh.primitive_torus_add(major_radius=1.95, minor_radius=0.26,
                                     location=(GATE[0], GATE[1], 1.35),
                                     major_segments=48, minor_segments=16,
                                     rotation=(math.radians(90), 0, math.radians(-9)))
    arch = bpy.context.active_object
    bpy.ops.object.shade_smooth()
    arch.data.materials.append(rock)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=1.15)
    bpy.ops.object.mode_set(mode="OBJECT")

    # boulders buttressing the arch feet
    bigs = import_prop("Rocks/Rock_Big_02.fbx",
                       opaque_mat=rock_material("Rocks/Rock_Big_02_Albedo.png",
                                                "Rocks/Rock_Big_02_Normal.png"))
    for side in (-1, 1):
        place(bigs, GATE[0] + side * 2.0, GATE[1] - side * 0.25, height=0.75,
              yaw=rng.uniform(0, 360), z=-0.12)

    # fantasy house on the rise behind the gate, closing the vista
    house_mat = opaque_material("house", os.path.join(A, "Fantasy House/Mesh/Fantasy_House_6.png"),
                                (1.0, 0.95, 0.88), roughness=0.8)
    house = import_prop("Mesh/Fantasy_House_6.FBX", opaque_mat=house_mat,
                        root=os.path.join(A, "Fantasy House"))
    place(house, HOUSE[0], HOUSE[1], height=6.4, yaw=196, z=1.1)


def build_burrow():
    moss = opaque_material("moss", "Moss/Moss_Albedo.png", (0.40, 0.62, 0.20),
                           "Moss/Moss_Normal.png", 0.92, tile=6.0)
    door_wood = flat_material("door_wood", (0.30, 0.16, 0.07), roughness=0.78)
    door_rim = flat_material("door_rim", (0.50, 0.32, 0.15), roughness=0.8)

    bpy.ops.mesh.primitive_uv_sphere_add(radius=2.25, location=(BURROW[0], BURROW[1], 0.55),
                                         segments=32, ring_count=18)
    mound = bpy.context.active_object
    mound.name = "burrow_mound"
    mound.scale = (1.2, 1.0, 0.62)
    bpy.ops.object.transform_apply(scale=True)
    bpy.ops.object.shade_smooth()
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.sphere_project()
    bpy.ops.object.mode_set(mode="OBJECT")
    mound.data.materials.append(moss)

    # arched door set into the slope, facing the camera
    face = math.radians(-70)
    dx = BURROW[0] + math.cos(face) * 2.35
    dy = BURROW[1] + math.sin(face) * 1.95
    for radius, depth, mat, off in ((0.78, 0.4, door_rim, -0.1), (0.63, 0.45, door_wood, 0.08)):
        bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth,
                                            location=(dx + math.cos(face) * off,
                                                      dy + math.sin(face) * off, 0.82), vertices=28)
        door = bpy.context.active_object
        door.rotation_euler = Euler((math.radians(82), 0, face + math.pi / 2), "ZYX")
        door.data.materials.append(mat)
    # square the door bottom by sinking a matching block
    bpy.ops.mesh.primitive_cube_add(size=1.56, location=(dx, dy, 0.2))
    sill = bpy.context.active_object
    sill.scale = (1.0, 0.3, 0.5)
    sill.rotation_euler = Euler((0, 0, face + math.pi / 2))
    sill.data.materials.append(door_wood)

    # stone arch framing the doorway, so it reads as built rather than punched in
    arch_rock = rock_material("Stones/Stone_Medium_01_Albedo.png",
                              "Stones/Stone_Medium_01_Normal.png")
    chunk = import_prop("Rocks/Stone_Medium_02.fbx", opaque_mat=arch_rock)
    for k in range(9):
        a = math.pi * (0.06 + 0.88 * k / 8)
        ax = dx + math.cos(face + math.pi / 2) * math.cos(a) * 0.95
        ay = dy + math.sin(face + math.pi / 2) * math.cos(a) * 0.95
        place(chunk, ax, ay, height=0.34, yaw=rng.uniform(0, 360),
              z=0.82 + math.sin(a) * 0.9)

    # flat stone steps leading down from the door toward the pond
    slabs = import_prop("Rocks/Stone_Big_01.fbx",
                        opaque_mat=rock_material("Stones/Stone_Big_01_Albedo.png",
                                                 "Stones/Stone_Big_01_Normal.png"))
    for i in range(5):
        f = 1.0 + i * 0.85
        place(slabs, dx + math.cos(face) * f, dy + math.sin(face) * f,
              height=0.2, yaw=rng.uniform(0, 360), z=max(0.0, 0.55 - i * 0.14))


def build_fences():
    """Chunky rounded-post fence. The reference's fence is a framing device with
    thick capped posts and heavy rails, which the thin plank assets can't read as
    at foreground scale, so it is built from primitives."""
    # Flat colour, not the pack's colour-sheet atlas: primitives get default UVs
    # and would sample an arbitrary swatch from it.
    wood = flat_material("fence_wood", (0.30, 0.165, 0.075), roughness=0.75)

    def post(x, y, h=1.5, r=0.15):
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=(x, y, h / 2), vertices=16)
        p = bpy.context.active_object
        bpy.ops.object.shade_smooth()
        p.data.materials.append(wood)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=r * 1.08, location=(x, y, h), segments=16, ring_count=8)
        cap = bpy.context.active_object
        cap.scale = (1, 1, 0.6)
        bpy.ops.object.shade_smooth()
        cap.data.materials.append(wood)

    def rail(x1, y1, x2, y2, z, r=0.085):
        length = math.hypot(x2 - x1, y2 - y1)
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=length,
                                            location=((x1 + x2) / 2, (y1 + y2) / 2, z), vertices=12)
        b = bpy.context.active_object
        b.rotation_euler = Euler((0, math.radians(90), math.atan2(y2 - y1, x2 - x1)), "XYZ")
        bpy.ops.object.shade_smooth()
        b.data.materials.append(wood)

    runs = [
        # near runs sit just inside the frame edge: close enough to frame the
        # view, far enough not to loom over it
        ([(-6.8, -1.5), (-5.0, -1.1), (-3.4, -0.9)], 1.15),
        ([(2.2, -1.3), (3.8, -0.7), (5.2, 0.2)], 1.15),
        # a run climbing the right side, closing the meadow behind the path
        ([(7.4, 2.6), (8.0, 5.4), (8.2, 8.4)], 1.25),
        # a short run beside the burrow steps
        ([(-9.0, 1.6), (-7.4, 1.1), (-6.0, 0.9)], 1.1),
    ]
    for pts, h in runs:
        dense = []
        for i in range(len(pts) - 1):
            (x1, y1), (x2, y2) = pts[i], pts[i + 1]
            seg = math.hypot(x2 - x1, y2 - y1)
            n = max(1, int(round(seg / 1.5)))
            for k in range(n):
                t = k / n
                dense.append((x1 + (x2 - x1) * t, y1 + (y2 - y1) * t))
        dense.append(pts[-1])
        for x, y in dense:
            post(x, y, h, 0.115)
        for i in range(len(dense) - 1):
            (x1, y1), (x2, y2) = dense[i], dense[i + 1]
            rail(x1, y1, x2, y2, h * 0.68)
            rail(x1, y1, x2, y2, h * 0.38)


def dress_vegetation():
    # ---- tier 1: canopy trees ringing the meadow, with color accents
    broadleaf = [import_prop(f"Trees/BroadleafTree_0{i}.fbx", "broadleaf") for i in (1, 2, 3, 4, 5)]
    broadleaf_warm = [import_prop(f"Trees/BroadleafTree_0{i}.fbx", "broadleaf_warm") for i in (1, 3, 5)]
    broadleaf_red = [import_prop(f"Trees/BroadleafTree_0{i}.fbx", "broadleaf_red") for i in (2, 4)]

    clusters = [
        (-10.0, 10.4), (-5.0, 12.6), (0.8, 13.6), (7.2, 12.4), (11.2, 8.4),
        (-10.6, 5.0), (-9.6, -1.2), (9.6, 3.0), (9.4, -2.6), (-8.4, -4.6),
        (7.0, -4.4), (-14.0, 8.0), (14.0, 4.6), (2.0, 16.4), (-3.0, 16.8),
        (-13.2, 1.2), (12.6, 0.0),
    ]
    ti = 0
    tree_bases = []
    for cx, cy in clusters:
        for _ in range(rng.choice((4, 4, 5))):
            x = cx + rng.uniform(-1.1, 1.1)
            y = cy + rng.uniform(-1.0, 1.0)
            if blocked(x, y, 0.6):
                continue
            h = rng.uniform(3.4, 4.8)
            if ti % 11 == 5:
                tpl = broadleaf_red[ti % 2]
            elif ti % 3 == 1:
                tpl = broadleaf_warm[ti % 3]
            else:
                tpl = broadleaf[ti % 5]
            place(tpl, x, y, height=h, yaw=rng.uniform(0, 360), tilt=rng.uniform(-2, 2),
                  wide=rng.uniform(1.35, 1.6))
            ti += 1
        tree_bases.append((cx, cy))

    # ---- tier 2: bushes, including flowering and colored variants
    bushes_green = [import_prop("Bushes/Bush_01_01.fbx", "bush01"),
                    import_prop("Bushes/Bush_01_02.fbx", "bush01"),
                    import_prop("Bushes/Bush_02_01.fbx", "bush02"),
                    import_prop("Bushes/Bush_02_02.fbx", "bush02")]
    bushes_bloom = [import_prop("Bushes/Bush_03_01.fbx", "bush_bloom"),
                    import_prop("Bushes/Bush_03_02.fbx", "bush_bloom_warm"),
                    import_prop("Bushes/Bush_03_01.fbx", "bush_bloom_violet"),
                    import_prop("Bushes/Bush_03_02.fbx", "bush_bloom")]

    def hedge(fn, offset_lo, offset_hi, count, lo=0.7, hi=1.3):
        """Low border planting that lines the path without walling off the view."""
        for i in range(count):
            t = (i // 2) / max(1, (count // 2 - 1))
            x, y = fn(min(t, 1.0))
            side = 1 if i % 2 == 0 else -1
            x2, y2 = fn(min(t + 0.01, 1.0))
            tx, ty = x2 - x, y2 - y
            L = math.hypot(tx, ty) or 1.0
            nx, ny = -ty / L, tx / L
            off = rng.uniform(offset_lo, offset_hi)
            bx = x + nx * off * side
            by = y + ny * off * side
            if in_pond(bx, by, 0.6) or math.hypot(bx - GATE[0], by - GATE[1]) < 2.6:
                continue
            tpl = bushes_bloom[i % 4] if i % 3 == 1 else bushes_green[i % 4]
            place(tpl, bx, by, height=rng.uniform(lo, hi), yaw=rng.uniform(0, 360),
                  wide=rng.uniform(1.05, 1.3))

    hedge(path_main, 2.1, 3.0, 20)
    hedge(path_side, 1.3, 2.0, 10, 0.6, 1.1)
    # taller mass only far from the path, so it reads as depth not as a wall
    hedge(path_main, 5.0, 6.4, 14, 1.2, 2.0)
    for i in range(9):
        # far bank only: bushes on the near bank would hide the water
        a = 0.2 + (math.pi - 0.4) * i / 8
        x = POND_C[0] + math.cos(a) * (POND_R[0] + rng.uniform(0.9, 1.8))
        y = POND_C[1] + math.sin(a) * (POND_R[1] + rng.uniform(0.9, 1.8))
        if blocked(x, y, 0.2):
            continue
        place([bushes_green[i % 4], bushes_bloom[i % 4]][i % 2], x, y,
              height=rng.uniform(0.6, 1.1), yaw=rng.uniform(0, 360))
    # bushes cushioning the burrow mound
    for i in range(7):
        a = rng.uniform(0, 2 * math.pi)
        place(bushes_green[i % 4], BURROW[0] + math.cos(a) * rng.uniform(2.2, 3.6),
              BURROW[1] + math.sin(a) * rng.uniform(2.0, 3.2),
              height=rng.uniform(0.6, 1.1), yaw=rng.uniform(0, 360))
    # skirt the tree clusters so no bare trunk stands on bare lawn
    for k, (cx, cy) in enumerate(tree_bases):
        for j in range(rng.choice((1, 2))):
            a = rng.uniform(0, 2 * math.pi)
            bx = cx + math.cos(a) * rng.uniform(1.0, 2.4)
            by = cy + math.sin(a) * rng.uniform(1.0, 2.2)
            if blocked(bx, by, 0.2):
                continue
            tpl = bushes_bloom[(k + j) % 4] if (k + j) % 5 == 2 else bushes_green[(k + j) % 4]
            place(tpl, bx, by, height=rng.uniform(0.9, 1.7), yaw=rng.uniform(0, 360))

    # ---- tier 3: broad-leaf plants for the lush mid layer
    plants = [import_prop(f"Plants/Plant_0{i}.fbx", "plant") for i in (1, 2, 3, 4, 5, 6, 7, 8)]
    for i in range(30):
        if i % 3 == 0:
            # only on the far side of the pond, so the near bank stays open
            a = rng.uniform(0.15, math.pi - 0.15)
            x = POND_C[0] + math.cos(a) * (POND_R[0] + rng.uniform(0.3, 1.6))
            y = POND_C[1] + math.sin(a) * (POND_R[1] + rng.uniform(0.3, 1.4))
        elif i % 3 == 1:
            t = rng.uniform(0, 1)
            x, y = path_main(t)
            x += rng.choice((-1, 1)) * rng.uniform(1.5, 3.6)
            y += rng.uniform(-0.6, 0.6)
        else:
            x = rng.uniform(-12, 12)
            y = rng.uniform(-2, 14)
        if in_pond(x, y, -0.2) or near_path(x, y, 1.5) or near_path(x, y, 1.1, path_side, 20):
            continue
        place(plants[i % 8], x, y, height=rng.uniform(0.45, 0.9), yaw=rng.uniform(0, 360))

    # ---- tier 4: flowers, dense and saturated, plus grass tufts everywhere
    single = ["Blue_01", "Blue_02", "Orange", "Pink", "Purple", "Red", "White", "Yellow", "YellowRed"]
    meadow = ["Orange", "Red", "RedOrange", "RedPink", "Purple", "BluePurple", "Pink",
              "PurpleRedPink", "OrangePinkRedPurpleBlue", "White", "Blue", "RedPurple"]
    flowers = [import_prop(f"Flowers/Flower_{n}.fbx", "flower") for n in single]
    meadows = [import_prop(f"Flowers/FlowerMeadow_{n}.fbx", "meadow") for n in meadow]

    for i in range(170):
        r = i % 4
        if r == 0:
            t = rng.uniform(0, 1)
            x, y = path_main(t)
            x += rng.choice((-1, 1)) * rng.uniform(1.4, 3.4)
            y += rng.uniform(-0.7, 0.7)
        elif r == 1:
            a = rng.uniform(0, 2 * math.pi)
            x = POND_C[0] + math.cos(a) * (POND_R[0] + rng.uniform(0.4, 2.4))
            y = POND_C[1] + math.sin(a) * (POND_R[1] + rng.uniform(0.4, 2.2))
        elif r == 2:
            t = rng.uniform(0, 1)
            x, y = path_side(t)
            x += rng.choice((-1, 1)) * rng.uniform(1.0, 2.6)
            y += rng.uniform(-0.6, 0.6)
        else:
            x = rng.uniform(-13, 13)
            y = rng.uniform(-13, 15)
        if in_pond(x, y, -0.3) or near_path(x, y, 1.35) or near_path(x, y, 1.0, path_side, 20):
            continue
        if math.hypot(x - HOUSE[0], y - HOUSE[1]) < 5.0:
            continue
        tpl = meadows[i % len(meadows)] if i % 3 else flowers[i % len(flowers)]
        place(tpl, x, y, height=rng.uniform(0.6, 1.05), yaw=rng.uniform(0, 360))

    grass_a = import_prop("Grass/Grass.fbx", "grass")
    grass_b = import_prop("Grass/Grass.fbx", "grass2")
    for i in range(150):
        if i % 2 == 0:
            t = rng.uniform(0, 1)
            x, y = path_main(t)
            x += rng.choice((-1, 1)) * rng.uniform(1.25, 4.2)
            y += rng.uniform(-0.8, 0.8)
        else:
            x = rng.uniform(-14, 14)
            y = rng.uniform(-13, 16)
        if in_pond(x, y, -0.4) or near_path(x, y, 1.2) or near_path(x, y, 0.95, path_side, 20):
            continue
        place(grass_a if i % 3 else grass_b, x, y, height=rng.uniform(0.35, 0.72),
              yaw=rng.uniform(0, 360))

    # scattered pebbles so the ground never reads as a bare plane
    smalls = [import_prop(f"Rocks/Rock_Small_0{i}.fbx",
                          opaque_mat=rock_material(f"Rocks/Rock_Small_0{i}_Albedo.png",
                                                   f"Rocks/Rock_Small_0{i}_Normal.png"))
              for i in (1, 2, 3)]
    for i in range(46):
        t = rng.uniform(0, 1)
        x, y = path_main(t)
        x += rng.choice((-1, 1)) * rng.uniform(1.2, 3.0)
        y += rng.uniform(-0.9, 0.9)
        if in_pond(x, y, 0.2) or near_path(x, y, 1.15):
            continue
        place(smalls[i % 3], x, y, height=rng.uniform(0.14, 0.32), yaw=rng.uniform(0, 360))

    # ---- plant the burrow roof so the mound reads as living turf, not an egg
    for i in range(46):
        a = rng.uniform(0, 2 * math.pi)
        rr = rng.uniform(0.0, 0.86)
        mx = BURROW[0] + math.cos(a) * rr * 2.25 * 1.2
        my = BURROW[1] + math.sin(a) * rr * 2.25
        # ride the ellipsoid surface of the mound
        mz = 0.55 + math.sqrt(max(0.0, 1.0 - rr * rr)) * 2.25 * 0.62 - 0.12
        if i % 3 == 0:
            place(bushes_bloom[i % 4], mx, my, height=rng.uniform(0.4, 0.7),
                  yaw=rng.uniform(0, 360), z=mz)
        elif i % 3 == 1:
            place(meadows[i % len(meadows)], mx, my, height=rng.uniform(0.3, 0.5),
                  yaw=rng.uniform(0, 360), z=mz)
        else:
            place(grass_a, mx, my, height=rng.uniform(0.3, 0.5), yaw=rng.uniform(0, 360), z=mz)

    # ---- foreground framing band: the reference crowds its bottom edge with
    # oversized blooms, leafy plants and boulders that the frame crops
    meds = [import_prop(f"Rocks/Rock_Medium_0{i}.fbx",
                        opaque_mat=rock_material(f"Rocks/Rock_Medium_0{i}_Albedo.png",
                                                 f"Rocks/Rock_Medium_0{i}_Normal.png"))
            for i in (1, 2, 3)]
    # A 24mm lens magnifies whatever sits closest, so this band carries the
    # oversized blooms, leaves and boulders that the reference crops at the edge.
    for i in range(110):
        x = rng.uniform(-5.5, 3.5)
        y = rng.uniform(FOREGROUND_Y[0], FOREGROUND_Y[1])
        if near_path(x, y, 1.9) or near_path(x, y, 1.3, path_side, 20) \
                or near_path(x, y, 1.1, creek, 24) or in_pond(x, y, 0.6):
            continue
        # Anything left of the path sits in the pond's sightline, so it is kept
        # low; the water has to stay readable.
        cap = 0.5 if x < -1.4 else 1.0
        r = i % 10
        if r < 5:
            place(meadows[i % len(meadows)], x, y, height=rng.uniform(0.8, 1.45) * cap,
                  yaw=rng.uniform(0, 360))
        elif r < 8:
            place(flowers[i % len(flowers)], x, y, height=rng.uniform(0.75, 1.3) * cap,
                  yaw=rng.uniform(0, 360))
        elif r == 8:
            place(plants[i % 8], x, y, height=rng.uniform(0.5, 1.1) * cap, yaw=rng.uniform(0, 360))
        else:
            place(meds[i % 3], x, y, height=rng.uniform(0.7, 1.35) * cap,
                  yaw=rng.uniform(0, 360), z=-0.1)


def frame_report():
    """Print normalised screen coords (0..1, origin bottom-left) for the
    landmarks so framing can be tuned without paying for a render."""
    from bpy_extras.object_utils import world_to_camera_view

    scene = bpy.context.scene
    cam = scene.camera
    marks = {
        "pond": (POND_C[0], POND_C[1], 0.0),
        "pond_left": (POND_C[0] - POND_R[0], POND_C[1], 0.0),
        "pond_right": (POND_C[0] + POND_R[0], POND_C[1], 0.0),
        "bridge": (BRIDGE[0], BRIDGE[1], 1.0),
        "burrow": (BURROW[0], BURROW[1], 1.5),
        "gate_top": (GATE[0], GATE[1], 3.3),
        "house": (HOUSE[0], HOUSE[1], 5.0),
        "path_near": path_main(0.0) + (0.0,),
        "fg_near": (0.0, FOREGROUND_Y[0], 0.0),
        "fg_far": (0.0, FOREGROUND_Y[1], 0.0),
        "fg_left": (-6.0, FOREGROUND_Y[0], 0.0),
        "fg_right": (6.0, FOREGROUND_Y[0], 0.0),
        "fg_left4": (-4.0, FOREGROUND_Y[0], 0.0),
        "fg_right4": (4.0, FOREGROUND_Y[0], 0.0),
        "fg_tall": (-3.0, FOREGROUND_Y[0], 1.4),
        "horizon": (0.0, 60.0, 0.0),
        "tree_l": (-13.4, 4.4, 6.0),
        "tree_r": (11.6, 2.4, 6.0),
    }
    for name, p in marks.items():
        v = world_to_camera_view(scene, cam, Vector(p))
        flag = "IN " if 0.0 <= v.x <= 1.0 and 0.0 <= v.y <= 1.0 else "OUT"
        print(f"FRAME| {flag} {name:11s} x={v.x:6.3f} y={v.y:6.3f}")


def main():
    build_scene()
    build_ground()
    build_hills()
    build_paths()
    build_pond()
    build_bridge()
    build_gate_and_house()
    build_burrow()
    build_fences()
    dress_vegetation()
    frame_report()
    if os.environ.get("FRAME_ONLY"):
        print("FRAME_ONLY_DONE")
        return
    scene = bpy.context.scene
    scene.render.use_compositing = False
    scene.render.image_settings.file_format = "OPEN_EXR"
    scene.render.image_settings.color_depth = "32"
    scene.render.filepath = RAW
    bpy.ops.render.render(write_still=True)
    print("RENDER_OK", RAW)
    grade_exr()


if __name__ == "__main__":
    main()
