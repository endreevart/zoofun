#!/usr/bin/env python3
"""Convert the curated Unity FBX subset to GLB for the web zoo.

Run:
  blender --background --python scripts/convert-unity-assets.py
"""
from __future__ import annotations

import json
import os
import sys
import traceback

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
MANIFEST_PATH = os.path.join(HERE, "unity-asset-manifest.json")


def load_manifest():
    with open(MANIFEST_PATH, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    assets_root = os.path.normpath(os.path.join(HERE, data["assetsRoot"]))
    out_dir = os.path.normpath(os.path.join(HERE, data["outDir"]))
    texture_dir = os.path.normpath(os.path.join(HERE, data["textureOutDir"]))
    return data, assets_root, out_dir, texture_dir


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_fbx(path: str):
    bpy.ops.import_scene.fbx(
        filepath=path,
        use_anim=False,
        automatic_bone_orientation=True,
        ignore_leaf_bones=True,
    )


def mesh_objects():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def classify_slot(name: str) -> str:
    lower = (name or "").lower()
    if any(token in lower for token in ("leaf", "leave", "foliage", "canopy", "blossom", "needle", "branch")):
        return "leaf"
    if any(token in lower for token in ("grass", "reed", "cattail", "plant", "bush", "shrub", "fern")):
        return "leaf"
    if any(token in lower for token in ("petal", "flower", "bloom")):
        return "petal"
    if any(token in lower for token in ("bark", "trunk", "wood", "stem")):
        return "bark"
    if any(token in lower for token in ("rock", "stone")):
        return "rock"
    if "dirt" in lower:
        return "dirt"
    if "atlas" in lower or "main" in lower or "spring" in lower or "color" in lower:
        return "atlas"
    return "leaf" if any(token in lower for token in ("alpha", "cutout", "veg")) else "atlas"


def load_image(path: str):
    image = bpy.data.images.load(path, check_existing=True)
    image.colorspace_settings.name = "sRGB"
    return image


def apply_texture(material, image, alpha: bool):
    material.use_nodes = True
    tree = material.node_tree
    principled = next((node for node in tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
    if principled is None:
        return

    # Drop previous image nodes so a second oak variant does not keep Oak01's map.
    for node in list(tree.nodes):
        if node.type == "TEX_IMAGE":
            tree.nodes.remove(node)

    texture = tree.nodes.new("ShaderNodeTexImage")
    texture.image = image
    texture.location = (-400, 200)
    tree.links.new(texture.outputs["Color"], principled.inputs["Base Color"])

    if alpha and "Alpha" in texture.outputs and "Alpha" in principled.inputs:
        tree.links.new(texture.outputs["Alpha"], principled.inputs["Alpha"])
        try:
            material.blend_method = "CLIP"
        except TypeError:
            material.blend_method = "HASHED"
        if hasattr(material, "shadow_method"):
            try:
                material.shadow_method = "CLIP"
            except TypeError:
                pass
        if "Alpha Threshold" in dir(material) or hasattr(material, "alpha_threshold"):
            try:
                material.alpha_threshold = 0.35
            except Exception:
                pass

    if "Roughness" in principled.inputs:
        principled.inputs["Roughness"].default_value = 0.78
    if "Specular IOR Level" in principled.inputs:
        principled.inputs["Specular IOR Level"].default_value = 0.2
    elif "Specular" in principled.inputs:
        principled.inputs["Specular"].default_value = 0.2


def ensure_material(obj):
    if not obj.data.materials:
        material = bpy.data.materials.new(name="garden")
        obj.data.materials.append(material)
        return
    for index, material in enumerate(obj.data.materials):
        if material is None:
            obj.data.materials[index] = bpy.data.materials.new(name="garden")


def assign_maps(maps: dict[str, str], alpha: bool):
    images = {role: load_image(path) for role, path in maps.items() if os.path.isfile(path)}
    fallback = next(iter(images.values()), None)

    for obj in mesh_objects():
        ensure_material(obj)
        if not fallback:
            continue
        for slot in obj.material_slots:
            material = slot.material
            if material is None:
                continue
            role = classify_slot(material.name)
            image = images.get(role) or images.get("atlas") or images.get("leaf") or images.get("wood") or images.get("stone") or images.get("rock") or images.get("grass") or fallback
            apply_texture(material, image, alpha and role in {"leaf", "petal", "atlas"})


def join_and_origin():
    meshes = mesh_objects()
    if not meshes:
        return
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # Sit the mesh on y=0, centred in xz, matching NatureLibrary's later flatten.
    min_x = min(v[0] for v in (obj.bound_box))
    max_x = max(v[0] for v in (obj.bound_box))
    min_y = min(v[1] for v in (obj.bound_box))
    min_z = min(v[2] for v in (obj.bound_box))
    max_z = max(v[2] for v in (obj.bound_box))
    obj.location.x -= (min_x + max_x) / 2
    obj.location.y -= min_y
    obj.location.z -= (min_z + max_z) / 2
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

    try:
        bpy.ops.object.shade_auto_smooth(angle=0.85)
    except Exception:
        bpy.ops.object.shade_smooth()


def export_glb(path: str):
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_apply=True,
    )


def resize_texture(src: str, dest: str, max_px: int):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    image = bpy.data.images.load(src)
    width, height = image.size
    scale = max(width, height) / float(max_px)
    if scale > 1:
        image.scale(max(1, int(width / scale)), max(1, int(height / scale)))
    image.filepath_raw = dest
    image.file_format = "PNG"
    image.save()
    bpy.data.images.remove(image)


def cached_texture(src: str, cache_dir: str, max_px: int) -> str:
    dest = os.path.join(cache_dir, os.path.basename(src))
    if not os.path.isfile(dest) or os.path.getmtime(dest) < os.path.getmtime(src):
        resize_texture(src, dest, max_px)
    return dest


def convert_model(entry, assets_root: str, out_dir: str, cache_dir: str, max_px: int):
    reset_scene()
    src = os.path.join(assets_root, entry["src"])
    if not os.path.isfile(src):
        print(f"missing mesh: {src}")
        return False
    import_fbx(src)
    maps = {}
    for role, rel in (entry.get("maps") or {}).items():
        original = os.path.join(assets_root, rel)
        if os.path.isfile(original):
            maps[role] = cached_texture(original, cache_dir, max_px)
    assign_maps(maps, bool(entry.get("alpha")))
    join_and_origin()
    dest = os.path.join(out_dir, entry["name"] + ".glb")
    export_glb(dest)
    size = os.path.getsize(dest)
    print(f"ok {entry['name']} ({size} bytes)")
    return True


def main():
    data, assets_root, out_dir, texture_dir = load_manifest()
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(texture_dir, exist_ok=True)
    max_px = int(data.get("maxTexturePx", 1024))

    for ground in data.get("groundTextures", []):
        src = os.path.join(assets_root, ground["src"])
        dest = os.path.join(texture_dir, ground["name"])
        if not os.path.isfile(src):
            print(f"missing texture: {src}")
            continue
        resize_texture(src, dest, max_px)
        print(f"tex {ground['name']}")

    cache_dir = os.path.join(texture_dir, "_cache")
    os.makedirs(cache_dir, exist_ok=True)

    failed = []
    for entry in data["models"]:
        try:
            if not convert_model(entry, assets_root, out_dir, cache_dir, max_px):
                failed.append(entry["name"])
        except Exception as error:
            failed.append(entry["name"])
            print(f"fail {entry['name']}: {error}")
            traceback.print_exc()

    print(f"done, {len(failed)} failed: {failed}")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
