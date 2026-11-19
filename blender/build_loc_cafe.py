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
    # Portrait layout (the gameplay camera sees about x -0.55..0.55 on the back wall;
    # +x in Blender = screen LEFT): shelves + bottles behind the customer on the left,
    # chalkboard and the arched window on the right, both inside the 9:16 frame.
    sx, sw = 0.42, 0.95
    for i, z in enumerate((0.5, 0.8, 1.1)):
        box(f"Shelf{i}", (sw, 0.22, 0.03), (sx, -0.8, z), "wood", bevel=0.006)
        for x in (sx - 0.42, sx, sx + 0.42):  # wrought-iron brackets
            box(f"Bracket{i}_{x:.2f}", (0.015, 0.18, 0.015), (x, -0.82, z - 0.04), "iron")
            box(f"BracketV{i}_{x:.2f}", (0.015, 0.015, 0.1), (x, -0.9, z - 0.07), "iron")
        box(f"LED{i}", (sw - 0.06, 0.012, 0.008), (sx, -0.72, z - 0.02), "led")  # under-shelf warm strip
        colors = ["bottle_teal", "bottle_amber", "bottle_violet", "bottle_rose"]
        for j in range(4):
            if i == 2 and j == 3:
                continue  # the cat sleeps there
            x = sx - 0.36 + j * 0.24
            h = 0.11 + 0.04 * ((i * 3 + j) % 3)
            c = colors[(i + j) % len(colors)]
            cyl(f"Bottle{i}_{j}", 0.03, h, (x, -0.8, z + 0.015 + h / 2), c, verts=12)
            sphere(f"BottleShoulder{i}_{j}", 0.03, (x, -0.8, z + 0.015 + h), c, scale=(1, 1, 0.6), seg=12, rings=6)
            cyl(f"Neck{i}_{j}", 0.011, 0.04, (x, -0.8, z + 0.035 + h), c, verts=10)
            cyl(f"Cork{i}_{j}", 0.013, 0.025, (x, -0.8, z + 0.065 + h), "cork", verts=8)
            box(f"Label{i}_{j}", (0.035, 0.004, 0.04), (x, -0.77, z + 0.015 + h * 0.45), "ceramic")
    # dried herbs hanging from an iron rod
    cyl("HerbRod", 0.006, 0.8, (0.05, -0.55, 1.42), "iron", rot=(0, math.pi / 2, 0))
    for k in range(5):
        x = -0.27 + k * 0.16
        cyl(f"HerbString{k}", 0.002, 0.08, (x, -0.55, 1.38), "cork", verts=6)
        cone(f"Herb{k}", 0.035, 0.008, 0.12, (x, -0.55, 1.28), "herb" if k % 2 else "herb_dry", rot=(math.pi, 0, 0), verts=7)

    # ---------------- arched rainy window on an indigo night (screen right, top) ----------------
    wx, wz, ww = -0.33, 0.98, 0.17   # centre x, centre z of the straight part, half width
    box("WinFrameL", (0.03, 0.06, 0.32), (wx - ww, -0.9, wz), "mahogany", bevel=0.004)
    box("WinFrameR", (0.03, 0.06, 0.32), (wx + ww, -0.9, wz), "mahogany", bevel=0.004)
    box("WinSill", (2 * ww + 0.08, 0.1, 0.025), (wx, -0.86, wz - 0.17), "mahogany", bevel=0.004)
    torus("WinArch", ww, 0.016, (wx, -0.9, wz + 0.16), "mahogany", rot=(math.pi / 2, 0, 0))
    box("WinMullion", (0.012, 0.02, 0.48), (wx, -0.89, wz + 0.07), "mahogany")
    box("WinTransom", (2 * ww, 0.02, 0.012), (wx, -0.89, wz + 0.02), "mahogany")
    box("WinPane", (2 * ww - 0.02, 0.01, 0.32), (wx, -0.915, wz), "night")
    bpy.ops.mesh.primitive_circle_add(vertices=24, radius=ww - 0.01, fill_type='NGON', location=(wx, -0.915, wz + 0.16),
                                      rotation=(math.pi / 2, 0, 0))
    finish(bpy.context.active_object, "WinPaneArch", "night")
    sphere("Moon", 0.045, (wx + 0.07, -0.91, wz + 0.2), "moon")
    for k, (dx, dz) in enumerate(((-0.11, 0.24), (0.04, 0.08), (-0.06, -0.05), (0.12, -0.1), (-0.13, 0.05))):
        sphere(f"Star{k}", 0.006, (wx + dx, -0.905, wz + dz), "star", seg=6, rings=4)
    for k in range(8):  # rain streaks on the glass
        dx = -0.15 + k * 0.042
        h = 0.04 + 0.04 * (k % 3)
        box(f"Rain{k}", (0.0025, 0.004, h), (wx + dx, -0.905, wz - 0.12 + (k * 0.137) % 0.34), "rain")

    # ---------------- chalkboard (repainted by Three.js), under the window ----------------
    cx, cz = -0.33, 0.56
    box("ChalkFrame", (0.46, 0.04, 0.38), (cx, -0.91, cz), "chalk_frame", bevel=0.008)
    # normal toward the room (+Y); location.ts rotates the painted texture by 180°
    plane("CHALKBOARD", 0.41, 0.335, (cx, -0.885, cz), "chalkboard", rot=(-math.pi / 2, 0, 0))
    box("ChalkLedge", (0.42, 0.05, 0.015), (cx, -0.875, cz - 0.2), "chalk_frame")
    box("ChalkStick", (0.04, 0.01, 0.01), (cx + 0.12, -0.865, cz - 0.188), "ceramic")

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
    sphere("CatBody", 0.08, (0.72, -0.8, 1.17), "cat", scale=(1.3, 1.0, 0.75))
    sphere("CatHead", 0.045, (0.8, -0.78, 1.19), "cat")
    cone("CatEarL", 0.016, 0, 0.03, (0.785, -0.8, 1.235), "cat_dark")
    cone("CatEarR", 0.016, 0, 0.03, (0.815, -0.8, 1.235), "cat_dark")

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

    bake_pbr()

    bpy.ops.export_scene.gltf(filepath=RAW_GLB, export_format='GLB',
                              export_image_format='WEBP', export_image_quality=82)
    log(f"exported {RAW_GLB} ({os.path.getsize(RAW_GLB)} bytes, uncompressed geometry)")


# ---------------------------------------------------------------- PBR bake
# Procedural Blender materials (wood grain + wear, brick + mortar, plaster, brushed brass,
# glazed ceramic) are baked with Cycles into small textures: albedo multiplied by baked
# ambient occlusion (contact shadows, corners), a tangent-space normal map, and a roughness
# map. The runtime then pays only for a texture lookup, not for the procedural nodes.
#   kind, albedo/normal size (0 = no normal map), roughness map?
BAKE = {
    "mahogany": ("wood", 1024, True),       # the hero counter
    "mahogany_dark": ("wood", 512, True),
    "wood": ("wood", 512, True),
    "floor": ("planks", 512, True),
    "brick": ("brick", 256, True),
    "wall": ("plaster", 512, True),
    "brass": ("brass", 512, True),
    "ceramic": ("ceramic", 256, False),
    "ceramic_blue": ("ceramic", 128, False),
}
TEX_DIR = os.path.join(OUT_DIR, "_bake")


def _proc_nodes(m, kind):
    nt = m.node_tree
    N, L = nt.nodes, nt.links
    bsdf = next(n for n in N if n.type == 'BSDF_PRINCIPLED')
    base = tuple(bsdf.inputs["Base Color"].default_value)
    coord = N.new("ShaderNodeTexCoord")
    mapping = N.new("ShaderNodeMapping")
    L.new(coord.outputs["Object"], mapping.inputs["Vector"])
    ramp = N.new("ShaderNodeValToRGB")
    dark = tuple(c * 0.55 for c in base[:3]) + (1,)
    light = tuple(min(1, c * 1.35) for c in base[:3]) + (1,)
    ramp.color_ramp.elements[0].color = dark
    ramp.color_ramp.elements[1].color = light
    bump = N.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.25
    rough = N.new("ShaderNodeMapRange")
    noise = N.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 18.0
    noise.inputs["Detail"].default_value = 6.0
    L.new(mapping.outputs["Vector"], noise.inputs["Vector"])
    L.new(noise.outputs["Fac"], rough.inputs["Value"])
    r0 = bsdf.inputs["Roughness"].default_value
    rough.inputs["To Min"].default_value = max(0.05, r0 - 0.2)
    rough.inputs["To Max"].default_value = min(1.0, r0 + 0.15)
    L.new(rough.outputs["Result"], bsdf.inputs["Roughness"])

    if kind in ("wood", "planks"):
        wave = N.new("ShaderNodeTexWave")
        wave.wave_type = 'BANDS'
        wave.bands_direction = 'X'
        wave.inputs["Scale"].default_value = 3.0 if kind == "wood" else 2.0
        wave.inputs["Distortion"].default_value = 9.0
        wave.inputs["Detail"].default_value = 4.0
        mapping.inputs["Scale"].default_value = (1.0, 7.0, 7.0) if kind == "wood" else (1.0, 3.0, 9.0)
        L.new(mapping.outputs["Vector"], wave.inputs["Vector"])
        mix = N.new("ShaderNodeMix")
        mix.data_type = 'FLOAT'
        mix.inputs["Factor"].default_value = 0.35
        L.new(wave.outputs["Fac"], mix.inputs["A"])
        L.new(noise.outputs["Fac"], mix.inputs["B"])
        L.new(mix.outputs["Result"], ramp.inputs["Fac"])
        L.new(wave.outputs["Fac"], bump.inputs["Height"])
        if kind == "planks":
            brick = N.new("ShaderNodeTexBrick")  # plank seams
            brick.inputs["Scale"].default_value = 3.0
            brick.inputs["Mortar Size"].default_value = 0.008
            brick.inputs["Color1"].default_value = (1, 1, 1, 1)
            brick.inputs["Color2"].default_value = (0.85, 0.85, 0.85, 1)
            brick.inputs["Mortar"].default_value = (0.2, 0.2, 0.2, 1)
            brick.offset_frequency = 1
            brick.squash = 0.25
            L.new(mapping.outputs["Vector"], brick.inputs["Vector"])
            mul = N.new("ShaderNodeMix")
            mul.data_type = 'RGBA'
            mul.blend_type = 'MULTIPLY'
            mul.inputs["Factor"].default_value = 1.0
            L.new(ramp.outputs["Color"], mul.inputs["A"])
            L.new(brick.outputs["Color"], mul.inputs["B"])
            L.new(mul.outputs["Result"], bsdf.inputs["Base Color"])
        else:
            L.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    elif kind == "brick":
        brick = N.new("ShaderNodeTexBrick")
        brick.inputs["Scale"].default_value = 9.0
        brick.inputs["Color1"].default_value = light
        brick.inputs["Color2"].default_value = dark
        brick.inputs["Mortar"].default_value = (0.32, 0.28, 0.25, 1)
        brick.inputs["Mortar Size"].default_value = 0.015
        # Brick is a 2D (x, y) pattern: turn the coordinates so vertical walls get courses
        # along X/Y-world and rows along Z (height), instead of long smeared stripes.
        mapping.inputs["Rotation"].default_value = (math.pi / 2, 0, 0)
        L.new(mapping.outputs["Vector"], brick.inputs["Vector"])
        L.new(brick.outputs["Color"], bsdf.inputs["Base Color"])
        L.new(brick.outputs["Fac"], bump.inputs["Height"])
        bump.inputs["Strength"].default_value = 0.5
    elif kind == "plaster":
        L.new(noise.outputs["Fac"], ramp.inputs["Fac"])
        ramp.color_ramp.elements[0].color = tuple(c * 0.85 for c in base[:3]) + (1,)
        ramp.color_ramp.elements[1].color = tuple(min(1, c * 1.12) for c in base[:3]) + (1,)
        L.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
        L.new(noise.outputs["Fac"], bump.inputs["Height"])
        bump.inputs["Strength"].default_value = 0.12
    elif kind == "brass":
        mapping.inputs["Scale"].default_value = (90.0, 1.0, 1.0)  # brushed streaks
        L.new(noise.outputs["Fac"], ramp.inputs["Fac"])
        ramp.color_ramp.elements[0].color = tuple(c * 0.8 for c in base[:3]) + (1,)
        ramp.color_ramp.elements[1].color = tuple(min(1, c * 1.1) for c in base[:3]) + (1,)
        L.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
        L.new(noise.outputs["Fac"], bump.inputs["Height"])
        bump.inputs["Strength"].default_value = 0.05
    elif kind == "ceramic":
        noise.inputs["Scale"].default_value = 30.0
        L.new(noise.outputs["Fac"], ramp.inputs["Fac"])
        ramp.color_ramp.elements[0].color = tuple(c * 0.9 for c in base[:3]) + (1,)
        ramp.color_ramp.elements[1].color = tuple(min(1, c * 1.05) for c in base[:3]) + (1,)
        L.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
        rough.inputs["To Min"].default_value = 0.12
        rough.inputs["To Max"].default_value = 0.3
    L.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return bsdf


def _bake(obj, m, kind_type, size, name, colorspace='sRGB', pass_filter=None):
    img = bpy.data.images.new(name, size, size, alpha=False)
    img.colorspace_settings.name = colorspace
    node = m.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = img
    m.node_tree.nodes.active = node
    kw = {"type": kind_type, "margin": 4, "use_clear": True}
    if pass_filter:
        kw["pass_filter"] = pass_filter
    if kind_type == 'NORMAL':
        kw["normal_space"] = 'TANGENT'
    bpy.ops.object.bake(**kw)
    m.node_tree.nodes.remove(node)
    return img


def bake_pbr():
    os.makedirs(TEX_DIR, exist_ok=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 24
    sc.render.bake.use_selected_to_active = False
    for mname, (kind, size, has_normal) in BAKE.items():
        obj = bpy.data.objects.get(f"M_{mname}")
        if not obj:
            continue
        m = obj.data.materials[0]
        bsdf = _proc_nodes(m, kind)
        metallic = bsdf.inputs["Metallic"].default_value
        bsdf.inputs["Metallic"].default_value = 0.0  # a metal has no diffuse colour to bake
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.01)
        bpy.ops.object.mode_set(mode='OBJECT')

        albedo = _bake(obj, m, 'DIFFUSE', size, f"{mname}_albedo", pass_filter={'COLOR'})
        ao = _bake(obj, m, 'AO', size, f"{mname}_ao", colorspace='Non-Color')
        px, aopx = list(albedo.pixels), ao.pixels[:]
        for i in range(0, len(px), 4):  # albedo * AO (80% strength, contact shadows)
            a = 0.2 + 0.8 * aopx[i]
            px[i], px[i + 1], px[i + 2] = px[i] * a, px[i + 1] * a, px[i + 2] * a
        albedo.pixels = px
        normal = _bake(obj, m, 'NORMAL', size, f"{mname}_normal", colorspace='Non-Color') if has_normal else None
        rough = _bake(obj, m, 'ROUGHNESS', max(128, size // 2), f"{mname}_rough", colorspace='Non-Color')
        bpy.data.images.remove(ao)

        # rebuild a lean glTF-friendly material from the baked images
        nt = m.node_tree
        for n in list(nt.nodes):
            nt.nodes.remove(n)
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        p = nt.nodes.new("ShaderNodeBsdfPrincipled")
        p.inputs["Metallic"].default_value = metallic
        nt.links.new(p.outputs["BSDF"], out.inputs["Surface"])
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = albedo
        nt.links.new(t.outputs["Color"], p.inputs["Base Color"])
        tr = nt.nodes.new("ShaderNodeTexImage")
        tr.image = rough
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(tr.outputs["Color"], sep.inputs["Color"])
        nt.links.new(sep.outputs["Green"], p.inputs["Roughness"])
        if normal:
            tn = nt.nodes.new("ShaderNodeTexImage")
            tn.image = normal
            nm = nt.nodes.new("ShaderNodeNormalMap")
            nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
            nt.links.new(nm.outputs["Normal"], p.inputs["Normal"])
        for img in (albedo, normal, rough):
            if img:
                img.filepath_raw = os.path.join(TEX_DIR, f"{img.name}.png")
                img.file_format = 'PNG'
                img.save()
        log(f"baked {mname}: {size}px albedo*AO{' + normal' if normal else ''} + roughness")


if __name__ == "__main__":
    build()
