# Aguamesa - the full customer cast: 30 customers per location, 180 in total (Blender 5.2, headless)
# Run:  blender.exe --background --python build_customers.py
#   then compress the *_raw.glb files of blender/_chars (weld + meshopt) into assets/models/.
#
# One parametric character builder + one table per location (ROSTERS below). Each entry picks a
# body type, a head shape, eyes, nose, ears, hair, hat, arms and extras (wings, tails, capes,
# props...), its colours and its greeting line. Every char_<id>.glb keeps the contract (00 §6.3):
# Y up, 1 unit = 1 m, 4 animations idle / happy / meh / splashed.
#
# Mobile budget: no textures. Colours are vertex colours on ONE shared material per character
# (+ one translucent material, + one per glowing colour), and meshes are joined per moving part
# (body, head, each arm, each wing, tail) -> about 6-10 draw calls and 40-90 KB per character.
#
# Rig: root "char_<id>" (the animated node, keyed by the clips) > "Rig" (static scale = height)
# > body meshes + pivots Head, ArmL, ArmR, WingL, WingR, Tail; Mouth (scaled by the clips) is a
# child of Head. Clips are NLA tracks named after the clip on every animated object; the glTF
# exporter merges same-named tracks into one animation.
#
# Also writes src/client/world/customers.manifest.json: id, name, location, size class, line.
import bpy
import bmesh
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(HERE, "_chars")
MANIFEST = os.path.normpath(os.path.join(HERE, "..", "src", "client", "world", "customers.manifest.json"))
FPS = 24
ONLY = os.environ.get("AGUAMESA_ONLY")  # optional: comma-separated ids, to rebuild a few

# Height (metres) of each size class. "tall" stands on the back-bar floor behind the counter,
# "small" stands ON the counter next to the glass, "floater" hovers behind the counter.
HEIGHT = {"tall": 0.74, "small": 0.2, "floater": 0.46}


def log(msg):
    print(f"[cast] {msg}", flush=True)


def lin(hexv):
    h = hexv.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c) + (1.0,)


def shade(hexv, k):
    h = hexv.lstrip('#')
    c = [min(255, max(0, int(int(h[i:i + 2], 16) * k))) for i in (0, 2, 4)]
    return "#%02X%02X%02X" % tuple(c)


# ------------------------------------------------------------------ materials
_M = {}


def material(kind, hexv=None):
    key = kind if kind != "glow" else f"glow_{hexv}"
    if key in _M:
        return _M[key]
    m = bpy.data.materials.new(key)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    if kind == "glow":
        b.inputs["Base Color"].default_value = lin(hexv)
        b.inputs["Emission Color"].default_value = lin(hexv)
        b.inputs["Emission Strength"].default_value = 3.0
    else:
        vc = nt.nodes.new("ShaderNodeVertexColor")
        vc.layer_name = "Col"
        nt.links.new(vc.outputs["Color"], b.inputs["Base Color"])
        b.inputs["Roughness"].default_value = 0.55
        if kind == "trans":
            b.inputs["Alpha"].default_value = 0.62
            try:
                m.surface_render_method = 'BLENDED'
            except Exception:
                pass
            try:
                m.blend_method = 'BLEND'
            except Exception:
                pass
    _M[key] = m
    return m


def paint(o, hexv):
    me = o.data
    a = me.color_attributes.new("Col", 'FLOAT_COLOR', 'POINT')
    a.data.foreach_set("color", list(lin(hexv)) * len(me.vertices))
    me.color_attributes.active_color = a


def fin(o, name, hexv, parent, kind="toon", smooth=True):
    o.name = name
    if smooth:
        for p in o.data.polygons:
            p.use_smooth = True
    paint(o, hexv)
    o.data.materials.append(material(kind, hexv))
    o.parent = parent
    return o


def _apply(o, scale=None):
    if scale:
        o.scale = scale
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def cut(o, co, no):
    """Removes the part of the mesh on the +normal side of the plane (co, no), co given in the
    parent's space, then closes the hole. Used so caps and hair stop above the eyes."""
    me = o.data
    bm = bmesh.new()
    bm.from_mesh(me)
    local = (co[0] - o.location.x, co[1] - o.location.y, co[2] - o.location.z)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=local, plane_no=no, clear_outer=True)
    edges = [e for e in bm.edges if e.is_boundary]
    if edges:
        bmesh.ops.holes_fill(bm, edges=edges, sides=0)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()


def sph(name, r, loc, col, parent, scale=None, rot=(0, 0, 0), kind="toon", seg=14, rings=9, cutp=None):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, rotation=rot, segments=seg, ring_count=rings)
    o = bpy.context.active_object
    _apply(o, scale)
    if cutp:
        cut(o, *cutp)
    return fin(o, name, col, parent, kind)


def cone(name, r1, r2, depth, loc, col, parent, rot=(0, 0, 0), verts=12, kind="toon", scale=None, smooth=True):
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.active_object
    _apply(o, scale)
    return fin(o, name, col, parent, kind, smooth)


def tor(name, R, r, loc, col, parent, rot=(0, 0, 0), kind="toon", scale=None, seg=18):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, location=loc, rotation=rot,
                                     major_segments=seg, minor_segments=6)
    o = bpy.context.active_object
    _apply(o, scale)
    return fin(o, name, col, parent, kind)


def cube(name, size, loc, col, parent, rot=(0, 0, 0), kind="toon", bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    _apply(o, size)
    if bevel:
        mod = o.modifiers.new("b", 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return fin(o, name, col, parent, kind, smooth=bevel > 0)


def lathe(name, pts, col, parent, seg=18, kind="toon", loc=(0, 0, 0)):
    me = bpy.data.meshes.new(name)
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    bm = bmesh.new()
    rings = []
    for r, z in pts:
        if r <= 1e-4:
            rings.append([bm.verts.new((loc[0], loc[1], loc[2] + z))])
        else:
            rings.append([bm.verts.new((loc[0] + r * math.cos(2 * math.pi * i / seg),
                                        loc[1] + r * math.sin(2 * math.pi * i / seg), loc[2] + z)) for i in range(seg)])
    for a, b in zip(rings, rings[1:]):
        if len(a) == 1:
            for i in range(seg):
                bm.faces.new((a[0], b[(i + 1) % seg], b[i]))
        elif len(b) == 1:
            for i in range(seg):
                bm.faces.new((a[i], a[(i + 1) % seg], b[0]))
        else:
            for i in range(seg):
                j = (i + 1) % seg
                bm.faces.new((a[i], a[j], b[j], b[i]))
    if len(rings[0]) > 1:
        bm.faces.new(list(reversed(rings[0])))
    if len(rings[-1]) > 1:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    return fin(o, name, col, parent, kind)


def pivot(name, loc, parent, rot=(0, 0, 0)):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.03
    bpy.context.collection.objects.link(e)
    e.parent = parent
    e.location = loc
    e.rotation_euler = rot
    return e


def body_kind(sp):
    """Material of the body: ghosts/jellies are see-through by default, the rest opaque."""
    return sp.get("kind", "trans" if sp["body"] == "sheet" else "toon")


# ------------------------------------------------------------------ bodies (unit height ~1)
# Each returns: bt (body top z = neck), sx/sz (shoulder), rm (body radius toward the front),
# feet (bool).
def body(rig, sp):
    t, c = sp["body"], sp["outfit"]
    if t == "pear":
        lathe("Body", [(0.22, 0.0), (0.27, 0.1), (0.26, 0.28), (0.2, 0.45), (0.12, 0.54), (0.0, 0.57)], c, rig)
        return dict(bt=0.55, sx=0.21, sz=0.46, rm=0.26, rn=0.15, feet=True)
    if t == "stocky":
        lathe("Body", [(0.27, 0.0), (0.31, 0.15), (0.3, 0.38), (0.22, 0.52), (0.1, 0.58), (0.0, 0.59)], c, rig)
        return dict(bt=0.57, sx=0.27, sz=0.48, rm=0.3, rn=0.2, feet=True)
    if t == "slim":
        lathe("Body", [(0.15, 0.0), (0.17, 0.2), (0.16, 0.4), (0.12, 0.53), (0.0, 0.56)], c, rig)
        return dict(bt=0.55, sx=0.16, sz=0.47, rm=0.17, rn=0.11, feet=True)
    if t == "robe":
        lathe("Body", [(0.28, 0.0), (0.24, 0.1), (0.17, 0.35), (0.12, 0.52), (0.0, 0.56)], c, rig)
        return dict(bt=0.55, sx=0.15, sz=0.46, rm=0.2, rn=0.12, feet=False)
    if t == "round":
        sph("Body", 0.29, (0, 0, 0.29), c, rig, scale=(1, 0.95, 1))
        return dict(bt=0.54, sx=0.26, sz=0.38, rm=0.28, rn=0.17, feet=True)
    if t == "blob":
        sph("Body", 0.33, (0, 0, 0.21), c, rig, scale=(1, 1, 0.65), kind=body_kind(sp))
        return dict(bt=0.38, sx=0.3, sz=0.26, rm=0.32, rn=0.2, feet=False)
    if t == "sheet":
        k = body_kind(sp)
        lathe("Body", [(0.25, 0.04), (0.26, 0.16), (0.23, 0.34), (0.16, 0.5), (0.0, 0.56)], c, rig, kind=k)
        for i in range(7):
            a = i / 7 * math.tau
            sph(f"Hem{i}", 0.06, (math.cos(a) * 0.22, math.sin(a) * 0.22, 0.04), c, rig, kind=k)
        return dict(bt=0.5, sx=0.22, sz=0.4, rm=0.25, rn=0.15, feet=False)
    if t == "box":
        cube("Body", (0.46, 0.34, 0.5), (0, 0, 0.27), c, rig, bevel=0.03)
        return dict(bt=0.52, sx=0.27, sz=0.44, rm=0.17, rn=0.17, feet=True)
    if t == "snowman":
        sph("Body", 0.27, (0, 0, 0.25), c, rig)
        sph("Body2", 0.2, (0, 0, 0.6), c, rig)
        return dict(bt=0.78, sx=0.17, sz=0.66, rm=0.2, rn=0.12, feet=False)
    if t == "mermaid":
        lathe("Body", [(0.0, 0.0), (0.09, 0.05), (0.15, 0.18), (0.2, 0.33), (0.17, 0.46), (0.11, 0.54), (0.0, 0.56)], c, rig)
        for s in (-1, 1):
            cone(f"TailFin{s}", 0.09, 0.0, 0.16, (s * 0.07, -0.02, 0.02), sp.get("accent", c), rig, rot=(0, s * 2.2, 0),
                 scale=(1, 0.35, 1))
        return dict(bt=0.54, sx=0.17, sz=0.45, rm=0.2, rn=0.12, feet=False)
    if t == "cup":
        cone("Body", 0.24, 0.26, 0.48, (0, 0, 0.24), c, rig, verts=20)
        return dict(bt=0.48, sx=0.25, sz=0.36, rm=0.25, rn=0.25, feet=False)
    raise ValueError(t)


# ------------------------------------------------------------------ head
def head(rig, B, sp, hr):
    hp = pivot("Head", (0, 0, B["bt"]), rig)
    shape, skin = sp.get("head", "round"), sp["skin"]
    cz = hr * 0.92
    hx, hy, hz = {"round": (1, 1, 1), "wide": (1.18, 1, 0.92), "tall": (0.9, 0.95, 1.15), "box": (0.95, 0.85, 0.9),
                  "pumpkin": (1.15, 1.05, 0.9), "skull": (0.95, 1.0, 1.0)}[shape]
    hx, hy, hz = hx * hr, hy * hr, hz * hr
    kind = sp.get("head_kind", body_kind(sp) if sp["body"] == "sheet" else "toon")
    if shape == "box":
        cube("HeadMesh", (hx * 2, hy * 2, hz * 2), (0, 0, cz), skin, hp, bevel=hr * 0.12)
    elif shape == "pumpkin":
        for i in range(6):
            a = i / 6 * math.pi
            sph(f"Ridge{i}", hr, (0, 0, cz), skin, hp, scale=(1.15, 0.55, 0.9), rot=(0, 0, a))
        cone("Stem", hr * 0.1, hr * 0.07, hr * 0.3, (0, 0, cz + hz + hr * 0.1), "#4F7A2C", hp, rot=(0.2, 0, 0))
    else:
        sph("HeadMesh", hr, (0, 0, cz), skin, hp, scale=(hx / hr, hy / hr, hz / hr), kind=kind)
    G = dict(hp=hp, hr=hr, cz=cz, hx=hx, hy=hy, hz=hz, top=cz + hz, box=shape == "box")
    return G


def surf(G, x, z):
    if G["box"]:
        return G["hy"]
    v = 1 - (x / G["hx"]) ** 2 - ((z - G["cz"]) / G["hz"]) ** 2
    return G["hy"] * math.sqrt(max(0.04, v))


def face(G, sp):
    hp, hr, cz, hx, hz = G["hp"], G["hr"], G["cz"], G["hx"], G["hz"]
    style = sp.get("eyes", "dot")
    ec = sp.get("eye_col", "#1A1410")
    ez = cz + hz * (0.12 + sp.get("eye_z", 0))
    G["ez"] = ez
    ex = hx * 0.36 * sp.get("spread", 1)

    def dot(x, r=0.11, col=ec):
        y = surf(G, x, ez) - hr * 0.02
        sph(f"Eye{x:.3f}", hr * r, (x, y, ez), col, hp, scale=(1, 0.6, 1.1))
        sph(f"Shine{x:.3f}", hr * r * 0.36, (x + hr * 0.03, y + hr * r * 0.5, ez + hr * r * 0.4), "#FFFFFF", hp)

    def big(x, r=0.17):
        y = surf(G, x, ez) - hr * 0.04
        sph(f"Sclera{x:.3f}", hr * r, (x, y, ez), "#FBFBF6", hp, scale=(1, 0.55, 1.15))
        sph(f"Pupil{x:.3f}", hr * r * 0.6, (x, y + hr * r * 0.42, ez - hr * 0.01), ec, hp, scale=(1, 0.6, 1.1))
        sph(f"Shine{x:.3f}", hr * r * 0.2, (x + hr * 0.04, y + hr * r * 0.7, ez + hr * 0.05), "#FFFFFF", hp)

    if style in ("dot", "sleepy"):
        dot(-ex)
        dot(ex)
        if style == "sleepy":
            for x in (-ex, ex):
                sph(f"Lid{x:.3f}", hr * 0.14, (x, surf(G, x, ez) - hr * 0.01, ez + hr * 0.045), sp["skin"], hp,
                    scale=(1.05, 0.6, 0.6))
    elif style == "big":
        big(-ex)
        big(ex)
    elif style == "glow":
        for x in (-ex, ex):
            sph(f"Eye{x:.3f}", hr * 0.12, (x, surf(G, x, ez) - hr * 0.02, ez), ec, hp, scale=(1, 0.6, 1.1), kind="glow")
    elif style == "mask":
        sph("Mask", hr, (0, surf(G, 0, ez) - hr * 0.62, ez), sp.get("mask_col", "#2A2A30"), hp,
            scale=(hx / hr * 0.98, 0.42, 0.32))
        big(-ex)
        big(ex)
    elif style == "patch":
        dot(-ex)
        sph("Patch", hr * 0.15, (ex, surf(G, ex, ez) - hr * 0.02, ez), "#141414", hp, scale=(1.1, 0.3, 1))
        tor("Strap", hx * 1.01, hr * 0.025, (0, 0, cz + hr * 0.12), "#141414", hp, rot=(0, -0.45, 0))
    elif style == "three":
        for i, x in enumerate((-ex * 1.15, 0, ex * 1.15)):
            dot(x, r=0.1)
    elif style == "cyclops":
        big(0, r=0.3)
    elif style == "visor":
        cube("Visor", (hx * 1.5, hr * 0.12, hr * 0.26), (0, G["hy"] * 0.98 if G["box"] else surf(G, 0, ez) - hr * 0.05, ez),
             ec, hp, kind="glow")
    elif style == "stalk":
        for s in (-1, 1):
            cone(f"Stalk{s}", hr * 0.06, hr * 0.05, hr * 0.7, (s * hr * 0.35, hr * 0.2, G["top"] + hr * 0.3), sp["skin"], hp,
                 rot=(0, s * 0.25, 0))
            sph(f"StalkEye{s}", hr * 0.17, (s * hr * 0.44, hr * 0.2, G["top"] + hr * 0.68), "#FBFBF6", hp)
            sph(f"StalkPupil{s}", hr * 0.09, (s * hr * 0.44, hr * 0.34, G["top"] + hr * 0.68), ec, hp)
    elif style == "closed":
        for x in (-ex, ex):
            tor(f"Closed{x:.3f}", hr * 0.09, hr * 0.022, (x, surf(G, x, ez) - hr * 0.01, ez), ec, hp,
                rot=(math.pi / 2, 0, 0), scale=(1, 1, 0.5))

    # eyewear
    ew = sp.get("eyewear")
    if ew in ("glasses", "monocle"):
        xs = (-ex, ex) if ew == "glasses" else (ex,)
        col = sp.get("eyewear_col", "#2A2622" if ew == "glasses" else "#E5B84A")
        for x in xs:
            tor(f"Rim{x:.3f}", hr * 0.2, hr * 0.025, (x, surf(G, x, ez) + hr * 0.04, ez), col, hp, rot=(math.pi / 2, 0, 0))
        if ew == "glasses":
            cone("Bridge", hr * 0.02, hr * 0.02, ex * 0.9, (0, surf(G, 0, ez) + hr * 0.04, ez + hr * 0.04), col, hp,
                 rot=(0, math.pi / 2, 0), verts=6)
    elif ew == "shades":
        col = sp.get("eyewear_col", "#141418")
        for x in (-ex, ex):
            sph(f"Shade{x:.3f}", hr * 0.2, (x, surf(G, x, ez) + hr * 0.02, ez), col, hp, scale=(1.25, 0.3, 0.85))
        cube("ShadeBar", (ex * 2.3, hr * 0.05, hr * 0.05), (0, surf(G, 0, ez) + hr * 0.04, ez + hr * 0.1), col, hp)
    elif ew == "goggles":
        col = sp.get("eyewear_col", "#4FB0E0")
        gz = G["top"] - hz * 0.35
        tor("GoggleStrap", hx * 1.02, hr * 0.04, (0, 0, gz), "#2A2622", hp)
        for x in (-ex, ex):
            tor(f"Goggle{x:.3f}", hr * 0.17, hr * 0.06, (x, surf(G, x, gz) + hr * 0.02, gz), "#2A2622", hp,
                rot=(math.pi / 2 - 0.3, 0, 0))
            sph(f"GoggleLens{x:.3f}", hr * 0.15, (x, surf(G, x, gz) + hr * 0.02, gz), col, hp, scale=(1, 0.3, 1))

    # nose / snout / beak
    n = sp.get("nose")
    nc = sp.get("nose_col", shade(sp["skin"], 0.82))
    nz = cz - hz * 0.1
    mz = cz - hz * 0.4
    my_extra = 0.0
    if n == "round":
        sph("Nose", hr * 0.13, (0, surf(G, 0, nz) + hr * 0.04, nz), nc, hp)
    elif n == "button":
        sph("Nose", hr * 0.07, (0, surf(G, 0, nz) + hr * 0.02, nz), sp.get("nose_col", "#E58FA0"), hp, scale=(1.2, 0.8, 0.9))
    elif n == "beak":
        bc = sp.get("nose_col", "#F2A23A")
        cone("Beak", hr * 0.16, 0.0, hr * 0.34, (0, surf(G, 0, nz) + hr * 0.14, nz - hr * 0.04), bc, hp, rot=(-math.pi / 2 + 0.25, 0, 0))
        mz = nz - hr * 0.2
    elif n in ("snout", "long_snout"):
        mc = sp.get("muzzle", shade(sp["skin"], 1.25))
        L = 1.6 if n == "long_snout" else 1.0
        sz_ = cz - hz * 0.22
        y = surf(G, 0, sz_) - hr * 0.08
        sph("Snout", hr * 0.3, (0, y + hr * 0.12 * L, sz_), mc, hp, scale=(1.05, 0.85 * L, 0.72))
        sph("NoseTip", hr * 0.09, (0, y + hr * 0.38 * L, sz_ + hr * 0.12), sp.get("nose_col", "#2A1F1C"), hp, scale=(1.2, 0.8, 0.8))
        mz = sz_ - hr * 0.13
        my_extra = hr * 0.22 * L
    elif n == "carrot":
        cone("Carrot", hr * 0.11, 0.0, hr * 0.6, (0, surf(G, 0, nz) + hr * 0.27, nz), "#F07A2A", hp, rot=(-math.pi / 2, 0, 0))
    elif n == "pig":
        cone("PigNose", hr * 0.17, hr * 0.17, hr * 0.12, (0, surf(G, 0, nz) + hr * 0.04, nz), sp.get("nose_col", "#F2A0B0"), hp,
             rot=(math.pi / 2, 0, 0), verts=16)
        for s in (-1, 1):
            sph(f"Nostril{s}", hr * 0.035, (s * hr * 0.06, surf(G, 0, nz) + hr * 0.1, nz), "#7A3A40", hp)
        mz = nz - hr * 0.25
    elif n == "trunk":
        # thick at the face, thin tip hanging down and a little forward
        cone("Trunk", hr * 0.17, hr * 0.07, hr * 0.85, (0, surf(G, 0, nz) + hr * 0.28, nz - hr * 0.38), sp["skin"], hp,
             rot=(math.pi + 0.5, 0, 0))
        tor("TrunkTip", hr * 0.07, hr * 0.025, (0, surf(G, 0, nz) + hr * 0.5, nz - hr * 0.76), shade(sp["skin"], 0.85), hp)
        mz = nz - hr * 0.3

    # mouth (separate object: the clips scale it)
    my = surf(G, 0, mz) - hr * 0.015 + my_extra
    bpy.ops.mesh.primitive_uv_sphere_add(radius=hr * 0.15, location=(0, my, mz), segments=12, ring_count=8)
    m = bpy.context.active_object
    m.scale = (1.4, 0.35, 0.5)
    fin(m, "Mouth", sp.get("mouth_col", "#6A2A2A"), hp)
    if sp.get("blush"):
        for s in (-1, 1):
            sph(f"Blush{s}", hr * 0.11, (s * hx * 0.56, surf(G, s * hx * 0.56, cz - hz * 0.12) - hr * 0.02, cz - hz * 0.12),
                sp.get("blush_col", "#F29BAA"), hp, scale=(1.2, 0.3, 0.7))
    if sp.get("fangs"):
        for s in (-1, 1):
            cone(f"Fang{s}", hr * 0.035, 0.0, hr * 0.12, (s * hr * 0.07, my + hr * 0.01, mz - hr * 0.08), "#FFFFFF", hp,
                 rot=(math.pi, 0, 0), verts=6)
    if sp.get("tusks"):
        for s in (-1, 1):
            cone(f"Tusk{s}", hr * 0.05, 0.0, hr * 0.42, (s * hr * 0.16, my + hr * 0.02, mz - hr * 0.2), "#F4EEDC", hp,
                 rot=(math.pi, 0, 0), verts=8)
    if sp.get("teeth"):
        cube("Teeth", (hr * 0.16, hr * 0.04, hr * 0.12), (0, my + hr * 0.02, mz - hr * 0.08), "#FFFFFF", hp)
    if sp.get("whiskers"):
        for s in (-1, 1):
            for k in range(3):
                cone(f"Whisker{s}{k}", hr * 0.008, hr * 0.004, hr * 0.5,
                     (s * hr * 0.32, my + hr * 0.05, mz + hr * 0.05 + k * hr * 0.05), "#2A2622", hp,
                     rot=(0, math.pi / 2 + s * (k - 1) * 0.15, 0), verts=4)
    fh = sp.get("facial")
    if fh in ("mustache", "beard_mustache"):
        for s in (-1, 1):
            sph(f"Stache{s}", hr * 0.13, (s * hr * 0.1, my + hr * 0.04, mz + hr * 0.08), sp.get("hair_col", "#4A2E1E"), hp,
                scale=(1.4, 0.55, 0.55), rot=(0, s * -0.3, 0))
    if fh in ("beard", "beard_mustache", "long_beard"):
        L = 2.0 if fh == "long_beard" else 1.0
        sph("Beard", hr * 0.42, (0, my - hr * 0.12, mz - hr * 0.18 * L), sp.get("hair_col", "#4A2E1E"), hp,
            scale=(1.05, 0.7, 0.75 * L))
    if fh == "goatee":
        cone("Goatee", hr * 0.1, 0.0, hr * 0.25, (0, my, mz - hr * 0.2), sp.get("hair_col", "#4A2E1E"), hp, rot=(math.pi, 0, 0))


def ears(G, sp):
    e = sp.get("ears")
    if not e:
        return
    hp, hr, cz, hx, hz = G["hp"], G["hr"], G["cz"], G["hx"], G["hz"]
    c = sp.get("ear_col", sp["skin"])
    inner = sp.get("ear_inner", shade(c, 1.3))
    for s in (-1, 1):
        if e == "pointy":
            cone(f"Ear{s}", hr * 0.28, 0.0, hr * 0.5, (s * hx * 0.58, -hr * 0.05, cz + hz * 0.85), c, hp, rot=(0, s * 0.45, 0),
                 scale=(1, 0.55, 1))
            cone(f"EarIn{s}", hr * 0.16, 0.0, hr * 0.32, (s * hx * 0.58, hr * 0.03, cz + hz * 0.82), inner, hp,
                 rot=(0, s * 0.45, 0), scale=(1, 0.3, 1))
        elif e in ("round", "big_round"):
            r = hr * (0.42 if e == "big_round" else 0.27)
            sph(f"Ear{s}", r, (s * hx * 0.7, -hr * 0.05, cz + hz * 0.72), c, hp, scale=(1, 0.45, 1))
            sph(f"EarIn{s}", r * 0.62, (s * hx * 0.7, hr * 0.02, cz + hz * 0.72), inner, hp, scale=(1, 0.3, 1))
        elif e == "long":
            sph(f"Ear{s}", hr * 0.6, (s * hx * 0.32, -hr * 0.05, cz + hz * 1.45), c, hp, scale=(0.32, 0.22, 1), rot=(0, s * 0.18, 0))
            sph(f"EarIn{s}", hr * 0.45, (s * hx * 0.32, hr * 0.04, cz + hz * 1.45), inner, hp, scale=(0.22, 0.12, 1),
                rot=(0, s * 0.18, 0))
        elif e == "floppy":
            sph(f"Ear{s}", hr * 0.55, (s * hx * 0.98, 0, cz - hz * 0.05), c, hp, scale=(0.3, 0.55, 0.9), rot=(0, s * -0.25, 0))
        elif e == "elf":
            cone(f"Ear{s}", hr * 0.16, 0.0, hr * 0.5, (s * hx * 1.05, 0, cz + hz * 0.1), c, hp, rot=(0, s * 1.2, 0),
                 scale=(1, 0.45, 1))
        elif e == "fin":
            cone(f"Ear{s}", hr * 0.28, 0.0, hr * 0.45, (s * hx * 1.0, -hr * 0.05, cz), c, hp, rot=(0.3, s * 1.35, 0),
                 scale=(1, 0.2, 1))
        elif e == "tufts":
            cone(f"Ear{s}", hr * 0.15, 0.0, hr * 0.35, (s * hx * 0.55, 0, cz + hz * 0.95), c, hp, rot=(0, s * 0.35, 0))
        elif e == "huge":  # elephant
            sph(f"Ear{s}", hr * 0.75, (s * hx * 1.15, -hr * 0.1, cz), c, hp, scale=(0.18, 0.95, 1.05), rot=(0, 0, s * 0.35))


def hair(G, sp):
    h = sp.get("hair")
    if not h:
        return
    hp, hr, cz, hx, hy, hz = G["hp"], G["hr"], G["cz"], G["hx"], G["hy"], G["hz"]
    c = sp.get("hair_col", "#4A2E1E")
    if h in ("bob", "bun", "long", "braids", "slick"):
        sz = 0.75 if h == "slick" else 0.95
        # fringe line above the eyebrows: the face stays clear
        fringe = ((0, hy * 0.3, G["ez"] + hr * 0.2), (0, 0.6, -0.8))
        sph("Hair", hr * 1.07, (0, -hr * 0.1, cz + hz * 0.06), c, hp, scale=(hx / hr, hy / hr, hz / hr * sz), cutp=fringe)
        if h == "bun":
            sph("Bun", hr * 0.36, (0, -hr * 0.35, G["top"] + hr * 0.08), c, hp)
        if h == "long":
            sph("HairBack", hr * 0.9, (0, -hr * 0.45, cz - hz * 0.5), c, hp, scale=(1.05, 0.55, 1.15))
        if h == "braids":
            for s in (-1, 1):
                for k in range(3):
                    sph(f"Braid{s}{k}", hr * 0.13, (s * hx * 0.85, -hr * 0.1, cz - hz * (0.4 + k * 0.28)), c, hp)
    elif h == "curly":
        for i in range(9):
            a = i / 9 * math.tau
            sph(f"Curl{i}", hr * 0.34, (math.cos(a) * hx * 0.62, math.sin(a) * hy * 0.5 - hr * 0.15, G["top"] - hr * 0.12), c, hp)
    elif h == "mohawk":
        for k in range(5):
            cone(f"Spike{k}", hr * 0.16, 0.0, hr * 0.5, (0, hr * (0.45 - k * 0.25), G["top"] + hr * 0.1 - abs(k - 1.5) * hr * 0.06),
                 c, hp, rot=(-0.3 + k * 0.18, 0, 0), verts=8)
    elif h == "spiky":
        for k in range(8):
            a = k / 8 * math.tau
            cone(f"Spike{k}", hr * 0.15, 0.0, hr * 0.45, (math.cos(a) * hx * 0.4, math.sin(a) * hy * 0.4, G["top"]), c, hp,
                 rot=(math.sin(a) * -0.6, math.cos(a) * 0.6, 0), verts=7)
    elif h == "mane":
        for k in range(12):
            a = k / 12 * math.tau
            sph(f"Mane{k}", hr * 0.36, (math.cos(a) * hx * 0.98, -hr * 0.12, cz + math.sin(a) * hz * 0.98), c, hp,
                scale=(1, 0.7, 1))
    elif h == "leaves":
        for k in range(7):
            a = k / 7 * math.tau
            cone(f"Leaf{k}", hr * 0.14, 0.0, hr * 0.7, (math.cos(a) * hr * 0.15, math.sin(a) * hr * 0.15, G["top"] + hr * 0.25), c, hp,
                 rot=(math.sin(a) * -0.5, math.cos(a) * 0.5, 0), scale=(1, 0.4, 1), verts=6)
    elif h == "tuft":
        for k in range(3):
            cone(f"Tuft{k}", hr * 0.1, 0.0, hr * 0.35, ((k - 1) * hr * 0.12, 0, G["top"] + hr * 0.1), c, hp, rot=(0, (k - 1) * 0.4, 0),
                 verts=6)


def hat(G, sp):
    h = sp.get("hat")
    if not h:
        return
    hp, hr, cz, hx, hy, hz, top = G["hp"], G["hr"], G["cz"], G["hx"], G["hy"], G["hz"], G["top"]
    c = sp.get("hat_col", "#2A2430")
    a = sp.get("hat_accent", "#E5B84A")
    base = cz + hz * 0.72
    # soft hats (beanie, cap, bandana...) are spheres cut along the brow line, above the eyes
    brow = G["ez"] + hr * 0.22
    capcut = ((0, 0, brow), (0, 0.35, -0.94))
    if h == "top":
        cone("HatBrim", hr * 0.95, hr * 0.95, hr * 0.06, (0, 0, base), c, hp, verts=24)
        cone("HatCrown", hr * 0.58, hr * 0.62, hr * 0.8, (0, 0, base + hr * 0.43), c, hp, verts=20)
        cone("HatBand", hr * 0.6, hr * 0.6, hr * 0.12, (0, 0, base + hr * 0.1), a, hp, verts=20)
    elif h == "fedora":
        cone("HatBrim", hr * 1.05, hr * 1.05, hr * 0.05, (0, 0, base), c, hp, verts=24)
        sph("HatCrown", hr * 0.6, (0, 0, base + hr * 0.22), c, hp, scale=(1, 0.9, 0.7))
        cone("HatBand", hr * 0.6, hr * 0.6, hr * 0.1, (0, 0, base + hr * 0.06), a, hp, verts=20)
    elif h in ("beanie", "nightcap", "santa"):
        sph("Beanie", hr * 1.06, (0, -hr * 0.02, cz + hz * 0.1), c, hp, scale=(hx / hr, hy / hr, hz / hr), cutp=capcut)
        tor("BeanieFold", hx * 0.98, hr * 0.1, (0, -hr * 0.06, brow + hr * 0.04), a if h != "beanie" else shade(c, 0.85), hp,
            rot=(-0.36, 0, 0))
        if h == "beanie":
            sph("Pompom", hr * 0.2, (0, -hr * 0.05, top + hr * 0.18), a, hp)
        else:
            cone("CapTip", hr * 0.55, hr * 0.1, hr * 0.9, (hr * 0.25, -hr * 0.2, top + hr * 0.25), c, hp, rot=(0.3, 0.9, 0))
            sph("Pompom", hr * 0.16, (hr * 0.72, -hr * 0.3, top + hr * 0.42), "#FFFFFF" if h == "santa" else a, hp)
    elif h in ("wizard", "witch"):
        R = 1.55 if h == "witch" else 1.25
        cone("HatBrim", hr * R, hr * R, hr * 0.05, (0, 0, base), c, hp, verts=24)
        cone("HatCone", hr * 0.68, 0.0, hr * 1.7, (0, -hr * 0.12, base + hr * 0.8), c, hp, rot=(-0.22, 0, 0), verts=18)
        cone("HatBand", hr * 0.68, hr * 0.64, hr * 0.12, (0, -hr * 0.01, base + hr * 0.08), a, hp, verts=18)
        if h == "wizard":
            sph("HatStar", hr * 0.1, (hr * 0.2, hr * 0.38, base + hr * 0.6), "#FFE07A", hp, kind="glow")
    elif h in ("tricorn", "bicorne"):
        cone("HatCrown", hr * 0.66, hr * 0.52, hr * 0.42, (0, 0, base + hr * 0.2), c, hp, verts=16)
        cone("HatTrim", hr * 0.67, hr * 0.67, hr * 0.05, (0, 0, base + hr * 0.04), a, hp, verts=16)
        # turned-up brim: 3 flaps around the crown (tricorn, one point at the front) or 2 (bicorne)
        angles = (math.pi / 2 + math.pi / 3, math.pi / 2 + math.pi, math.pi / 2 - math.pi / 3) if h == "tricorn" \
            else (math.pi / 2, -math.pi / 2)
        fh = 0.3 if h == "tricorn" else 0.42  # flap height (fraction of its width)
        for k, ang in enumerate(angles):
            R = hr * (0.6 if h == "tricorn" else 0.48)
            sph(f"HatFlap{k}", hr * 0.78, (math.cos(ang) * R, math.sin(ang) * R, base + hr * 0.16), c, hp,
                scale=(1.15, 0.14, fh), rot=(0.62, 0, ang - math.pi / 2))
            tor(f"HatEdge{k}", hr * 0.86, hr * 0.03, (math.cos(ang) * R * 1.03, math.sin(ang) * R * 1.03, base + hr * 0.16), a, hp,
                rot=(math.pi / 2 + 0.62, 0, ang - math.pi / 2), scale=(1.04, fh, 1))
        if sp.get("skull_hat"):
            sph("HatSkull", hr * 0.13, (0, hr * 0.72, base + hr * 0.3), "#F5F2E8", hp, scale=(1, 0.5, 1))
    elif h == "crown":
        cone("Crown", hr * 0.62, hr * 0.7, hr * 0.38, (0, 0, top + hr * 0.08), a, hp, verts=10)
        for k in range(5):
            ang = k / 5 * math.tau
            cone(f"CrownPt{k}", hr * 0.1, 0.0, hr * 0.22, (math.cos(ang) * hr * 0.66, math.sin(ang) * hr * 0.66, top + hr * 0.36),
                 a, hp, verts=6)
        sph("Jewel", hr * 0.09, (0, hr * 0.68, top + hr * 0.1), "#D6453D", hp)
    elif h in ("cap", "nurse"):
        col = "#FFFFFF" if h == "nurse" else c
        sph("Cap", hr * 1.05, (0, -hr * 0.03, cz + hz * 0.08), col, hp, scale=(hx / hr, hy / hr, hz / hr), cutp=capcut)
        if h == "cap":
            sph("CapBill", hr * 0.62, (0, hy * 0.92, brow + hr * 0.05), a if sp.get("bill_accent") else col, hp, scale=(1, 0.95, 0.12),
                rot=(-0.15, 0, 0))
        else:
            cube("NurseCross", (hr * 0.25, hr * 0.04, hr * 0.08), (0, hy * 0.6, top - hr * 0.05), "#D6453D", hp)
    elif h == "straw":
        cone("HatBrim", hr * 1.6, hr * 1.6, hr * 0.05, (0, 0, base), c if c != "#2A2430" else "#E8C877", hp, verts=24)
        cone("HatCrown", hr * 0.65, hr * 0.55, hr * 0.42, (0, 0, base + hr * 0.22), c if c != "#2A2430" else "#E8C877", hp, verts=20)
        cone("HatBand", hr * 0.66, hr * 0.64, hr * 0.12, (0, 0, base + hr * 0.08), a, hp, verts=20)
    elif h == "helmet":
        sph("Helmet", hr * 1.12, (0, 0, cz + hz * 0.12), c, hp, scale=(hx / hr, hy / hr, hz / hr))
        cube("Slit", (hx * 1.3, hr * 0.06, hr * 0.12), (0, hy * 1.08, cz + hz * 0.1), "#141414", hp)
        cone("Plume", hr * 0.15, 0.0, hr * 0.8, (0, -hr * 0.2, top + hr * 0.45), a, hp, rot=(-0.4, 0, 0))
    elif h == "chef":
        cone("ChefBand", hr * 0.72, hr * 0.75, hr * 0.3, (0, 0, base + hr * 0.12), "#FFFFFF", hp, verts=20)
        for k in range(5):
            ang = k / 5 * math.tau
            sph(f"ChefPuff{k}", hr * 0.38, (math.cos(ang) * hr * 0.32, math.sin(ang) * hr * 0.32, base + hr * 0.55), "#FFFFFF", hp)
    elif h == "party":
        cone("PartyHat", hr * 0.45, 0.0, hr * 1.1, (hr * 0.1, 0, top + hr * 0.42), c, hp, rot=(0, 0.18, 0))
        sph("Pompom", hr * 0.13, (hr * 0.2, 0, top + hr * 0.98), a, hp)
        for k in range(3):
            tor(f"PartyStripe{k}", hr * (0.38 - k * 0.11), hr * 0.03, (hr * (0.05 + k * 0.04), 0, top + hr * (0.15 + k * 0.26)), a, hp,
                rot=(0, 0.18, 0))
    elif h == "beret":
        sph("Beret", hr * 0.92, (hr * 0.15, -hr * 0.05, top - hr * 0.1), c, hp, scale=(1.1, 1.05, 0.32), rot=(0, 0.22, 0))
        cone("BeretTip", hr * 0.05, 0.0, hr * 0.12, (hr * 0.15, 0, top + hr * 0.12), c, hp, verts=6)
    elif h == "horns":
        for s in (-1, 1):
            cone(f"Horn{s}", hr * 0.13, 0.0, hr * 0.55, (s * hx * 0.5, 0, top - hr * 0.05), a if sp.get("horn_col") is None else sp["horn_col"],
                 hp, rot=(0, s * 0.5, 0))
    elif h == "antlers":
        col = sp.get("horn_col", "#B88A5A")
        for s in (-1, 1):
            cone(f"Antler{s}", hr * 0.06, hr * 0.04, hr * 0.7, (s * hx * 0.55, 0, top + hr * 0.2), col, hp, rot=(0, s * 0.6, 0), verts=6)
            for k in range(2):
                cone(f"Tine{s}{k}", hr * 0.04, 0.0, hr * 0.35, (s * hx * (0.75 + k * 0.15), hr * 0.05, top + hr * (0.35 + k * 0.15)), col, hp,
                     rot=(-0.3, s * -0.2, 0), verts=5)
    elif h == "antennae":
        for s in (-1, 1):
            cone(f"Antenna{s}", hr * 0.03, hr * 0.02, hr * 0.6, (s * hr * 0.25, 0, top + hr * 0.25), sp.get("hat_col", "#2A2430"), hp,
                 rot=(0, s * 0.35, 0), verts=6)
            sph(f"AntennaBall{s}", hr * 0.09, (s * hr * 0.45, 0, top + hr * 0.55), a, hp, kind="glow" if sp.get("glow_tips") else "toon")
    elif h == "flower":
        for k in range(7):
            ang = k / 7 * math.tau
            sph(f"Petal{k}", hr * 0.14, (math.cos(ang) * hx * 0.8, math.sin(ang) * hy * 0.55 - hr * 0.1, top - hr * 0.15),
                (c, a)[k % 2], hp)
    elif h == "bow":
        for s in (-1, 1):
            cone(f"Bow{s}", hr * 0.25, 0.0, hr * 0.38, (s * hr * 0.2, 0, top + hr * 0.05), c, hp, rot=(0, s * -1.57, 0), scale=(1, 0.5, 1))
        sph("BowKnot", hr * 0.1, (0, 0, top + hr * 0.05), c, hp)
    elif h == "bandana":
        sph("Bandana", hr * 1.05, (0, -hr * 0.03, cz + hz * 0.08), c, hp, scale=(hx / hr, hy / hr, hz / hr), cutp=capcut)
        sph("BandanaKnot", hr * 0.15, (0, -hy * 1.0, cz + hz * 0.2), c, hp)
        for s in (-1, 1):
            cone(f"BandanaTail{s}", hr * 0.1, 0.0, hr * 0.35, (s * hr * 0.1, -hy * 1.05, cz - hz * 0.1), c, hp, rot=(0.3, s * 0.3, 0))
        if sp.get("bandana_dots"):
            for k in range(5):
                ang = (k / 5 - 0.5) * 2.4
                sph(f"BDot{k}", hr * 0.05, (math.sin(ang) * hx * 0.95, math.cos(ang) * hy * 0.95, top - hr * 0.3), "#FFFFFF", hp)
    elif h == "headphones":
        tor("Band", hx * 1.08, hr * 0.06, (0, 0, cz + hz * 0.15), c, hp, rot=(math.pi / 2, 0, math.pi / 2), scale=(1, 1, 1))
        for s in (-1, 1):
            cone(f"Cup{s}", hr * 0.26, hr * 0.26, hr * 0.18, (s * hx * 1.02, 0, cz), a, hp, rot=(0, math.pi / 2, 0), verts=16)
    elif h == "deerstalker":
        sph("Cap", hr * 1.05, (0, 0, cz + hz * 0.08), c, hp, scale=(hx / hr, hy / hr, hz / hr), cutp=((0, 0, brow), (0, 0, -1)))
        for s in (-1, 1):
            sph(f"Bill{s}", hr * 0.45, (0, s * hy * 0.92, brow + hr * 0.02), c, hp, scale=(1, 0.8, 0.12))
        sph("Knot", hr * 0.08, (0, 0, top + hr * 0.02), a, hp)
    elif h == "halo":
        tor("Halo", hr * 0.6, hr * 0.06, (0, 0, top + hr * 0.35), "#FFE9A0", hp, kind="glow")
    elif h == "dorsal":
        cone("Dorsal", hr * 0.45, 0.0, hr * 0.75, (0, -hr * 0.15, top + hr * 0.18), sp["skin"], hp, scale=(0.3, 1, 1), rot=(-0.35, 0, 0))
    elif h == "marshmallow":
        for k in range(4):
            cube(f"Mallow{k}", (hr * 0.32, hr * 0.32, hr * 0.28), ((k % 2 - 0.5) * hr * 0.35, (k // 2 - 0.5) * hr * 0.35, top + hr * 0.05),
                 "#FFF8F0", hp, rot=(0.2 * k, 0.1, 0.3 * k), bevel=hr * 0.08)
    elif h == "propeller":
        sph("Cap", hr * 1.05, (0, -hr * 0.02, cz + hz * 0.08), c, hp, scale=(hx / hr, hy / hr, hz / hr), cutp=capcut)
        cone("PropStem", hr * 0.04, hr * 0.04, hr * 0.25, (0, 0, top + hr * 0.1), a, hp, verts=6)
        for s in (-1, 1):
            sph(f"Blade{s}", hr * 0.35, (s * hr * 0.32, 0, top + hr * 0.23), "#D6453D" if s > 0 else "#4FB0E0", hp, scale=(1, 0.3, 0.08))
    elif h == "flame":
        cone("Flame", hr * 0.35, 0.0, hr * 0.9, (0, 0, top + hr * 0.3), "#FFB547", hp, kind="glow")
    elif h == "hood":
        # open in front: the face looks out of the hood
        sph("Hood", hr * 1.18, (0, -hr * 0.15, cz + hz * 0.08), c, hp, scale=(hx / hr, hy / hr * 1.05, hz / hr * 1.05),
            cutp=((0, hy * 0.45, 0), (0, 1, 0)))
    elif h == "fez":
        cone("Fez", hr * 0.42, hr * 0.5, hr * 0.5, (0, 0, top + hr * 0.12), c, hp, verts=16)
        cone("Tassel", hr * 0.03, hr * 0.03, hr * 0.35, (hr * 0.3, 0, top + hr * 0.2), a, hp, rot=(0, 0.6, 0), verts=5)
    elif h == "earmuffs":
        tor("Band", hx * 1.06, hr * 0.04, (0, 0, cz + hz * 0.1), c, hp, rot=(math.pi / 2, 0, math.pi / 2))
        for s in (-1, 1):
            sph(f"Muff{s}", hr * 0.28, (s * hx * 1.02, 0, cz), a, hp)


def arms(rig, B, sp, H):
    style = sp.get("arms", "normal")
    if style == "none":
        return None, None
    oc, sk = sp.get("sleeve", sp["outfit"]), sp.get("hand", sp["skin"])
    ak = body_kind(sp) if sp["body"] == "sheet" else "toon"
    out = []
    for side, s in (("L", -1), ("R", 1)):
        p = pivot(f"Arm{side}", (s * B["sx"], 0, B["sz"]), rig, rot=(0, -s * 0.18, 0))
        if style == "normal":
            cone(f"Arm{side}Mesh", 0.055, 0.048, 0.3, (0, 0, -0.15), oc, p, verts=12, kind=ak)
            sph(f"Arm{side}Hand", 0.068, (0, 0.01, -0.32), sk, p, kind=ak)
        elif style == "wing":
            sph(f"Arm{side}Wing", 0.2, (s * 0.02, -0.02, -0.14), oc, p, scale=(0.22, 0.55, 1.0), rot=(0, s * 0.15, 0))
            for k in range(3):
                sph(f"Arm{side}Feather{k}", 0.08, (s * 0.02, -0.02 - k * 0.05, -0.3 - k * 0.02), sp.get("accent", oc), p,
                    scale=(0.22, 0.5, 1.0))
        elif style == "claw":
            cone(f"Arm{side}Mesh", 0.05, 0.045, 0.22, (0, 0, -0.11), oc, p, verts=10)
            sph(f"Arm{side}Claw", 0.1, (0, 0.02, -0.29), oc, p, scale=(0.8, 0.6, 1.0))
            cone(f"Arm{side}Pincer", 0.05, 0.0, 0.16, (0, 0.04, -0.4), oc, p, rot=(math.pi, 0, 0), verts=8)
            cone(f"Arm{side}Pincer2", 0.04, 0.0, 0.13, (s * -0.05, 0.04, -0.38), oc, p, rot=(math.pi - 0.4, s * -0.3, 0), verts=8)
        elif style == "fin":
            sph(f"Arm{side}Fin", 0.14, (0, 0, -0.1), oc, p, scale=(0.25, 0.6, 1.0), rot=(0, s * 0.25, 0))
        elif style == "tentacle":
            cone(f"Arm{side}Mesh", 0.06, 0.035, 0.24, (0, 0, -0.12), oc, p, verts=10)
            cone(f"Arm{side}Tip", 0.035, 0.008, 0.2, (s * 0.05, 0.03, -0.3), oc, p, rot=(0.4, s * -0.5, 0), verts=8)
            for k in range(3):
                sph(f"Arm{side}Sucker{k}", 0.014, (0, 0.045, -0.06 - k * 0.07), sp.get("accent", "#F2C2D8"), p)
        out.append(p)
    return out[0], out[1]


def held(arm_r, sp):
    item = sp.get("holds")
    if not item or arm_r is None:
        return
    y, z = 0.07, -0.33
    if item == "orb":
        sph("Orb", 0.07, (0, y, z), sp.get("orb_col", "#8FD8FF"), arm_r, kind="glow")
    elif item == "lantern":
        cone("Lantern", 0.05, 0.05, 0.09, (0, y, z - 0.05), "#3A3040", arm_r, verts=8)
        sph("LanternLight", 0.04, (0, y, z - 0.05), sp.get("orb_col", "#FFC56A"), arm_r, kind="glow")
    elif item == "cup":
        cone("Cup", 0.04, 0.045, 0.08, (0, y, z), "#EFE2C2", arm_r, verts=12)
    elif item == "book":
        cube("Book", (0.1, 0.03, 0.13), (0, y, z), sp.get("book_col", "#7A1E2A"), arm_r)
    elif item == "spyglass":
        cone("Spyglass", 0.025, 0.035, 0.22, (0, y + 0.06, z), "#C8963E", arm_r, rot=(-1.2, 0, 0), verts=10)
    elif item == "hook":
        tor("Hook", 0.04, 0.009, (0, 0.02, z - 0.04), "#B9B9C0", arm_r, rot=(0, math.pi / 2, 0))
    elif item == "staff":
        cone("Staff", 0.012, 0.012, 0.75, (0, y, z + 0.1), "#6B4325", arm_r, verts=8)
        sph("StaffOrb", 0.05, (0, y, z + 0.48), sp.get("orb_col", "#8FD8FF"), arm_r, kind="glow")
    elif item == "balloon":
        cone("String", 0.003, 0.003, 0.5, (0, y, z + 0.25), "#2A2622", arm_r, verts=4)
        sph("Balloon", 0.1, (0, y, z + 0.55), sp.get("orb_col", "#E8423A"), arm_r, scale=(1, 1, 1.18))
    elif item == "wand":
        cone("Wand", 0.008, 0.008, 0.25, (0, y, z + 0.08), "#2A2622", arm_r, verts=6)
        sph("WandStar", 0.03, (0, y, z + 0.22), "#FFE07A", arm_r, kind="glow")
    elif item == "shell":
        sph("HeldShell", 0.06, (0, y, z), "#F2C2A8", arm_r, scale=(1, 0.5, 0.8))
    elif item == "pearl":
        sph("Pearl", 0.04, (0, y, z), "#F4F2EC", arm_r)


def extras(rig, B, sp, hp):
    ex = set(sp.get("extras", []))
    bt, rm, oc = B["bt"], B["rm"], sp["outfit"]
    acc = sp.get("accent", "#E5B84A")
    parts = {}
    if "belly" in ex:
        sph("Belly", rm * 0.75, (0, rm * 0.45, bt * 0.42), sp.get("belly_col", shade(oc, 1.35)), rig, scale=(0.9, 0.55, 1.05))
    if "stripes" in ex:
        for k in range(4):
            z = bt * (0.18 + k * 0.19)
            tor(f"Stripe{k}", rm * (1.0 - k * 0.07), 0.018, (0, 0, z), sp.get("stripe_col", acc), rig)
    if "spots" in ex:
        for k in range(6):
            ang = (k / 6 - 0.5) * 2.4
            z = bt * (0.2 + (k % 3) * 0.2)
            sph(f"Spot{k}", 0.035, (math.sin(ang) * rm * 0.95, math.cos(ang) * rm * 0.95, z), sp.get("spot_col", acc), rig,
                scale=(1, 0.4, 1))
    if "buttons" in ex:
        for k in range(3):
            sph(f"Button{k}", 0.022, (0, rm * 0.98, bt * (0.25 + k * 0.17)), sp.get("button_col", acc), rig)
    if "scarf" in ex:
        tor("Scarf", B["sx"] * 0.85, 0.045, (0, 0, bt - 0.02), sp.get("scarf_col", acc), rig)
        cone("ScarfTail", 0.045, 0.035, 0.2, (B["sx"] * 0.4, rm * 0.75, bt - 0.12), sp.get("scarf_col", acc), rig, rot=(0.25, 0, 0))
    if "bowtie" in ex:
        for s in (-1, 1):
            cone(f"Bowtie{s}", 0.05, 0.0, 0.08, (s * 0.04, B["rn"] + 0.02, bt - 0.06), sp.get("tie_col", "#B8322B"), rig,
                 rot=(0, s * -1.57, 0), scale=(1, 0.5, 1))
    if "tie" in ex:
        cube("Tie", (0.045, 0.02, 0.2), (0, B["rn"] + 0.03, bt - 0.13), sp.get("tie_col", "#B8322B"), rig)
    if "apron" in ex:
        sph("Apron", rm * 0.8, (0, rm * 0.55, bt * 0.38), sp.get("apron_col", "#F4EEE2"), rig, scale=(0.85, 0.3, 1.2))
    if "cape" in ex:
        # an elliptical cone shifted behind the body: its front half stays hidden inside the body
        cc = sp.get("cape_col", "#7A1E2A")
        cone("Cape", rm * 1.25, B["sx"] * 0.7, bt - 0.02, (0, -rm * 0.45, (bt - 0.02) / 2 + 0.02), cc, rig, scale=(1, 0.45, 1), verts=20)
        cone("Collar", B["sx"] * 0.95, B["sx"] * 0.75, 0.16, (0, -rm * 0.2, bt + 0.03), cc, rig, scale=(1, 0.7, 1), verts=16)
    if "necklace" in ex:
        for k in range(9):
            ang = (k / 8 - 0.5) * 2.6
            sph(f"Bead{k}", 0.018, (math.sin(ang) * B["sx"] * 0.8, math.cos(ang) * B["sx"] * 0.8, bt - 0.05 - math.cos(ang * 0.5) * 0.04),
                sp.get("bead_col", "#F4F2EC"), rig)
    if "collar" in ex:
        tor("Collar", B["sx"] * 0.82, 0.025, (0, 0, bt - 0.02), sp.get("collar_col", "#D6453D"), rig)
        sph("Tag", 0.03, (0, B["sx"] * 0.82, bt - 0.06), "#E5B84A", rig)
    if "medal" in ex:
        cone("Medal", 0.04, 0.04, 0.012, (rm * 0.3, rm * 0.9, bt * 0.75), "#E5B84A", rig, rot=(math.pi / 2, 0, 0), verts=16)
    if "bolts" in ex:
        for s in (-1, 1):
            cone(f"Bolt{s}", 0.025, 0.025, 0.12, (s * 0.12, 0, bt + 0.03), "#9A9AA2", rig, rot=(0, math.pi / 2, 0), verts=8)
    if "bandages" in ex:
        for k in range(6):
            tor(f"Wrap{k}", rm * (1.0 - abs(k - 2.5) * 0.04), 0.02, (0, 0, bt * (0.1 + k * 0.15)), "#E9E2CF", rig,
                rot=(0.15 * ((k % 2) * 2 - 1), 0, 0))
    if "shell" in ex:
        sph("Shell", rm * 1.05, (0, -rm * 0.55, bt * 0.5), sp.get("shell_col", "#6B8E3A"), rig, scale=(1.0, 0.75, 1.0))
        for k in range(5):
            ang = (k / 4 - 0.5) * 2.0
            sph(f"ShellPlate{k}", rm * 0.25, (math.sin(ang) * rm * 0.7, -rm * 1.1, bt * (0.35 + (k % 2) * 0.3)),
                shade(sp.get("shell_col", "#6B8E3A"), 1.25), rig, scale=(1, 0.3, 1))
    if "snail_shell" in ex:
        sph("Shell", rm * 1.1, (0, -rm * 0.7, bt * 0.7), sp.get("shell_col", "#C98A4A"), rig)
        tor("ShellSpiral", rm * 0.6, rm * 0.12, (rm * 0.95, -rm * 0.7, bt * 0.7), shade(sp.get("shell_col", "#C98A4A"), 0.7), rig,
            rot=(0, math.pi / 2, 0))
    if "backpack" in ex:
        cube("Backpack", (0.3, 0.16, 0.32), (0, -rm * 0.95, bt * 0.6), sp.get("pack_col", "#4F7A2C"), rig, bevel=0.03)
    if "fur" in ex:
        # tufts of fur: small soft lumps scattered on the body surface, a shade lighter/darker
        for k in range(18):
            ang = k / 18 * math.tau * 2.0 + (k % 3) * 0.4
            z = bt * (0.22 + (k % 4) * 0.17)
            sph(f"Fur{k}", rm * 0.16, (math.cos(ang) * rm * 0.93, math.sin(ang) * rm * 0.93, z), shade(oc, 1.08 if k % 2 else 0.92),
                rig, scale=(1, 1, 1.3), seg=10, rings=6)
    if "tentacles" in ex:
        for k in range(6):
            ang = k / 6 * math.tau
            cone(f"Tentacle{k}", 0.06, 0.012, 0.32, (math.cos(ang) * rm * 0.75, math.sin(ang) * rm * 0.75, 0.03), oc, rig,
                 rot=(math.sin(ang) * -1.3, math.cos(ang) * 1.3, 0), verts=8)
    if "jelly_tentacles" in ex:
        for k in range(7):
            ang = k / 7 * math.tau
            cone(f"Tendril{k}", 0.025, 0.006, 0.38, (math.cos(ang) * rm * 0.6, math.sin(ang) * rm * 0.6, -0.12), oc, rig,
                 kind=sp.get("kind", "trans"), verts=6)
    if "mug_handle" in ex:
        tor("MugHandle", 0.13, 0.035, (-(B["rm"] + 0.08), 0, 0.26), oc, rig, rot=(math.pi / 2, 0, 0))
    if "glow_belly" in ex:
        sph("GlowBelly", rm * 0.7, (0, -rm * 0.3, bt * 0.3), sp.get("glow_col", "#FFE36A"), rig, kind="glow")
    if "wings_fairy" in ex or "wings_bat" in ex or "wings_moth" in ex:
        kind = "trans" if "wings_fairy" in ex or "wings_moth" in ex else "toon"
        col = sp.get("wing_col", "#BFE6FF" if "wings_fairy" in ex else "#2A2033" if "wings_bat" in ex else "#D9CBA8")
        for side, s in (("L", -1), ("R", 1)):
            w = pivot(f"Wing{side}", (s * 0.06, -rm * 0.8, B["sz"]), rig)
            if "wings_bat" in ex:
                for k in range(3):
                    sph(f"Wing{side}M{k}", 0.16, (s * (0.12 + k * 0.08), -0.02, 0.02 - k * 0.04), col, w, scale=(0.9, 0.12, 0.65),
                        rot=(0, s * (0.3 + k * 0.25), 0))
            else:
                sph(f"Wing{side}Up", 0.2, (s * 0.15, -0.02, 0.1), col, w, scale=(1.0, 0.1, 1.35), rot=(0, s * -0.4, 0), kind=kind)
                sph(f"Wing{side}Low", 0.13, (s * 0.12, -0.02, -0.12), col, w, scale=(1.0, 0.1, 1.2), rot=(0, s * 0.5, 0), kind=kind)
            parts[f"Wing{side}"] = w
    if ex & {"tail", "tail_fluffy", "tail_ringed", "tail_fish", "tail_thin"}:
        t = pivot("Tail", (0, -rm * 0.92, 0.14), rig)
        tc = sp.get("tail_col", oc)
        if "tail_fluffy" in ex:
            sph("TailMesh", 0.12, (0, -0.12, 0.12), tc, t, scale=(0.75, 0.75, 1.4), rot=(-0.7, 0, 0))
            sph("TailTip", 0.07, (0, -0.2, 0.26), sp.get("tail_tip", "#FFFFFF"), t)
        elif "tail_ringed" in ex:
            for k in range(4):
                sph(f"TailRing{k}", 0.075 - k * 0.006, (0, -0.06 - k * 0.06, 0.05 + k * 0.08), tc if k % 2 == 0 else "#2A2A30", t)
        elif "tail_fish" in ex:
            cone("TailMesh", 0.08, 0.0, 0.22, (0, -0.1, 0.08), tc, t, rot=(-1.2, 0, 0), scale=(1, 0.35, 1))
        else:
            cone("TailMesh", 0.04, 0.012, 0.36, (0, -0.12, 0.15), tc, t, rot=(-0.8, 0, 0), verts=8)
            if "tail_thin" not in ex:
                sph("TailTip", 0.03, (0, -0.25, 0.3), tc, t)
        parts["Tail"] = t
    return parts


def feet(rig, B, sp):
    if not B["feet"] or sp.get("no_feet"):
        return
    c = sp.get("shoe_col", shade(sp["outfit"], 0.55))
    for s in (-1, 1):
        sph(f"Foot{s}", 0.075, (s * 0.1, 0.05, 0.03), c, rig, scale=(1, 1.4, 0.55))


# ------------------------------------------------------------------ animation
def kf(obj, f, loc=None, rot=None, scale=None):
    if loc is not None:
        obj.location = loc
        obj.keyframe_insert("location", frame=f)
    if rot is not None:
        obj.rotation_euler = rot
        obj.keyframe_insert("rotation_euler", frame=f)
    if scale is not None:
        obj.scale = scale
        obj.keyframe_insert("scale", frame=f)


def add(v, d):
    return tuple(a + b for a, b in zip(v, d))


def animate(root, parts, s, hover=False, tempo=1.0):
    objs = [root] + [p for p in parts.values() if p is not None]
    base = {o.name: (tuple(o.location), tuple(o.rotation_euler), tuple(o.scale)) for o in objs}
    T = int(2 * FPS / tempo)

    def side(n):
        return 1 if n.endswith("L") else -1

    def idle(n, o, L, R, S):
        if o is root:
            h = s * (0.08 if hover else 0.022)
            kf(o, 0, loc=L, rot=R, scale=S)
            kf(o, T // 2, loc=add(L, (0, 0, h)), rot=add(R, (0, 0, 0.04)), scale=(S[0], S[1], S[2] * 1.025))
            kf(o, T, loc=L, rot=R, scale=S)
        elif n == "Head":
            kf(o, 0, rot=R)
            kf(o, T // 2, rot=add(R, (0.05, 0.1, 0)))
            kf(o, T, rot=R)
        elif n.startswith("Arm"):
            sd = side(n)
            kf(o, 0, rot=add(R, (0, 0.06 * sd, 0)))
            kf(o, T // 2, rot=add(R, (0.1, 0.14 * sd, 0)))
            kf(o, T, rot=add(R, (0, 0.06 * sd, 0)))
        elif n.startswith("Wing"):
            sd = side(n)
            for f in range(0, T + 1, 3):
                kf(o, f, rot=add(R, (0, 0, (0.6 if (f // 3) % 2 else -0.1) * sd)))
        elif n == "Tail":
            kf(o, 0, rot=add(R, (0, 0, -0.25)))
            kf(o, T // 2, rot=add(R, (0, 0, 0.25)))
            kf(o, T, rot=add(R, (0, 0, -0.25)))
        elif n == "Mouth":
            kf(o, 0, scale=S)
            kf(o, T, scale=S)

    def happy(n, o, L, R, S):
        if o is root:
            kf(o, 0, loc=L, rot=R, scale=S)
            kf(o, 5, loc=L, rot=add(R, (0.1, 0, 0)), scale=(S[0] * 1.14, S[1] * 1.14, S[2] * 0.82))
            kf(o, 11, loc=add(L, (0, s * 0.06, s * 0.2)), rot=add(R, (-0.16, 0, 0)), scale=(S[0] * 0.92, S[1] * 0.92, S[2] * 1.16))
            kf(o, 17, loc=L, rot=add(R, (-0.06, 0, 0)), scale=(S[0] * 1.08, S[1] * 1.08, S[2] * 0.9))
            kf(o, 28, loc=L, rot=R, scale=S)
        elif n == "Head":
            kf(o, 0, rot=R)
            kf(o, 11, rot=add(R, (-0.22, 0, 0.12)))
            kf(o, 28, rot=R)
        elif n.startswith("Arm"):
            sd = side(n)
            kf(o, 0, rot=R)
            kf(o, 8, rot=add(R, (0.4, 0.6 * sd, 0)))
            for i, f in enumerate((12, 15, 18, 21)):
                kf(o, f, rot=add(R, (0.3, (2.5 if i % 2 == 0 else 2.15) * sd, 0)))
            kf(o, 28, rot=R)
        elif n.startswith("Wing"):
            sd = side(n)
            for f in range(0, 29, 2):
                kf(o, f, rot=add(R, (0, 0, (0.9 if (f // 2) % 2 else -0.2) * sd)))
        elif n == "Tail":
            for i, f in enumerate(range(0, 29, 3)):
                kf(o, f, rot=add(R, (0, 0, 0.45 if i % 2 else -0.45)))
        elif n == "Mouth":
            kf(o, 0, scale=S)
            kf(o, 8, scale=(S[0] * 1.6, S[1], S[2] * 2.2))
            kf(o, 24, scale=(S[0] * 1.6, S[1], S[2] * 2.2))
            kf(o, 28, scale=S)

    def meh(n, o, L, R, S):
        if o is root:
            kf(o, 0, loc=L, rot=R, scale=S)
            kf(o, 10, loc=add(L, (0, 0, -s * 0.04)), rot=add(R, (0.13, 0, 0)), scale=(S[0] * 1.04, S[1] * 1.04, S[2] * 0.94))
            kf(o, T - 8, loc=add(L, (0, 0, -s * 0.04)), rot=add(R, (0.13, 0, 0)), scale=(S[0] * 1.04, S[1] * 1.04, S[2] * 0.94))
            kf(o, T, loc=L, rot=R, scale=S)
        elif n == "Head":
            kf(o, 0, rot=R)
            for i, f in enumerate((10, 16, 22, 28, 34)):
                kf(o, f, rot=add(R, (0.15, 0, (0.3 if i % 2 == 0 else -0.3))))
            kf(o, T, rot=R)
        elif n.startswith("Arm"):
            sd = side(n)
            folded = add(R, (1.35, -0.25 * sd, 0.7 * sd))
            kf(o, 0, rot=R)
            kf(o, 10, rot=folded)
            kf(o, T - 8, rot=folded)
            kf(o, T, rot=R)
        elif n.startswith("Wing"):
            sd = side(n)
            kf(o, 0, rot=R)
            kf(o, 10, rot=add(R, (0, 0, -0.35 * sd)))
            kf(o, T, rot=R)
        elif n == "Tail":
            kf(o, 0, rot=R)
            kf(o, 10, rot=add(R, (0.5, 0, 0)))
            kf(o, T, rot=R)
        elif n == "Mouth":
            kf(o, 0, scale=S)
            kf(o, 8, scale=(S[0] * 1.2, S[1], S[2] * 0.35))
            kf(o, T - 6, scale=(S[0] * 1.2, S[1], S[2] * 0.35))
            kf(o, T, scale=S)

    def splashed(n, o, L, R, S):
        if o is root:
            kf(o, 0, loc=L, rot=R, scale=S)
            kf(o, 3, loc=add(L, (0, -s * 0.12, s * 0.04)), rot=add(R, (0.28, 0, 0)), scale=(S[0] * 0.92, S[1] * 0.92, S[2] * 1.1))
            for i, f in enumerate((10, 13, 16, 19, 22)):
                kf(o, f, loc=add(L, (0, -s * 0.06, 0)), rot=add(R, (0.1, 0, (0.18 if i % 2 == 0 else -0.18))), scale=S)
            kf(o, 30, loc=L, rot=R, scale=S)
        elif n == "Head":
            kf(o, 0, rot=R)
            kf(o, 3, rot=add(R, (0.3, 0, 0.35)))
            for i, f in enumerate((10, 13, 16, 19, 22)):
                kf(o, f, rot=add(R, (0.1, 0, (0.4 if i % 2 == 0 else -0.4))))
            kf(o, 30, rot=R)
        elif n.startswith("Arm"):
            sd = side(n)
            shield = add(R, (2.3, 0.3 * sd, -0.5 * sd))
            kf(o, 0, rot=R)
            kf(o, 3, rot=shield)
            kf(o, 9, rot=shield)
            kf(o, 14, rot=add(R, (0.5, 0.9 * sd, 0)))
            kf(o, 18, rot=add(R, (0.2, 0.5 * sd, 0)))
            kf(o, 30, rot=R)
        elif n.startswith("Wing"):
            sd = side(n)
            for f in range(0, 31, 2):
                kf(o, f, rot=add(R, (0, 0, (1.1 if (f // 2) % 2 else -0.3) * sd)))
        elif n == "Tail":
            kf(o, 0, rot=R)
            kf(o, 3, rot=add(R, (-0.6, 0, 0)))
            kf(o, 30, rot=R)
        elif n == "Mouth":
            kf(o, 0, scale=S)
            kf(o, 3, scale=(S[0] * 0.9, S[1], S[2] * 2.6))
            kf(o, 20, scale=(S[0] * 0.9, S[1], S[2] * 2.0))
            kf(o, 30, scale=S)

    for clip_name, fn in (("idle", idle), ("happy", happy), ("meh", meh), ("splashed", splashed)):
        for o in objs:
            if o.animation_data is None:
                o.animation_data_create()
            act = bpy.data.actions.new(f"{clip_name}_{o.name}")
            act.use_fake_user = True
            o.animation_data.action = act
            L, R, S = base[o.name]
            fn(o.name, o, L, R, S)
            o.location, o.rotation_euler, o.scale = L, R, S
            tr = o.animation_data.nla_tracks.new()
            tr.name = clip_name
            tr.strips.new(clip_name, 0, act)
            o.animation_data.action = None


# ------------------------------------------------------------------ assembly
def join_parts():
    groups = {}
    for o in list(bpy.context.scene.objects):
        if o.type != 'MESH' or o.name == "Mouth":
            continue
        groups.setdefault((o.parent.name if o.parent else "", o.data.materials[0].name), []).append(o)
    for (pname, mname), objs in groups.items():
        if len(objs) > 1:
            bpy.ops.object.select_all(action='DESELECT')
            for o in objs:
                o.select_set(True)
            bpy.context.view_layer.objects.active = objs[0]
            bpy.ops.object.join()
        bpy.context.view_layer.objects.active.name = f"{pname}_{mname}"


def build(sp):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _M.clear()
    cls = sp["cls"]
    H = HEIGHT[cls] * sp.get("scale", 1.0)
    root = bpy.data.objects.new(f"char_{sp['id']}", None)
    bpy.context.collection.objects.link(root)
    rig = pivot("Rig", (0, 0, 0), root)
    rig.scale = (H, H, H)
    hr = sp.get("hr", {"tall": 0.21, "small": 0.27, "floater": 0.22}[cls])
    B = body(rig, sp)
    G = head(rig, B, sp, hr)
    face(G, sp)
    ears(G, sp)
    hair(G, sp)
    hat(G, sp)
    feet(rig, B, sp)
    al, ar = arms(rig, B, sp, H)
    held(ar, sp)
    parts = {"Head": G["hp"], "ArmL": al, "ArmR": ar, "Mouth": bpy.data.objects["Mouth"]}
    parts.update(extras(rig, B, sp, G["hp"]))
    join_parts()
    hover = cls == "floater" or bool({"wings_fairy", "wings_moth"} & set(sp.get("extras", [])))
    animate(root, parts, H, hover=hover, tempo=sp.get("tempo", 1.0))
    bpy.context.scene.frame_set(0)
    raw = os.path.join(RAW_DIR, f"char_{sp['id']}_raw.glb")
    kw = dict(filepath=raw, export_format='GLB', export_animation_mode='NLA_TRACKS', export_extras=False)
    try:
        bpy.ops.export_scene.gltf(**kw, export_frame_step=2, export_optimize_animation_size=True, export_texcoords=False)
    except TypeError:
        bpy.ops.export_scene.gltf(**kw)
    meshes = sum(1 for o in bpy.context.scene.objects if o.type == 'MESH')
    return meshes, os.path.getsize(raw)


def C(id, name, cls, body, skin, outfit, line, **kw):
    d = dict(id=id, name=name, cls=cls, body=body, skin=skin, outfit=outfit, line=line)
    d.update(kw)
    return d


# =================================================================== ROSTERS (30 per location)
# Colour shorthands
SKIN = ["#F2C9A8", "#E3AE8E", "#C98B66", "#A8714E", "#8D5A3B", "#6B4430"]

ROSTERS = {
    "cafe": [
        C("giant", "The Gentle Giant", "tall", "stocky", "#8BA872", "#6E8F5A", "The biggest mug you have, please!",
          ears="round", nose="round", scarf_col="#C9573F", extras=["scarf", "belly"], scale=1.08, eyes="dot"),
        C("fairy", "Pip the Fairy", "small", "slim", "#F7D5C4", "#E07FB8", "Just a tiny drop... exactly to the line!",
          hair="bun", hair_col="#F3C04B", hat="flower", hat_col="#FF8FB3", hat_accent="#FFF2A8", extras=["wings_fairy"],
          eyes="big", blush=True),
        C("ghost", "Boo", "floater", "sheet", "#E4E9FA", "#E4E9FA", "Boo... I mean, hello. Something warm?",
          eyes="dot", eye_col="#232035", blush=True, arms="normal", holds="lantern", hand="#E4E9FA"),
        C("wizard", "Old Merlo", "tall", "robe", "#E9C2A4", "#3C2E85", "Pour wisely, young barista.",
          hat="wizard", hat_col="#3C2E85", facial="long_beard", hair_col="#F4F4F8", nose="round", holds="staff"),
        C("owl_professor", "Professor Hoot", "tall", "round", "#8A6A4A", "#8A6A4A", "Precisely 0.78 of a cup, if you please.",
          eyes="big", eye_col="#2A1A10", eyewear="glasses", nose="beak", ears="tufts", arms="wing", accent="#6B4E34",
          extras=["belly", "bowtie"], belly_col="#EADBC0"),
        C("cat_poet", "Noir the Poet", "tall", "slim", "#2B2B33", "#2B2B33", "Pour me something... melancholic.",
          ears="pointy", ear_inner="#E58FA0", nose="button", eyes="big", eye_col="#C9A83A", hat="beret", hat_col="#B8322B",
          extras=["scarf", "tail"], scarf_col="#E8DCC0", whiskers=True),
        C("raccoon", "Bandit", "tall", "pear", "#8A8F99", "#5E7FA8", "I'm not stealing the coaster. Probably.",
          eyes="mask", ears="round", nose="snout", muzzle="#D9DCE0", hat="beanie", hat_col="#2A2430", hat_accent="#D6453D",
          extras=["tail_ringed"], tail_col="#8A8F99"),
        C("fox_detective", "Inspector Vix", "tall", "slim", "#D9733A", "#8A6A4A", "The clue is in the foam.",
          ears="pointy", nose="snout", muzzle="#F4E6D8", hat="deerstalker", hat_col="#8A6A4A", eyewear="monocle",
          extras=["tail_fluffy", "buttons"], tail_col="#D9733A"),
        C("vampire", "Count Velour", "tall", "slim", "#E8E2F0", "#1E1A22", "Something red. Just to look at.",
          hair="slick", hair_col="#1E1A22", fangs=True, extras=["cape", "bowtie"], cape_col="#7A1E2A", eyes="dot", eye_col="#7A1E2A"),
        C("student", "Sleepy Sam", "tall", "pear", SKIN[2], "#4F7A2C", "Exams tomorrow. Make it strong.",
          hair="curly", hair_col="#3B2418", eyes="sleepy", hat="headphones", hat_col="#2A2430", hat_accent="#D6453D", holds="book"),
        C("jazz", "Smooth Lou", "tall", "slim", SKIN[4], "#24304F", "One more for the last set.",
          hat="fedora", hat_col="#1E1A22", hat_accent="#C9573F", facial="mustache", hair_col="#1E1A22", extras=["bowtie"]),
        C("moth", "Lumi the Moth", "small", "round", "#CFC3A8", "#CFC3A8", "Is that a lamp? Oh. Oh, it's lovely.",
          eyes="big", hat="antennae", hat_col="#5A4A3A", hat_accent="#CFC3A8", extras=["wings_moth", "fur"], arms="normal"),
        C("mouse_chef", "Chef Crumb", "small", "pear", "#B8B0A8", "#F4EEE2", "A thimble of cream. For research.",
          ears="big_round", ear_inner="#F2B5C0", nose="button", hat="chef", extras=["apron", "tail_thin"], tail_col="#E8A0A8",
          whiskers=True),
        C("robot", "Unit B-12", "tall", "box", "#9AA7B5", "#7E8A99", "Beep. Optimal fill level requested.",
          head="box", eyes="visor", eye_col="#5FE3FF", hat="antennae", hat_col="#5E6670", hat_accent="#D6453D", glow_tips=True,
          extras=["bolts", "buttons"], hand="#5E6670"),
        C("astronomer", "Stella", "tall", "robe", SKIN[1], "#24304F", "Pour it like a shooting star.",
          hair="long", hair_col="#D9D9E8", eyewear="glasses", extras=["spots"], spot_col="#FFE07A", holds="spyglass"),
        C("firefly", "Flick", "small", "round", "#3A3428", "#3A3428", "Bzzt! Half caf, half glow.",
          eyes="big", hat="antennae", hat_col="#3A3428", hat_accent="#FFE36A", glow_tips=True, extras=["wings_fairy", "glow_belly"]),
        C("moon_rabbit", "Mochi", "tall", "pear", "#F2EEE8", "#F2EEE8", "Under a full moon, everything tastes sweeter.",
          ears="long", ear_inner="#F2B5C0", nose="button", blush=True, extras=["scarf"], scarf_col="#5E7FA8", eyes="big"),
        C("nurse", "Night Nurse Ana", "tall", "pear", SKIN[1], "#F4F4F8", "Twelve-hour shift. Fill it up.",
          hair="bun", hair_col="#5A3A28", hat="nurse", eyes="dot", extras=["buttons"], button_col="#5E7FA8"),
        C("taxi", "Rocco the Cabbie", "tall", "stocky", SKIN[2], "#E8B83A", "Meter's running, pal. Quick one.",
          hat="cap", hat_col="#2A2430", hat_accent="#E8B83A", bill_accent=True, facial="mustache", hair_col="#2A2018", nose="round"),
        C("bear_nightcap", "Barnaby", "tall", "stocky", "#7A5236", "#7A5236", "Warm milk. With honey. Lots.",
          ears="round", nose="snout", muzzle="#C9A27E", hat="nightcap", hat_col="#5E7FA8", hat_accent="#F4F4F8", eyes="sleepy",
          extras=["belly"], belly_col="#C9A27E"),
        C("sleepwalker", "Dozy Dot", "tall", "pear", SKIN[0], "#A9C7E8", "Zzz... same as yesterday... zzz.",
          hat="nightcap", hat_col="#A9C7E8", hat_accent="#F4F4F8", eyes="closed", extras=["spots"], spot_col="#F4F4F8"),
        C("crow", "Corvin", "tall", "slim", "#23263A", "#23263A", "Shiny glass. I approve.",
          nose="beak", nose_col="#E8B83A", arms="wing", accent="#1A1C2A", hat="top", hat_col="#1A1C2A", hat_accent="#7A1E2A",
          eyewear="monocle", eyes="dot", eye_col="#E8E2F0"),
        C("mime", "Marcel", "tall", "slim", "#F4F1EE", "#F4F4F8", "...",
          hat="beret", hat_col="#1E1A22", extras=["stripes"], stripe_col="#1E1A22", facial="mustache", hair_col="#1E1A22",
          mouth_col="#B8322B"),
        C("apprentice_witch", "Hazel", "tall", "robe", SKIN[0], "#3F6B4A", "Not too much! Last time the cauldron exploded.",
          hat="witch", hat_col="#2A2430", hat_accent="#7C4BB8", hair="long", hair_col="#D9733A", blush=True),
        C("werewolf", "Sir Howl", "tall", "stocky", "#6E6A70", "#4A3A5A", "Full moon tonight. Make it a double.",
          ears="pointy", nose="snout", muzzle="#A9A4AC", fangs=True, extras=["bowtie", "fur"], eyes="dot", eye_col="#E8B83A"),
        C("snail", "Shelly", "small", "slim", "#9FC46A", "#9FC46A", "No rush. Take your time. Really.",
          eyes="stalk", extras=["snail_shell"], arms="none", tempo=0.7),
        C("radio_host", "DJ Night", "tall", "pear", SKIN[3], "#7C4BB8", "You're live on Midnight FM!",
          hat="headphones", hat_col="#1E1A22", hat_accent="#7C4BB8", eyewear="shades", hair="mohawk", hair_col="#1E1A22"),
        C("cloud", "Nimbus", "floater", "blob", "#F4F4FA", "#F4F4FA", "Feeling a little drizzly tonight.",
          eyes="sleepy", blush=True, extras=["fur"], arms="none"),
        C("gnome", "Pebble", "small", "robe", "#F2C9A8", "#B8322B", "Ho! A gnome-sized pour, please.",
          hat="party", hat_col="#B8322B", hat_accent="#F4F4F8", facial="long_beard", hair_col="#F4F4F8", nose="round"),
        C("bat", "Velvet", "small", "round", "#4A3A5A", "#4A3A5A", "Upside-down service, if possible.",
          ears="pointy", fangs=True, extras=["wings_bat"], eyes="big", arms="none"),
    ],
    "beach": [
        C("surfer", "Kai the Surfer", "tall", "pear", SKIN[2], "#3FB2A0", "Duuude. Fill it like a perfect wave.",
          hair="long", hair_col="#E8C877", eyewear="shades", extras=["necklace"], bead_col="#F2C2A8"),
        C("crab_mister", "Mister Crab", "small", "round", "#E0563F", "#E0563F", "Snip snip! Precisely, please.",
          eyes="stalk", arms="claw", facial="mustache", hair_col="#7A2A1E"),
        C("mermaid", "Marina", "tall", "mermaid", SKIN[1], "#3FB2A0", "Salt water? No thanks. Something sparkly.",
          hair="long", hair_col="#2F9E95", hat="flower", hat_col="#F2C2A8", hat_accent="#FFE07A", accent="#2F9E95",
          extras=["necklace"], bead_col="#F4F2EC", holds="pearl"),
        C("seagull", "Gully", "small", "round", "#F4F4F8", "#F4F4F8", "Mine? Mine? Mine!",
          nose="beak", nose_col="#F2B23A", arms="wing", accent="#B8BCC4", hat="cap", hat_col="#24304F", hat_accent="#F4F4F8"),
        C("turtle", "Old Tortuga", "tall", "stocky", "#7FA05A", "#7FA05A", "Slowly now. The best drinks take their time.",
          extras=["shell", "belly"], belly_col="#E8D9A8", hat="straw", eyewear="glasses", tempo=0.7),
        C("octopus", "Inka", "tall", "blob", "#9A63E0", "#9A63E0", "I'll take eight. Kidding. One.",
          eyes="big", arms="tentacle", accent="#F2C2D8", extras=["tentacles"], scale=1.1, hr=0.28),
        C("lifeguard", "Coral", "tall", "pear", SKIN[4], "#D6453D", "No splashing on my watch!",
          hair="bun", hair_col="#2A1A10", eyewear="shades", extras=["necklace"], bead_col="#F4F4F8"),
        C("tourist", "Gary", "tall", "stocky", "#F2B9A0", "#3FB2A0", "Is this the famous bar? Selfie first!",
          hat="straw", eyewear="shades", blush=True, blush_col="#E86A5A", extras=["spots"], spot_col="#F2D36B"),
        C("dolphin", "Splash", "tall", "slim", "#7FA6C8", "#7FA6C8", "Eee-eee! (That means 'extra bubbles'.)",
          nose="long_snout", muzzle="#B8D0E4", arms="fin", extras=["belly", "tail_fish"], belly_col="#E4EEF6", eyes="big"),
        C("shark", "Finn", "tall", "stocky", "#7E8A99", "#7E8A99", "I promise I only bite the lime.",
          hat="dorsal", fangs=True, extras=["belly", "bowtie"], belly_col="#F4F4F8", arms="fin", eyes="dot"),
        C("parrot", "Polly", "small", "round", "#4FB83A", "#4FB83A", "Polly wants a perfect pour!",
          nose="beak", nose_col="#2A2A30", arms="wing", accent="#4FB0E0", hair="mohawk", hair_col="#E0463A",
          extras=["belly"], belly_col="#E0463A", eyes="big"),
        C("coconut", "Coco", "small", "round", "#7A5236", "#7A5236", "Put a little umbrella in it?",
          eyes="big", hat="antennae", hat_col="#F2D36B", hat_accent="#D6453D", arms="none", extras=["fur"]),
        C("pineapple", "Pina", "small", "pear", "#E8B83A", "#E8B83A", "Something tropical. Shocking, I know.",
          hair="leaves", hair_col="#4F9A3A", eyewear="shades", extras=["spots"], spot_col="#B8862A"),
        C("flamingo", "Rosa", "tall", "slim", "#F29BB8", "#F29BB8", "Pink, please. Everything pink.",
          nose="beak", nose_col="#2A2A30", arms="wing", accent="#E07FA0", hat="straw", hat_accent="#F29BB8", scale=1.05),
        C("hermit", "Hermie", "small", "slim", "#E8803A", "#E8803A", "Nice glass. Is it... available? To live in?",
          eyes="stalk", arms="claw", extras=["snail_shell"], shell_col="#F2E2C8"),
        C("sand_knight", "Sir Sandy", "tall", "box", "#E2C48A", "#E2C48A", "I hold this beach until high tide!",
          head="box", hat="helmet", hat_col="#D9B878", hat_accent="#D6453D", eyes="dot"),
        C("starfish", "Starla", "small", "round", "#F28A4A", "#F28A4A", "I'm a star. Pour like it.",
          extras=["spots"], spot_col="#FFD9B8", hat="bow", hat_col="#E8423A", eyes="big", blush=True),
        C("otter", "Otto", "tall", "pear", "#8A6040", "#8A6040", "I brought my own shell. Fill it?",
          ears="round", nose="snout", muzzle="#E2C8A8", whiskers=True, extras=["belly", "tail"], belly_col="#E2C8A8", holds="shell"),
        C("surfer_girl", "Leilani", "tall", "slim", SKIN[3], "#F28A4A", "Sunset's in five. Make it golden.",
          hair="long", hair_col="#2A1A10", hat="flower", hat_col="#F29BB8", hat_accent="#FFE07A"),
        C("jellyfish", "Jello", "floater", "sheet", "#F2A6D8", "#F2A6D8", "Bloop. Something wobbly, please.",
          eyes="dot", blush=True, extras=["jelly_tentacles"], arms="none", kind="trans"),
        C("pelican", "Pete", "tall", "round", "#F4F4F8", "#F4F4F8", "I'll hold it in my beak for later.",
          nose="beak", nose_col="#F28A2A", arms="wing", accent="#D9DCE0", hat="cap", hat_col="#3FB2A0", hat_accent="#F4F4F8"),
        C("beach_bum", "Dude Rick", "tall", "stocky", SKIN[1], "#F4F4F8", "Whatever's coldest, man.",
          hat="bandana", hat_col="#3FB2A0", facial="beard", hair_col="#8A6040", eyewear="shades"),
        C("gelato", "Gelato Gina", "tall", "pear", SKIN[1], "#F29BB8", "You pour, I scoop. Deal?",
          hat="cap", hat_col="#F4F4F8", extras=["stripes", "apron"], stripe_col="#F4F4F8", hair="bob", hair_col="#3B2418"),
        C("seal", "Sealy", "tall", "round", "#9AA0A8", "#9AA0A8", "Arf! Arf! (Two please.)",
          nose="button", nose_col="#2A2A30", whiskers=True, arms="fin", eyes="big", extras=["belly"], belly_col="#C8CCD2"),
        C("sun", "Sunny", "floater", "blob", "#FFD24A", "#FFD24A", "Don't mind me, just warming up.",
          eyewear="shades", blush=True, arms="none", extras=["fur"], kind="toon"),
        C("puffer", "Puff", "small", "round", "#F2D36B", "#F2D36B", "Don't startle me. I puff.",
          eyes="big", arms="fin", hair="spiky", hair_col="#E8B83A", extras=["spots"], spot_col="#C8862A"),
        C("walrus", "Wally", "tall", "stocky", "#9A6A4A", "#9A6A4A", "Splendid evening for a tall one.",
          tusks=True, facial="mustache", hair_col="#7A5236", whiskers=True, arms="fin", hat="bow", hat_col="#24304F"),
        C("scuba", "Diver Dee", "tall", "pear", SKIN[2], "#1E1A22", "Down the hatch. Like a dive.",
          eyewear="goggles", extras=["stripes", "backpack"], stripe_col="#E8B83A", pack_col="#E8B83A", hair="bob", hair_col="#2A1A10"),
        C("palm_spirit", "Palmy", "floater", "sheet", "#9FD46A", "#9FD46A", "Rustle rustle. A coconut water?",
          hair="leaves", hair_col="#4F9A3A", eyes="big", kind="toon"),
        C("lobster", "Lord Lobster", "tall", "stocky", "#D6453D", "#D6453D", "A refined pour for a refined crustacean.",
          arms="claw", hat="top", hat_col="#1E1A22", hat_accent="#E5B84A", eyewear="monocle", facial="mustache", hair_col="#8A2A1E",
          eyes="stalk"),
    ],
    "chalet": [
        C("yeti", "The Yeti", "tall", "stocky", "#9FB4C8", "#EEF2F6", "Something warm. I'm always cold. Ironically.",
          extras=["fur"], hat="horns", horn_col="#E8E2D2", nose="round", scale=1.08),
        C("skier", "Ski Sam", "tall", "pear", SKIN[1], "#D6453D", "Fresh powder out there! Pour me some.",
          hat="beanie", hat_col="#F4F4F8", hat_accent="#D6453D", eyewear="goggles", extras=["scarf"], scarf_col="#F4F4F8"),
        C("grandma_bear", "Grandma Bear", "tall", "stocky", "#8A6040", "#C9A0C8", "Oh, sweetie, just to the line.",
          ears="round", nose="snout", muzzle="#D9B898", hair="bun", hair_col="#D9D9E0", eyewear="glasses", extras=["apron", "scarf"],
          scarf_col="#8A5A9A"),
        C("penguin", "Pengo", "small", "round", "#23263A", "#23263A", "Brrr. Something hot. Very hot.",
          nose="beak", nose_col="#F2A23A", arms="fin", extras=["belly", "scarf"], belly_col="#F4F4F8", scarf_col="#D6453D"),
        C("arctic_fox", "Frost", "tall", "slim", "#F4F4F8", "#F4F4F8", "Cocoa. Extra marshmallows. Don't judge.",
          ears="pointy", nose="snout", muzzle="#FFFFFF", extras=["tail_fluffy", "scarf"], scarf_col="#4FB0E0", eyes="big", eye_col="#2A6AA0"),
        C("moose", "Mister Moose", "tall", "stocky", "#7A5236", "#7A5236", "Mind the antlers, I always do.",
          hat="antlers", nose="snout", muzzle="#5A3A28", extras=["bowtie"], tie_col="#3F6B4A"),
        C("snowman", "Frosty Fred", "tall", "snowman", "#F4F6FA", "#F4F6FA", "Nothing too warm! I'm fragile.",
          nose="carrot", hat="top", hat_col="#1E1A22", hat_accent="#D6453D", extras=["scarf", "buttons"], button_col="#1E1A22",
          eyes="dot", arms="normal", hand="#5A3A28", sleeve="#5A3A28"),
        C("reindeer", "Rudi", "tall", "slim", "#8A6040", "#8A6040", "Long night of deliveries ahead.",
          hat="antlers", nose="snout", muzzle="#C9A27E", nose_col="#E8423A", extras=["collar"], collar_col="#D6453D"),
        C("mountaineer", "Edmund", "tall", "stocky", SKIN[1], "#E8803A", "Summit tomorrow. Fuel me up.",
          hat="beanie", hat_col="#3F6B4A", facial="beard", hair_col="#8A5A3A", extras=["backpack"], eyewear="goggles"),
        C("snowy_owl", "Snowy", "small", "round", "#F4F4F8", "#F4F4F8", "Hoo... hoo's pouring tonight?",
          eyes="big", eye_col="#E8B83A", nose="beak", nose_col="#2A2A30", ears="tufts", arms="wing", accent="#D9DCE0",
          extras=["spots"], spot_col="#2A2A30"),
        C("hot_cocoa", "Cocoa", "small", "cup", "#7A4A2A", "#E8DCC8", "Am I... a drink ordering a drink?",
          hat="marshmallow", extras=["mug_handle"], arms="none", eyes="big", blush=True),
        C("lumberjack", "Big Jack", "tall", "stocky", SKIN[1], "#B8322B", "Chopped wood all day. Pour a tall one.",
          hat="beanie", hat_col="#B8322B", hat_accent="#1E1A22", facial="beard_mustache", hair_col="#6B3A1E",
          extras=["stripes"], stripe_col="#1E1A22"),
        C("skater", "Glide", "tall", "slim", SKIN[0], "#9FD8F0", "One perfect spin. One perfect pour.",
          hair="bun", hair_col="#E8C877", hat="earmuffs", hat_col="#F4F4F8", hat_accent="#9FD8F0", blush=True),
        C("snow_hare", "Snow Hare", "tall", "pear", "#F4F4F8", "#F4F4F8", "Quick quick! Before I hop off!",
          ears="long", ear_inner="#F2C2C8", nose="button", extras=["scarf"], scarf_col="#7C4BB8", eyes="big", tempo=1.3),
        C("wolf", "Lupo", "tall", "stocky", "#7E8A99", "#7E8A99", "Ahh-wooo. Warm cider, please.",
          ears="pointy", nose="snout", muzzle="#D9DCE0", extras=["scarf", "tail_fluffy"], scarf_col="#D6453D", tail_col="#7E8A99"),
        C("polar_bear", "Polar Pat", "tall", "stocky", "#F4F2EC", "#F4F2EC", "Ice? No thanks. Plenty outside.",
          ears="round", nose="snout", muzzle="#FFFFFF", nose_col="#1E1A22", hat="beanie", hat_col="#D6453D", hat_accent="#F4F4F8"),
        C("husky", "Husk", "tall", "pear", "#7E8A99", "#7E8A99", "Pulled a sled all day. Woof.",
          ears="pointy", nose="snout", muzzle="#F4F4F8", eyes="big", eye_col="#4FB0E0", extras=["collar", "belly", "tail_fluffy"],
          belly_col="#F4F4F8"),
        C("alp_gnome", "Alpi", "small", "robe", "#F2C9A8", "#3F6B4A", "A tiny schnapps of cocoa, ja?",
          hat="party", hat_col="#3F6B4A", hat_accent="#D6453D", facial="long_beard", hair_col="#F4F4F8", nose="round"),
        C("mountain_goat", "Billy", "tall", "slim", "#E8E2D2", "#E8E2D2", "Climbed up here for this. Worth it?",
          hat="horns", horn_col="#8A7A6A", facial="goatee", hair_col="#B8B0A0", extras=["collar"], collar_col="#E5B84A"),
        C("snowflake", "Flurry", "small", "round", "#DDF2FF", "#DDF2FF", "Chill. Literally.",
          extras=["wings_fairy"], hat="halo", eyes="big", eye_col="#2A6AA0", blush=True, kind="toon"),
        C("old_skier", "Old Olaf", "tall", "pear", SKIN[0], "#24304F", "In my day we skied uphill. Both ways.",
          hat="beanie", hat_col="#D6453D", hat_accent="#F4F4F8", facial="beard_mustache", hair_col="#D9D9E0", eyewear="glasses"),
        C("baker", "Strudel Sue", "tall", "pear", SKIN[1], "#E8803A", "Fresh strudel, fresh pour. Perfect.",
          hat="chef", extras=["apron"], hair="bob", hair_col="#8A5A3A", blush=True),
        C("ice_golem", "Glacier", "tall", "box", "#BFE6FF", "#BFE6FF", "Cold. Clear. Precise.",
          head="box", eyes="glow", eye_col="#5FE3FF", kind="trans", head_kind="trans", hand="#BFE6FF", scale=1.05),
        C("cuckoo", "Kuku", "small", "round", "#F2D36B", "#F2D36B", "Cuckoo! It's pouring o'clock!",
          nose="beak", arms="wing", accent="#E8B83A", eyes="big", hair="tuft", hair_col="#E8803A"),
        C("ermine", "Ermin", "small", "slim", "#F4F4F8", "#F4F4F8", "A small, elegant measure.",
          ears="round", nose="button", nose_col="#1E1A22", extras=["tail_thin"], tail_col="#1E1A22", eyes="big"),
        C("snowboarder", "Shred", "tall", "slim", SKIN[3], "#9AE03A", "Gnarly night. Fill it to the line, bro.",
          hat="beanie", hat_col="#1E1A22", hat_accent="#9AE03A", eyewear="shades"),
        C("yodeler", "Heidi", "tall", "pear", SKIN[0], "#D6453D", "Yodel-ay-hee-hoo! One cocoa!",
          hair="braids", hair_col="#E8C877", extras=["apron"], apron_col="#F4F4F8", hat="flower", hat_col="#F4F4F8",
          hat_accent="#E8423A", blush=True),
        C("st_bernard", "Bernie", "tall", "stocky", "#9A5A2A", "#F4F2EC", "I carry rescue cocoa. You carry the rest.",
          ears="floppy", ear_col="#9A5A2A", nose="snout", muzzle="#F4F2EC", extras=["collar", "backpack"], pack_col="#9A5A2A",
          collar_col="#D6453D"),
        C("aurora", "Aurora", "floater", "sheet", "#8AF0C8", "#8AF0C8", "Shimmer... shimmer... a green tea?",
          eyes="glow", eye_col="#E8F8FF", kind="trans", hat="halo"),
        C("marmot", "Marty", "small", "round", "#9A6A4A", "#9A6A4A", "I just woke up. Is it spring?",
          ears="round", nose="button", teeth=True, eyes="sleepy", extras=["belly"], belly_col="#D9B898"),
    ],
    "fair": [
        C("clown", "Bobo", "tall", "pear", "#F4F1EE", "#E8423A", "Honk honk! Make it fizzy!",
          nose="round", nose_col="#E8423A", hair="curly", hair_col="#F28A2A", hat="party", hat_col="#4FB0E0", hat_accent="#F2D36B",
          extras=["spots", "buttons"], spot_col="#F2D36B", blush=True),
        C("acrobat", "Aria", "tall", "slim", SKIN[1], "#9A63E0", "I'll balance it on my nose afterwards.",
          hair="bun", hair_col="#2A1A10", extras=["spots"], spot_col="#FFE07A", blush=True),
        C("juggler", "Juno", "tall", "pear", SKIN[2], "#E8B83A", "Three glasses in the air, one on the counter.",
          hat="party", hat_col="#7C4BB8", hat_accent="#E8B83A", extras=["stripes"], stripe_col="#7C4BB8", holds="balloon"),
        C("strongman", "Brutus", "tall", "stocky", SKIN[2], "#F4F4F8", "I'll lift the glass. You pour.",
          facial="mustache", hair="slick", hair_col="#1E1A22", extras=["stripes", "belly"], stripe_col="#D6453D", scale=1.08),
        C("fortune_teller", "Madame Zora", "tall", "robe", SKIN[3], "#7C4BB8", "I see... a perfect pour in your future.",
          hat="bandana", hat_col="#D6453D", bandana_dots=True, hair="long", hair_col="#1E1A22", holds="orb", orb_col="#C9A0FF",
          extras=["necklace"], bead_col="#E5B84A"),
        C("magician", "The Great Ozzo", "tall", "slim", SKIN[0], "#1E1A22", "Watch closely... nothing up my sleeve.",
          hat="top", hat_col="#1E1A22", hat_accent="#D6453D", facial="mustache", hair_col="#1E1A22", extras=["cape", "bowtie"],
          cape_col="#24304F", holds="wand"),
        C("balloon_dog", "Twisty", "small", "round", "#F29BB8", "#F29BB8", "Squeak squeak! (Careful, I pop.)",
          ears="long", nose="round", nose_col="#F29BB8", extras=["tail"], tail_col="#F29BB8", eyes="dot"),
        C("popcorn", "Pop", "small", "cup", "#FFF1C2", "#E8423A", "Salty or sweet? Both!",
          hat="marshmallow", extras=["stripes"], stripe_col="#F4F4F8", arms="none", eyes="big"),
        C("cotton_candy", "Fluff", "floater", "blob", "#F7B8D8", "#F7B8D8", "Sugar, sugar, sugar!",
          extras=["fur"], eyes="big", blush=True, arms="none"),
        C("kid", "Timmy", "tall", "pear", SKIN[0], "#4FB0E0", "Can I have the BIG cup? Pleeeease?",
          hat="cap", hat_col="#D6453D", hat_accent="#D6453D", blush=True, scale=0.88, holds="balloon", orb_col="#4FB0E0"),
        C("ringmaster", "Ringo", "tall", "pear", SKIN[1], "#D6453D", "Ladies and gentlemen... the POUR!",
          hat="top", hat_col="#1E1A22", hat_accent="#E5B84A", facial="mustache", hair_col="#2A1A10", extras=["buttons"],
          button_col="#E5B84A"),
        C("lion", "Leo", "tall", "stocky", "#E8B85A", "#E8B85A", "A roaring good drink, please.",
          hair="mane", hair_col="#B8622A", nose="snout", muzzle="#F4E2B8", extras=["bowtie", "tail"], tail_col="#E8B85A"),
        C("elephant", "Ellie", "tall", "stocky", "#9AA0A8", "#9AA0A8", "I never forget a good pour.",
          ears="huge", nose="trunk", hat="party", hat_col="#E8423A", hat_accent="#F2D36B", scale=1.05),
        C("monkey", "Mojo", "tall", "pear", "#8A5A3A", "#8A5A3A", "Ooh ooh! Banana flavour?",
          ears="big_round", ear_inner="#E2C8A8", nose="snout", muzzle="#E2C8A8", hat="fez", hat_col="#D6453D", extras=["tail"]),
        C("robot_toy", "Tinny", "tall", "box", "#D6453D", "#D6453D", "Wind me up and pour me one!",
          head="box", eyes="dot", hat="antennae", hat_col="#E5B84A", hat_accent="#F2D36B", extras=["buttons", "bolts"],
          button_col="#F2D36B", hand="#E5B84A"),
        C("teddy", "Teddy Prize", "small", "round", "#F29BB8", "#F29BB8", "I'm the grand prize. Treat me nice.",
          ears="round", nose="snout", muzzle="#FFE0EA", hat="bow", hat_col="#4FB0E0", extras=["belly"]),
        C("duck_toy", "Ducky", "small", "round", "#F2D36B", "#F2D36B", "Quack. Floats well. Pours better.",
          nose="beak", arms="wing", accent="#E8B83A", eyes="dot", hair="tuft", hair_col="#F2D36B"),
        C("hotdog", "Hot Dog Hal", "tall", "slim", "#C9603A", "#E8B87A", "Mustard on the side of my glass?",
          extras=["stripes"], stripe_col="#F2D36B", eyes="big", blush=True),
        C("tightrope", "Tilly", "tall", "slim", SKIN[0], "#4FB0E0", "Steady... steady... perfect.",
          hat="bow", hat_col="#E8423A", hair="bob", hair_col="#E8C877", extras=["spots"], spot_col="#F4F4F8"),
        C("fire_breather", "Blaze", "tall", "stocky", SKIN[3], "#1E1A22", "Something cold. VERY cold.",
          hat="flame", eyes="dot", facial="goatee", hair_col="#1E1A22", extras=["stripes"], stripe_col="#E8803A"),
        C("stilts", "Long Larry", "tall", "slim", SKIN[1], "#E8423A", "Hello from up here!",
          hat="top", hat_col="#E8423A", hat_accent="#F4F4F8", extras=["stripes"], stripe_col="#F4F4F8", scale=1.15),
        C("ghost_train", "Spooky Sue", "floater", "sheet", "#F7C98A", "#F7C98A", "Boo! Did I scare you? A little?",
          eyes="glow", eye_col="#2A1A10", kind="trans", hat="bow", hat_col="#7C4BB8"),
        C("carousel_horse", "Prancer", "tall", "slim", "#F4F2EC", "#F4F2EC", "Round and round... then a drink.",
          ears="pointy", nose="long_snout", muzzle="#F4F2EC", hair="mohawk", hair_col="#F29BB8", extras=["collar"],
          collar_col="#E5B84A"),
        C("ticket_taker", "Tess", "tall", "pear", SKIN[2], "#24304F", "Ticket? Kidding. Pour away.",
          hat="cap", hat_col="#24304F", hat_accent="#E5B84A", eyewear="glasses", extras=["buttons"]),
        C("cupcake", "Sprinkles", "small", "cup", "#F7B8D8", "#F2D3A8", "I'm sweet enough already, but okay.",
          extras=["spots"], spot_col="#4FB0E0", hat="marshmallow", arms="none", eyes="big", blush=True),
        C("alien_prize", "Zib", "small", "round", "#7FE07A", "#7FE07A", "Greetings. Your liquid is... fascinating.",
          eyes="three", hat="antennae", hat_col="#7FE07A", hat_accent="#F2D36B", glow_tips=True),
        C("pierrot", "Pierrot", "tall", "slim", "#F4F1EE", "#F4F4F8", "Sigh... make it a happy one.",
          eyes="closed", extras=["buttons", "spots"], button_col="#1E1A22", hat="beret", hat_col="#F4F4F8", mouth_col="#3A3A50"),
        C("bumper_bear", "Bumper", "tall", "stocky", "#4FB0E0", "#4FB0E0", "Bump! Oops. Sorry. Pour please.",
          ears="round", nose="snout", hat="propeller", hat_col="#F2D36B", hat_accent="#1E1A22"),
        C("lantern_spirit", "Glim", "floater", "blob", "#FFB547", "#FFB547", "I light up when the pour is right.",
          eyes="big", blush=True, arms="none", hat="flame"),
        C("pretzel", "Pretzel Pete", "tall", "stocky", SKIN[1], "#C98A4A", "Salty snack, sweet drink. Classic.",
          hat="chef", facial="mustache", hair_col="#6B3A1E", extras=["apron"]),
    ],
    "pirate": [
        C("pirate", "Captain Barnacle", "tall", "stocky", "#E3AE8E", "#F1E8D8", "Fill her up, matey. No spillin'!",
          hat="tricorn", hat_col="#1E1A1A", skull_hat=True, eyes="patch", facial="beard", hair_col="#5A2E14", nose="round",
          extras=["stripes"], stripe_col="#B8322B", holds="hook"),
        C("parrot_pirate", "Squawk", "small", "round", "#E0463A", "#E0463A", "Rrraak! Pieces of eight! Pour it!",
          nose="beak", nose_col="#F2D36B", arms="wing", accent="#4FB0E0", eyes="patch", extras=["belly"], belly_col="#F2D36B"),
        C("skeleton_pirate", "Bones", "tall", "slim", "#EEE8D6", "#EEE8D6", "Goes right through me. Pour anyway.",
          head="skull", eyes="glow", eye_col="#5FE3FF", hat="bandana", hat_col="#B8322B", extras=["stripes"], stripe_col="#C8C0A8",
          teeth=True),
        C("first_mate", "Mate Molly", "tall", "pear", SKIN[1], "#24304F", "Captain's orders: a full measure.",
          hair="long", hair_col="#B8322B", hat="bandana", hat_col="#1E1A22", extras=["buttons"], button_col="#E5B84A"),
        C("ship_cook", "Cookie", "tall", "stocky", SKIN[2], "#F4F2EC", "Galley's closed. Galley's thirsty.",
          hat="chef", facial="mustache", hair_col="#6B3A1E", extras=["apron", "belly"], nose="round"),
        C("octopus_pirate", "Captain Inky", "tall", "blob", "#7C4BB8", "#7C4BB8", "Eight arms, zero spills. Your turn.",
          hat="tricorn", hat_col="#1E1A1A", arms="tentacle", accent="#F2C2D8", extras=["tentacles"], eyes="patch", hr=0.28, scale=1.08),
        C("monkey_pirate", "Swabbie", "small", "pear", "#8A5A3A", "#8A5A3A", "Ook! Grog! Ook!",
          ears="big_round", ear_inner="#E2C8A8", nose="snout", muzzle="#E2C8A8", hat="bandana", hat_col="#D6453D", extras=["tail"]),
        C("ghost_pirate", "Phantom Pete", "floater", "sheet", "#9FFFC8", "#9FFFC8", "Yo ho... yo ho... a ghostly grog.",
          hat="tricorn", hat_col="#5A8A7A", eyes="glow", eye_col="#E8FFF0", kind="trans"),
        C("navigator", "Compass Kate", "tall", "slim", SKIN[3], "#3F6B4A", "Due north. Straight to the line.",
          hat="tricorn", hat_col="#5A3A28", hair="braids", hair_col="#2A1A10", eyewear="glasses", holds="spyglass"),
        C("deckhand", "Swab", "tall", "pear", SKIN[0], "#F4F4F8", "Mopped the deck twice. I earned this.",
          hat="bandana", hat_col="#4FB0E0", extras=["stripes"], stripe_col="#24304F", blush=True),
        C("crab_pirate", "Pinch", "small", "round", "#D6453D", "#D6453D", "Arr! Snip! Arr!",
          eyes="stalk", arms="claw", hat="bandana", hat_col="#1E1A22"),
        C("shark_pirate", "Sharkey", "tall", "stocky", "#7E8A99", "#7E8A99", "I smell rum. Or is it cocoa?",
          hat="dorsal", fangs=True, eyes="patch", arms="fin", extras=["belly"], belly_col="#F4F4F8"),
        C("pearl_merchant", "Pearl", "tall", "mermaid", SKIN[2], "#2F9E95", "I'll pay in pearls. Fair?",
          hair="long", hair_col="#F4F2EC", extras=["necklace"], bead_col="#F4F2EC", accent="#2F9E95", holds="pearl"),
        C("lookout", "Ned the Lookout", "tall", "slim", SKIN[1], "#5E7FA8", "Land ho! And drink ho!",
          hat="beanie", hat_col="#D6453D", hat_accent="#F4F4F8", holds="spyglass", extras=["scarf"]),
        C("cannoneer", "Boomer", "tall", "stocky", SKIN[3], "#3A3740", "BOOM! Sorry. Habit. A drink?",
          hat="bandana", hat_col="#E8803A", blush=True, blush_col="#3A3740", facial="beard", hair_col="#1E1A22"),
        C("mimic", "Mimic", "small", "box", "#C8963E", "#C8963E", "I'm definitely just a treasure chest.",
          head="box", eyes="big", teeth=True, arms="none", extras=["stripes"], stripe_col="#5A3A28"),
        C("sea_witch", "Morgana", "tall", "robe", "#A8D8C8", "#2F6B6A", "The sea told me you'd pour perfectly.",
          hair="long", hair_col="#F4F4F8", hat="crown", hat_accent="#F2C2A8", holds="orb", orb_col="#5FE3C8"),
        C("captain_cat", "Whiskers", "tall", "slim", "#E8803A", "#24304F", "Cream. In a proper glass, sailor.",
          ears="pointy", nose="button", whiskers=True, hat="tricorn", hat_col="#1E1A1A", eyes="patch", extras=["tail", "buttons"],
          tail_col="#E8803A"),
        C("bilge_rat", "Bilge Rat", "small", "pear", "#8A8F99", "#8A8F99", "Squeak. Got any cheese drinks?",
          ears="big_round", ear_inner="#F2B5C0", nose="button", whiskers=True, extras=["tail_thin"], tail_col="#E8A0A8"),
        C("kraken_kid", "Krakkie", "small", "blob", "#B85A9A", "#B85A9A", "When I grow up, I'll sink ships!",
          eyes="big", extras=["tentacles"], arms="none", blush=True),
        C("governor", "Lady Governor", "tall", "robe", SKIN[0], "#C9A0C8", "This ship is under my protection. Pour.",
          hair="bun", hair_col="#F4F4F8", extras=["necklace"], bead_col="#F4F2EC", hat="bow", hat_col="#7C4BB8"),
        C("quartermaster", "Quill", "tall", "stocky", SKIN[1], "#5A3A28", "I'll be noting the exact amount.",
          eyewear="glasses", hat="bandana", hat_col="#3F6B4A", holds="book", book_col="#5A3A28"),
        C("old_salt", "Old Salt", "tall", "pear", SKIN[0], "#E8B83A", "Seen many storms. Never a perfect pour.",
          hat="cap", hat_col="#E8B83A", facial="long_beard", hair_col="#F4F4F8", nose="round"),
        C("gull_spy", "Gull", "small", "round", "#F4F4F8", "#F4F4F8", "Psst. Pour fast, captain's coming.",
          nose="beak", nose_col="#F2B23A", arms="wing", accent="#B8BCC4", hat="tricorn", hat_col="#1E1A1A"),
        C("cabin_boy", "Little Jim", "tall", "pear", SKIN[2], "#D6453D", "First voyage! Is this grown-up juice?",
          hat="bandana", hat_col="#F2D36B", blush=True, scale=0.85),
        C("siren", "Lorelei", "floater", "sheet", "#8AB8F0", "#8AB8F0", "La la laaa... a drink for the song?",
          hair="long", hair_col="#2F6B6A", eyes="glow", eye_col="#E8F8FF", kind="trans"),
        C("anchor_golem", "Anchor", "tall", "box", "#5E6670", "#5E6670", "Heavy day. Heavy pour.",
          head="box", eyes="glow", eye_col="#E8B83A", extras=["bolts"], hand="#3A3740", scale=1.05),
        C("shanty", "Shanty Sam", "tall", "pear", SKIN[3], "#24304F", "Yo ho! Sing while you pour!",
          hat="cap", hat_col="#24304F", hat_accent="#F4F4F8", facial="beard", hair_col="#1E1A22", extras=["stripes"],
          stripe_col="#F4F4F8"),
        C("puffer_pirate", "Puffy", "small", "round", "#F2D36B", "#F2D36B", "Don't make me puff, matey.",
          eyes="patch", arms="fin", hair="spiky", hair_col="#E8B83A"),
        C("admiral", "Admiral Fogg", "tall", "stocky", SKIN[0], "#24304F", "A measured pour. Military precision.",
          hat="bicorne", hat_col="#1E1A1A", hat_accent="#E5B84A", facial="mustache", hair_col="#F4F4F8", extras=["medal", "buttons"],
          button_col="#E5B84A"),
    ],
    "castle": [
        C("vampire_lord", "Lord Nocturne", "tall", "slim", "#E2DCEA", "#1E1A22", "I never drink... cocoa. Until tonight.",
          hair="slick", hair_col="#1E1A22", fangs=True, extras=["cape", "medal"], cape_col="#7A1E2A", eyes="dot", eye_col="#B8322B"),
        C("witch", "Grizelda", "tall", "robe", "#9FD48A", "#5A3A6A", "Eye of newt? No? Fine, a latte.",
          hat="witch", hat_col="#1E1A22", hat_accent="#7C4BB8", hair="long", hair_col="#3A3740", nose="round", nose_col="#7FB86A"),
        C("skeleton", "Rattles", "tall", "slim", "#EEE8D6", "#EEE8D6", "Pour slowly. I have no stomach for spills.",
          head="skull", eyes="glow", eye_col="#1E1A22", teeth=True, extras=["bowtie", "stripes"], stripe_col="#C8C0A8"),
        C("frankenstein", "Franky", "tall", "stocky", "#8FB87A", "#3A3740", "Drink. Good. Drink good.",
          head="box", hair="slick", hair_col="#1E1A22", extras=["bolts", "buttons"], eyes="sleepy", scale=1.08),
        C("mummy", "Wrappy", "tall", "slim", "#E9E2CF", "#E9E2CF", "Three thousand years thirsty.",
          eyes="glow", eye_col="#E8B83A", extras=["bandages"]),
        C("werewolf_castle", "Fang", "tall", "stocky", "#7A5236", "#7A5236", "GRRR. Please. GRRR.",
          ears="pointy", nose="snout", muzzle="#B8946A", fangs=True, extras=["fur", "tail_fluffy"], eyes="dot", eye_col="#E8B83A"),
        C("castle_bat", "Batty", "small", "round", "#3A2A4A", "#3A2A4A", "Eek! Something dark and warm!",
          ears="pointy", fangs=True, extras=["wings_bat"], eyes="glow", eye_col="#E8423A", arms="none"),
        C("pumpkin", "Jack O.", "tall", "pear", "#E8803A", "#3F6B4A", "Spiced, please. It's my whole thing.",
          head="pumpkin", eyes="glow", eye_col="#FFD24A", mouth_col="#FFB547"),
        C("ghost_knight", "Sir Clank", "floater", "sheet", "#B8C8E8", "#B8C8E8", "A toast to the old kingdom!",
          hat="helmet", hat_col="#9AA0A8", hat_accent="#D6453D", kind="trans"),
        C("gargoyle", "Gargo", "tall", "stocky", "#7E7A82", "#7E7A82", "Been on the roof for centuries. Thirsty.",
          hat="horns", horn_col="#5E5A62", extras=["wings_bat"], wing_col="#5E5A62", fangs=True, eyes="glow", eye_col="#E8B83A"),
        C("spider", "Spinella", "small", "round", "#2A2430", "#2A2430", "Eight legs, one glass. Fill it.",
          eyes="three", eye_col="#E8423A", extras=["tentacles"], arms="none", hat="bow", hat_col="#7C4BB8"),
        C("zombie", "Shuffles", "tall", "pear", "#8FA88A", "#5E7FA8", "Braaains... I mean, chai.",
          eyes="sleepy", extras=["stripes"], stripe_col="#3A3740", hair="spiky", hair_col="#3A3740", tempo=0.7),
        C("banshee", "Wailing Wendy", "floater", "sheet", "#E8ECF4", "#E8ECF4", "AAAAAH! ...sorry. A tea please.",
          hair="long", hair_col="#C8D0E0", eyes="big", kind="trans"),
        C("butler", "Graves", "tall", "slim", SKIN[0], "#1E1A22", "The master requests a perfectly level pour.",
          hair="slick", hair_col="#9AA0A8", extras=["bowtie", "buttons"], tie_col="#1E1A22", button_col="#F4F4F8"),
        C("black_cat", "Midnight", "small", "slim", "#1E1A22", "#1E1A22", "Prrr. Bad luck if you spill.",
          ears="pointy", ear_inner="#5A3A6A", eyes="glow", eye_col="#9AE03A", whiskers=True, extras=["tail"], tail_col="#1E1A22"),
        C("imp", "Impy", "small", "round", "#D6453D", "#D6453D", "Hee hee! Pour it wrong! Pour it wrong!",
          hat="horns", horn_col="#3A1A1A", extras=["wings_bat", "tail"], wing_col="#7A1E2A", fangs=True, eyes="big"),
        C("necromancer", "Mortimer", "tall", "robe", "#C8C8D8", "#1E1A22", "Raise your glass. And the dead.",
          hat="hood", hat_col="#1E1A22", holds="staff", orb_col="#7FFF9A", eyes="glow", eye_col="#7FFF9A"),
        C("lady_raven", "Lady Raven", "tall", "robe", "#E8E2F0", "#2A2430", "Something dark, dear. Like my mood.",
          hair="bun", hair_col="#1E1A22", extras=["necklace"], bead_col="#7A1E2A", eyes="dot", mouth_col="#7A1E2A"),
        C("swamp_thing", "Bog", "tall", "stocky", "#5E7A4A", "#5E7A4A", "Glub. Murky. Like home.",
          extras=["spots", "fur"], spot_col="#3F5A2A", eyes="big", scale=1.05),
        C("cyclops", "Cy", "tall", "stocky", "#C8A0E8", "#5A3A6A", "I only need one eye to judge your pour.",
          eyes="cyclops", hat="horns", horn_col="#F4EEDC", extras=["belly"], scale=1.1),
        C("candle_spirit", "Wick", "small", "cup", "#F4E6C8", "#F4E6C8", "Don't let me melt, please.",
          hat="flame", arms="none", eyes="dot"),
        C("raven", "Raven", "small", "round", "#1E1A22", "#1E1A22", "Nevermore... unless it's free.",
          nose="beak", nose_col="#3A3740", arms="wing", accent="#2A2430", eyes="dot", eye_col="#E8E2F0"),
        C("jester_ghost", "Jinx", "floater", "sheet", "#E8C8F0", "#E8C8F0", "Ha ha! The joke's on the glass!",
          hat="party", hat_col="#7C4BB8", hat_accent="#F2D36B", eyes="big", kind="trans"),
        C("alchemist", "Dr. Grim", "tall", "pear", SKIN[0], "#5A5A62", "Fascinating viscosity. Proceed.",
          eyewear="goggles", eyewear_col="#9AE03A", hair="spiky", hair_col="#F4F4F8", extras=["apron"], apron_col="#8A6A4A"),
        C("castle_owl", "Hootington", "tall", "round", "#7E7A82", "#7E7A82", "Who? Who poured that? Impressive.",
          eyes="big", eye_col="#E8B83A", nose="beak", ears="tufts", arms="wing", accent="#5E5A62", extras=["belly"],
          belly_col="#C8C4CC"),
        C("armor", "Armand", "tall", "box", "#9AA0A8", "#9AA0A8", "Clank. Clank. One mead, please.",
          head="box", hat="helmet", hat_col="#9AA0A8", hat_accent="#D6453D", eyes="visor", eye_col="#1E1A22", hand="#7E8A99"),
        C("slime", "Gloop", "small", "blob", "#9AE03A", "#9AE03A", "Blorp. Pour it on me. Kidding.",
          eyes="big", kind="trans", head_kind="trans", arms="none", blush=True),
        C("ghoul_chef", "Chef Ghoul", "tall", "pear", "#A8B0A8", "#F4F2EC", "Today's special: soup of the night.",
          hat="chef", extras=["apron"], apron_col="#8A2A2A", eyes="glow", eye_col="#9AE03A"),
        C("gardener", "Grub", "tall", "stocky", SKIN[2], "#5A6B3A", "The roses are thirsty. So am I.",
          hat="straw", facial="beard", hair_col="#6B4A2A", extras=["apron"], apron_col="#8A6A4A", holds="cup"),
        C("royal_ghost", "Queen Wisp", "floater", "sheet", "#D8C0F8", "#D8C0F8", "We are amused. Pour for the queen.",
          hat="crown", hat_accent="#E5B84A", eyes="dot", kind="trans", blush=True),
    ],
}


def main():
    os.makedirs(RAW_DIR, exist_ok=True)
    only = set(ONLY.split(",")) if ONLY else None
    manifest = []
    seen = set()
    for loc, roster in ROSTERS.items():
        assert len(roster) == 30, f"{loc}: {len(roster)} customers"
        for sp in roster:
            assert sp["id"] not in seen, f"duplicate id {sp['id']}"
            seen.add(sp["id"])
            manifest.append({"id": sp["id"], "name": sp["name"], "location": loc, "size": sp["cls"], "line": sp["line"]})
            if only and sp["id"] not in only:
                continue
            meshes, size = build(sp)
            log(f"{loc:7s} {sp['id']:18s} {meshes:2d} meshes  {size // 1024:4d} KB raw")
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    log(f"manifest: {len(manifest)} customers -> {MANIFEST}")


if __name__ == "__main__":
    main()
