#!/usr/bin/env python3
"""Roof-hole diagnosis for the isolated acorn-cottage Tripo test.

No paid calls. Reads raw Meshy, the shipped mobile GLB, and _tripo-test.
Writes measurements + same-camera shaded / wire / orientation stills.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

REPO = Path(__file__).resolve().parents[2]
MEADOW = REPO / "chudiki/public/models/props/meadow"
OUT = MEADOW / "_tripo-test/roof-diag"
ICLOUD = Path.home() / "Library/Mobile Documents/com~apple~CloudDocs/Загрузки"

MODELS = {
    "raw": ICLOUD / "Meshy_AI_Acorn_Cottage_0913081525_texture.glb",
    "mobile": MEADOW / "mobile/acorn-cottage.glb",
    "tripo": MEADOW / "_tripo-test/acorn-cottage.glb",
}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 700
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new("sky")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.78, 0.88, 0.95, 1)
    key = bpy.data.objects.new("key", bpy.data.lights.new("key", "SUN"))
    key.data.energy = 3.0
    key.rotation_euler = (0.85, 0.15, 0.55)
    scene.collection.objects.link(key)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    return scene, cam


def meshes():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def world_box(objs):
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for obj in objs:
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            mn.x, mn.y, mn.z = min(mn.x, world.x), min(mn.y, world.y), min(mn.z, world.z)
            mx.x, mx.y, mx.z = max(mx.x, world.x), max(mx.y, world.y), max(mx.z, world.z)
    return mn, mx


def look_roof(cam, mn, mx):
    size = mx - mn
    center = (mn + mx) * 0.5
    # Same roof-down angle the player screenshots used.
    cam.location = Vector((center.x, center.y - size.y * 0.15, mx.z + max(size.x, size.y) * 0.55))
    direction = Vector((center.x, center.y, mx.z - size.z * 0.08)) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = 50


def boundary_and_roof(obj):
    mesh = obj.data
    mesh.calc_loop_triangles()
    edge_faces: dict[tuple[int, int], int] = {}
    for poly in mesh.polygons:
        verts = list(poly.vertices)
        for i, a in enumerate(verts):
            b = verts[(i + 1) % len(verts)]
            key = (a, b) if a < b else (b, a)
            edge_faces[key] = edge_faces.get(key, 0) + 1
    boundary = [edge for edge, count in edge_faces.items() if count == 1]
    zs = [obj.matrix_world @ mesh.vertices[i].co for i in range(len(mesh.vertices))]
    zmax = max(v.z for v in zs) if zs else 0.0
    zmin = min(v.z for v in zs) if zs else 0.0
    roof_cut = zmin + (zmax - zmin) * 0.78
    roof_boundary = []
    for a, b in boundary:
        wa = obj.matrix_world @ mesh.vertices[a].co
        wb = obj.matrix_world @ mesh.vertices[b].co
        if wa.z >= roof_cut or wb.z >= roof_cut:
            roof_boundary.append((wa, wb))
    loops = boundary_loops(boundary)
    roof_loops = []
    for loop in loops:
        pts = [obj.matrix_world @ mesh.vertices[i].co for i in loop]
        if pts and max(p.z for p in pts) >= roof_cut:
            roof_loops.append(loop_metrics(pts))
    flipped_roof = 0
    roof_faces = 0
    for poly in mesh.polygons:
        center = obj.matrix_world @ poly.center
        if center.z < roof_cut:
            continue
        roof_faces += 1
        normal = obj.matrix_world.to_3x3() @ poly.normal
        if normal.z < 0:
            flipped_roof += 1
    return {
        "verts": len(mesh.vertices),
        "faces": len(mesh.polygons),
        "tris": len(mesh.loop_triangles),
        "boundary_edges": len(boundary),
        "boundary_loops": len(loops),
        "roof_boundary_edges": len(roof_boundary),
        "roof_loops": roof_loops,
        "roof_faces": roof_faces,
        "roof_faces_pointing_down": flipped_roof,
        "z": [round(zmin, 4), round(zmax, 4)],
        "roof_cut_z": round(roof_cut, 4),
    }


def boundary_loops(edges: list[tuple[int, int]]) -> list[list[int]]:
    adj: dict[int, list[int]] = {}
    for a, b in edges:
        adj.setdefault(a, []).append(b)
        adj.setdefault(b, []).append(a)
    seen_edges: set[tuple[int, int]] = set()
    loops: list[list[int]] = []
    for start in adj:
        for nxt in adj[start]:
            edge = (start, nxt) if start < nxt else (nxt, start)
            if edge in seen_edges:
                continue
            loop = [start]
            prev, cur = start, nxt
            walked: set[int] = {start}
            for _ in range(len(adj) + 2):
                e = (prev, cur) if prev < cur else (cur, prev)
                seen_edges.add(e)
                loop.append(cur)
                if cur == start and len(loop) > 2:
                    break
                options = [v for v in adj.get(cur, []) if v != prev]
                unused = [v for v in options if ((cur, v) if cur < v else (v, cur)) not in seen_edges]
                nxt_v = unused[0] if unused else None
                if nxt_v is None:
                    break
                if nxt_v in walked and nxt_v != start:
                    break
                walked.add(nxt_v)
                prev, cur = cur, nxt_v
            if len(loop) >= 4:
                loops.append(loop)
    return loops


def loop_metrics(pts: list[Vector]) -> dict:
    unique = pts[:-1] if len(pts) > 1 and (pts[0] - pts[-1]).length < 1e-6 else pts
    xs = [p.x for p in unique]
    ys = [p.y for p in unique]
    zs = [p.z for p in unique]
    area = 0.0
    for i, p in enumerate(unique):
        q = unique[(i + 1) % len(unique)]
        area += p.x * q.y - q.x * p.y
    return {
        "verts": len(unique),
        "closed": len(pts) > 1 and (pts[0] - pts[-1]).length < 1e-5,
        "span_xy": [round(max(xs) - min(xs), 4), round(max(ys) - min(ys), 4)],
        "z": [round(min(zs), 4), round(max(zs), 4)],
        "area_xy": round(abs(area) * 0.5, 5),
    }


def material_report(obj) -> list[dict]:
    rows = []
    for mat in obj.data.materials:
        if not mat:
            continue
        row = {"name": mat.name, "blend": getattr(mat, "blend_method", None), "backface": not mat.use_backface_culling}
        if mat.use_nodes:
            for node in mat.node_tree.nodes:
                if node.type == "BSDF_PRINCIPLED":
                    row["alpha"] = node.inputs["Alpha"].default_value
                    row["metallic"] = node.inputs["Metallic"].default_value
                    row["roughness"] = node.inputs["Roughness"].default_value
                if node.type == "TEX_IMAGE" and node.image:
                    row.setdefault("images", []).append(
                        {
                            "name": node.image.name,
                            "size": list(node.image.size),
                            "channels": node.image.channels,
                        }
                    )
        rows.append(row)
    return rows


def paint_orientation(obj):
    mat = bpy.data.materials.new("orient")
    mat.use_nodes = True
    mat.use_backface_culling = False
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    geo = nodes.new("ShaderNodeNewGeometry")
    mix = nodes.new("ShaderNodeMixRGB")
    mix.inputs["Color1"].default_value = (0.15, 0.55, 0.95, 1)
    mix.inputs["Color2"].default_value = (0.95, 0.15, 0.12, 1)
    bsdf = nodes.new("ShaderNodeBsdfDiffuse")
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(geo.outputs["Backfacing"], mix.inputs["Fac"])
    links.new(mix.outputs["Color"], bsdf.inputs["Color"])
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def render(scene, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def diagnose(name: str, src: Path) -> dict:
    if not src.is_file():
        return {"name": name, "error": f"missing {src}"}
    scene, cam = reset()
    bpy.ops.import_scene.gltf(filepath=str(src))
    objs = meshes()
    if not objs:
        return {"name": name, "error": "no mesh"}
    obj = objs[0]
    mn, mx = world_box(objs)
    look_roof(cam, mn, mx)
    print(f"  analysing {name} verts={len(obj.data.vertices)} faces={len(obj.data.polygons)}", flush=True)
    geo = boundary_and_roof(obj)
    print(f"  {name} boundary_edges={geo['boundary_edges']} roof_loops={len(geo['roof_loops'])}", flush=True)
    mats = material_report(obj)
    size = mx - mn
    report = {
        "name": name,
        "path": str(src),
        "file_mb": round(src.stat().st_size / 1024 / 1024, 3),
        "size": [round(size.x, 4), round(size.y, 4), round(size.z, 4)],
        "geometry": geo,
        "materials": mats,
    }

    render(scene, OUT / f"{name}-roof.png")

    for o in objs:
        for slot in o.material_slots:
            if slot.material:
                slot.material.use_backface_culling = False
    render(scene, OUT / f"{name}-roof-double.png")

    for o in objs:
        o.show_wire = True
        for slot in o.material_slots:
            if slot.material:
                slot.material.use_nodes = True
                bsdf = next((n for n in slot.material.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
                if bsdf:
                    bsdf.inputs["Base Color"].default_value = (0.85, 0.85, 0.85, 1)
    scene.render.use_freestyle = False
    for o in objs:
        o.display_type = "WIRE"
    render(scene, OUT / f"{name}-roof-wire.png")

    scene, cam = reset()
    bpy.ops.import_scene.gltf(filepath=str(src))
    objs = meshes()
    mn, mx = world_box(objs)
    look_roof(cam, mn, mx)
    paint_orientation(objs[0])
    render(scene, OUT / f"{name}-roof-orient.png")
    return report


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    reports = [diagnose(name, path) for name, path in MODELS.items()]
    (OUT / "report.json").write_text(json.dumps(reports, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(reports, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
