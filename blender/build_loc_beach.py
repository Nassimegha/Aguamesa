# Aguamesa - loc_beach builder (Blender 5.2, headless)
# Run:  blender.exe --background --python build_loc_beach.py
# Same convention as build_loc_cafe.py : GLASS_ANCHOR / CAMERA_POS / CAMERA_TARGET.
import bpy
import math
import os

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_GLB = os.path.join(OUT_DIR, "loc_beach_raw.glb")


def log(msg):
    print(f"[loc_beach] {msg}", flush=True)


def hexlin(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c) + (1.0,)


PALETTE = {
    "bamboo": "#CDB66E", "bamboo_dark": "#A68F4F", "sand": "#EBD59E", "sand_dark": "#C9A968",
    "thatch": "#B98444", "thatch_dark": "#8C6230",
    "shell1": "#F0B8A0", "shell2": "#6FBFB0", "shell3": "#E0905C",
    "glow": "#FFD27A", "glow_core": "#FFF2C8",
    "night": "#142334", "moon": "#F3ECd0", "star": "#FFF6D8", "wave": "#5FB8C9",
    "crab": "#E0603C", "crab_dark": "#B8472A",
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


def add_cone(name, r1, r2, depth, loc, color, rot=(0, 0, 0), verts=24):
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot, vertices=verts)
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

    add_box("Floor", (2.4, 1.6, 0.04), (0, -0.2, -0.92), P["sand_dark"])

    # ---- bamboo bar counter ----
    add_box("CounterTop", (1.3, 0.42, 0.06), (0, 0.13, -0.03), P["bamboo"])
    add_box("CounterFront", (1.3, 0.05, 0.86), (0, 0.34, -0.46), P["bamboo_dark"])
    for i in range(5):
        x = -0.55 + i * 0.28
        add_cylinder(f"BambooPole{i}", 0.02, 0.84, (x, 0.355, -0.46), P["bamboo"])

    # ---- back counter wall (open-air look, lower than Cafe's) ----
    add_box("BackWall", (2.1, 0.06, 1.1), (0, -0.92, 0.47), P["bamboo_dark"])

    add_box("Shelf0", (1.5, 0.2, 0.03), (0, -0.78, 0.55), P["thatch"])
    shell_colors = [P["shell1"], P["shell2"], P["shell3"]]
    for j in range(6):
        x = -0.62 + j * 0.25
        add_sphere(f"Shell{j}", 0.035 + 0.01 * (j % 2), (x, -0.78, 0.59), shell_colors[j % 3])

    # ---- window : ocean horizon + moon, framed by a round bamboo opening ----
    add_cylinder("WindowFrame", 0.3, 0.05, (0.55, -0.9, 0.55), P["thatch_dark"], rot=(math.pi / 2, 0, 0))
    add_cylinder("WindowPane", 0.26, 0.02, (0.55, -0.88, 0.55), P["night"], rot=(math.pi / 2, 0, 0))
    add_box("WindowWave", (0.5, 0.01, 0.1), (0.55, -0.87, 0.42), P["wave"])
    add_sphere("Moon", 0.08, (0.6, -0.86, 0.67), P["moon"], emission=1.2)
    for k, (dx, dz) in enumerate(((-0.12, 0.1), (0.1, 0.02))):
        add_sphere(f"Star{k}", 0.012, (0.55 + dx, -0.86, 0.55 + dz), P["star"], emission=2.0)

    # ---- thatched roof lamp (lantern instead of a pendant lamp), clear of the shelf ----
    add_cylinder("LanternCord", 0.008, 0.3, (-0.25, -0.1, 1.0), P["bamboo_dark"])
    add_cone("LanternTop", 0.1, 0.1, 0.06, (-0.25, -0.1, 0.84), P["thatch_dark"])
    add_sphere("LanternBulb", 0.055, (-0.25, -0.1, 0.77), P["glow_core"], emission=4.0)

    # ---- a small crab for ambiance, peeking up at the far side of the counter ----
    add_sphere("CrabBody", 0.045, (0.75, -0.75, 0.0), P["crab"], scale=(1.2, 1.0, 0.7))
    add_sphere("CrabEyeL", 0.01, (0.73, -0.79, 0.04), P["crab_dark"])
    add_sphere("CrabEyeR", 0.01, (0.77, -0.79, 0.04), P["crab_dark"])

    add_empty("GLASS_ANCHOR", (0, 0, 0))
    add_empty("CAMERA_POS", (0, 1.7, 1.0))
    add_empty("CAMERA_TARGET", (0, -0.5, 0.45))

    names = sorted(o.name for o in bpy.context.collection.objects)
    log(f"{len(names)} objects: {names}")
    for required in ("GLASS_ANCHOR", "CAMERA_POS", "CAMERA_TARGET"):
        assert required in names, f"missing {required}"

    bpy.ops.export_scene.gltf(filepath=RAW_GLB, export_format='GLB')
    log(f"exported {RAW_GLB} ({os.path.getsize(RAW_GLB)} bytes, uncompressed)")


build()
