# Aguamesa - loc_cafe builder (Blender 5.2, headless)
# Run:  blender.exe --background --python build_loc_cafe.py
#
# Builds the Midnight Cafe counter decor (brief 02-monde-3d-et-ui.md, Tache 2).
# Scale: 1 unit = 1 meter. Origin (0,0,0) is where the glass sits on the counter,
# same convention as glass_pint.glb, so the two assets line up without offsets.
#
# Marker empties for location.ts (same idea as LIQUID_BOTTOM/TOP on glasses):
#   GLASS_ANCHOR    - where to parent/position the active glass
#   CAMERA_POS      - camera position for this location
#   CAMERA_TARGET   - point the camera looks at
import bpy
import math
import os

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_GLB = os.path.join(OUT_DIR, "loc_cafe_raw.glb")


def log(msg):
    print(f"[loc_cafe] {msg}", flush=True)


def hexlin(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c) + (1.0,)


PALETTE = {
    "wood": "#9C6B44", "wood_dark": "#5E3D2A", "wood_light": "#C49561",
    "wall": "#4A2F26", "brick": "#6B4336",
    "shelf": "#7A5236", "bottle1": "#5E8E8A", "bottle2": "#C0603F", "bottle3": "#8C58C8",
    "glow": "#FFD27A", "glow_core": "#FFF2C8",
    "night": "#171130", "moon": "#F3ECd0", "star": "#FFF6D8",
    "cat": "#E8934A", "cat_dark": "#C97633",
    "metal": "#8A8580",
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
        bsdf.inputs["Roughness"].default_value = 0.75
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


def add_cylinder(name, radius, depth, loc, color, rot=(0, 0, 0), emission=0.0, verts=16):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, location=loc, rotation=rot, vertices=verts)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(make_material(f"{name}Mat", color, emission))
    return obj


def add_cone(name, radius, depth, loc, color, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(radius1=radius, radius2=0.0, depth=depth, location=loc, rotation=rot)
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
    made = []

    # ---- floor, so the camera never stares into the void below the counter ----
    made.append(add_box("Floor", (2.4, 1.6, 0.04), (0, -0.2, -0.92), P["wood_dark"]))

    # ---- counter (comptoir) : surface top at z=0, the glass sits here ----
    made.append(add_box("CounterTop", (1.3, 0.42, 0.06), (0, 0.13, -0.03), P["wood_light"]))
    made.append(add_box("CounterFront", (1.3, 0.05, 0.86), (0, 0.34, -0.46), P["wood_dark"]))

    # ---- back wall ----
    made.append(add_box("BackWall", (2.1, 0.08, 1.7), (0, -0.92, 0.82), P["wall"]))

    # ---- shelves with bottles ----
    for i, z in enumerate((0.95, 1.32)):
        shelf = add_box(f"Shelf{i}", (1.5, 0.22, 0.03), (0, -0.78, z), P["shelf"])
        made.append(shelf)
        bottle_colors = [P["bottle1"], P["bottle2"], P["bottle3"]]
        for j in range(6):
            x = -0.62 + j * 0.25
            h = 0.14 + 0.05 * ((i + j) % 3)
            made.append(add_cylinder(f"Bottle{i}_{j}", 0.028, h, (x, -0.78, z + 0.015 + h / 2),
                                      bottle_colors[j % len(bottle_colors)]))

    # ---- window with a sliver of night sky ----
    made.append(add_box("WindowFrame", (0.58, 0.05, 0.72), (0.55, -0.9, 0.95), P["wood_dark"]))
    made.append(add_box("WindowPane", (0.48, 0.02, 0.62), (0.55, -0.88, 0.95), P["night"]))
    made.append(add_sphere("Moon", 0.07, (0.62, -0.86, 1.1), P["moon"], emission=1.2))
    for k, (dx, dz) in enumerate(((-0.1, 0.18), (0.08, 0.06), (-0.14, -0.1))):
        made.append(add_sphere(f"Star{k}", 0.012, (0.55 + dx, -0.86, 0.95 + dz), P["star"], emission=2.0))

    # ---- pendant lamp over the counter ----
    made.append(add_cylinder("LampCord", 0.008, 0.5, (-0.25, -0.1, 1.4), P["metal"]))
    made.append(add_cone("LampShade", 0.14, 0.14, (-0.25, -0.1, 1.12), P["wood_dark"]))
    made.append(add_sphere("LampBulb", 0.05, (-0.25, -0.1, 1.04), P["glow_core"], emission=4.0))

    # ---- the sleeping cat (ambiance, brief 01 §Lieu1 "un chat qui dort") ----
    made.append(add_sphere("CatBody", 0.09, (0.86, -0.78, 1.37), P["cat"], scale=(1.3, 1.0, 0.75)))
    made.append(add_sphere("CatHead", 0.05, (0.93, -0.82, 1.4), P["cat"]))
    made.append(add_cone("CatEarL", 0.018, 0.03, (0.915, -0.84, 1.445), P["cat_dark"]))
    made.append(add_cone("CatEarR", 0.018, 0.03, (0.945, -0.84, 1.445), P["cat_dark"]))

    # ---- markers for location.ts ----
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
