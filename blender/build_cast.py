# Aguamesa - opening cast v2: giant, fairy, ghost, pirate, wizard (Blender 5.2, headless)
# Run:  blender.exe --background --python build_cast.py
#
# Each char_<id>.glb keeps the contract (00 §6.3): 4 animations idle / happy / meh / splashed.
# Unlike v1 (only the root squashed), every character is articulated with pivot empties:
#   Head (neck pivot, carries eyes + Mouth), ArmL / ArmR (shoulder pivots), WingL / WingR (fairy)
# Each clip keys the root AND the parts; one NLA track per object, all named after the clip,
# so the glTF exporter (NLA_TRACKS) merges them into ONE animation per clip.
#   idle     breathing, weight shift, head tilt (fairy flutters, ghost bobs)
#   happy    anticipation squash, jump, lean in, both arms up, big smile
#   meh      slump, skeptical head shake, arms folded, flat mouth
#   splashed recoil, arms up shielding the face, shake off droplets, "o" mouth
import bpy
import math
import os

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
FPS = 24
bpy.context.preferences.edit.keyframe_new_interpolation_type = 'BEZIER'


def log(msg):
    print(f"[cast] {msg}", flush=True)


def hexlin(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c) + (1.0,)


_mats = {}


def mat(hexv, alpha=1.0, emis=0.0, rough=0.7):
    k = (hexv, alpha, emis)
    if k in _mats:
        return _mats[k]
    m = bpy.data.materials.new(f"m_{hexv.strip('#')}_{len(_mats)}")
    try:
        m.use_nodes = True
    except Exception:
        pass
    b = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if b:
        b.inputs["Base Color"].default_value = hexlin(hexv)
        b.inputs["Roughness"].default_value = rough
        if alpha < 1 and "Alpha" in b.inputs:
            b.inputs["Alpha"].default_value = alpha
        if emis > 0 and "Emission Color" in b.inputs:
            b.inputs["Emission Color"].default_value = hexlin(hexv)
            b.inputs["Emission Strength"].default_value = emis
    m.blend_method = 'BLEND' if alpha < 1 else 'OPAQUE'
    _mats[k] = m
    return m


def _fin(o, name, parent, m):
    o.name = name
    o.data.materials.append(m)
    if parent:
        o.parent = parent  # location given = local to the parent (identity parent inverse)
    return o


def sph(name, r, loc, col, parent=None, scale=(1, 1, 1), **mk):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=16, ring_count=10)
    o = bpy.context.active_object
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.shade_smooth()
    return _fin(o, name, parent, mat(col, **mk))


def cyl(name, r1, r2, depth, loc, col, parent=None, rot=(0, 0, 0), verts=16, **mk):
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.active_object
    bpy.ops.object.shade_smooth()
    return _fin(o, name, parent, mat(col, **mk))


def tor(name, R, r, loc, col, parent=None, rot=(0, 0, 0), **mk):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, location=loc, rotation=rot, major_segments=20, minor_segments=8)
    return _fin(bpy.context.active_object, name, parent, mat(col, **mk))


def pivot(name, loc, parent):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.03
    bpy.context.collection.objects.link(e)
    e.parent = parent
    e.location = loc
    return e


# ---------------------------------------------------------------- animation helpers
def k(obj, f, loc=None, rot=None, scale=None):
    if loc is not None:
        obj.location = loc
        obj.keyframe_insert("location", frame=f)
    if rot is not None:
        obj.rotation_euler = rot
        obj.keyframe_insert("rotation_euler", frame=f)
    if scale is not None:
        obj.scale = scale
        obj.keyframe_insert("scale", frame=f)


def clip(objs, name, keyer):
    """keyer(obj_name, obj, base) inserts keys; one action + NLA track per object."""
    for o in objs:
        if o.animation_data is None:
            o.animation_data_create()
        a = bpy.data.actions.new(f"{name}_{o.name}")
        a.use_fake_user = True
        o.animation_data.action = a
        base = o["base"]
        keyer(o.name, o, base)
        o.location, o.rotation_euler, o.scale = base["loc"], base["rot"], base["scale"]
        if not a.fcurves if hasattr(a, "fcurves") else False:
            pass
        tr = o.animation_data.nla_tracks.new()
        tr.name = name
        tr.strips.new(name, 0, a)
        o.animation_data.action = None


def add(v, d):
    return tuple(a + b for a, b in zip(v, d))


def animate(root, parts, s, flier=False, floater=False):
    objs = [root] + [p for p in parts.values() if p is not None]
    for o in objs:
        o["base"] = {"loc": tuple(o.location), "rot": tuple(o.rotation_euler), "scale": tuple(o.scale)}

    def arm_side(n):
        return 1 if n.endswith("L") else -1

    def idle(n, o, b):
        L, R, S = b["loc"], b["rot"], b["scale"]
        T = 2 * FPS
        if o is root:
            h = s * (0.08 if floater else 0.025)
            k(o, 0, loc=L, rot=R, scale=S)
            k(o, T // 2, loc=add(L, (0, 0, h)), rot=add(R, (0, 0, 0.04)), scale=(S[0], S[1], S[2] * 1.025))
            k(o, T, loc=L, rot=R, scale=S)
        elif n == "Head":
            k(o, 0, rot=R)
            k(o, T // 2, rot=add(R, (0.05, 0.1, 0)))
            k(o, T, rot=R)
        elif n.startswith("Arm"):
            sd = arm_side(n)
            k(o, 0, rot=add(R, (0, 0.12 * sd, 0)))
            k(o, T // 2, rot=add(R, (0.1, 0.2 * sd, 0)))
            k(o, T, rot=add(R, (0, 0.12 * sd, 0)))
        elif n.startswith("Wing"):
            sd = arm_side(n)
            for f in range(0, T + 1, 3):
                k(o, f, rot=add(R, (0, 0, (0.7 if (f // 3) % 2 else -0.1) * sd)))
        elif n == "Mouth":
            k(o, 0, scale=S)
            k(o, T, scale=S)

    def happy(n, o, b):
        L, R, S = b["loc"], b["rot"], b["scale"]
        if o is root:
            k(o, 0, loc=L, rot=R, scale=S)
            k(o, 5, loc=L, rot=add(R, (0.1, 0, 0)), scale=(S[0] * 1.15, S[1] * 1.15, S[2] * 0.8))
            k(o, 11, loc=add(L, (0, s * 0.08, s * 0.25)), rot=add(R, (-0.18, 0, 0)), scale=(S[0] * 0.9, S[1] * 0.9, S[2] * 1.2))
            k(o, 17, loc=L, rot=add(R, (-0.08, 0, 0)), scale=(S[0] * 1.1, S[1] * 1.1, S[2] * 0.88))
            k(o, 28, loc=L, rot=R, scale=S)
        elif n == "Head":
            k(o, 0, rot=R)
            k(o, 11, rot=add(R, (-0.25, 0, 0.12)))
            k(o, 28, rot=R)
        elif n.startswith("Arm"):
            sd = arm_side(n)
            k(o, 0, rot=R)
            k(o, 8, rot=add(R, (0.4, 0.6 * sd, 0)))
            for i, f in enumerate((12, 15, 18, 21)):
                k(o, f, rot=add(R, (0.3, (2.5 if i % 2 == 0 else 2.2) * sd, 0)))
            k(o, 28, rot=R)
        elif n.startswith("Wing"):
            sd = arm_side(n)
            for f in range(0, 29, 2):
                k(o, f, rot=add(R, (0, 0, (0.9 if (f // 2) % 2 else -0.2) * sd)))
        elif n == "Mouth":
            k(o, 0, scale=S)
            k(o, 8, scale=(S[0] * 1.6, S[1], S[2] * 2.2))
            k(o, 24, scale=(S[0] * 1.6, S[1], S[2] * 2.2))
            k(o, 28, scale=S)

    def meh(n, o, b):
        L, R, S = b["loc"], b["rot"], b["scale"]
        T = 2 * FPS
        if o is root:
            k(o, 0, loc=L, rot=R, scale=S)
            k(o, 10, loc=add(L, (0, 0, -s * 0.05)), rot=add(R, (0.14, 0, 0)), scale=(S[0] * 1.04, S[1] * 1.04, S[2] * 0.93))
            k(o, T - 8, loc=add(L, (0, 0, -s * 0.05)), rot=add(R, (0.14, 0, 0)), scale=(S[0] * 1.04, S[1] * 1.04, S[2] * 0.93))
            k(o, T, loc=L, rot=R, scale=S)
        elif n == "Head":
            k(o, 0, rot=R)
            for i, f in enumerate((10, 16, 22, 28, 34)):
                k(o, f, rot=add(R, (0.15, 0, (0.3 if i % 2 == 0 else -0.3))))
            k(o, T, rot=R)
        elif n.startswith("Arm"):
            sd = arm_side(n)
            folded = add(R, (1.35, -0.25 * sd, 0.7 * sd))
            k(o, 0, rot=R)
            k(o, 10, rot=folded)
            k(o, T - 8, rot=folded)
            k(o, T, rot=R)
        elif n.startswith("Wing"):
            sd = arm_side(n)
            k(o, 0, rot=R)
            k(o, 10, rot=add(R, (0, 0, -0.35 * sd)))
            k(o, T, rot=R)
        elif n == "Mouth":
            k(o, 0, scale=S)
            k(o, 8, scale=(S[0] * 1.2, S[1], S[2] * 0.35))
            k(o, T - 6, scale=(S[0] * 1.2, S[1], S[2] * 0.35))
            k(o, T, scale=S)

    def splashed(n, o, b):
        L, R, S = b["loc"], b["rot"], b["scale"]
        if o is root:
            k(o, 0, loc=L, rot=R, scale=S)
            k(o, 3, loc=add(L, (0, -s * 0.15, s * 0.04)), rot=add(R, (0.3, 0, 0)), scale=(S[0] * 0.92, S[1] * 0.92, S[2] * 1.1))
            for i, f in enumerate((10, 13, 16, 19, 22)):
                k(o, f, loc=add(L, (0, -s * 0.08, 0)), rot=add(R, (0.12, 0, (0.18 if i % 2 == 0 else -0.18))), scale=S)
            k(o, 30, loc=L, rot=R, scale=S)
        elif n == "Head":
            k(o, 0, rot=R)
            k(o, 3, rot=add(R, (0.3, 0, 0.35)))
            for i, f in enumerate((10, 13, 16, 19, 22)):
                k(o, f, rot=add(R, (0.1, 0, (0.4 if i % 2 == 0 else -0.4))))
            k(o, 30, rot=R)
        elif n.startswith("Arm"):
            sd = arm_side(n)
            shield = add(R, (2.3, 0.3 * sd, -0.5 * sd))
            k(o, 0, rot=R)
            k(o, 3, rot=shield)
            k(o, 9, rot=shield)
            k(o, 14, rot=add(R, (0.5, 0.9 * sd, 0)))
            k(o, 18, rot=add(R, (0.2, 0.5 * sd, 0)))
            k(o, 30, rot=R)
        elif n.startswith("Wing"):
            sd = arm_side(n)
            for f in range(0, 31, 2):
                k(o, f, rot=add(R, (0, 0, (1.1 if (f // 2) % 2 else -0.3) * sd)))
        elif n == "Mouth":
            k(o, 0, scale=S)
            k(o, 3, scale=(S[0] * 0.9, S[1], S[2] * 2.6))
            k(o, 20, scale=(S[0] * 0.9, S[1], S[2] * 2.0))
            k(o, 30, scale=S)

    for name, fn in (("idle", idle), ("happy", happy), ("meh", meh), ("splashed", splashed)):
        clip(objs, name, fn)


def face(head_pivot, r, z_eye, eye_col="#1a1410", spread=0.38, mouth_col="#6a2a2a"):
    sph("EyeL", r * 0.14, (-r * spread, r * 0.86, z_eye), eye_col, parent=head_pivot)
    sph("EyeR", r * 0.14, (r * spread, r * 0.86, z_eye), eye_col, parent=head_pivot)
    sph("ShineL", r * 0.05, (-r * spread + r * 0.04, r * 0.95, z_eye + r * 0.05), "#ffffff", parent=head_pivot, emis=1.0)
    sph("ShineR", r * 0.05, (r * spread + r * 0.04, r * 0.95, z_eye + r * 0.05), "#ffffff", parent=head_pivot, emis=1.0)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r * 0.16, location=(0, r * 0.9, z_eye - r * 0.38), segments=12, ring_count=8)
    m = bpy.context.active_object
    m.scale = (1.4, 0.35, 0.5)
    return _fin(m, "Mouth", head_pivot, mat(mouth_col))


def arm(name, shoulder, length, r, col, root, hand_col=None):
    p = pivot(name, shoulder, root)
    cyl(f"{name}Mesh", r, r * 0.85, length, (0, 0, -length / 2), col, parent=p)
    sph(f"{name}Hand", r * 1.25, (0, 0, -length), hand_col or col, parent=p)
    return p


def build(cid, builder):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _mats.clear()
    root = bpy.data.objects.new(f"char_{cid}", None)
    bpy.context.collection.objects.link(root)
    size, parts, flags = builder(root)
    animate(root, parts, size, **flags)
    bpy.context.scene.frame_set(0)
    raw = os.path.join(OUT_DIR, f"char_{cid}_raw.glb")
    bpy.ops.export_scene.gltf(filepath=raw, export_format='GLB', export_animation_mode='NLA_TRACKS')
    log(f"{cid}: {len(bpy.context.scene.objects)} objects -> {os.path.getsize(raw)} bytes raw")


# ---------------------------------------------------------------- the cast
def giant(root):
    # huge gentle mossy giant, knitted scarf, tiny ears
    cyl("Body", 0.2, 0.16, 0.42, (0, 0, 0.21), "#6E8F5A", parent=root, verts=20)
    sph("Belly", 0.15, (0, 0.07, 0.17), "#8BA872", parent=root, scale=(1, 0.7, 1))
    tor("Scarf", 0.15, 0.035, (0, 0, 0.42), "#C9573F", parent=root)
    cyl("ScarfTail", 0.03, 0.025, 0.14, (0.08, 0.13, 0.35), "#C9573F", parent=root, rot=(0.3, 0, 0))
    head = pivot("Head", (0, 0, 0.44), root)
    sph("HeadMesh", 0.14, (0, 0, 0.12), "#8BA872", parent=head)
    sph("Brow", 0.11, (0, 0.08, 0.18), "#6E8F5A", parent=head, scale=(1.2, 0.5, 0.35))
    sph("Nose", 0.035, (0, 0.14, 0.11), "#7A9A63", parent=head)
    sph("EarL", 0.03, (-0.14, 0, 0.13), "#7A9A63", parent=head)
    sph("EarR", 0.03, (0.14, 0, 0.13), "#7A9A63", parent=head)
    face(head, 0.14, 0.14)
    al = arm("ArmL", (-0.2, 0, 0.36), 0.24, 0.05, "#6E8F5A", root, "#8BA872")
    ar = arm("ArmR", (0.2, 0, 0.36), 0.24, 0.05, "#6E8F5A", root, "#8BA872")
    return 0.55, {"Head": head, "ArmL": al, "ArmR": ar, "Mouth": bpy.data.objects["Mouth"]}, {}


def fairy(root):
    # tiny glowing fairy: petal skirt, flower crown, translucent wings
    cyl("Skirt", 0.05, 0.02, 0.07, (0, 0, 0.05), "#E07FB8", parent=root)
    cyl("Torso", 0.022, 0.018, 0.05, (0, 0, 0.11), "#F2A9CF", parent=root)
    head = pivot("Head", (0, 0, 0.14), root)
    sph("HeadMesh", 0.04, (0, 0, 0.035), "#F7D5C4", parent=head)
    sph("Hair", 0.043, (0, -0.008, 0.045), "#F3C04B", parent=head, scale=(1, 1, 0.8))
    for i in range(5):
        a = i / 5 * math.tau
        sph(f"Petal{i}", 0.009, (math.cos(a) * 0.03, math.sin(a) * 0.03, 0.075), "#FF8FB3", parent=head)
    face(head, 0.04, 0.03, spread=0.36)
    wl = pivot("WingL", (-0.015, -0.02, 0.12), root)
    wr = pivot("WingR", (0.015, -0.02, 0.12), root)
    sph("WingLMesh", 0.04, (-0.04, 0, 0.02), "#BFE6FF", parent=wl, scale=(1.2, 0.15, 1.5), alpha=0.5, emis=0.6)
    sph("WingRMesh", 0.04, (0.04, 0, 0.02), "#BFE6FF", parent=wr, scale=(1.2, 0.15, 1.5), alpha=0.5, emis=0.6)
    sph("Glow", 0.012, (0, 0.03, 0.09), "#FFF2A8", parent=root, emis=4.0)
    al = arm("ArmL", (-0.024, 0, 0.125), 0.045, 0.007, "#F7D5C4", root)
    ar = arm("ArmR", (0.024, 0, 0.125), 0.045, 0.007, "#F7D5C4", root)
    return 0.18, {"Head": head, "ArmL": al, "ArmR": ar, "WingL": wl, "WingR": wr, "Mouth": bpy.data.objects["Mouth"]}, {"flier": True}


def ghost(root):
    # soft translucent ghost with a little lantern, floats and bobs
    root.location = (0, 0, 0.06)
    cyl("Sheet", 0.16, 0.12, 0.26, (0, 0, 0.13), "#E4E9FA", parent=root, verts=24, alpha=0.7, emis=0.25)
    for i in range(6):
        a = i / 6 * math.tau
        sph(f"Hem{i}", 0.04, (math.cos(a) * 0.14, math.sin(a) * 0.14, 0.0), "#E4E9FA", parent=root, alpha=0.7, emis=0.25)
    head = pivot("Head", (0, 0, 0.26), root)
    sph("HeadMesh", 0.13, (0, 0, 0.04), "#E4E9FA", parent=head, alpha=0.7, emis=0.25)
    sph("BlushL", 0.02, (-0.07, 0.115, 0.02), "#F2A0B8", parent=head, scale=(1, 0.3, 0.6))
    sph("BlushR", 0.02, (0.07, 0.115, 0.02), "#F2A0B8", parent=head, scale=(1, 0.3, 0.6))
    face(head, 0.13, 0.06, eye_col="#232035")
    al = arm("ArmL", (-0.14, 0, 0.2), 0.1, 0.03, "#E4E9FA", root)
    ar = arm("ArmR", (0.14, 0, 0.2), 0.1, 0.03, "#E4E9FA", root)
    cyl("Lantern", 0.025, 0.025, 0.05, (0, 0, -0.13), "#3A3040", parent=ar, verts=8)
    sph("LanternLight", 0.018, (0, 0, -0.13), "#9FE0FF", parent=ar, emis=4.0)
    return 0.42, {"Head": head, "ArmL": al, "ArmR": ar, "Mouth": bpy.data.objects["Mouth"]}, {"floater": True}


def pirate(root):
    # stocky pirate: striped barrel body, belt, big beard, tricorn, eye patch, hook
    cyl("Legs", 0.12, 0.13, 0.12, (0, 0, 0.06), "#2E3A55", parent=root)
    cyl("Body", 0.17, 0.14, 0.28, (0, 0, 0.26), "#F1E8D8", parent=root, verts=20)
    for i, z in enumerate((0.16, 0.22, 0.28, 0.34)):
        tor(f"Stripe{i}", 0.16 - (z - 0.12) * 0.1, 0.012, (0, 0, z), "#B8322B", parent=root)
    tor("Belt", 0.16, 0.022, (0, 0, 0.13), "#2A1A10", parent=root)
    sph("Buckle", 0.026, (0, 0.16, 0.13), "#E5B84A", parent=root, scale=(1.2, 0.4, 1))
    head = pivot("Head", (0, 0, 0.4), root)
    sph("HeadMesh", 0.11, (0, 0, 0.08), "#E3AE8E", parent=head)
    sph("Beard", 0.105, (0, 0.04, 0.02), "#5A2E14", parent=head, scale=(1.05, 0.85, 0.9))
    sph("Nose", 0.03, (0, 0.11, 0.08), "#D88E70", parent=head)
    face(head, 0.11, 0.1, spread=0.4)
    bpy.data.objects["EyeR"].scale = (1.6, 0.4, 1.4)  # eye patch
    bpy.data.objects["EyeR"].data.materials[0] = mat("#111111")
    bpy.data.objects["ShineR"].hide_render = True
    cyl("Strap", 0.115, 0.115, 0.012, (0, 0, 0.12), "#111111", parent=head, rot=(0, 0.35, 0), verts=20)
    cyl("Brim", 0.17, 0.17, 0.02, (0, 0, 0.17), "#1E1A1A", parent=head, verts=3)
    cyl("Crown", 0.1, 0.07, 0.1, (0, 0, 0.23), "#1E1A1A", parent=head, verts=16)
    sph("Skull", 0.018, (0, 0.085, 0.23), "#F5F2E8", parent=head)
    al = arm("ArmL", (-0.17, 0, 0.36), 0.2, 0.04, "#F1E8D8", root, "#E3AE8E")
    ar = arm("ArmR", (0.17, 0, 0.36), 0.2, 0.04, "#F1E8D8", root, "#E3AE8E")
    tor("Hook", 0.025, 0.006, (0, 0.02, -0.25), "#B9B9C0", parent=ar, rot=(0, math.pi / 2, 0))
    return 0.55, {"Head": head, "ArmL": al, "ArmR": ar, "Mouth": bpy.data.objects["Mouth"]}, {}


def wizard(root):
    # tall wizard: starry robe, huge hat, long beard, glowing staff orb
    cyl("Robe", 0.16, 0.08, 0.38, (0, 0, 0.19), "#3C2E85", parent=root, verts=20)
    tor("Sash", 0.1, 0.014, (0, 0, 0.3), "#E5B84A", parent=root)
    for i, (x, z) in enumerate(((0.08, 0.1), (-0.1, 0.18), (0.05, 0.24))):
        sph(f"RobeStar{i}", 0.012, (x, 0.12 - z * 0.15, z), "#FFE07A", parent=root, emis=2.0)
    head = pivot("Head", (0, 0, 0.4), root)
    sph("HeadMesh", 0.085, (0, 0, 0.05), "#E9C2A4", parent=head)
    cyl("Beard", 0.075, 0.0, 0.24, (0, 0.04, -0.07), "#F4F4F8", parent=head, rot=(0.15, 0, 0))
    sph("Nose", 0.022, (0, 0.085, 0.05), "#D9A88A", parent=head)
    face(head, 0.085, 0.07, spread=0.42)
    bpy.data.objects["Mouth"].location.z -= 0.02
    cyl("HatBrim", 0.17, 0.17, 0.015, (0, 0, 0.12), "#2E2468", parent=head, verts=24)
    cyl("HatCone", 0.1, 0.0, 0.34, (0, -0.03, 0.29), "#3C2E85", parent=head, rot=(-0.22, 0, 0), verts=18)
    sph("HatStar", 0.018, (0.03, 0.06, 0.24), "#FFE07A", parent=head, emis=2.5)
    al = arm("ArmL", (-0.12, 0, 0.36), 0.2, 0.035, "#3C2E85", root, "#E9C2A4")
    ar = arm("ArmR", (0.12, 0, 0.36), 0.2, 0.035, "#3C2E85", root, "#E9C2A4")
    cyl("Staff", 0.01, 0.01, 0.6, (0.0, 0.03, -0.1), "#6B4325", parent=ar, verts=8)
    sph("Orb", 0.04, (0.0, 0.03, 0.22), "#8FD8FF", parent=ar, emis=3.5)
    return 0.55, {"Head": head, "ArmL": al, "ArmR": ar, "Mouth": bpy.data.objects["Mouth"]}, {}


for cid, fn in (("giant", giant), ("fairy", fairy), ("ghost", ghost), ("pirate", pirate), ("wizard", wizard)):
    build(cid, fn)
