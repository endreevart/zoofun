#!/usr/bin/env python3
"""Export the Idyllic Fantasy Nature scene assets to GLB for the web prototype.

Run:
  blender --background --python scripts/export-idyllic-glb.py

This is the asset half of scripts/render-idyllic-world.py: the same meshes, the
same LOD0 selection, the same pivot centring and the same foliage gradients, but
written out for Three.js instead of rendered.

Two decisions matter for the port:

* The pack's foliage atlases are greyscale masks and all colour comes from the
  shader's Bottom_Color -> Top_Color vertical tint. That tint is baked into a
  COLOR_0 vertex-colour attribute here, so Three.js needs no custom shader:
  glTF COLOR_0 multiplies base colour exactly like the Blender ramp did.
* Textures are *not* embedded. Each GLB is geometry only, and materials are
  described in a manifest so dozens of assets share a handful of texture
  uploads and the stylization stays tunable without re-exporting.
"""
from __future__ import annotations

import json
import os

import bpy
from mathutils import Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
ASSETS = "/Volumes/Siska/DEVELOP/zoofun/client/VirtualZoo/Assets"
IDY = os.path.join(ASSETS, "Idyllic Fantasy Nature")
MODELS = os.path.join(IDY, "Models")
TEX = os.path.join(IDY, "Textures")

# Trees Package Lite supplies the canopy trees and bushes. It is solid low-poly
# geometry with no cut-out cards, which is both closer to the reference's chunky
# broccoli canopies and far cheaper for the few hundred trees in the treeline.
LP = os.path.join(ASSETS, "Trees Package Lite")
LP_MESHES = os.path.join(LP, "Meshes")
LP_TEXTURE = os.path.join(LP, "Textures/texture.png")

OUT_MODELS = os.path.join(PROJECT, "public/models/idyllic")
OUT_TEX = os.path.join(PROJECT, "public/textures/idyllic")
MANIFEST = os.path.join(OUT_MODELS, "manifest.json")

# 512 is generous here: foliage atlases are cut-out cards a few dozen pixels
# tall on screen, and the ground maps are tiled 26x. The source PNGs are 1-2 MB
# each, which would put ~50 MB of textures on the wire.
MAX_TEXTURE_PX = 512
JPEG_QUALITY = 82

# ---------------------------------------------------------------- stylization
# Gradients copied verbatim from render-idyllic-world.py: these are the values
# the approved Cycles frame was graded against. Linear RGB, bottom -> top, with
# an optional third stop used as a tip accent on flowering bushes.
C_GRASS = ((0.13, 0.36, 0.05), (0.56, 0.92, 0.11))
C_GRASS2 = ((0.10, 0.29, 0.045), (0.38, 0.72, 0.08))
C_PLANT = ((0.10, 0.30, 0.06), (0.48, 0.84, 0.12))

C_ROCK = (0.60, 0.56, 0.62)
C_BARK = (0.46, 0.30, 0.17)

# role -> gradient. `span` is the object-space height the ramp is normalised
# over, matching the MapRange "From Max" used in the render script; `top_at`
# moves the last stop so tip accents stay confined to the very top.
FOLIAGE = {
    "grass": dict(atlas="Grass/Grass_01.png", grad=C_GRASS, cutoff=0.5, span=0.7),
    "grass2": dict(atlas="Grass/Grass_02.png", grad=C_GRASS2, cutoff=0.5, span=0.7),
    "plant": dict(atlas="Plants/Plants_Albedo.png", grad=C_PLANT, cutoff=0.5, span=1.1),
    # C_WHITE in the render script: these atlases carry their own colour, so
    # they need no gradient and therefore no vertex colours.
    "flower": dict(atlas="Flowers/Flower.png", cutoff=0.5),
    "meadow": dict(atlas="Flowers/FlowerMeadow.png", cutoff=0.7),
    "lilypad": dict(atlas="Waterplants/LilyPad_Albedo.png", cutoff=0.5),
    "waterlily": dict(atlas="Waterplants/Waterlily_Leaf.png", cutoff=0.5),
    "cattail": dict(atlas="Waterplants/Cattail_Albedo.png", cutoff=0.5),
}

# --------------------------------------------------------------- asset table
# (glb name, fbx path relative to MODELS, role)
# Canopy trees and bushes now come from Trees Package Lite, so this pack keeps
# only what it is better at: the ankle-height layer where a cut-out atlas earns
# its cost, plus the rocks and water plants.
FOLIAGE_ASSETS = (
    [
        ("grass_a", "Grass/Grass.fbx", "grass"),
        ("grass_b", "Grass/Grass.fbx", "grass2"),
        ("reeds", "Waterplants/Reeds.fbx", "cattail"),
    ]
    + [(f"plant_{i:02d}", f"Plants/Plant_{i:02d}.fbx", "plant") for i in range(1, 9)]
    + [
        (f"flower_{n.lower()}", f"Flowers/Flower_{n}.fbx", "flower")
        for n in ("Blue_01", "Blue_02", "Orange", "Pink", "Purple", "Red", "White", "Yellow", "YellowRed")
    ]
    + [
        (f"meadow_{n.lower()}", f"Flowers/FlowerMeadow_{n}.fbx", "meadow")
        for n in ("Orange", "Red", "RedOrange", "RedPink", "Purple", "BluePurple", "Pink",
                  "PurpleRedPink", "OrangePinkRedPurpleBlue", "White", "Blue", "RedPurple")
    ]
    + [(f"lilypads_{i:02d}", f"Waterplants/LilyPads_{i:02d}.fbx", "lilypad") for i in (1, 2, 3)]
    + [(f"waterlily_{i:02d}", f"Waterplants/Waterlily_{i:02d}.fbx", "waterlily") for i in (1, 2)]
    + [(f"cattail_{i:02d}", f"Waterplants/Cattail_{i:02d}.fbx", "cattail") for i in (1, 2, 3)]
)

# (glb name, fbx path relative to MODELS, albedo, normal) — tinted with C_ROCK
ROCK_ASSETS = (
    [(f"rock_big_{i:02d}", f"Rocks/Rock_Big_{i:02d}.fbx", f"Rocks/Rock_Big_{i:02d}_Albedo.png",
      f"Rocks/Rock_Big_{i:02d}_Normal.png") for i in (1, 2, 3)]
    + [(f"rock_medium_{i:02d}", f"Rocks/Rock_Medium_{i:02d}.fbx", f"Rocks/Rock_Medium_{i:02d}_Albedo.png",
        f"Rocks/Rock_Medium_{i:02d}_Normal.png") for i in (1, 2, 3)]
    + [(f"rock_small_{i:02d}", f"Rocks/Rock_Small_{i:02d}.fbx", f"Rocks/Rock_Small_{i:02d}_Albedo.png",
        f"Rocks/Rock_Small_{i:02d}_Normal.png") for i in (1, 2, 3)]
    + [(f"stone_medium_{i:02d}", f"Rocks/Stone_Medium_{i:02d}.fbx", f"Stones/Stone_Medium_{i:02d}_Albedo.png",
        f"Stones/Stone_Medium_{i:02d}_Normal.png") for i in (1, 2, 3)]
    + [("stone_big_01", "Rocks/Stone_Big_01.fbx", "Stones/Stone_Big_01_Albedo.png",
        "Stones/Stone_Big_01_Normal.png")]
)

# Props from the wider project, kept because the pack ships no built structures.
PROP_ASSETS = [
    ("bridge", os.path.join(ASSETS, "Palmov Island/Low Poly Environment Park/Models/Environment/bridge.fbx"),
     "bridge_wood",
     os.path.join(ASSETS, "Palmov Island/Low Poly Environment Park/Textures/texture main.png"),
     None, (1.0, 0.82, 0.6), 0.78),
    ("house", os.path.join(ASSETS, "Fantasy House/Mesh/Fantasy_House_6.FBX"),
     "house_paint",
     os.path.join(ASSETS, "Fantasy House/Mesh/Fantasy_House_6.png"),
     None, (1.0, 0.95, 0.88), 0.8),
]

# Ground and structure textures the Three.js scene samples directly.
GROUND_TEXTURES = {
    "grass_albedo": "Ground/Grass/Grass_Albedo.png",
    "grass_normal": "Ground/Grass/Grass_Normal.png",
    "dirt_albedo": "Ground/Dirt/Dirt_01_Albedo.png",
    "dirt_normal": "Ground/Dirt/Dirt_Normal.png",
    "moss_albedo": "Moss/Moss_Albedo.png",
}

materials_manifest: dict[str, dict] = {}
textures_seen: dict[str, str] = {}


# ------------------------------------------------------------------ textures
def flat_name(rel: str) -> str:
    """Textures/Trees/Bark_Albedo.png -> trees_bark_albedo.png"""
    stem = rel.replace("\\", "/").replace(" & ", "_").replace(" ", "_")
    return stem.replace("/", "_").lower()


def copy_texture(rel_or_abs: str, alpha: bool = False) -> str:
    """Downscale and re-encode a source texture into public/, returning its
    filename. `alpha` keeps PNG for cut-out atlases; everything else becomes
    JPEG, which is roughly 20x smaller on these hand-painted maps.
    """
    src = rel_or_abs if os.path.isabs(rel_or_abs) else os.path.join(TEX, rel_or_abs)
    if not os.path.exists(src):
        print("MISSING TEXTURE", src)
        return ""
    key = os.path.abspath(src)
    if key in textures_seen:
        return textures_seen[key]

    stem = flat_name(rel_or_abs if not os.path.isabs(rel_or_abs) else os.path.basename(src))
    name = os.path.splitext(stem)[0] + (".png" if alpha else ".jpg")
    dst = os.path.join(OUT_TEX, name)

    if os.path.exists(dst):
        textures_seen[key] = name
        return name

    image = bpy.data.images.load(src, check_existing=False)
    width, height = image.size
    scale = max(width, height) / float(MAX_TEXTURE_PX)
    if scale > 1:
        image.scale(max(1, int(width / scale)), max(1, int(height / scale)))

    # save_render is the path that honours the scene's encoder settings; a plain
    # image.save() ignores quality and writes an uncompressed PNG.
    settings = bpy.context.scene.render.image_settings
    settings.file_format = "PNG" if alpha else "JPEG"
    settings.color_mode = "RGBA" if alpha else "RGB"
    settings.color_depth = "8"
    settings.quality = JPEG_QUALITY
    settings.compression = 95
    image.save_render(filepath=dst, scene=bpy.context.scene)
    bpy.data.images.remove(image)

    textures_seen[key] = name
    print("TEX", name, os.path.getsize(dst))
    return name


# ------------------------------------------------------------------ gradient
def ramp(grad, top_at: float, t: float):
    """Same piecewise ramp the render script builds with a ColorRamp node."""
    t = min(max(t, 0.0), 1.0)
    if len(grad) == 2:
        stops = ((0.0, grad[0]), (top_at, grad[1]))
    else:
        stops = ((0.0, grad[0]), (top_at * 0.78, grad[1]), (top_at, grad[2]))

    if t <= stops[0][0]:
        return stops[0][1]
    for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
        if t <= p1:
            f = (t - p0) / max(p1 - p0, 1e-6)
            return tuple(c0[i] + (c1[i] - c0[i]) * f for i in range(3))
    return stops[-1][1]


def bake_gradient(obj, spec, leaf_slots: set[int]):
    """Write the Bottom_Color -> Top_Color ramp into a COLOR_0 attribute.

    Corner domain, so a trunk slot inside the same mesh can stay white and keep
    its own bark tint instead of being tinted green.
    """
    grad = spec.get("grad")
    if not grad:
        return False

    span = spec.get("span", 1.0)
    top_at = spec.get("top_at", 1.0)
    mesh = obj.data
    layer = mesh.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="CORNER")

    for poly in mesh.polygons:
        leafy = poly.material_index in leaf_slots
        for loop_index in poly.loop_indices:
            if not leafy:
                layer.data[loop_index].color = (1.0, 1.0, 1.0, 1.0)
                continue
            z = mesh.vertices[mesh.loops[loop_index].vertex_index].co.z
            layer.data[loop_index].color = (*ramp(grad, top_at, z / span), 1.0)
    return True


# -------------------------------------------------------------------- import
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def keep_lod0():
    """Delete LOD1/LOD2 and non-mesh helpers, return the surviving meshes.

    Names are captured up front: removing an object invalidates every Python
    reference held into the old list.
    """
    names = [o.name for o in bpy.data.objects]
    meshes = [n for n in names if bpy.data.objects[n].type == "MESH"]
    lod0 = [n for n in meshes if "LOD0" in n]
    keep = lod0 if lod0 else meshes
    for name in names:
        if name in keep:
            continue
        stale = bpy.data.objects.get(name)
        if stale is not None:
            bpy.data.objects.remove(stale, do_unlink=True)
    return [bpy.data.objects[n] for n in keep]


def join(objs):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objs:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    return bpy.context.view_layer.objects.active


def recenter(obj):
    """Footprint centre at the origin, base at z=0 — the pivot convention both
    the render script and InstancedScatter assume."""
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    xs = [v.co.x for v in obj.data.vertices]
    ys = [v.co.y for v in obj.data.vertices]
    zs = [v.co.z for v in obj.data.vertices]
    obj.data.transform(
        Matrix.Translation((-(min(xs) + max(xs)) / 2, -(min(ys) + max(ys)) / 2, -min(zs)))
    )


def placeholder(name: str):
    """A material whose only job is to name a manifest entry: the GLB carries no
    textures, so Three.js looks the real parameters up by this name."""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    return mat


def is_woody(slot_name: str) -> bool:
    return any(tag in slot_name for tag in ("Trunk", "Bark", "Stem", "Wood"))


def export_glb(name: str, texcoords: bool = True):
    os.makedirs(OUT_MODELS, exist_ok=True)
    path = os.path.join(OUT_MODELS, f"{name}.glb")
    kwargs = dict(
        filepath=path,
        export_format="GLB",
        # The low-poly pack's colour is entirely in COLOR_0, so its UVs are dead
        # weight: dropping them takes a quarter off every one of those files.
        export_texcoords=texcoords,
        export_normals=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_apply=True,
        export_yup=True,
    )
    # The flag that carries COLOR_0 was renamed across Blender versions; ask for
    # every spelling and let the unknown ones fall away.
    for extra in ({"export_vertex_color": "ACTIVE"}, {"export_all_vertex_colors": True}, {}):
        try:
            bpy.ops.export_scene.gltf(**kwargs, **extra)
            return os.path.getsize(path)
        except TypeError:
            continue
    raise RuntimeError(f"could not export {name}")


def already_built(name: str) -> bool:
    """Blender segfaults at random points in a run this long, so the export is
    resumable: an existing GLB is trusted and only its manifest entry is redone.
    """
    return os.path.exists(os.path.join(OUT_MODELS, f"{name}.glb"))


def build_foliage(name: str, fbx_rel: str, role: str):
    spec = FOLIAGE[role]
    path = os.path.join(MODELS, fbx_rel)
    if not os.path.exists(path):
        print("MISSING", path)
        return None

    if already_built(name):
        register_foliage_material(role, spec)
        print(f"SKIP {name} role={role}")
        return name

    reset()
    bpy.ops.import_scene.fbx(filepath=path)
    meshes = keep_lod0()
    if not meshes:
        print("NO MESH", name)
        return None

    leaf_mat = placeholder(f"idy_{role}")
    bark_mat = placeholder("idy_bark")
    for mesh in meshes:
        slots = [s.material.name if s.material else "" for s in mesh.material_slots]
        if not slots:
            mesh.data.materials.append(leaf_mat)
            continue
        # A trunk slot only means bark when the same mesh also carries foliage.
        # Single-slot props are one atlas whatever they are called: Flower_Red's
        # only slot is named "Stems" but holds the whole coloured blossom.
        has_foliage_slot = any(not is_woody(s) for s in slots)
        for i, slot_name in enumerate(slots):
            woody = has_foliage_slot and is_woody(slot_name)
            mesh.material_slots[i].material = bark_mat if woody else leaf_mat

    obj = join(meshes)
    recenter(obj)

    leaf_slots = {i for i, s in enumerate(obj.data.materials) if s and s.name == leaf_mat.name}
    bake_gradient(obj, spec, leaf_slots)

    register_foliage_material(role, spec)
    if any(s and s.name == bark_mat.name for s in obj.data.materials):
        register_bark_material()

    size = export_glb(name)
    print(f"GLB {name} ({size} bytes) role={role}")
    return name


def build_rock(name: str, fbx_rel: str, albedo: str, normal: str):
    path = os.path.join(MODELS, fbx_rel)
    if not os.path.exists(path):
        print("MISSING", path)
        return None

    mat_name = f"idy_rock_{name}"
    resumed = already_built(name)

    if not resumed:
        reset()
        bpy.ops.import_scene.fbx(filepath=path)
        meshes = keep_lod0()
        if not meshes:
            return None

        mat = placeholder(mat_name)
        for mesh in meshes:
            if not mesh.material_slots:
                mesh.data.materials.append(mat)
                continue
            for i in range(len(mesh.material_slots)):
                mesh.material_slots[i].material = mat

        obj = join(meshes)
        recenter(obj)

    materials_manifest[mat_name] = {
        "map": copy_texture(albedo),
        # Rocks are scattered props at 0.2-1 m; their normal maps were half the
        # texture budget and invisible at that size.
        "normalMap": "",
        "color": list(C_ROCK),
        "roughness": 0.9,
        "alphaTest": 0,
        "doubleSide": False,
    }
    if resumed:
        print(f"SKIP {name} rock")
        return name
    size = export_glb(name)
    print(f"GLB {name} ({size} bytes) rock")
    return name


def build_prop(name, fbx_abs, mat_name, albedo, normal, tint, roughness):
    if not os.path.exists(fbx_abs):
        print("MISSING", fbx_abs)
        return None

    resumed = already_built(name)

    if not resumed:
        reset()
        bpy.ops.import_scene.fbx(filepath=fbx_abs)
        meshes = keep_lod0()
        if not meshes:
            return None

        mat = placeholder(f"idy_{mat_name}")
        for mesh in meshes:
            if not mesh.material_slots:
                mesh.data.materials.append(mat)
                continue
            for i in range(len(mesh.material_slots)):
                mesh.material_slots[i].material = mat

        obj = join(meshes)
        recenter(obj)

    materials_manifest[f"idy_{mat_name}"] = {
        "map": copy_texture(albedo),
        "normalMap": copy_texture(normal) if normal else "",
        "color": list(tint),
        "roughness": roughness,
        "alphaTest": 0,
        "doubleSide": False,
    }
    if resumed:
        print(f"SKIP {name} prop")
        return name
    size = export_glb(name)
    print(f"GLB {name} ({size} bytes) prop")
    return name


def register_foliage_material(role: str, spec: dict):
    key = f"idy_{role}"
    if key in materials_manifest:
        return
    materials_manifest[key] = {
        "map": copy_texture(spec["atlas"], alpha=True),
        "normalMap": "",
        # The gradient is already baked into COLOR_0, so base colour stays white.
        "color": [1.0, 1.0, 1.0],
        "roughness": 0.62,
        "alphaTest": spec["cutoff"],
        "doubleSide": True,
    }


# ------------------------------------------------------- Trees Package Lite
# The pack ships one material and one 256x256 palette; trunk and canopy differ
# only by which cell of that palette a face's UVs land in. Since every colour is
# rebaked into COLOR_0 here, the palette is read at export time and then thrown
# away: the GLBs carry no texture and the whole pack shares one white material.

LP_BARK = (0.185, 0.110, 0.062)

# Canopy ramps, bottom -> top. A third stop is a tip accent.
#
# These sit around half the value of the Idyllic gradients they replace, and
# that is deliberate. Idyllic foliage was a greyscale cut-out atlas: the mask
# averaged about half brightness and the alpha gaps let the background through,
# so the gradient never reached the eye at full strength. This pack is solid
# geometry with no map at all, so the ramp is the albedo. Carrying the old
# values across turned the whole garden acid lime under the graded key light.
# The top stops also carry a blue floor: the pack's own palette is nearly
# blue-free, and without it every green lands on yellow.
C_LP_GREEN = ((0.022, 0.078, 0.034), (0.120, 0.360, 0.112))
C_LP_GREEN_WARM = ((0.030, 0.088, 0.030), (0.210, 0.390, 0.082))
C_LP_GREEN_DEEP = ((0.016, 0.060, 0.034), (0.078, 0.245, 0.098))
C_LP_BLOSSOM = ((0.024, 0.082, 0.032), (0.145, 0.345, 0.105), (0.520, 0.200, 0.320))
C_LP_AUTUMN = ((0.040, 0.070, 0.024), (0.460, 0.200, 0.042))
C_LP_PINE = ((0.012, 0.050, 0.038), (0.062, 0.195, 0.090))
C_LP_PINE_HAZE = ((0.038, 0.088, 0.098), (0.105, 0.215, 0.190))
C_LP_BUSH = ((0.028, 0.095, 0.036), (0.115, 0.320, 0.100))
C_LP_BUSH_BLOOM = ((0.028, 0.095, 0.036), (0.110, 0.300, 0.096), (0.580, 0.500, 0.112))

LP_ROLES = {
    "lp_green": dict(grad=C_LP_GREEN),
    "lp_green_warm": dict(grad=C_LP_GREEN_WARM),
    "lp_green_deep": dict(grad=C_LP_GREEN_DEEP),
    "lp_blossom": dict(grad=C_LP_BLOSSOM, top_at=0.94),
    "lp_autumn": dict(grad=C_LP_AUTUMN),
    "lp_pine": dict(grad=C_LP_PINE),
    "lp_pine_haze": dict(grad=C_LP_PINE_HAZE),
    "lp_bush": dict(grad=C_LP_BUSH),
    "lp_bush_bloom": dict(grad=C_LP_BUSH_BLOOM, top_at=0.9),
}

# (glb name, fbx stem, role). The pack has four broadleaf silhouettes, so the
# variety comes from retinting them rather than from more shapes.
LOWPOLY_ASSETS = [
    ("lp_tree_01", "tree_1", "lp_green"),
    ("lp_tree_02", "tree_2", "lp_green"),
    ("lp_tree_03", "dragon_tree", "lp_green"),
    ("lp_tree_04", "oak_tree", "lp_green"),
    ("lp_tree_warm_01", "tree_1", "lp_green_warm"),
    ("lp_tree_warm_02", "tree_2", "lp_green_warm"),
    ("lp_tree_warm_03", "oak_tree", "lp_green_warm"),
    ("lp_tree_deep_01", "tree_1", "lp_green_deep"),
    ("lp_tree_deep_02", "dragon_tree", "lp_green_deep"),
    ("lp_tree_deep_03", "tree_2", "lp_green_deep"),
    ("lp_tree_blossom_01", "sakura_tree", "lp_blossom"),
    ("lp_tree_blossom_02", "tree_1", "lp_blossom"),
    ("lp_tree_autumn_01", "oak_tree", "lp_autumn"),
    ("lp_tree_autumn_02", "tree_2", "lp_autumn"),
    ("lp_pine_01", "pine_tree_1", "lp_pine"),
    ("lp_pine_02", "tree_2", "lp_pine"),
    ("lp_pine_haze_01", "pine_tree_1", "lp_pine_haze"),
    ("lp_pine_haze_02", "dragon_tree", "lp_pine_haze"),
    ("lp_bush_01", "bush_01", "lp_bush"),
    ("lp_bush_02", "bush_02", "lp_bush"),
    ("lp_bush_bloom_01", "bush_01", "lp_bush_bloom"),
    ("lp_bush_bloom_02", "bush_02", "lp_bush_bloom"),
]

_palette_cache: dict | None = None


def palette():
    """The pack's palette as (width, height, flat RGBA floats), loaded once."""
    global _palette_cache
    if _palette_cache is None:
        image = bpy.data.images.load(LP_TEXTURE, check_existing=True)
        _palette_cache = {
            "w": image.size[0],
            "h": image.size[1],
            "px": list(image.pixels),
        }
    return _palette_cache


def palette_sample(u: float, v: float):
    data = palette()
    x = min(max(int(u * data["w"]), 0), data["w"] - 1)
    y = min(max(int(v * data["h"]), 0), data["h"] - 1)
    i = (y * data["w"] + x) * 4
    return data["px"][i], data["px"][i + 1], data["px"][i + 2]


def is_bark(rgb) -> bool:
    """Brown palette cells are trunks and branches; everything else is canopy.

    Checked against every mesh in the pack: trunks sit at (0.48,0.32,0.20),
    (0.42,0.31,0.22) and (0.22,0.17,0.12), while canopies are green (g > r), the
    autumn orange (blue channel exactly 0) or the sakura pink (b > r). Ratios
    rather than absolute values, so the dark oak trunk classifies with the rest.
    """
    r, g, b = rgb
    if r <= 1e-4 or b <= 0.02 or r > 0.75:
        return False
    return 0.5 <= g / r <= 0.85 and 0.2 <= b / r <= 0.7


def bake_lowpoly_colors(obj, spec):
    """Write trunk colour and the canopy's vertical ramp into COLOR_0.

    The ramp is normalised over the canopy's own z span rather than the whole
    mesh, so a tall bare trunk does not push the entire crown into the top stop.
    Each palette shade also carries a small brightness offset, which preserves
    the per-blob separation that makes these chunky canopies readable.
    """
    grad = spec["grad"]
    top_at = spec.get("top_at", 1.0)
    mesh = obj.data
    uv = mesh.uv_layers.active.data

    faces = []
    canopy_lo, canopy_hi = 1e9, -1e9
    shade_lo, shade_hi = 1e9, -1e9

    for poly in mesh.polygons:
        us = [uv[i].uv[0] for i in poly.loop_indices]
        vs = [uv[i].uv[1] for i in poly.loop_indices]
        rgb = palette_sample(sum(us) / len(us), sum(vs) / len(vs))
        bark = is_bark(rgb)
        faces.append((poly, bark, rgb))
        if not bark:
            for i in poly.loop_indices:
                z = mesh.vertices[mesh.loops[i].vertex_index].co.z
                canopy_lo = min(canopy_lo, z)
                canopy_hi = max(canopy_hi, z)
            shade = max(rgb)
            shade_lo = min(shade_lo, shade)
            shade_hi = max(shade_hi, shade)

    span = max(canopy_hi - canopy_lo, 1e-4)
    shade_span = max(shade_hi - shade_lo, 1e-4)

    layer = mesh.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="CORNER")
    for poly, bark, rgb in faces:
        if bark:
            for i in poly.loop_indices:
                layer.data[i].color = (*LP_BARK, 1.0)
            continue

        # +-6 percent around the mean shade: enough to keep the blobs apart,
        # small enough that the ramp still reads as one canopy.
        blob = 0.94 + 0.12 * ((max(rgb) - shade_lo) / shade_span)
        for i in poly.loop_indices:
            z = mesh.vertices[mesh.loops[i].vertex_index].co.z
            colour = ramp(grad, top_at, (z - canopy_lo) / span)
            layer.data[i].color = (*(min(c * blob, 1.0) for c in colour), 1.0)


def build_lowpoly(name: str, stem: str, role: str):
    spec = LP_ROLES[role]
    path = os.path.join(LP_MESHES, f"{stem}.fbx")
    if not os.path.exists(path):
        print("MISSING", path)
        return None

    if already_built(name):
        register_lowpoly_material()
        print(f"SKIP {name} role={role}")
        return name

    reset()
    bpy.ops.import_scene.fbx(filepath=path)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    if not meshes:
        print("NO MESH", name)
        return None

    obj = join(meshes)
    # recenter applies the FBX's centimetre scale, so the bake reads metres.
    recenter(obj)

    obj.data.materials.clear()
    obj.data.materials.append(placeholder("idy_lowpoly"))
    bake_lowpoly_colors(obj, spec)

    register_lowpoly_material()
    size = export_glb(name, texcoords=False)
    print(f"GLB {name} ({size} bytes) role={role}")
    return name


def register_lowpoly_material():
    """One material for the whole pack: all colour lives in COLOR_0."""
    if "idy_lowpoly" in materials_manifest:
        return
    materials_manifest["idy_lowpoly"] = {
        "map": "",
        "normalMap": "",
        "color": [1.0, 1.0, 1.0],
        # Matte: these canopies are solid geometry, and any gloss on a flat
        # facet immediately reads as plastic.
        "roughness": 0.95,
        "alphaTest": 0,
        "doubleSide": False,
    }


def register_bark_material():
    if "idy_bark" in materials_manifest:
        return
    materials_manifest["idy_bark"] = {
        "map": copy_texture("Trees/Bark_Albedo.png"),
        # Trunks are a few pixels wide at planting scale; the normal map only
        # bought file size.
        "normalMap": "",
        "color": list(C_BARK),
        "roughness": 0.8,
        "alphaTest": 0,
        "doubleSide": False,
    }


def main():
    os.makedirs(OUT_MODELS, exist_ok=True)
    os.makedirs(OUT_TEX, exist_ok=True)

    exported: list[str] = []
    for name, fbx_rel, role in FOLIAGE_ASSETS:
        if build_foliage(name, fbx_rel, role):
            exported.append(name)
    for name, fbx_rel, albedo, normal in ROCK_ASSETS:
        if build_rock(name, fbx_rel, albedo, normal):
            exported.append(name)
    for name, stem, role in LOWPOLY_ASSETS:
        if build_lowpoly(name, stem, role):
            exported.append(name)
    for args in PROP_ASSETS:
        if build_prop(*args):
            exported.append(args[0])

    ground = {key: copy_texture(rel) for key, rel in GROUND_TEXTURES.items()}

    with open(MANIFEST, "w", encoding="utf-8") as handle:
        json.dump(
            {
                "models": sorted(exported),
                "materials": materials_manifest,
                "ground": ground,
            },
            handle,
            indent=2,
            sort_keys=True,
        )
    print(f"MANIFEST {MANIFEST}: {len(exported)} models, {len(materials_manifest)} materials")


if __name__ == "__main__":
    main()
