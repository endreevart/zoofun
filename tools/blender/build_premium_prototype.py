#!/usr/bin/env python3
"""Deterministic Blender 5.1 pipeline for Virtual Zoo premium prototype meshes."""
from __future__ import annotations

import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector, noise

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BLEND_DIR = os.path.join(ROOT, "art-source", "blender")
FBX_DIR = os.path.join(ROOT, "client", "VirtualZoo", "Assets", "VirtualZoo", "Art", "PremiumPrototype")
TEX_DIR = os.path.join(FBX_DIR, "Textures")

POND_CX = -3.05
POND_CY = 1.05
POND_RX = 2.28
POND_RZ = 1.68


def pond_scale(a):
    return 1.0 + 0.26 * math.sin(a + 0.95) + 0.1 * math.sin(2.0 * a + 0.35)


def pond_xy(a, rx=None, rz=None):
    k = pond_scale(a)
    rx = POND_RX if rx is None else rx
    rz = POND_RZ if rz is None else rz
    return POND_CX + math.cos(a) * rx * k, POND_CY + math.sin(a) * rz * k


def pond_inside(x, y, pad=0.0):
    dx = x - POND_CX
    dy = y - POND_CY
    a = math.atan2(dy, dx)
    k = pond_scale(a)
    nx = dx / (POND_RX * k + pad + 1e-5)
    ny = dy / (POND_RZ * k + pad + 1e-5)
    return nx * nx + ny * ny < 1.0


def ensure_dirs():
    os.makedirs(BLEND_DIR, exist_ok=True)
    os.makedirs(FBX_DIR, exist_ok=True)
    os.makedirs(TEX_DIR, exist_ok=True)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def select_only(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def object_mode():
    if bpy.context.view_layer.objects.active and bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def shade_smooth(obj, angle=0.85):
    select_only(obj)
    try:
        bpy.ops.object.shade_auto_smooth(angle=angle)
    except Exception:
        bpy.ops.object.shade_smooth()


def apply_bevel(obj, width=0.03, segments=3, angle=0.7):
    select_only(obj)
    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = angle
    bpy.ops.object.modifier_apply(modifier=mod.name)


def apply_subdiv(obj, levels=1):
    select_only(obj)
    mod = obj.modifiers.new("Subdiv", "SUBSURF")
    mod.levels = levels
    mod.render_levels = levels
    bpy.ops.object.modifier_apply(modifier=mod.name)


def origin_to_bottom(obj):
    select_only(obj)
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    min_y = min((obj.matrix_world @ Vector(c)).z for c in obj.bound_box)
    obj.location.z -= min_y
    bpy.context.view_layer.update()
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def join_objects(objects, name):
    object_mode()
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    objects[0].name = name
    return objects[0]


def new_mesh_object(name, bm):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def fbm(p: Vector, octaves=4):
    total = 0.0
    amp = 1.0
    freq = 1.0
    for _ in range(octaves):
        total += amp * noise.noise(p * freq)
        freq *= 2.03
        amp *= 0.5
    return total


def uv_unwrap(obj):
    select_only(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    try:
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
    except Exception:
        bpy.ops.uv.unwrap(method="ANGLE_BASED")
    bpy.ops.object.mode_set(mode="OBJECT")


def get_mat(name, color):
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
        mat.diffuse_color = (color[0], color[1], color[2], 1.0)
    return mat


def split_materials_by_z(obj, z_cut, mat_low, mat_high):
    mesh = obj.data
    mesh.materials.clear()
    mesh.materials.append(mat_low)
    mesh.materials.append(mat_high)
    for poly in mesh.polygons:
        poly.material_index = 1 if poly.center.z >= z_cut else 0


def triangulate(obj):
    select_only(obj)
    mod = obj.modifiers.new("Tri", "TRIANGULATE")
    mod.quad_method = "FIXED"
    bpy.ops.object.modifier_apply(modifier=mod.name)


def export_fbx(obj, filename):
    triangulate(obj)
    select_only(obj)
    path = os.path.join(FBX_DIR, filename)
    bpy.ops.export_scene.fbx(
        filepath=path,
        use_selection=True,
        object_types={"MESH"},
        apply_scale_options="FBX_SCALE_ALL",
        axis_forward="-Z",
        axis_up="Y",
        mesh_smooth_type="FACE",
        use_tspace=False,
        add_leaf_bones=False,
        bake_space_transform=True,
        path_mode="AUTO",
        embed_textures=False,
    )
    print("exported", path)


def make_meadow():
    bm = bmesh.new()
    extent = 16.0
    div = 72
    step = (extent * 2.0) / div
    verts = []
    for iz in range(div + 1):
        row = []
        for ix in range(div + 1):
            x = -extent + ix * step
            y = -extent + iz * step
            h = 0.22 * fbm(Vector((x * 0.09, y * 0.09, 0.2)), 5)
            h += 0.55 * math.exp(-((x + 6.4) ** 2 + (y - 2.8) ** 2) / 18.0)
            h += 0.42 * math.exp(-((x - 7.2) ** 2 + (y - 4.1) ** 2) / 22.0)
            h += 0.95 * math.exp(-((x + 0.4) ** 2 + (y - 9.6) ** 2) / 28.0)
            h += 0.18 * math.sin(x * 0.18) * math.cos(y * 0.14)
            if pond_inside(x, y, pad=0.45):
                h = -0.08
            row.append(bm.verts.new((x, y, h)))
        verts.append(row)
    bm.verts.ensure_lookup_table()
    for iz in range(div):
        for ix in range(div):
            v00 = verts[iz][ix]
            v10 = verts[iz][ix + 1]
            v01 = verts[iz + 1][ix]
            v11 = verts[iz + 1][ix + 1]
            mid = (v00.co + v10.co + v01.co + v11.co) * 0.25
            if pond_inside(mid.x, mid.y, pad=0.08):
                continue
            bm.faces.new((v00, v10, v11, v01))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = new_mesh_object("meadow_hills", bm)
    uv_unwrap(obj)
    shade_smooth(obj, 1.1)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return obj


def catmull(p0, p1, p2, p3, t):
    t2 = t * t
    t3 = t2 * t
    return 0.5 * (
        (2.0 * p1)
        + (-p0 + p2) * t
        + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2
        + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
    )


def make_path():
    controls = [
        Vector((0.55, -7.4, 0.04)),
        Vector((1.35, -4.6, 0.05)),
        Vector((0.35, -2.1, 0.05)),
        Vector((1.15, 0.15, 0.05)),
        Vector((2.05, 2.25, 0.06)),
        Vector((0.85, 4.4, 0.07)),
        Vector((-0.15, 6.5, 0.08)),
        Vector((-0.55, 8.3, 0.09)),
    ]
    samples = []
    for i in range(len(controls) - 1):
        p0 = controls[max(i - 1, 0)]
        p1 = controls[i]
        p2 = controls[i + 1]
        p3 = controls[min(i + 2, len(controls) - 1)]
        steps = 14
        for s in range(steps):
            samples.append(catmull(p0, p1, p2, p3, s / steps))
    samples.append(controls[-1])
    bm = bmesh.new()
    left = []
    right = []
    width = 1.35
    for i, p in enumerate(samples):
        nxt = samples[min(i + 1, len(samples) - 1)]
        prv = samples[max(i - 1, 0)]
        tangent = (nxt - prv).normalized()
        if tangent.length < 0.001:
            tangent = Vector((0, 1, 0))
        side = Vector((-tangent.y, tangent.x, 0)).normalized()
        edge = 0.12 * fbm(Vector((p.x * 0.4, p.y * 0.4, 2.2)))
        w = width * 0.5 + edge
        left.append(bm.verts.new(p - side * w + Vector((0, 0, 0.02))))
        right.append(bm.verts.new(p + side * w + Vector((0, 0, 0.02))))
    for i in range(len(samples) - 1):
        bm.faces.new((left[i], right[i], right[i + 1], left[i + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = new_mesh_object("path_ribbon", bm)
    apply_solidify = obj.modifiers.new("Solid", "SOLIDIFY")
    apply_solidify.thickness = 0.07
    apply_solidify.offset = 1.0
    select_only(obj)
    bpy.ops.object.modifier_apply(modifier=apply_solidify.name)
    apply_bevel(obj, 0.025, 3, 0.5)
    uv_unwrap(obj)
    shade_smooth(obj)
    return obj


def make_pond_water():
    bm = bmesh.new()
    y0 = 0.11
    rings = 8
    segs = 56
    rings_v = []
    for r in range(rings + 1):
        t = r / rings
        dish = (1.0 - t) * (1.0 - t) * 0.045
        row = []
        rad = 0.04 + t * 0.96
        for i in range(segs):
            a = i / segs * math.tau
            x, y = pond_xy(a, POND_RX * rad, POND_RZ * rad)
            row.append(bm.verts.new((x, y, y0 - dish)))
        rings_v.append(row)
    bm.verts.ensure_lookup_table()
    for r in range(rings):
        for i in range(segs):
            n = (i + 1) % segs
            bm.faces.new((rings_v[r][i], rings_v[r + 1][i], rings_v[r + 1][n], rings_v[r][n]))
    obj = new_mesh_object("pond_water", bm)
    uv_unwrap(obj)
    shade_smooth(obj, 1.4)
    return obj


def make_pond_bank():
    bm = bmesh.new()
    segs = 56
    inner_v = []
    outer_v = []
    for i in range(segs):
        a = i / segs * math.tau
        ix, iy = pond_xy(a, POND_RX * 0.96, POND_RZ * 0.96)
        ox, oy = pond_xy(a, POND_RX * 1.22, POND_RZ * 1.22)
        bump = 0.14 * fbm(Vector((math.cos(a) * 2.2, math.sin(a) * 2.2, 4.1)))
        inner_v.append(bm.verts.new((ix, iy, 0.085)))
        outer_v.append(bm.verts.new((ox + math.cos(a) * bump, oy + math.sin(a) * bump, 0.05)))
    for i in range(segs):
        n = (i + 1) % segs
        bm.faces.new((inner_v[i], outer_v[i], outer_v[n], inner_v[n]))
    obj = new_mesh_object("pond_bank", bm)
    apply_solidify = obj.modifiers.new("Solid", "SOLIDIFY")
    apply_solidify.thickness = 0.07
    apply_solidify.offset = 0.2
    select_only(obj)
    bpy.ops.object.modifier_apply(modifier=apply_solidify.name)
    apply_bevel(obj, 0.03, 3)
    uv_unwrap(obj)
    shade_smooth(obj)
    return obj


def primitive_uvsphere(name, radius, location, segments=24, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, segments=segments, ring_count=rings, location=location)
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    return obj


def primitive_cylinder(name, radius, depth, location, verts=16):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, vertices=verts, location=location)
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    return obj


def align_cylinder_z(obj, direction):
    direction = Vector(direction)
    if direction.length < 1e-5:
        return
    direction.normalize()
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0.0, 0.0, 1.0)).rotation_difference(direction)
    bpy.ops.object.transform_apply(rotation=True)


def make_bridge():
    bm = bmesh.new()
    cols, rows = 7, 16
    width = 1.08
    span = 2.72
    bx = POND_CX + 1.78
    by = POND_CY - 0.12
    verts = []
    for iz in range(rows + 1):
        t = iz / rows
        y = by + (t - 0.5) * span
        z = 0.16 + math.sin(t * math.pi) * 0.48
        row = []
        for ix in range(cols + 1):
            u = ix / cols
            x = bx + (u - 0.5) * width
            dip = 0.012 * math.sin(u * math.pi)
            row.append(bm.verts.new((x, y, z - dip)))
        verts.append(row)
    bm.verts.ensure_lookup_table()
    for iz in range(rows):
        for ix in range(cols):
            bm.faces.new((verts[iz][ix], verts[iz][ix + 1], verts[iz + 1][ix + 1], verts[iz + 1][ix]))
    deck = new_mesh_object("bridge_deck", bm)
    solid = deck.modifiers.new("Solid", "SOLIDIFY")
    solid.thickness = 0.09
    solid.offset = 1.0
    select_only(deck)
    bpy.ops.object.modifier_apply(modifier=solid.name)
    apply_bevel(deck, 0.035, 3)
    parts = [deck]
    for side in (-0.48, 0.48):
        points = []
        for i in range(11):
            t = i / 10.0
            y = by + (t - 0.5) * (span - 0.22)
            z = 0.38 + math.sin(t * math.pi) * 0.48
            loc = Vector((bx + side, y, z))
            points.append(loc)
            post = primitive_cylinder("rail_post", 0.038, 0.42, (loc.x, loc.y, loc.z - 0.04), 12)
            apply_bevel(post, 0.01, 2)
            parts.append(post)
        for i in range(len(points) - 1):
            a = points[i] + Vector((0, 0, 0.18))
            b = points[i + 1] + Vector((0, 0, 0.18))
            mid = (a + b) * 0.5
            length = (b - a).length
            rail = primitive_cylinder("rail_beam", 0.032, max(length, 0.06), tuple(mid), 12)
            align_cylinder_z(rail, b - a)
            apply_bevel(rail, 0.008, 2)
            parts.append(rail)
    bridge = join_objects(parts, "bridge_round")
    uv_unwrap(bridge)
    shade_smooth(bridge)
    return bridge


def displace_verts(obj, amount, seed_off):
    mesh = obj.data
    for v in mesh.vertices:
        n = fbm(Vector((v.co.x + seed_off, v.co.y, v.co.z)) * 1.6)
        v.co += v.normal * n * amount
    mesh.update()


def make_tree(name, seed, trunk_h, trunk_r, clumps):
    trunk = primitive_cylinder(name + "_trunk", trunk_r, trunk_h, (0, 0, trunk_h * 0.5), verts=14)
    trunk.scale.x = 1.0
    trunk.scale.y = 1.08
    bpy.ops.object.transform_apply(scale=True)
    apply_bevel(trunk, 0.04, 3)
    displace_verts(trunk, 0.035, seed)
    parts = [trunk]
    for i, (dx, dy, dz, r) in enumerate(clumps):
        loc = (dx, dy, trunk_h + dz)
        ball = primitive_uvsphere(name + "_c" + str(i), r, loc, 28, 16)
        apply_subdiv(ball, 1)
        displace_verts(ball, 0.11 + 0.02 * (i % 3), seed + i * 1.7)
        apply_bevel(ball, 0.04, 2)
        parts.append(ball)
    tree = join_objects(parts, name)
    origin_to_bottom(tree)
    split_materials_by_z(
        tree,
        trunk_h * 0.9,
        get_mat("mat_bark", (0.38, 0.24, 0.14)),
        get_mat("mat_leaf", (0.28, 0.52, 0.24)),
    )
    uv_unwrap(tree)
    shade_smooth(tree)
    return tree


def make_bush(name, seed, radii):
    parts = []
    for i, (dx, dy, dz, r) in enumerate(radii):
        ball = primitive_uvsphere(name + str(i), r, (dx, dy, dz + r * 0.55), 16, 10)
        displace_verts(ball, 0.06, seed + i)
        apply_bevel(ball, 0.03, 2)
        parts.append(ball)
    bush = join_objects(parts, name)
    origin_to_bottom(bush)
    bind = get_mat("mat_leaf", (0.28, 0.52, 0.24))
    if bush.data.materials:
        bush.data.materials[0] = bind
    else:
        bush.data.materials.append(bind)
    uv_unwrap(bush)
    shade_smooth(bush)
    return bush


def make_rock(name, seed, size):
    bpy.ops.mesh.primitive_ico_sphere_add(radius=size, subdivisions=3, location=(0, 0, size * 0.45))
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    obj.scale = (1.15, 0.92, 0.7)
    bpy.ops.object.transform_apply(scale=True)
    displace_verts(obj, 0.12, seed)
    apply_bevel(obj, 0.05, 3)
    origin_to_bottom(obj)
    uv_unwrap(obj)
    shade_smooth(obj)
    return obj


def make_flower(name, color_index):
    stem = primitive_cylinder(name + "_stem", 0.022, 0.34, (0, 0, 0.18), 8)
    head = primitive_uvsphere(name + "_head", 0.055, (0, 0, 0.40), 14, 10)
    petals = [stem, head]
    for i in range(8):
        a = i / 8 * math.tau
        p = primitive_uvsphere(name + "_p" + str(i), 0.07, (math.cos(a) * 0.11, math.sin(a) * 0.11, 0.40), 12, 8)
        p.scale = (1.25, 0.85, 0.38)
        bpy.ops.object.transform_apply(scale=True)
        petals.append(p)
    flower = join_objects(petals, name)
    origin_to_bottom(flower)
    split_materials_by_z(
        flower,
        0.28,
        get_mat("mat_stem", (0.22, 0.42, 0.18)),
        get_mat("mat_petal", (0.92, 0.42, 0.32)),
    )
    uv_unwrap(flower)
    shade_smooth(flower)
    flower["flower_color"] = color_index
    return flower


def make_lily():
    bm = bmesh.new()
    segs = 18
    verts = [bm.verts.new((0, 0, 0.01))]
    for i in range(segs):
        a = i / segs * math.tau
        r = 0.26 + 0.04 * math.sin(a * 3)
        verts.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, 0.014)))
    for i in range(1, segs + 1):
        n = 1 if i == segs else i + 1
        bm.faces.new((verts[0], verts[i], verts[n]))
    pad = new_mesh_object("lily_pad_mesh", bm)
    apply_bevel(pad, 0.012, 2)
    bloom = primitive_uvsphere("lily_bloom", 0.08, (0.02, 0.01, 0.12), 16, 10)
    bloom.scale = (1.05, 1.0, 1.15)
    bpy.ops.object.transform_apply(scale=True)
    obj = join_objects([pad, bloom], "lily_pad")
    origin_to_bottom(obj)
    split_materials_by_z(
        obj,
        0.06,
        get_mat("mat_leaf", (0.28, 0.52, 0.24)),
        get_mat("mat_petal", (0.92, 0.42, 0.32)),
    )
    uv_unwrap(obj)
    shade_smooth(obj)
    return obj


def make_lantern():
    post = primitive_cylinder("lantern_post", 0.055, 1.35, (0, 0, 0.675), 12)
    apply_bevel(post, 0.02, 3)
    cap = primitive_uvsphere("lantern_cap", 0.16, (0, 0, 1.42), 16, 10)
    cap.scale.z = 0.55
    bpy.ops.object.transform_apply(scale=True)
    glass = primitive_uvsphere("lantern_glass", 0.12, (0, 0, 1.28), 16, 10)
    base = primitive_uvsphere("lantern_base", 0.14, (0, 0, 0.08), 12, 8)
    base.scale.z = 0.35
    bpy.ops.object.transform_apply(scale=True)
    lantern = join_objects([post, cap, glass, base], "lantern")
    origin_to_bottom(lantern)
    split_materials_by_z(
        lantern,
        1.12,
        get_mat("mat_wood", (0.55, 0.33, 0.16)),
        get_mat("mat_glass", (1.0, 0.86, 0.45)),
    )
    uv_unwrap(lantern)
    shade_smooth(lantern)
    return lantern


def make_gate():
    parts = []
    for x in (-1.35, 1.35):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x, 0, 1.15))
        p = bpy.context.view_layer.objects.active
        p.scale = (0.42, 0.42, 1.15)
        bpy.ops.object.transform_apply(scale=True)
        apply_bevel(p, 0.08, 4)
        parts.append(p)
        ball = primitive_uvsphere("knob", 0.22, (x, 0, 2.42), 16, 10)
        apply_bevel(ball, 0.04, 3)
        parts.append(ball)
    # arch
    bm = bmesh.new()
    segs = 14
    for i in range(segs + 1):
        t = i / segs
        a = math.pi * (1.0 - t)
        cx = math.cos(a) * 1.35
        cz = 2.05 + math.sin(a) * 0.95
        for s, r in ((-0.22, 0.16), (0.22, 0.16)):
            bm.verts.new((cx, s, cz))
    bm.verts.ensure_lookup_table()
    # simpler: torus-like cubes along arc
    bm.free()
    for i in range(10):
        t = i / 9.0
        a = math.pi * t
        loc = (math.cos(a) * 1.35, 0.0, 2.1 + math.sin(a) * 0.9)
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc)
        k = bpy.context.view_layer.objects.active
        k.scale = (0.28, 0.28, 0.22)
        k.rotation_euler[1] = a - math.pi * 0.5
        bpy.ops.object.transform_apply(scale=True, rotation=True)
        apply_bevel(k, 0.05, 3)
        parts.append(k)
    gate = join_objects(parts, "gate_arch")
    origin_to_bottom(gate)
    uv_unwrap(gate)
    shade_smooth(gate)
    return gate


def make_burrow():
    hill = primitive_uvsphere("burrow_hill", 1.8, (0, 0, 0.35), 24, 14)
    hill.scale = (1.35, 1.1, 0.72)
    bpy.ops.object.transform_apply(scale=True)
    displace_verts(hill, 0.08, 3.3)
    door = primitive_uvsphere("burrow_door", 0.55, (0, -1.35, 0.55), 16, 10)
    door.scale = (0.85, 0.2, 1.05)
    bpy.ops.object.transform_apply(scale=True)
    apply_bevel(hill, 0.06, 3)
    apply_bevel(door, 0.04, 3)
    burrow = join_objects([hill, door], "hill_burrow")
    origin_to_bottom(burrow)
    uv_unwrap(burrow)
    shade_smooth(burrow)
    return burrow


def make_background_hills():
    parts = []
    specs = [
        (-4.0, 14.0, 2.4, 3.6),
        (1.5, 16.5, 3.2, 4.4),
        (6.5, 13.5, 2.1, 3.1),
        (-8.5, 12.0, 1.8, 2.8),
        (9.5, 15.0, 2.6, 3.4),
    ]
    for i, (x, y, z, r) in enumerate(specs):
        h = primitive_uvsphere("bg" + str(i), r, (x, y, z * 0.15), 20, 12)
        h.scale = (1.6, 1.1, 0.55)
        bpy.ops.object.transform_apply(scale=True)
        displace_verts(h, 0.18, 8 + i)
        apply_bevel(h, 0.08, 2)
        parts.append(h)
    hills = join_objects(parts, "background_hills")
    uv_unwrap(hills)
    shade_smooth(hills, 1.2)
    return hills


def make_tower():
    body = primitive_cylinder("tower_body", 0.85, 3.2, (0, 0, 1.6), 20)
    apply_bevel(body, 0.08, 4)
    roof = primitive_uvsphere("tower_roof", 1.05, (0, 0, 3.35), 18, 12)
    roof.scale.z = 0.55
    bpy.ops.object.transform_apply(scale=True)
    window = primitive_uvsphere("tower_window", 0.28, (0, -0.82, 2.15), 12, 8)
    window.scale.y = 0.2
    bpy.ops.object.transform_apply(scale=True)
    tower = join_objects([body, roof, window], "story_tower")
    origin_to_bottom(tower)
    split_materials_by_z(
        tower,
        2.85,
        get_mat("mat_stone", (0.62, 0.58, 0.52)),
        get_mat("mat_wood", (0.55, 0.33, 0.16)),
    )
    uv_unwrap(tower)
    shade_smooth(tower)
    return tower


def make_paver():
    bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=0.06, vertices=14, location=(0, 0, 0.03))
    obj = bpy.context.view_layer.objects.active
    obj.name = "stone_paver"
    apply_bevel(obj, 0.02, 3)
    origin_to_bottom(obj)
    uv_unwrap(obj)
    shade_smooth(obj)
    return obj


def make_fence():
    parts = []
    for x in (-0.62, 0.62):
        post = primitive_cylinder("fence_post", 0.055, 0.92, (x, 0.0, 0.46), 12)
        apply_bevel(post, 0.018, 3)
        cap = primitive_uvsphere("fence_cap", 0.07, (x, 0.0, 0.94), 12, 8)
        parts.extend([post, cap])
    for height in (0.36, 0.62):
        rail = primitive_cylinder("fence_rail_beam", 0.032, 1.28, (0.0, 0.0, height), 10)
        rail.rotation_euler[1] = math.pi * 0.5
        bpy.ops.object.transform_apply(rotation=True)
        apply_bevel(rail, 0.01, 2)
        parts.append(rail)
    fence = join_objects(parts, "fence_rail")
    origin_to_bottom(fence)
    bind = get_mat("mat_wood", (0.55, 0.33, 0.16))
    if fence.data.materials:
        fence.data.materials[0] = bind
    else:
        fence.data.materials.append(bind)
    uv_unwrap(fence)
    shade_smooth(fence)
    return fence


def make_grass_tuft():
    return make_bush(
        "grass_tuft",
        9.2,
        [(0, 0, 0, 0.18), (0.14, 0.05, 0.01, 0.13), (-0.12, 0.07, 0.0, 0.12), (0.03, -0.12, 0.02, 0.11)],
    )


def make_reed():
    parts = []
    for i in range(5):
        x = (i - 2) * 0.07
        y = (i % 2) * 0.05
        h = 0.85 + 0.12 * (i % 3)
        stem = primitive_cylinder("reed", 0.018, h, (x, y, h * 0.5), 8)
        apply_bevel(stem, 0.008, 2)
        parts.append(stem)
        tip = primitive_uvsphere("reed_tip", 0.04, (x, y, h + 0.02), 10, 6)
        tip.scale = (0.7, 0.7, 1.4)
        bpy.ops.object.transform_apply(scale=True)
        parts.append(tip)
    reed = join_objects(parts, "reed_cluster")
    origin_to_bottom(reed)
    uv_unwrap(reed)
    shade_smooth(reed)
    return reed


def make_creature_nub():
    bpy.ops.mesh.primitive_ico_sphere_add(radius=0.12, subdivisions=2, location=(0, 0, 0.1))
    obj = bpy.context.view_layer.objects.active
    obj.name = "creature_nub"
    obj.scale = (1.05, 0.72, 0.9)
    bpy.ops.object.transform_apply(scale=True)
    apply_bevel(obj, 0.03, 3)
    origin_to_bottom(obj)
    uv_unwrap(obj)
    shade_smooth(obj)
    return obj


def make_creature_slab():
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.6))
    obj = bpy.context.view_layer.objects.active
    obj.name = "creature_slab"
    obj.scale = (0.52, 0.12, 0.62)
    bpy.ops.object.transform_apply(scale=True)
    apply_bevel(obj, 0.06, 4, 0.4)
    apply_subdiv(obj, 1)
    origin_to_bottom(obj)
    uv_unwrap(obj)
    shade_smooth(obj)
    return obj


def save_texture(name, size, func):
    path = os.path.join(TEX_DIR, name)
    img = bpy.data.images.new(name, width=size, height=size, alpha=False, float_buffer=False)
    pixels = [0.0] * (size * size * 4)
    for y in range(size):
        v = y / (size - 1)
        for x in range(size):
            u = x / (size - 1)
            r, g, b = func(u, v)
            i = (y * size + x) * 4
            pixels[i] = r
            pixels[i + 1] = g
            pixels[i + 2] = b
            pixels[i + 3] = 1.0
    img.pixels = pixels
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)
    print("texture", path)


def clamp(x):
    return max(0.0, min(1.0, x))


def tex_grass(u, v):
    n = 0.5 + 0.16 * math.sin(u * 5.2) * math.cos(v * 4.4)
    n += 0.08 * math.sin((u * 1.7 + v * 1.3) * math.tau)
    patch = 0.5 + 0.12 * math.sin(u * 2.1 + 0.4) * math.cos(v * 1.8)
    g = 0.64 + 0.08 * n + 0.05 * patch
    return (0.22 + 0.05 * patch, g, 0.16 + 0.04 * (1.0 - n))


def tex_dirt(u, v):
    n = 0.5 + 0.28 * math.sin(u * 7.4) * math.cos(v * 6.1)
    r = 0.66 + 0.08 * n
    return (r, 0.42 + 0.06 * n, 0.22 + 0.03 * n)


def tex_wood(u, v):
    grain = 0.5 + 0.5 * math.sin((u * 11 + math.sin(v * 14) * 0.12) * math.tau)
    r = 0.58 + 0.12 * grain
    return (r, 0.36 + 0.08 * grain, 0.18 + 0.03 * grain)


def tex_bark(u, v):
    n = 0.5 + 0.3 * math.sin(u * 9.5) * math.cos(v * 4.2)
    return (0.4 + 0.08 * n, 0.26 + 0.05 * n, 0.15 + 0.03 * n)


def tex_leaf(u, v):
    n = 0.5 + 0.28 * math.sin(u * 6.5) * math.cos(v * 5.8)
    return (0.24 + 0.06 * n, 0.52 + 0.12 * n, 0.22 + 0.06 * n)


def tex_rock(u, v):
    n = 0.5 + 0.22 * math.sin(u * 5.4) * math.cos(v * 6.8)
    m = 0.5 + 0.12 * math.sin((u + v) * 4.6)
    g = 0.5 + 0.08 * n + 0.04 * m
    return (g * 0.96, g * 0.93, g * 0.88)


def tex_stone(u, v):
    n = 0.5 + 0.18 * math.sin(u * 4.8) * math.cos(v * 5.2)
    g = 0.66 + 0.07 * n
    return (g, g * 0.96, g * 0.9)


def tex_petal(u, v):
    n = 0.5 + 0.18 * math.sin(u * 4.2) * math.cos(v * 3.8)
    return (0.94, 0.46 + 0.12 * n, 0.32 + 0.08 * n)


def write_textures():
    save_texture("grass.png", 512, tex_grass)
    save_texture("dirt.png", 512, tex_dirt)
    save_texture("wood.png", 512, tex_wood)
    save_texture("bark.png", 512, tex_bark)
    save_texture("leaf.png", 512, tex_leaf)
    save_texture("rock.png", 512, tex_rock)
    save_texture("stone.png", 512, tex_stone)
    save_texture("petal.png", 512, tex_petal)


def main():
    ensure_dirs()
    reset_scene()
    write_textures()

    exports = []
    exports.append(make_meadow())
    exports.append(make_path())
    exports.append(make_pond_water())
    exports.append(make_pond_bank())
    exports.append(make_bridge())
    exports.append(
        make_tree(
            "tree_cloud_a",
            1.1,
            1.72,
            0.34,
            [
                (-0.05, 0.08, 0.05, 1.18),
                (0.72, -0.18, 0.22, 0.82),
                (-0.68, -0.12, 0.28, 0.78),
                (0.12, 0.62, 0.42, 0.7),
                (0.48, 0.38, 0.85, 0.58),
                (-0.42, 0.22, 0.92, 0.55),
                (0.08, -0.08, 1.15, 0.62),
                (0.55, -0.42, 0.55, 0.52),
                (-0.55, 0.48, 0.62, 0.5),
            ],
        )
    )
    exports.append(
        make_tree(
            "tree_cloud_b",
            2.4,
            1.45,
            0.4,
            [
                (0.08, 0.04, 0.0, 1.32),
                (0.78, 0.18, 0.12, 0.82),
                (-0.74, 0.16, 0.18, 0.86),
                (0.22, -0.62, 0.38, 0.7),
                (-0.18, 0.55, 0.48, 0.64),
                (0.05, 0.02, 0.95, 0.72),
            ],
        )
    )
    exports.append(
        make_tree(
            "tree_cloud_c",
            3.8,
            2.05,
            0.28,
            [
                (0.0, 0.0, 0.08, 0.95),
                (0.55, 0.14, 0.32, 0.7),
                (-0.48, -0.12, 0.4, 0.66),
                (0.18, 0.48, 0.72, 0.58),
                (-0.22, 0.08, 1.05, 0.52),
                (0.08, -0.32, 0.82, 0.48),
            ],
        )
    )
    exports.append(make_bush("bush_round_a", 4.2, [(0, 0, 0, 0.42), (0.28, 0.12, 0.05, 0.32), (-0.22, 0.1, 0.02, 0.3)]))
    exports.append(make_bush("bush_round_b", 5.1, [(0, 0, 0, 0.5), (0.34, -0.1, 0.08, 0.36), (-0.3, 0.16, 0.04, 0.34), (0.05, 0.28, 0.1, 0.28)]))
    exports.append(make_rock("rock_soft_a", 6.0, 0.42))
    exports.append(make_rock("rock_soft_b", 7.2, 0.28))
    exports.append(make_rock("rock_soft_c", 8.1, 0.55))
    exports.append(make_flower("flower_cluster_a", 0))
    exports.append(make_flower("flower_cluster_b", 1))
    exports.append(make_flower("flower_cluster_c", 2))
    exports.append(make_lily())
    exports.append(make_lantern())
    exports.append(make_gate())
    exports.append(make_burrow())
    exports.append(make_background_hills())
    exports.append(make_tower())
    exports.append(make_paver())
    exports.append(make_fence())
    exports.append(make_grass_tuft())
    exports.append(make_reed())
    exports.append(make_creature_nub())
    exports.append(make_creature_slab())

    for obj in exports:
        export_fbx(obj, obj.name + ".fbx")

    blend_path = os.path.join(BLEND_DIR, "premium_prototype.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    print("saved", blend_path)
    print("PREMIUM_PROTOTYPE_OK count=" + str(len(exports)))


if __name__ == "__main__":
    main()
