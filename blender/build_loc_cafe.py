# Aguamesa - loc_cafe builder v2 (Blender 5.2, headless)
# Run:  blender.exe --background --python build_loc_cafe.py
#
# The Midnight Cafe interior: worn mahogany counter with brass rail and coaster rings,
# tiered wood + wrought-iron back-bar with glowing apothecary bottles and under-shelf LED
# strips, brass espresso machine, mugs, dried herbs, arched rainy window on an indigo
# night, Edison bulbs, counter candles, barista forearms, and a chalkboard that Three.js
# paints at runtime (specials + streak).
#
# Scale: 1 unit = 1 meter, Z up in Blender (Y up after glTF export).
# Origin (0,0,0) = where the glass sits on the counter (same as glass_<model>.glb).
#
# Draw calls: every mesh uses one of a few shared palette materials, and at the end all
# static meshes are JOINED PER MATERIAL (one draw call per material). Only the objects the
# client animates or repaints stay separate: CHALKBOARD, CANDLE_FLAME_n.
#
# Markers (empties) read by location.ts:
#   GLASS_ANCHOR, CAMERA_POS, CAMERA_TARGET      - contract (location.ts)
#   UI_DIALOGUE_ANCHOR                           - above the customer's head (speech bubble)
#   UI_STREAK_ANCHOR                             - on the chalkboard (streak overlay)
import bpy
import bmesh
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


# name: (hex, roughness, metallic, emission)
PALETTE = {
    "mahogany": ("#5A2418", 0.55, 0.0, 0.0),
    "mahogany_dark": ("#3A160F", 0.7, 0.0, 0.0),
    "wood": ("#8A5634", 0.75, 0.0, 0.0),
    "floor": ("#3B2419", 0.85, 0.0, 0.0),
    "wall": ("#2E2238", 0.95, 0.0, 0.0),          # deep plum: dark behind the glass
    "brick": ("#4A2C2A", 0.95, 0.0, 0.0),
    "brass": ("#C8963E", 0.32, 1.0, 0.0),
    "iron": ("#25211F", 0.6, 0.8, 0.0),
    "ceramic": ("#EFE2C2", 0.4, 0.0, 0.0),
    "ceramic_blue": ("#5E7FA8", 0.4, 0.0, 0.0),
    "coaster": ("#2A1A12", 0.9, 0.0, 0.0),
    "herb": ("#6F7F3E", 0.9, 0.0, 0.0),
    "herb_dry": ("#A08A4A", 0.9, 0.0, 0.0),
    "skin": ("#C98B66", 0.6, 0.0, 0.0),
    "sleeve": ("#E9E4DA", 0.85, 0.0, 0.0),
    "apron": ("#3F2A20", 0.85, 0.0, 0.0),
    "chalk_frame": ("#4A2E1E", 0.7, 0.0, 0.0),
    "chalkboard": ("#1E2A26", 0.95, 0.0, 0.0),
    "night": ("#141A3D", 0.2, 0.0, 0.35),          # indigo sky behind the window
    "rain": ("#9FB3E8", 0.1, 0.0, 0.6),
    "moon": ("#F3ECD0", 0.5, 0.0, 1.5),
    "star": ("#FFF6D8", 0.5, 0.0, 2.5),
    "edison": ("#FFB45A", 0.3, 0.0, 6.0),
    "led": ("#FFC274", 0.3, 0.0, 4.0),
    "flame": ("#FFD27A", 0.3, 0.0, 8.0),
    "wax": ("#F4E6C8", 0.6, 0.0, 0.0),
    "bottle_teal": ("#3FB2A0", 0.15, 0.0, 1.2),
    "bottle_amber": ("#E08A2E", 0.15, 0.0, 1.2),
    "bottle_violet": ("#9A63E0", 0.15, 0.0, 1.2),
    "bottle_rose": ("#E0607A", 0.15, 0.0, 1.0),
    "cork": ("#9C7A52", 0.9, 0.0, 0.0),
    "cat": ("#E8934A", 0.9, 0.0, 0.0),
    "cat_dark": ("#C97633", 0.9, 0.0, 0.0),
}
MATS = {}


def mat(name):
    if name in MATS:
        return MATS[name]
    hexv, rough, metal, emis = PALETTE[name]
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    col = hexlin(hexv)
    if bsdf:
        bsdf.inputs["Base Color"].default_value = col
        bsdf.inputs["Roughness"].default_value = rough
        bsdf.inputs["Metallic"].default_value = metal
        if emis > 0 and "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = col
            bsdf.inputs["Emission Strength"].default_value = emis
    MATS[name] = m
    return m


def finish(obj, name, material, bevel=0.0):
    obj.name = name
    if bevel > 0:
        mod = obj.modifiers.new("Bevel", 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.data.materials.clear()
    obj.data.materials.append(mat(material))
    return obj


def box(name, size, loc, material, rot=(0, 0, 0), bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish(o, name, material, bevel)


def cyl(name, r, depth, loc, material, rot=(0, 0, 0), verts=14, bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.active_object
    return finish(o, name, material, bevel)


def cone(name, r1, r2, depth, loc, material, rot=(0, 0, 0), verts=12):
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot, vertices=verts)
    return finish(bpy.context.active_object, name, material)


def sphere(name, r, loc, material, scale=(1, 1, 1), seg=12, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=seg, ring_count=rings)
    o = bpy.context.active_object
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, name, material)


def torus(name, r_major, r_minor, loc, material, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=r_major, minor_radius=r_minor, location=loc, rotation=rot,
                                     major_segments=20, minor_segments=6)
    return finish(bpy.context.active_object, name, material)


def plane(name, w, h, loc, material, rot=(math.pi / 2, 0, 0)):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = (w, h, 1)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish(o, name, material)


def empty(name, loc):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'PLAIN_AXES'
    e.empty_display_size = 0.05
    e.location = loc
    bpy.context.collection.objects.link(e)
    return e


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # ---------------- room shell ----------------
    box("Floor", (2.6, 2.0, 0.04), (0, -0.1, -0.92), "floor")
    box("BackBarFloor", (2.4, 0.9, 0.04), (0, -0.5, -0.36), "floor")
    box("BackWall", (2.6, 0.08, 2.2), (0, -0.96, 0.6), "wall")
    box("Wainscot", (2.6, 0.05, 0.55), (0, -0.92, -0.08), "mahogany_dark", bevel=0.005)
    box("WainscotCap", (2.6, 0.07, 0.03), (0, -0.91, 0.2), "mahogany", bevel=0.006)
    for i in range(9):  # vertical wainscot panels
        box(f"Panel{i}", (0.02, 0.02, 0.5), (-1.2 + i * 0.3, -0.89, -0.08), "mahogany")
    box("SideWallL", (0.08, 1.4, 2.2), (-1.3, -0.3, 0.6), "brick")
    box("SideWallR", (0.08, 1.4, 2.2), (1.3, -0.3, 0.6), "brick")

    # ---------------- the counter (foreground, lower third) ----------------
    box("CounterTop", (1.5, 0.46, 0.06), (0, 0.12, -0.03), "mahogany", bevel=0.012)
    box("CounterLip", (1.52, 0.04, 0.05), (0, 0.35, -0.045), "mahogany_dark", bevel=0.01)
    box("CounterFront", (1.46, 0.05, 0.86), (0, 0.33, -0.48), "mahogany_dark", bevel=0.008)
    for i in range(8):  # slats on the counter front
        box(f"Slat{i}", (0.025, 0.02, 0.78), (-0.63 + i * 0.18, 0.36, -0.48), "mahogany", bevel=0.004)
    cyl("BrassRail", 0.013, 1.44, (0, 0.42, -0.72), "brass", rot=(0, math.pi / 2, 0))
    for k, x in enumerate((-0.6, -0.2, 0.2, 0.6)):
        cyl(f"RailPost{k}", 0.009, 0.1, (x, 0.38, -0.69), "brass", rot=(math.pi / 2, 0, 0))
    # damp coaster rings (worn wood storytelling)
    for k, (x, y) in enumerate(((0.22, 0.05), (0.27, 0.16), (-0.17, 0.2), (0.4, -0.02))):
        torus(f"Ring{k}", 0.035, 0.0025, (x, y, 0.0005), "coaster")
    cyl("Coaster", 0.05, 0.004, (0, 0, 0.002), "coaster", verts=20)

    # ---------------- back-bar: tiered shelves, wood + wrought iron ----------------
    for i, z in enumerate((0.55, 0.85, 1.15)):
        box(f"Shelf{i}", (1.7, 0.22, 0.03), (0, -0.8, z), "wood", bevel=0.006)
        for x in (-0.75, 0.0, 0.75):  # iron brackets
            box(f"Bracket{i}_{x}", (0.015, 0.18, 0.015), (x, -0.82, z - 0.04), "iron")
            box(f"BracketV{i}_{x}", (0.015, 0.015, 0.1), (x, -0.9, z - 0.07), "iron")
        box(f"LED{i}", (1.6, 0.012, 0.008), (0, -0.72, z - 0.02), "led")  # under-shelf warm strip
        colors = ["bottle_teal", "bottle_amber", "bottle_violet", "bottle_rose"]
        for j in range(7):
            x = -0.72 + j * 0.24
            if i == 1 and 2 <= j <= 4:
                continue  # leave room for the espresso machine silhouette
            h = 0.11 + 0.04 * ((i * 3 + j) % 3)
            c = colors[(i + j) % len(colors)]
            cyl(f"Bottle{i}_{j}", 0.03, h, (x, -0.8, z + 0.015 + h / 2), c, verts=10)
            sphere(f"BottleShoulder{i}_{j}", 0.03, (x, -0.8, z + 0.015 + h), c, scale=(1, 1, 0.6), seg=10, rings=6)
            cyl(f"Cork{i}_{j}", 0.012, 0.04, (x, -0.8, z + 0.03 + h + 0.02), "cork", verts=8)
    # dried herbs hanging from an iron rod
    cyl("HerbRod", 0.006, 1.0, (0, -0.55, 1.5), "iron", rot=(0, math.pi / 2, 0))
    for k in range(6):
        x = -0.45 + k * 0.18
        cyl(f"HerbString{k}", 0.002, 0.08, (x, -0.55, 1.46), "cork", verts=6)
        cone(f"Herb{k}", 0.035, 0.008, 0.12, (x, -0.55, 1.36), "herb" if k % 2 else "herb_dry", rot=(math.pi, 0, 0), verts=7)

    # ---------------- arched rainy window on an indigo night ----------------
    wx, wz = 0.68, 0.95
    box("WinFrameL", (0.04, 0.06, 0.62), (wx - 0.26, -0.9, wz - 0.05), "mahogany", bevel=0.005)
    box("WinFrameR", (0.04, 0.06, 0.62), (wx + 0.26, -0.9, wz - 0.05), "mahogany", bevel=0.005)
    box("WinSill", (0.62, 0.1, 0.03), (wx, -0.86, wz - 0.37), "mahogany", bevel=0.005)
    torus("WinArch", 0.26, 0.02, (wx, -0.9, wz + 0.26), "mahogany", rot=(math.pi / 2, 0, 0))
    box("WinMullion", (0.015, 0.02, 0.85), (wx, -0.89, wz + 0.05), "mahogany")
    box("WinPane", (0.5, 0.01, 0.6), (wx, -0.915, wz - 0.05), "night")
    bpy.ops.mesh.primitive_circle_add(vertices=20, radius=0.25, fill_type='NGON', location=(wx, -0.915, wz + 0.26),
                                      rotation=(math.pi / 2, 0, 0))
    finish(bpy.context.active_object, "WinPaneArch", "night")
    sphere("Moon", 0.06, (wx + 0.1, -0.91, wz + 0.25), "moon")
    for k, (dx, dz) in enumerate(((-0.15, 0.3), (0.05, 0.12), (-0.08, -0.05), (0.17, -0.2), (-0.18, 0.05))):
        sphere(f"Star{k}", 0.008, (wx + dx, -0.905, wz + dz), "star", seg=6, rings=4)
    for k in range(9):  # rain streaks on the glass
        dx = -0.21 + k * 0.052
        h = 0.06 + 0.05 * (k % 3)
        box(f"Rain{k}", (0.003, 0.004, h), (wx + dx, -0.905, wz - 0.2 + (k * 0.137) % 0.45), "rain")

    # ---------------- chalkboard (repainted by Three.js) ----------------
    cx, cz = -0.62, 1.0
    box("ChalkFrame", (0.6, 0.04, 0.5), (cx, -0.91, cz), "chalk_frame", bevel=0.008)
    plane("CHALKBOARD", 0.54, 0.44, (cx, -0.885, cz), "chalkboard")

    # ---------------- brass espresso machine + ceramics ----------------
    ex = -0.5
    box("EspressoBody", (0.26, 0.17, 0.22), (ex, 0.02, 0.11), "brass", bevel=0.015)
    box("EspressoTop", (0.28, 0.19, 0.025), (ex, 0.02, 0.235), "mahogany", bevel=0.006)
    cyl("EspressoBoiler", 0.065, 0.22, (ex, 0.02, 0.31), "brass", rot=(0, math.pi / 2, 0), verts=18)
    sphere("EspressoDome", 0.04, (ex, 0.02, 0.38), "brass")
    sphere("EspressoEagle", 0.018, (ex, 0.02, 0.43), "brass", scale=(1.6, 0.6, 1))
    for k, x in enumerate((ex - 0.06, ex + 0.06)):
        cyl(f"Group{k}", 0.022, 0.04, (x, 0.12, 0.08), "iron")
        cyl(f"Handle{k}", 0.008, 0.08, (x, 0.18, 0.07), "mahogany_dark", rot=(math.pi / 2, 0, 0), verts=8)
        cyl(f"Cup{k}", 0.022, 0.03, (x, 0.13, 0.015), "ceramic")
    sphere("Gauge", 0.024, (ex, 0.11, 0.17), "ceramic", scale=(1, 0.3, 1))
    for k in range(3):
        cyl(f"Mug{k}", 0.034, 0.075, (0.5 + 0.075 * k, -0.02, 0.0375), "ceramic" if k != 1 else "ceramic_blue")
        torus(f"MugHandle{k}", 0.018, 0.005, (0.5 + 0.075 * k + 0.035, -0.02, 0.04), "ceramic" if k != 1 else "ceramic_blue",
              rot=(math.pi / 2, 0, 0))

    # ---------------- Edison bulbs + candles ----------------
    for k, x in enumerate((-0.6, -0.2, 0.2, 0.6)):
        drop = 0.3 + 0.08 * (k % 2)
        cyl(f"BulbCord{k}", 0.004, drop, (x, -0.3, 1.7 - drop / 2), "iron", verts=6)
        cyl(f"BulbCap{k}", 0.014, 0.03, (x, -0.3, 1.7 - drop), "brass", verts=10)
        sphere(f"Edison{k}", 0.032, (x, -0.3, 1.7 - drop - 0.045), "edison", scale=(1, 1, 1.35))
    for k, (x, y) in enumerate(((-0.28, 0.24), (0.36, 0.2))):
        cyl(f"Candle{k}", 0.018, 0.07, (x, y, 0.035), "wax", verts=10)
        cyl(f"CandleDish{k}", 0.032, 0.008, (x, y, 0.004), "brass", verts=14)
        sphere(f"CANDLE_FLAME_{k}", 0.01, (x, y, 0.085), "flame", scale=(1, 1, 1.8), seg=8, rings=6)

    # ---------------- barista forearms (over-the-counter presence) ----------------
    for side, x, ang in (("L", -0.3, 0.35), ("R", 0.3, -0.35)):
        rx = (math.pi / 2) - 0.12
        cyl(f"Forearm{side}", 0.028, 0.24, (x, 0.3, 0.03), "skin", rot=(rx, 0, ang), verts=10)
        cyl(f"Sleeve{side}", 0.036, 0.08, (x - math.sin(ang) * -0.12, 0.42, 0.045), "sleeve", rot=(rx, 0, ang), verts=10)
        torus(f"Wristband{side}", 0.029, 0.006, (x + math.sin(ang) * 0.08, 0.22, 0.025), "brass" if side == "R" else "apron",
              rot=(rx, 0, ang))
        sphere(f"Hand{side}", 0.034, (x + math.sin(ang) * 0.13, 0.17, 0.02), "skin", scale=(1, 1.3, 0.55))

    # ---------------- sleeping cat on the top shelf ----------------
    sphere("CatBody", 0.09, (0.86, -0.8, 1.23), "cat", scale=(1.3, 1.0, 0.75))
    sphere("CatHead", 0.05, (0.95, -0.82, 1.26), "cat")
    cone("CatEarL", 0.018, 0, 0.03, (0.935, -0.84, 1.305), "cat_dark")
    cone("CatEarR", 0.018, 0, 0.03, (0.965, -0.84, 1.305), "cat_dark")

    # ---------------- markers ----------------
    empty("GLASS_ANCHOR", (0, 0, 0))
    empty("CAMERA_POS", (0, 1.7, 1.0))
    empty("CAMERA_TARGET", (0, -0.5, 0.5))
    empty("UI_DIALOGUE_ANCHOR", (0.3, -0.65, 0.55))   # above a customer's head (three: x 0.3, z 0.65)
    empty("UI_STREAK_ANCHOR", (cx, -0.86, cz + 0.12))

    # ---------------- join static meshes per material ----------------
    keep = lambda n: n == "CHALKBOARD" or n.startswith("CANDLE_FLAME_")
    groups = {}
    for o in list(bpy.context.scene.objects):
        if o.type != 'MESH' or keep(o.name):
            continue
        groups.setdefault(o.data.materials[0].name, []).append(o)
    for mname, objs in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        if len(objs) > 1:
            bpy.ops.object.join()
        bpy.context.view_layer.objects.active.name = f"M_{mname}"
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    log(f"{len(meshes)} meshes after join (= draw calls): {sorted(o.name for o in meshes)}")

    for req in ("GLASS_ANCHOR", "CAMERA_POS", "CAMERA_TARGET", "UI_DIALOGUE_ANCHOR", "UI_STREAK_ANCHOR", "CHALKBOARD"):
        assert bpy.data.objects.get(req), f"missing {req}"

    bpy.ops.export_scene.gltf(filepath=RAW_GLB, export_format='GLB')
    log(f"exported {RAW_GLB} ({os.path.getsize(RAW_GLB)} bytes, uncompressed)")


build()
