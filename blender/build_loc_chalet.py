# Aguamesa - loc_chalet builder (Blender 5.2, headless)
# Run:  blender.exe --background --python build_loc_chalet.py
# Same convention as build_loc_cafe.py : GLASS_ANCHOR / CAMERA_POS / CAMERA_TARGET.
# Brief 02 Tache 4 : la fenetre montre les sommets enneiges et la cascade, jamais la mer.
import bpy
import math
import os

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_GLB = os.path.join(OUT_DIR, "loc_chalet_raw.glb")


def log(msg):
    print(f"[loc_chalet] {msg}", flush=True)


def hexlin(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c) + (1.0,)


PALETTE = {
    "wood": "#8C6648", "wood_dark": "#5A4030", "log": "#A8703F",
    "stone": "#8B857F", "stone_dark": "#6E6865",
    "mug1": "#C0603F", "mug2": "#8FB7A0", "mug3": "#CDB66E",
    "fire": "#FF8A3D", "fire_core": "#FFD27A",
    "sky": "#1B2433", "snow": "#F6F3EE", "snow2": "#E4E8EE", "fall": "#CFEFEF", "star": "#FFF6D8",
    "fox": "#D97B3F", "fox_dark": "#B85F2C",
}
P = {k: hexlin(v) for k, v in PALETTE.items()}


def make_material(name, color, emission=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    try:
        mat.use_nodes = True
    except Exception:
        pass
    bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = 0.8
        if emission > 0.0 and "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = color
            bsdf.inputs["Emission Strength"].default_value = emission
    return mat


def add_box(name, size, loc, color, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size[0], size[1], size[2])
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.data.materials.append(make_material(f"{name}Mat", color))
    return obj


def add_cylinder(name, radius, depth, loc, color, rot=(0, 0, 0), emission=0.0, verts=14):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, location=loc, rotation=rot, vertices=verts)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(make_material(f"{name}Mat", color, emission))
    return obj


def add_cone(name, r1, r2, depth, loc, color, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(make_material(f"{name}Mat", color))
    return obj


def add_sphere(name, radius, loc, color, emission=0.0, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=loc, segments=14, ring_count=10)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(make_material(f"{name}Mat", color, emission))
    return obj


def add_empty(name, loc):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'PLAIN_AXES'
    e.empty_display_size = 0.05
    e.location = loc
    bpy.context.collection.objects.link(e)
    return e


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)

    add_box("Floor", (2.4, 1.6, 0.04), (0, -0.2, -0.92), P["wood_dark"])

    # ---- counter ----
    add_box("CounterTop", (1.3, 0.42, 0.06), (0, 0.13, -0.03), P["wood"])
    add_box("CounterFront", (1.3, 0.05, 0.86), (0, 0.34, -0.46), P["wood_dark"])

    # ---- stone fireplace wall ----
    add_box("BackWall", (2.1, 0.08, 1.7), (0, -0.92, 0.82), P["stone"])
    add_box("Hearth", (0.46, 0.1, 0.3), (-0.78, -0.86, -0.07), P["stone_dark"])
    add_cone("FireGlowCore", 0.1, 0.02, 0.22, (-0.78, -0.82, 0.14), P["fire_core"])
    add_sphere("FireGlow", 0.14, (-0.78, -0.84, 0.1), P["fire"], emission=3.0, scale=(1, 0.6, 1.2))

    # ---- shelf with mugs (hot chocolate / cider) ----
    add_box("Shelf0", (1.5, 0.2, 0.03), (0.15, -0.78, 0.95), P["wood"])
    mug_colors = [P["mug1"], P["mug2"], P["mug3"]]
    for j in range(5):
        x = -0.35 + j * 0.22
        add_cylinder(f"Mug{j}", 0.03, 0.07, (x, -0.78, 1.0), mug_colors[j % 3])

    # ---- the window : snowy peaks and a waterfall, never the sea (brief 02 Tache 4) ----
    add_box("WindowFrame", (0.62, 0.05, 0.74), (0.5, -0.9, 1.0), P["wood_dark"])
    add_box("WindowPane", (0.52, 0.02, 0.64), (0.5, -0.88, 1.0), P["sky"])
    add_cone("Peak0", 0.22, 0.0, 0.5, (0.42, -0.84, 1.1), P["snow"])
    add_cone("Peak1", 0.16, 0.0, 0.36, (0.62, -0.84, 1.04), P["snow2"])
    add_box("Waterfall", (0.05, 0.01, 0.3), (0.55, -0.85, 0.78), P["fall"])
    for k, (dx, dz) in enumerate(((-0.18, 0.22), (0.1, 0.26))):
        add_sphere(f"Star{k}", 0.012, (0.5 + dx, -0.86, 1.0 + dz), P["star"], emission=2.0)

    # ---- a sleeping fox cub for ambiance ----
    add_sphere("FoxBody", 0.07, (0.75, -0.75, -0.015), P["fox"], scale=(1.4, 1.0, 0.7))
    add_sphere("FoxHead", 0.04, (0.84, -0.78, 0.015), P["fox"])
    add_cone("FoxEarL", 0.015, 0.0, 0.025, (0.825, -0.8, 0.045), P["fox_dark"])
    add_cone("FoxEarR", 0.015, 0.0, 0.025, (0.855, -0.8, 0.045), P["fox_dark"])

    add_empty("GLASS_ANCHOR", (0, 0, 0))
    add_empty("CAMERA_POS", (0, 1.7, 1.0))
    add_empty("CAMERA_TARGET", (0, -0.5, 0.5))

    names = sorted(o.name for o in bpy.context.collection.objects)
    log(f"{len(names)} objects: {names}")
    for required in ("GLASS_ANCHOR", "CAMERA_POS", "CAMERA_TARGET"):
        assert required in names, f"missing {required}"

    bpy.ops.export_scene.gltf(filepath=RAW_GLB, export_format='GLB')
    log(f"exported {RAW_GLB} ({os.path.getsize(RAW_GLB)} bytes, uncompressed)")


build()
