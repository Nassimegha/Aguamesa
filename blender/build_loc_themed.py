# Aguamesa - loc_fair / loc_pirate / loc_castle (Blender 5.2, headless)
# Run:  blender.exe --background --python build_loc_themed.py
#
# Same contract and same pipeline as build_loc_cafe.py (whose helpers are reused):
#   - markers GLASS_ANCHOR / CAMERA_POS / CAMERA_TARGET / UI_DIALOGUE_ANCHOR / UI_STREAK_ANCHOR
#   - CHALKBOARD (repainted by Three.js) and CANDLE_FLAME_n (flicker) kept separate
#   - every other mesh joined per material (1 draw call per material)
#   - procedural PBR (wood, planks, stone, plaster, brass) baked by Cycles into small WebP
#     textures: albedo x ambient occlusion, normal map, roughness map
# Same layout as the cafe so the gameplay camera, the customers' spots and the speech
# bubble work unchanged: counter in front (top at z=0), customers on the back-bar floor,
# chalkboard on the right of the back wall (screen right), props on the left.
import bpy
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ns = {"__name__": "aguamesa_themed", "__file__": os.path.join(HERE, "build_loc_cafe.py")}
exec(open(os.path.join(HERE, "build_loc_cafe.py"), encoding="utf-8").read(), ns)
box, cyl, cone, sphere, torus, plane, empty = (ns[k] for k in ("box", "cyl", "cone", "sphere", "torus", "plane", "empty"))
finish, log = ns["finish"], ns["log"]

ns["PALETTE"].update({
    # pirate ship
    "deck": ("#5B3A22", 0.8, 0.0, 0.0),
    "hull": ("#3E2716", 0.85, 0.0, 0.0),
    "rope": ("#B79A62", 0.95, 0.0, 0.0),
    "hoop": ("#2C2A28", 0.5, 0.85, 0.0),
    "sea_night": ("#0E2A44", 0.2, 0.0, 0.45),
    "lantern": ("#FFB85C", 0.3, 0.0, 6.0),
    "gold": ("#E5B84A", 0.25, 1.0, 0.0),
    "sail": ("#E8DCC0", 0.9, 0.0, 0.0),
    # haunted castle
    "stone": ("#5D5A63", 0.9, 0.0, 0.0),
    "stone_dark": ("#3A3740", 0.9, 0.0, 0.0),
    "oak": ("#3B2A20", 0.8, 0.0, 0.0),
    "banner": ("#7A1E2A", 0.9, 0.0, 0.0),
    "ghost_moon": ("#B8F5C8", 0.5, 0.0, 1.8),
    "night_green": ("#0F2A26", 0.2, 0.0, 0.4),
    "potion_green": ("#56E08A", 0.15, 0.0, 1.6),
    "potion_purple": ("#A86BFF", 0.15, 0.0, 1.6),
    "bone": ("#E8E0C8", 0.6, 0.0, 0.0),
    "cobweb": ("#D9D9E0", 0.9, 0.0, 0.3),
    # funfair
    "booth": ("#2F7F86", 0.85, 0.0, 0.0),
    "booth_wood": ("#C9874A", 0.75, 0.0, 0.0),
    "stripe_red": ("#D6453D", 0.8, 0.0, 0.0),
    "stripe_cream": ("#F4E6C8", 0.8, 0.0, 0.0),
    "marquee": ("#FFD27A", 0.3, 0.0, 7.0),
    "plush_pink": ("#F29BB8", 0.95, 0.0, 0.0),
    "plush_blue": ("#7FB6F2", 0.95, 0.0, 0.0),
    "plush_yellow": ("#F2D36B", 0.95, 0.0, 0.0),
    "balloon_red": ("#E8423A", 0.25, 0.0, 0.3),
    "balloon_teal": ("#3FC1B0", 0.25, 0.0, 0.3),
    "popcorn": ("#FFF1C2", 0.9, 0.0, 0.0),
})


def shell(wall, wall_kind_mat, counter, counter_front, floor):
    box("Floor", (2.6, 2.0, 0.04), (0, -0.1, -0.92), floor)
    box("BackBarFloor", (2.4, 0.9, 0.04), (0, -0.5, -0.36), floor)
    box("BackWall", (2.6, 0.08, 2.2), (0, -0.96, 0.6), wall)
    box("SideWallL", (0.08, 1.4, 2.2), (-1.3, -0.3, 0.6), wall_kind_mat)
    box("SideWallR", (0.08, 1.4, 2.2), (1.3, -0.3, 0.6), wall_kind_mat)
    box("CounterTop", (1.5, 0.46, 0.06), (0, 0.12, -0.03), counter, bevel=0.012)
    box("CounterLip", (1.52, 0.04, 0.05), (0, 0.35, -0.045), counter_front, bevel=0.01)
    box("CounterFront", (1.46, 0.05, 0.86), (0, 0.33, -0.48), counter_front, bevel=0.008)
    cyl("Coaster", 0.05, 0.004, (0, 0, 0.002), "coaster", verts=20)


def chalkboard(frame="chalk_frame"):
    cx, cz = -0.33, 0.56
    box("ChalkFrame", (0.46, 0.04, 0.38), (cx, -0.91, cz), frame, bevel=0.008)
    plane("CHALKBOARD", 0.41, 0.335, (cx, -0.885, cz), "chalkboard", rot=(-math.pi / 2, 0, 0))
    return cx, cz


def candles(spots, dish="brass"):
    for k, (x, y, z) in enumerate(spots):
        cyl(f"Candle{k}", 0.016, 0.07, (x, y, z + 0.035), "wax", verts=10)
        cyl(f"CandleDish{k}", 0.03, 0.008, (x, y, z + 0.004), dish, verts=14)
        sphere(f"CANDLE_FLAME_{k}", 0.01, (x, y, z + 0.085), "flame", scale=(1, 1, 1.8), seg=8, rings=6)


def markers(cx, cz):
    empty("GLASS_ANCHOR", (0, 0, 0))
    empty("CAMERA_POS", (0, 1.7, 1.0))
    empty("CAMERA_TARGET", (0, -0.5, 0.5))
    empty("UI_DIALOGUE_ANCHOR", (0.3, -0.65, 0.55))
    empty("UI_STREAK_ANCHOR", (cx, -0.86, cz + 0.12))


def barrel(name, x, y, z, r=0.11, h=0.24):
    cyl(f"{name}", r, h, (x, y, z + h / 2), "hull", verts=16, bevel=0.004)
    for k, dz in enumerate((0.03, h / 2, h - 0.03)):
        torus(f"{name}Hoop{k}", r + 0.002, 0.006, (x, y, z + dz), "hoop")


def round_window(name, x, z, r, pane, moon, frame):
    torus(f"{name}Frame", r, 0.025, (x, -0.9, z), frame, rot=(math.pi / 2, 0, 0))
    bpy.ops.mesh.primitive_circle_add(vertices=24, radius=r - 0.01, fill_type='NGON', location=(x, -0.915, z),
                                      rotation=(math.pi / 2, 0, 0))
    finish(bpy.context.active_object, f"{name}Pane", pane)
    sphere(f"{name}Moon", r * 0.28, (x + r * 0.3, -0.91, z + r * 0.3), moon)


# ------------------------------------------------------------------ the three rooms
def pirate():
    shell("deck", "hull", "deck", "hull", "deck")
    for i in range(7):  # hull planks on the back wall
        box(f"Plank{i}", (2.6, 0.02, 0.012), (0, -0.915, -0.1 + i * 0.22), "hull")
    for k, x in enumerate((-0.9, 0.0, 0.9)):  # deck beams overhead
        box(f"Beam{k}", (0.08, 1.6, 0.1), (x, -0.2, 1.6), "hull", bevel=0.01)
    cx, cz = chalkboard("hull")
    round_window("PortholeA", -0.33, 1.05, 0.15, "sea_night", "moon", "brass")
    round_window("PortholeB", 0.75, 0.9, 0.13, "sea_night", "moon", "brass")
    # ship's wheel on the wall, behind the customer (screen left)
    wx, wz = 0.35, 0.82
    torus("WheelRim", 0.2, 0.018, (wx, -0.88, wz), "deck", rot=(math.pi / 2, 0, 0))
    cyl("WheelHub", 0.04, 0.05, (wx, -0.87, wz), "brass", rot=(math.pi / 2, 0, 0))
    for k in range(8):
        a = k / 8 * math.tau
        cyl(f"Spoke{k}", 0.009, 0.5, (wx, -0.875, wz), "deck", rot=(math.pi / 2, a, 0), verts=8)
        sphere(f"Knob{k}", 0.018, (wx + math.cos(a) * 0.25, -0.875, wz + math.sin(a) * 0.25), "deck", scale=(1, 1, 1.4))
    # barrels, rope coils, treasure chest, hanging lantern
    barrel("BarrelA", 0.62, -0.75, -0.34)
    barrel("BarrelB", 0.86, -0.7, -0.34)
    barrel("BarrelC", 0.74, -0.72, -0.1, r=0.09, h=0.2)
    for k, (x, y) in enumerate(((-0.55, 0.05), (0.55, 0.12))):
        for j in range(3):
            torus(f"Rope{k}_{j}", 0.05 - j * 0.012, 0.009, (x, y, 0.01 + j * 0.016), "rope")
    box("Chest", (0.2, 0.13, 0.1), (-0.5, -0.02, 0.05), "deck", bevel=0.01)
    cyl("ChestLid", 0.065, 0.2, (-0.5, -0.02, 0.1), "deck", rot=(0, math.pi / 2, 0), verts=12)
    for x in (-0.58, -0.42):
        box(f"ChestBand{x}", (0.02, 0.135, 0.18), (x, -0.02, 0.07), "gold")
    for k in range(5):
        sphere(f"Coin{k}", 0.012, (-0.4 + k * 0.025, 0.08, 0.004 + (k % 2) * 0.006), "gold", scale=(1, 1, 0.25))
    cyl("LanternChain", 0.004, 0.3, (0.0, -0.35, 1.45), "hoop", verts=6)
    cyl("LanternCage", 0.05, 0.12, (0.0, -0.35, 1.24), "hoop", verts=8)
    sphere("LanternGlow", 0.04, (0.0, -0.35, 1.24), "lantern")
    box("Sail", (0.5, 0.01, 0.3), (0.62, -0.9, 1.25), "sail")
    candles(((-0.28, 0.24, 0.0), (0.36, 0.2, 0.0)), dish="brass")
    markers(cx, cz)
    return {"deck": ("planks", 512, True), "hull": ("wood", 512, True), "brass": ("brass", 256, True),
            "rope": ("plaster", 128, False), "gold": ("brass", 128, False)}


def castle():
    shell("stone", "stone_dark", "oak", "stone_dark", "stone_dark")
    cx, cz = chalkboard("oak")
    # tall gothic window with a sickly green moon (screen right, above the board)
    wx, wz = -0.33, 0.98
    for s in (-1, 1):
        box(f"WinJamb{s}", (0.04, 0.07, 0.34), (wx + s * 0.17, -0.9, wz), "stone_dark", bevel=0.006)
    cone("WinArch", 0.2, 0.0, 0.22, (wx, -0.9, wz + 0.27), "stone_dark", rot=(math.pi / 2, 0, 0), verts=4)
    box("WinPane", (0.32, 0.01, 0.34), (wx, -0.915, wz), "night_green")
    sphere("Moon", 0.05, (wx + 0.06, -0.91, wz + 0.08), "ghost_moon")
    box("WinBarV", (0.012, 0.02, 0.34), (wx, -0.895, wz), "hoop")
    box("WinBarH", (0.32, 0.02, 0.012), (wx, -0.895, wz + 0.05), "hoop")
    # banners + potion shelf behind the customer (screen left)
    for k, x in enumerate((0.15, 0.85)):
        box(f"Banner{k}", (0.2, 0.012, 0.55), (x, -0.9, 0.95), "banner")
        cone(f"BannerTip{k}", 0.1, 0.0, 0.1, (x, -0.9, 0.62), "banner", rot=(math.pi, 0, 0), verts=3)
        box(f"BannerRod{k}", (0.26, 0.02, 0.02), (x, -0.88, 1.23), "gold")
    box("PotionShelf", (0.6, 0.18, 0.03), (0.5, -0.82, 0.55), "oak", bevel=0.005)
    for j in range(4):
        x = 0.27 + j * 0.15
        c = "potion_green" if j % 2 == 0 else "potion_purple"
        sphere(f"Potion{j}", 0.045, (x, -0.82, 0.615), c, seg=12, rings=8)
        cyl(f"PotionNeck{j}", 0.012, 0.05, (x, -0.82, 0.68), c, verts=8)
        cyl(f"PotionCork{j}", 0.014, 0.02, (x, -0.82, 0.715), "cork", verts=8)
    # iron chandelier with candles (lit by the client's warm lights)
    torus("Chandelier", 0.28, 0.012, (0, -0.35, 1.35), "hoop")
    for k in range(6):
        a = k / 6 * math.tau
        x, y = math.cos(a) * 0.28, -0.35 + math.sin(a) * 0.28
        cyl(f"ChCandle{k}", 0.012, 0.06, (x, y, 1.39), "wax", verts=8)
        sphere(f"ChFlame{k}", 0.009, (x, y, 1.43), "edison", scale=(1, 1, 1.6), seg=6, rings=4)
    # skull, cobweb corner, candelabra
    sphere("Skull", 0.05, (0.52, 0.05, 0.05), "bone", scale=(1, 1.1, 0.95))
    sphere("SkullJaw", 0.032, (0.52, 0.09, 0.02), "bone", scale=(1, 0.8, 0.6))
    for s in (-1, 1):
        sphere(f"SkullEye{s}", 0.013, (0.52 + s * 0.02, 0.095, 0.06), "iron")
    for k in range(4):
        cyl(f"Web{k}", 0.002, 0.5, (-1.05, -0.75, 1.45), "cobweb", rot=(0.4 * k, 0.6, 0), verts=4)
    candles(((-0.3, 0.22, 0.0), (0.32, 0.22, 0.0), (0.4, 0.14, 0.0)), dish="hoop")
    markers(cx, cz)
    return {"stone": ("brick", 512, True), "stone_dark": ("brick", 256, True), "oak": ("wood", 1024, True),
            "banner": ("plaster", 128, False), "gold": ("brass", 128, False)}


def fair():
    shell("booth", "booth", "booth_wood", "stripe_red", "deck")
    cx, cz = chalkboard("booth_wood")
    # striped awning across the top of the booth
    for k in range(13):
        x = -1.2 + k * 0.2
        box(f"Stripe{k}", (0.2, 0.5, 0.02), (x, -0.55, 1.45), "stripe_red" if k % 2 == 0 else "stripe_cream",
            rot=(-0.35, 0, 0))
        cone(f"Scallop{k}", 0.1, 0.0, 0.09, (x, -0.31, 1.33), "stripe_red" if k % 2 == 0 else "stripe_cream",
             rot=(math.pi, 0, 0), verts=12)
    # string of marquee bulbs (catenary) + round marquee frame around the board
    for k in range(15):
        u = k / 14
        x = -0.9 + u * 1.8
        z = 1.22 - math.sin(u * math.pi) * 0.12
        sphere(f"Bulb{k}", 0.018, (x, -0.3, z), "marquee", seg=8, rings=6)
    for k in range(12):
        a = k / 12 * math.tau
        sphere(f"FrameBulb{k}", 0.012, (cx + math.cos(a) * 0.26, -0.88, cz + math.sin(a) * 0.22), "marquee", seg=6, rings=4)
    # prize shelf with plush toys (screen left, behind the customer)
    for i, z in enumerate((0.45, 0.78)):
        box(f"PrizeShelf{i}", (0.7, 0.2, 0.03), (0.5, -0.82, z), "booth_wood", bevel=0.005)
        for j in range(3):
            x = 0.3 + j * 0.2
            c = ("plush_pink", "plush_blue", "plush_yellow")[(i + j) % 3]
            sphere(f"Plush{i}_{j}", 0.06, (x, -0.8, z + 0.075), c, scale=(1, 0.9, 0.95))
            sphere(f"PlushHead{i}_{j}", 0.042, (x, -0.78, z + 0.16), c)
            for s in (-1, 1):
                sphere(f"PlushEar{i}_{j}_{s}", 0.016, (x + s * 0.03, -0.78, z + 0.2), c)
                sphere(f"PlushEye{i}_{j}_{s}", 0.007, (x + s * 0.014, -0.742, z + 0.17), "iron", seg=6, rings=4)
    # balloons tied to the counter corner, popcorn box
    for k, (x, z, c) in enumerate(((-0.62, 0.55, "balloon_red"), (-0.5, 0.62, "balloon_teal"), (-0.7, 0.68, "balloon_teal"))):
        sphere(f"Balloon{k}", 0.07, (x, 0.1, z), c, scale=(1, 1, 1.18))
        cyl(f"BalloonString{k}", 0.002, z - 0.03, (x, 0.1, (z - 0.03) / 2), "iron", verts=4)
    box("PopcornBox", (0.08, 0.08, 0.12), (0.5, 0.05, 0.06), "stripe_red")
    for k in range(7):
        sphere(f"Popcorn{k}", 0.018, (0.48 + (k % 3) * 0.02, 0.04 + (k % 2) * 0.025, 0.13 + (k // 3) * 0.012), "popcorn",
               seg=6, rings=4)
    candles(((-0.28, 0.24, 0.0), (0.36, 0.22, 0.0)), dish="booth_wood")
    markers(cx, cz)
    return {"booth": ("plaster", 512, True), "booth_wood": ("wood", 512, True), "deck": ("planks", 512, True),
            "stripe_red": ("plaster", 128, False), "stripe_cream": ("plaster", 128, False)}


def join_per_material():
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


def build(loc_id, fn):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    ns["MATS"].clear()
    bake = fn()
    join_per_material()
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for req in ("GLASS_ANCHOR", "CAMERA_POS", "CAMERA_TARGET", "UI_DIALOGUE_ANCHOR", "UI_STREAK_ANCHOR", "CHALKBOARD"):
        assert bpy.data.objects.get(req), f"{loc_id}: missing {req}"
    ns["BAKE"] = bake
    ns["bake_pbr"]()
    raw = os.path.join(HERE, f"loc_{loc_id}_raw.glb")
    bpy.ops.export_scene.gltf(filepath=raw, export_format='GLB', export_image_format='WEBP', export_image_quality=82)
    print(f"[loc_themed] {loc_id}: {len(meshes)} draw calls, {os.path.getsize(raw)} bytes raw", flush=True)


for loc_id, fn in (("pirate", pirate), ("castle", castle), ("fair", fair)):
    build(loc_id, fn)
