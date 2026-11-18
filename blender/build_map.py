# Last Drop - island map builder (Blender 5.2, visible window, progressive build)
# Run:  blender.exe --python build_map.py
import bpy, bmesh, math, random, time, json, os, traceback
import numpy as np
from mathutils import Vector, Matrix, Quaternion, Euler, noise
from mathutils.bvhtree import BVHTree

OUT = r"C:\Users\User\Desktop\claude\last-drop-map-test"
T0 = time.time()
random.seed(11)
SCN = bpy.context.scene
TIMES = {}
FAILS = []

for fn in ("build_log.txt", "build_done.json", "build_error.txt"):
    p = os.path.join(OUT, fn)
    if os.path.exists(p):
        os.remove(p)


def log(msg):
    line = f"[{time.time()-T0:7.1f}s] {msg}"
    print(line, flush=True)
    with open(os.path.join(OUT, "build_log.txt"), "a", encoding="utf-8") as f:
        f.write(line + "\n")


# ------------------------------------------------------------------ palette
def hexlin(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c) + (1.0,)


PHEX = dict(
    grass1="#8FC46A", grass2="#7DB35E", grass3="#A6CC76", grass4="#93BD5F", sand="#F0DAA8", sand2="#E8CD95",
    sand_wet="#D2B884", seabed="#8FB7A0", seabed_deep="#5E8E8A",
    dirt="#C8955F", dirt2="#B7854F", rock="#9C9690", rock2="#8B857F", rock_dark="#6E6865", snow="#F6F3EE", snow2="#E4E8EE",
    wood="#9C6B44", wood_dark="#5E3D2A", wood_light="#C49561", log="#A8703F", roof_dark="#6E3B2C", bamboo="#CDB66E",
    straw="#DDBB6C", straw_dark="#C49F55", stone="#CFC2B0", navy="#3A4C70", terracotta="#C0603F", cream="#F7E8CC",
    brick="#A65A44", red="#DE5B4E", teal="#4FB0A8", black="#2E2A2B", chalk="#2F3B36",
    glow="#FFD27A", glowp="#A24DFF", purple="#8C58C8", purple_dark="#5E3A8C", castle="#8A84A0", castle_dark="#625C78",
    pine="#3E7D57", pine2="#4E8F5F", leaf="#74B35A", leaf2="#8CC062", leaf3="#5E9E4C", palm_leaf="#64AE50",
    palm_leaf2="#4F9A45", bark="#8B6B4E", bark2="#7A5C42", white="#FAF6EE", yellow="#F3C450", blue="#5C90D8",
    pink="#EE93AE", orange="#EE9450", green="#6DBE6A", hull="#6B4630", hull_low="#8C3F30", deck="#C09060",
    sail="#F4EAD3", deadwood="#4E4550", grave="#A9A5B0", lh_red="#D8544A", river="#5BB8D0", foam="#FFFFFF",
    cat="#E8934A", gray="#9A9AA0", dolphin="#7F9DB3", whale="#4C5D73", flower_w="#FFF8EC", lilac="#B79BE0",
)
P = {k: hexlin(v) for k, v in PHEX.items()}


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(a[i] * (1 - t) + b[i] * t for i in range(4))


def jit(c, a=0.04):
    k = 1 + random.uniform(-a, a)
    return (c[0] * k, c[1] * k, c[2] * k, 1.0)


def smooth(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def angdiff(a, b):
    return (a - b + math.pi) % (2 * math.pi) - math.pi


def face_yaw(dx, dy):
    """yaw so that local -Y points along (dx,dy)"""
    return math.atan2(dx, -dy)


# ------------------------------------------------------------------ materials
def make_mat(name, emit=None, strength=0.0, rough=0.85):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None)
    if bsdf is None:
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    if out is None:
        out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    ca = nt.nodes.new("ShaderNodeVertexColor")
    ca.layer_name = "Col"
    nt.links.new(ca.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = rough
    if emit:
        bsdf.inputs["Emission Color"].default_value = emit
        bsdf.inputs["Emission Strength"].default_value = strength
    m.use_backface_culling = False
    return m


# ------------------------------------------------------------------ mesh builder
class G:
    def __init__(s, name):
        s.name = name
        s.bm = bmesh.new()
        s.cl = s.bm.loops.layers.float_color.new("Col")
        s.T = Matrix.Identity(4)

    def at(s, pos, yaw=0.0):
        s.T = Matrix.Translation(Vector(pos)) @ Matrix.Rotation(yaw, 4, 'Z')
        return s

    def ident(s):
        s.T = Matrix.Identity(4)
        return s

    def world(s, lx, ly, lz=0.0):
        return s.T @ Vector((lx, ly, lz))

    def pf(s, f, color, mat=0, j=0.035):
        f.material_index = mat
        col = jit(color, j)
        for l in f.loops:
            l[s.cl] = col

    def _fin(s, verts, local, color, mat=0, stripes=None, j=0.035):
        fs = set()
        for v in verts:
            fs.update(v.link_faces)
        for f in fs:
            c = color
            if stripes:
                cc = f.calc_center_median()
                a = math.atan2(cc.y, cc.x)
                idx = int((a + math.pi) / (2 * math.pi) * stripes[2] + 1e-4) % 2
                c = stripes[0] if idx == 0 else stripes[1]
            s.pf(f, c, mat, j)
        bmesh.ops.transform(s.bm, matrix=s.T @ local, verts=list(verts))
        return fs

    def box(s, c, size, color, rz=0.0, rx=0.0, ry=0.0, mat=0):
        r = bmesh.ops.create_cube(s.bm, size=1.0)
        local = (Matrix.Translation(Vector(c)) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Rotation(ry, 4, 'Y')
                 @ Matrix.Rotation(rx, 4, 'X') @ Matrix.Diagonal((size[0], size[1], size[2], 1)))
        return s._fin(r['verts'], local, color, mat)

    def cyl(s, c, r1, r2, h, color, seg=8, mat=0, stripes=None, rot=None, sc=None):
        r = bmesh.ops.create_cone(s.bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=h)
        for v in r['verts']:
            v.co.z += h / 2
        local = Matrix.Translation(Vector(c)) @ (rot if rot is not None else Matrix.Identity(4))
        if sc:
            local = local @ Matrix.Diagonal((sc[0], sc[1], sc[2], 1))
        return s._fin(r['verts'], local, color, mat, stripes)

    def ico(s, c, r, color, sub=1, sc=(1, 1, 1), jitter=0.0, mat=0, stripes=None, rz=0.0):
        res = bmesh.ops.create_icosphere(s.bm, subdivisions=sub, radius=1.0)
        if jitter:
            for v in res['verts']:
                v.co += Vector([random.uniform(-jitter, jitter) for _ in range(3)])
        local = (Matrix.Translation(Vector(c)) @ Matrix.Rotation(rz, 4, 'Z')
                 @ Matrix.Diagonal((sc[0] * r, sc[1] * r, sc[2] * r, 1)))
        return s._fin(res['verts'], local, color, mat, stripes)

    def poly(s, verts, faces, color, mat=0, recalc=False):
        vs = [s.bm.verts.new(Vector(v)) for v in verts]
        nf = []
        for f in faces:
            try:
                nf.append(s.bm.faces.new([vs[i] for i in f]))
            except ValueError:
                pass
        if recalc and nf:
            bmesh.ops.recalc_face_normals(s.bm, faces=nf)
        return s._fin(vs, Matrix.Identity(4), color, mat)

    def prism(s, c, w, d, h, color, rz=0.0, mat=0):
        hw, hd = w / 2, d / 2
        cx, cy, cz = c
        M = Matrix.Translation(Vector(c)) @ Matrix.Rotation(rz, 4, 'Z')
        V = [M @ Vector(v) for v in [(-hw, -hd, 0), (hw, -hd, 0), (hw, hd, 0), (-hw, hd, 0), (0, -hd, h), (0, hd, h)]]
        F = [(0, 1, 4), (1, 2, 5, 4), (2, 3, 5), (3, 0, 4, 5), (0, 3, 2, 1)]
        return s.poly(V, F, color, mat, recalc=True)

    def beam(s, p0, p1, t, color, mat=0, t2=None):
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        L = d.length
        if L < 1e-5:
            return set()
        q = d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        r = bmesh.ops.create_cube(s.bm, size=1.0)
        local = Matrix.Translation((p0 + p1) / 2) @ q @ Matrix.Diagonal((t, t2 or t, L, 1))
        return s._fin(r['verts'], local, color, mat)

    def obj(s, name=None, loc=(0, 0, 0), rz=0.0, keep=False, coll=None):
        name = name or s.name
        me = bpy.data.meshes.new(name)
        s.bm.to_mesh(me)
        if not keep:
            s.bm.free()
        for m in MATS:
            me.materials.append(m)
        ob = bpy.data.objects.new(name, me)
        ob.location = loc
        ob.rotation_euler = (0, 0, rz)
        (coll or SCN.collection).objects.link(ob)
        try:
            me.color_attributes.active_color = me.color_attributes['Col']
        except Exception:
            pass
        return ob


def new_coll(name):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in SCN.collection.children:
        SCN.collection.children.link(c)
    return c


def empty(name, loc, coll=None, size=1.5, kind='PLAIN_AXES', parent=None, props=None):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = kind
    e.empty_display_size = size
    e.location = loc
    (coll or SCN.collection).objects.link(e)
    if parent:
        set_parent(e, parent)
    for k, v in (props or {}).items():
        e[k] = v
    return e


def set_parent(child, parent):
    # objects here are created unparented, so basis == world; keep the child where it is
    pw = parent.matrix_basis.copy()
    child.parent = parent
    child.matrix_parent_inverse = pw.inverted()


# ------------------------------------------------------------------ island layout
R0 = 56.0


def coastR(th):
    return R0 * (1 + 0.15 * math.sin(2 * th + 0.6) + 0.08 * math.sin(3 * th + 2.3)
                 + 0.045 * math.sin(5 * th + 1.1) + 0.02 * math.sin(8 * th + 0.2))


def polar(deg, f):
    th = math.radians(deg)
    r = coastR(th) * f
    return (r * math.cos(th), r * math.sin(th))


LOCDEF = [
    dict(id=1, key="cafe", name="Midnight Café", deg=-100, f=0.42, pad=8.0, pin=8.0),
    dict(id=2, key="beachbar", name="Beach Bar", deg=-40, f=0.84, pad=7.0, pin=7.5),
    dict(id=3, key="chalet", name="Mountain Chalet", deg=30, f=0.47, pad=6.5, pin=9.0),
    dict(id=4, key="funfair", name="Funfair", deg=100, f=0.47, pad=12.0, pin=16.0),
    dict(id=5, key="ship", name="Pirate Ship", deg=152, f=0.86, pad=5.0, pin=14.0),
    dict(id=6, key="castle", name="Haunted Castle", deg=213, f=0.70, pad=10.0, pin=19.0),
]
LOC = {}
for L in LOCDEF:
    x, y = polar(L['deg'], L['f'])
    L['pos'] = (x, y)
    LOC[L['key']] = L
PEAK = polar(40, 0.30)
RIVER_DEF = dict(src=(58, 0.36), mouth=(74, 1.04))


def fbm(x, y, z=0.5):
    return (noise.noise(Vector((x, y, z))) * 0.6 + noise.noise(Vector((x * 2.1, y * 2.1, z + 1.7))) * 0.3
            + noise.noise(Vector((x * 4.3, y * 4.3, z + 2.9))) * 0.1)


def h_natural(x, y):
    r = math.hypot(x, y)
    th = math.atan2(y, x)
    R = coastR(th)
    d = r / R
    c = math.exp(-(angdiff(th, math.radians(213)) / 0.55) ** 2)
    n = fbm(x * 0.05, y * 0.05)
    if d < 0.86:
        h = 0.9 + 4.2 * smooth(0.86, 0.25, d) + 1.5 * n * smooth(0.86, 0.62, d)
    elif d < 1.0:
        h = 0.9 * (1.0 - d) / 0.14
    else:
        h = -min((d - 1.0) * 26, 7.0) * (1 + 0.1 * n)
    # small cliffs (castle headland + a little one on the north-east)
    h += c * 8.5 * smooth(1.0, 0.9, d) * smooth(0.3, 0.62, d)
    c2 = math.exp(-(angdiff(th, math.radians(-10)) / 0.25) ** 2)
    h += c2 * 2.6 * smooth(0.99, 0.92, d)
    dd = (x - PEAK[0]) ** 2 + (y - PEAK[1]) ** 2
    h += 20 * math.exp(-dd / (2 * 8.5 ** 2)) * (1 + 0.22 * noise.noise(Vector((x * 0.22, y * 0.22, 3.0))))
    return h


PADS = []
for L in LOCDEF:
    x, y = L['pos']
    PADS.append((x, y, L['pad'], h_natural(x, y)))


def h_pads(x, y):
    h = h_natural(x, y)
    for (px, py, pr, ph) in PADS:
        dist = math.hypot(x - px, y - py)
        w = smooth(pr + 6, pr, dist)
        if w > 0:
            h = h * (1 - w) + ph * w
    return h


# path between locations (dense polyline)
def build_path_points():
    pts = []
    for i in range(5):
        A, B = LOCDEF[i], LOCDEF[i + 1]
        ax, ay = A['pos']
        bx, by = B['pos']
        ra = math.hypot(ax, ay)
        rb = math.hypot(bx, by)
        # anchor: in front of each location (towards centre)
        fa = (ra - A['pad'] * 0.75) / coastR(math.atan2(ay, ax))
        fb = (rb - B['pad'] * 0.75) / coastR(math.atan2(by, bx))
        a0 = math.atan2(ay, ax)
        a1 = a0 + angdiff(math.atan2(by, bx), a0)
        n = 70
        for k in range(n + (1 if i == 4 else 0)):
            t = k / n
            ang = a0 + (a1 - a0) * t
            f = fa + (fb - fa) * t + (0.16 if i == 2 else -0.07) * math.sin(math.pi * t) + 0.025 * math.sin(t * math.pi * 4 + i * 1.7)
            r = coastR(ang) * f
            pts.append((r * math.cos(ang), r * math.sin(ang)))
    # resample evenly every 0.8 units
    out = [pts[0]]
    acc = 0.0
    for p in pts[1:]:
        q = out[-1]
        dd = math.hypot(p[0] - q[0], p[1] - q[1])
        if dd >= 0.8:
            out.append(p)
    return np.array(out)


PATH = build_path_points()


def river_points():
    s = polar(*RIVER_DEF['src'])
    m = polar(*RIVER_DEF['mouth'])
    pts = []
    n = 90
    for k in range(n + 1):
        t = k / n
        x = s[0] + (m[0] - s[0]) * t
        y = s[1] + (m[1] - s[1]) * t
        # meander perpendicular
        dx, dy = m[0] - s[0], m[1] - s[1]
        L = math.hypot(dx, dy)
        px, py = -dy / L, dx / L
        w = 3.2 * math.sin(t * math.pi * 2.3 + 0.4) * math.sin(math.pi * t)
        pts.append((x + px * w, y + py * w))
    return np.array(pts)


RIVER = river_points()
RIVER_Z = None  # filled in terrain step
FALL_T = 0.42


def seg_dist(P2, pts):
    """min distance of points P2 (N,2) to polyline pts (M,2); returns dist and param index"""
    A = pts[:-1]
    B = pts[1:]
    AB = B - A
    L2 = (AB ** 2).sum(1) + 1e-9
    best = np.full(len(P2), 1e9)
    bidx = np.zeros(len(P2))
    for s0 in range(0, len(P2), 1500):
        Pc = P2[s0:s0 + 1500][:, None, :]
        t = np.clip(((Pc - A[None]) * AB[None]).sum(2) / L2[None], 0, 1)
        C = A[None] + t[..., None] * AB[None]
        d = np.sqrt(((Pc - C) ** 2).sum(2))
        j = d.argmin(1)
        best[s0:s0 + 1500] = d[np.arange(len(j)), j]
        bidx[s0:s0 + 1500] = j + t[np.arange(len(j)), j]
    return best, bidx


# ------------------------------------------------------------------ ground queries
BVHS = []  # (bvh, xmin, xmax, ymin, ymax)


def ground(x, y, default=-6.0):
    best = None
    for (b, x0, x1, y0, y1) in BVHS:
        if x0 <= x <= x1 and y0 <= y <= y1:
            hit = b.ray_cast(Vector((x, y, 300)), Vector((0, 0, -1)))
            if hit[0] is not None:
                if best is None or hit[0].z > best[0]:
                    best = (hit[0].z, hit[1].z)
    return best if best else (default, 1.0)


def gz(x, y):
    return ground(x, y)[0]


# ------------------------------------------------------------------ terrain
def terrain_grid(g, cx, cy, ext, nseg, hf, seed=1):
    step = 2 * ext / nseg
    rnd = random.Random(seed)
    V = []
    for j in range(nseg + 1):
        row = []
        for i in range(nseg + 1):
            x = cx - ext + i * step
            y = cy - ext + j * step
            if 0 < i < nseg and 0 < j < nseg:
                x += rnd.uniform(-0.28, 0.28) * step
                y += rnd.uniform(-0.28, 0.28) * step
            row.append(g.bm.verts.new((x, y, hf(x, y))))
        V.append(row)
    for j in range(nseg):
        for i in range(nseg):
            a, b, c, d = V[j][i], V[j][i + 1], V[j + 1][i + 1], V[j + 1][i]
            if (i + j) % 2 == 0:
                g.bm.faces.new((a, b, c)); g.bm.faces.new((a, c, d))
            else:
                g.bm.faces.new((a, b, d)); g.bm.faces.new((b, c, d))
    g.bm.normal_update()


def grass_col(c):
    n = noise.noise(Vector((c.x * 0.07, c.y * 0.07, 7.0)))
    if n > 0.25:
        return P['grass3']
    if n > -0.05:
        return P['grass1']
    if n > -0.3:
        return P['grass4']
    return P['grass2']


def base_color(c, nz):
    h = c.z
    if h < -0.05:
        return mix(mix(P['sand_wet'], P['seabed'], -h / 2.0), P['seabed_deep'], (-h - 2) / 5)
    if h > 11.5 and nz > 0.3:
        return P['snow'] if random.random() < 0.8 else P['snow2']
    if nz < 0.6:
        return P['rock_dark'] if nz < 0.42 else (P['rock'] if random.random() < 0.6 else P['rock2'])
    if h > 12.0 and nz > 0.5:
        return P['snow'] if random.random() < 0.8 else P['snow2']
    if h > 10.5 and nz > 0.5:
        return mix(P['rock'], P['snow'], (h - 10.5) / 1.5)
    return grass_col(c)


MAIN = {}


def repaint_main(fn):
    g = MAIN['g']
    g.bm.normal_update()
    for f in g.bm.faces:
        c = f.calc_center_median()
        col = fn(f, c, f.normal.z)
        if col is not None:
            g.pf(f, col, 0, 0.03)
    g.bm.to_mesh(MAIN['ob'].data)
    MAIN['ob'].data.update()


def face_d(c):
    return math.hypot(c.x, c.y) / coastR(math.atan2(c.y, c.x))


# ================================================================== STEPS
def step_setup():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    for m in list(bpy.data.meshes):
        bpy.data.meshes.remove(m)
    MATS.clear()
    MATS.extend([make_mat("Palette"), make_mat("Glow", P['glow'], 4.0, 0.6),
                 make_mat("GlowPurple", (0.45, 0.08, 1.0, 1.0), 2.0, 0.6), make_mat("Water", rough=0.1)])
    v = view3d()
    if v:
        win, area, region = v
        try:
            with bpy.context.temp_override(window=win, area=area, region=region):
                bpy.ops.screen.screen_full_area(use_hide_panels=False)
        except Exception as e:
            log(f"fullscreen skipped: {e}")
    v = view3d()
    if v:
        sp = v[1].spaces.active
        sp.shading.type = 'SOLID'
        sp.shading.light = 'STUDIO'
        sp.shading.color_type = 'VERTEX'
        sp.shading.show_cavity = True
        sp.shading.cavity_type = 'BOTH'
        sp.shading.show_shadows = True
        sp.shading.background_type = 'VIEWPORT'
        sp.shading.background_color = (0.55, 0.78, 0.86)
        sp.overlay.show_floor = False
        sp.overlay.show_axis_x = False
        sp.overlay.show_axis_y = False
        sp.overlay.show_relationship_lines = False
        sp.clip_end = 3000
        sp.lens = 40
        r3 = sp.region_3d
        r3.view_perspective = 'PERSP'
        r3.view_rotation = Euler((math.radians(58), 0, math.radians(20))).to_quaternion()
        r3.view_location = (0, 0, 0)
        r3.view_distance = 160
    CAM['loc'] = Vector((0, 0, 0)); CAM['dist'] = 160
    return None


def step_terrain():
    coll = new_coll("Island_Base")
    g = G("Terrain")
    terrain_grid(g, 0, 0, 82, 140, h_pads, seed=3)
    MAIN['g'] = g
    for f in g.bm.faces:
        c = f.calc_center_median()
        g.pf(f, base_color(c, f.normal.z), 0, 0.03)
    MAIN['ob'] = g.obj("Terrain", keep=True, coll=coll)
    return [MAIN['ob']]


def step_river():
    """carve river + waterfall, river water ribbon"""
    global RIVER_Z
    g = MAIN['g']
    nat = np.array([h_pads(x, y) for x, y in RIVER])
    n = len(RIVER)
    z = np.zeros(n)
    kf = int(FALL_T * (n - 1))
    top = nat[0] - 0.9
    for i in range(n):
        if i == 0:
            z[i] = top
        elif i <= kf:
            z[i] = min(z[i - 1] - 0.02, nat[i] - 0.8)
        elif i == kf + 1:
            z[i] = z[i - 1] - 3.4  # waterfall drop
        else:
            z[i] = min(z[i - 1] - 0.01, nat[i] - 0.6)
    # finish at sea level
    k85 = int(0.85 * (n - 1))
    zk = z[k85]
    for i in range(k85, n):
        u = (i - k85) / max(1, (n - 1 - k85))
        z[i] = min(z[i], zk * (1 - u) - 0.15 * u)
    RIVER_Z = z
    verts = list(g.bm.verts)
    P2 = np.array([(v.co.x, v.co.y) for v in verts])
    dist, idx = seg_dist(P2, RIVER)
    for v, d, ix in zip(verts, dist, idx):
        if d < 5.0:
            i0 = int(min(ix, n - 2))
            fr = ix - i0
            zr = z[i0] * (1 - fr) + z[i0 + 1] * fr
            bed = zr - 0.55
            if d < 1.9:
                v.co.z = min(v.co.z, bed)
            else:
                w = smooth(5.0, 1.9, d)
                v.co.z = min(v.co.z, v.co.z * (1 - w) + (zr + 0.25) * w)

    def col(f, c, nz):
        d, ix = seg_dist(np.array([(c.x, c.y)]), RIVER)
        if d[0] < 2.3 and c.z > -0.3:
            return P['rock2'] if random.random() < 0.5 else P['sand_wet']
        if d[0] < 3.2 and c.z > 0:
            return P['grass2']
        return None
    # only re-color faces near the river (fast pre-filter)
    g.bm.normal_update()
    for f in g.bm.faces:
        c = f.calc_center_median()
        if abs(c.x - RIVER[:, 0].mean()) < 40 and abs(c.y - RIVER[:, 1].mean()) < 40:
            cc = col(f, c, f.normal.z)
            if cc is not None:
                g.pf(f, cc, 0, 0.03)
            elif f.normal.z < 0.6 and c.z > 0:
                g.pf(f, P['rock'], 0, 0.04)
    g.bm.to_mesh(MAIN['ob'].data)
    MAIN['ob'].data.update()
    # water ribbon (own material, uv: u across, v along)
    rg = G("River")
    uvl = rg.bm.loops.layers.uv.new("UVMap")
    rows = []
    vacc = 0.0
    for i in range(n):
        x, y = RIVER[i]
        if i < n - 1:
            dx, dy = RIVER[i + 1] - RIVER[i]
        L = math.hypot(dx, dy)
        px, py = -dy / L, dx / L
        wdt = 1.55 + 0.5 * (i / n)
        if i > 0:
            vacc += math.hypot(*(RIVER[i] - RIVER[i - 1])) + abs(z[i] - z[i - 1])
        rows.append([(x - px * wdt, y - py * wdt, z[i] + 0.0, vacc), (x + px * wdt, y + py * wdt, z[i] + 0.0, vacc)])
    vs = [[rg.bm.verts.new((a[0], a[1], a[2])) for a in row] for row in rows]
    for i in range(n - 1):
        f = rg.bm.faces.new((vs[i][0], vs[i][1], vs[i + 1][1], vs[i + 1][0]))
        uvs = [(0, rows[i][0][3]), (1, rows[i][1][3]), (1, rows[i + 1][1][3]), (0, rows[i + 1][0][3])]
        for l, uv in zip(f.loops, uvs):
            l[uvl].uv = (uv[0], uv[1] / 6.0)
        fall = 1.0 if i == kf else 0.0
        rg.pf(f, mix(P['river'], P['foam'], fall * 0.7), 3, 0.0)
    river_ob = rg.obj("River", coll=bpy.data.collections["Island_Base"])
    # waterfall foam + rocks
    deco = G("RiverDeco")
    fx, fy = RIVER[kf + 2]
    for k in range(9):
        deco.ico((fx + random.uniform(-1.6, 1.6), fy + random.uniform(-1.6, 1.6), z[kf + 2] + random.uniform(0.0, 0.4)),
                 random.uniform(0.35, 0.7), P['foam'], sub=1, sc=(1, 1, 0.5), jitter=0.2)
    for i in range(2, n - 6, 4):
        x, y = RIVER[i]
        for sgn in (-1, 1):
            if random.random() < 0.6:
                dx, dy = RIVER[i + 1] - RIVER[i]
                L = math.hypot(dx, dy)
                ox, oy = -dy / L * sgn * random.uniform(2.0, 2.8), dx / L * sgn * random.uniform(2.0, 2.8)
                zz = gz(x + ox, y + oy) if BVHS else z[i]
                deco.ico((x + ox, y + oy, z[i] + 0.3), random.uniform(0.4, 0.9), P['rock'] if random.random() < .5 else P['rock2'],
                         sub=1, sc=(1.2, 1, 0.7), jitter=0.25)
    MAIN['deco'] = deco
    return [MAIN['ob'], river_ob]


def step_beach():
    def fn(f, c, nz):
        d = face_d(c)
        if c.z < -0.05:
            return None
        if c.z < 1.15 and nz > 0.6 and d > 0.74:
            return P['sand'] if random.random() < 0.7 else P['sand2']
        if c.z < 1.5 and nz > 0.6 and d > 0.72 and random.random() < 0.5:
            return mix(P['sand2'], P['grass3'], 0.5)
        return None
    repaint_main(fn)
    return [MAIN['ob']]


def step_path():
    g = MAIN['g']
    verts = list(g.bm.verts)
    P2 = np.array([(v.co.x, v.co.y) for v in verts])
    dist, _ = seg_dist(P2, PATH)
    rdist, _ = seg_dist(P2, RIVER)
    for v, d, rd in zip(verts, dist, rdist):
        if d < 1.7 and rd > 3.0:
            v.co.z -= 0.14 * (1 - d / 1.7)
    g.bm.normal_update()
    faces = list(g.bm.faces)
    C = np.array([(f.calc_center_median().x, f.calc_center_median().y) for f in faces])
    fd, _ = seg_dist(C, PATH)
    frd, _ = seg_dist(C, RIVER)
    for f, d, rd in zip(faces, fd, frd):
        c = f.calc_center_median()
        if d < 1.3 and c.z > 0.15 and rd > 2.4:
            g.pf(f, P['dirt'] if random.random() < 0.65 else P['dirt2'], 0, 0.03)
        elif d < 1.9 and c.z > 0.15 and rd > 2.4 and random.random() < 0.4:
            g.pf(f, mix(P['dirt2'], P['grass1'], 0.55), 0, 0.03)
    g.bm.to_mesh(MAIN['ob'].data)
    MAIN['ob'].data.update()
    bvh = BVHTree.FromBMesh(g.bm)
    BVHS.append((bvh, -82, 82, -82, 82))
    return [MAIN['ob']]


# ------------------------------------------------------------------ prop helpers
def pine(g, x, y, s=1.0, snow=False):
    z = gz(x, y) - 0.1
    g.ident()
    g.cyl((x, y, z), 0.22 * s, 0.18 * s, 1.2 * s, P['bark2'], seg=5)
    cols = [P['pine'], P['pine2'], P['pine']]
    for k, (r, hz) in enumerate([(1.55, 0.9), (1.2, 2.0), (0.85, 3.0)]):
        c = cols[k]
        if snow and k == 2:
            c = P['snow']
        g.cyl((x, y, z + hz * s), r * s, 0.0, 1.75 * s, c, seg=7)
        if snow and k < 2:
            g.cyl((x, y, z + hz * s + 1.1 * s), r * s * 0.42, 0.0, 0.66 * s, P['snow'], seg=7)


def round_tree(g, x, y, s=1.0):
    z = gz(x, y) - 0.1
    g.ident()
    g.cyl((x, y, z), 0.22 * s, 0.17 * s, 1.8 * s, P['bark'], seg=5)
    c = random.choice([P['leaf'], P['leaf2'], P['leaf3']])
    g.ico((x, y, z + 2.6 * s), 1.45 * s, c, sub=1, jitter=0.18, sc=(1, 1, 0.9))
    if random.random() < 0.6:
        g.ico((x + 0.7 * s, y + 0.3 * s, z + 2.0 * s), 0.9 * s, c, sub=1, jitter=0.15)


def palm(g, x, y, s=1.0, z=None):
    z = (gz(x, y) - 0.1) if z is None else z
    g.ident()
    a = random.uniform(0, 2 * math.pi)
    lean = Vector((math.cos(a), math.sin(a), 0)) * 1.8 * s
    h = random.uniform(5.0, 6.8) * s
    pts = [Vector((x, y, z)) + lean * (t * t) + Vector((0, 0, h * t)) for t in [i / 6 for i in range(7)]]
    for i in range(6):
        g.beam(pts[i], pts[i + 1], 0.34 * s * (1 - 0.3 * i / 6), P['bark'] if i % 2 == 0 else P['bark2'])
    top = pts[-1]
    for k in range(7):
        b = 2 * math.pi * k / 7 + random.uniform(-0.2, 0.2)
        dv = Vector((math.cos(b), math.sin(b), 0))
        side = Vector((-dv.y, dv.x, 0))
        L = random.uniform(2.6, 3.3) * s
        V = [top, top + dv * L * 0.4 + Vector((0, 0, 0.55 * s)) + side * 0.5 * s,
             top + dv * L + Vector((0, 0, -1.0 * s)), top + dv * L * 0.4 + Vector((0, 0, 0.55 * s)) - side * 0.5 * s]
        g.poly(V, [(0, 1, 2), (0, 2, 3)], P['palm_leaf'] if k % 2 else P['palm_leaf2'])
    for k in range(3):
        b = 2 * math.pi * k / 3
        g.ico(top + Vector((math.cos(b) * 0.3, math.sin(b) * 0.3, -0.3)), 0.2 * s, P['wood_dark'], sub=1)


def rock(g, x, y, r, z=None, sink=0.3):
    z = (gz(x, y) if z is None else z) - r * sink
    g.ident()
    g.ico((x, y, z), r, P['rock'] if random.random() < 0.5 else P['rock2'], sub=1, jitter=0.28,
          sc=(random.uniform(0.9, 1.3), random.uniform(0.8, 1.2), random.uniform(0.6, 0.95)), rz=random.uniform(0, 6))


def bush(g, x, y, s=1.0):
    z = gz(x, y)
    g.ident()
    c = random.choice([P['leaf'], P['leaf3'], P['leaf2']])
    g.ico((x, y, z + 0.25 * s), 0.75 * s, c, sub=1, jitter=0.15, sc=(1.2, 1, 0.8))
    if random.random() < 0.4:
        g.ico((x + 0.2, y + 0.1, z + 0.85 * s), 0.12, random.choice([P['pink'], P['yellow'], P['flower_w']]), sub=1)


def flower_patch(g, x, y, n=8):
    g.ident()
    col = random.choice([P['pink'], P['yellow'], P['flower_w'], P['lilac'], P['orange']])
    for k in range(n):
        fx, fy = x + random.uniform(-1.4, 1.4), y + random.uniform(-1.4, 1.4)
        z = gz(fx, fy)
        g.cyl((fx, fy, z - 0.05), 0.03, 0.03, 0.35, P['leaf3'], seg=3)
        g.cyl((fx, fy, z + 0.28), 0.16, 0.02, 0.12, col, seg=5)


def lantern(g, x, y):
    z = gz(x, y) - 0.1
    g.ident()
    g.cyl((x, y, z), 0.07, 0.06, 2.0, P['wood_dark'], seg=5)
    g.box((x, y, z + 2.15), (0.34, 0.34, 0.42), P['glow'], mat=1)
    g.cyl((x, y, z + 2.36), 0.3, 0.0, 0.3, P['black'], seg=4)


def fence(g, pts, h=0.9):
    g.ident()
    prev = None
    for (x, y) in pts:
        z = gz(x, y)
        p = Vector((x, y, z))
        g.cyl((x, y, z - 0.2), 0.08, 0.08, h + 0.25, P['wood'], seg=4)
        if prev is not None:
            for hh in (0.4, 0.8):
                g.beam(prev + Vector((0, 0, hh * h / 0.9)), p + Vector((0, 0, hh * h / 0.9)), 0.07, P['wood_light'])
        prev = p


def signpost(g, x, y, targets):
    z = gz(x, y) - 0.1
    g.ident()
    g.cyl((x, y, z), 0.09, 0.08, 2.4, P['wood_dark'], seg=5)
    for k, (tx, ty, col) in enumerate(targets):
        a = math.atan2(ty - y, tx - x)
        c = Vector((x + math.cos(a) * 0.55, y + math.sin(a) * 0.55, z + 2.0 - k * 0.42))
        g.box(c, (1.1, 0.07, 0.3), col, rz=a)
        tip = c + Vector((math.cos(a), math.sin(a), 0)) * 0.55
        g.at(tip, a)
        g.poly([(0, -0.06, -0.15), (0, -0.06, 0.15), (0.25, -0.06, 0)], [(0, 1, 2)], col)
        g.ident()


def barrel(g, x, y, z):
    g.ident()
    g.cyl((x, y, z), 0.38, 0.38, 0.9, P['wood'], seg=8)
    for hz in (0.15, 0.72):
        g.cyl((x, y, z + hz), 0.4, 0.4, 0.06, P['black'], seg=8)


def crate(g, x, y, z, s=0.8, rz=0.0):
    g.ident()
    g.box((x, y, z + s / 2), (s, s, s), P['wood_light'], rz=rz)
    g.box((x, y, z + s / 2), (s * 1.02, s * 0.2, s * 1.02), P['wood'], rz=rz)


def pier(g, sx, sy, ux, uy, length, width=2.2, z=0.95, lamps=True):
    yaw = face_yaw(-ux, -uy)  # local +Y along u
    g.at((sx, sy, z), yaw)
    s = 0.0
    k = 0
    while s < length:
        g.box((0, s, 0), (width, 0.42, 0.12), P['wood_light'] if k % 3 else P['wood'])
        s += 0.48
        k += 1
    for s2 in np.arange(0.6, length, 2.6):
        for sx2 in (-width / 2 + 0.12, width / 2 - 0.12):
            g.cyl((sx2, s2, -4.0), 0.13, 0.13, 4.6 if s2 < length - 1 else 5.2, P['wood_dark'], seg=6)
    if lamps:
        for sx2 in (-width / 2 + 0.12, width / 2 - 0.12):
            g.cyl((sx2, length - 0.3, 0), 0.06, 0.06, 1.5, P['black'], seg=4)
            g.box((sx2, length - 0.3, 1.6), (0.28, 0.28, 0.34), P['glow'], mat=1)
    g.ident()


def hull_mesh(g, secs, cdeck, chigh, clow):
    """secs: list of (y, halfwidth, zdeck, zbottom); builds an open-top hull + deck"""
    rows = []
    for (y, w, zd, zb) in secs:
        rows.append([(-w, y, zd), (-w * 0.86, y, (zd + zb) * 0.45), (0, y, zb), (w * 0.86, y, (zd + zb) * 0.45), (w, y, zd)])
    V = [p for r in rows for p in r]
    F = []
    for i in range(len(rows) - 1):
        for k in range(4):
            a = i * 5 + k
            F.append((a, a + 1, a + 6, a + 5))
    fs_hi = g.poly(V, [f for i, f in enumerate(F) if (i % 4) in (0, 3)], chigh)
    fs_lo = g.poly(V, [f for i, f in enumerate(F) if (i % 4) in (1, 2)], clow)
    # transom
    g.poly([rows[0][i] for i in range(5)], [(0, 1, 2, 3, 4)], chigh)
    # deck
    deck = [(-r[0][0] * 0.0 + r[0][0] * 0.96, r[0][1], r[0][2] - 0.25) for r in rows] + \
           [(r[4][0] * 0.96, r[4][1], r[4][2] - 0.25) for r in reversed(rows)]
    g.poly(deck, [tuple(range(len(deck)))], cdeck)


# ------------------------------------------------------------------ locations
def loc_root(L):
    key = f"LOC_{L['id']}_{L['key']}"
    coll = new_coll(key)
    x, y = L['pos']
    z = gz(x, y)
    root = empty(key, (x, y, z), coll, size=3, kind='CUBE',
                 props=dict(loc_id=L['id'], loc_name=L['name'], loc_key=L['key']))
    L['root'] = root
    L['coll'] = coll
    L['z'] = z
    return root, coll, z


def loc_finish(L, g, extra=()):
    ob = g.obj(f"LOC_{L['id']}_{L['key']}_mesh", coll=L['coll'])
    set_parent(ob, L['root'])
    x, y = L['pos']
    z = L['z']
    pin = empty(f"PIN_{L['id']}", (x, y, z + L['pin']), L['coll'], size=1.2, kind='SPHERE', parent=L['root'])
    # camera target + suggested camera position (looking from the island centre side / outward offset)
    r = math.hypot(x, y)
    ux, uy = x / r, y / r
    if L['key'] == 'chalet':
        # chalet: camera stands on the sea side and looks across the chalet toward the mountain,
        # so the snowy peak (not the beach) fills the background
        mx, my = PEAK[0] - x, PEAK[1] - y
        m = math.hypot(mx, my)
        mx, my = mx / m, my / m
        tz = (z + L['pin'] * 0.35 + gz(*PEAK)) * 0.5
        tgt = empty(f"CAMT_{L['id']}", (x + mx * 4, y + my * 4, tz), L['coll'], size=1.0, kind='ARROWS',
                    parent=L['root'])
        dist = 24
        cpos = empty(f"CAMP_{L['id']}", (x - mx * dist + my * 12, y - my * dist - mx * 12, z + 10), L['coll'],
                     size=1.0, kind='CONE', parent=L['root'])
        for e in extra:
            set_parent(e, L['root'])
        return [ob] + list(extra)
    tgt = empty(f"CAMT_{L['id']}", (x, y, z + L['pin'] * 0.35), L['coll'], size=1.0, kind='ARROWS', parent=L['root'])
    # suggested camera: in front of the location (buildings face the island centre, beach/ship face the sea)
    fx, fy = (ux, uy) if L['key'] in ('beachbar', 'ship') else (-ux, -uy)
    dist = 22 + L['pin'] * 0.6
    cpos = empty(f"CAMP_{L['id']}", (x + fx * dist - fy * 9, y + fy * dist + fx * 9, z + L['pin'] * 0.9 + 6), L['coll'],
                 size=1.0, kind='CONE', parent=L['root'])
    for e in extra:
        set_parent(e, L['root'])
    return [ob] + list(extra)


def build_cafe():
    L = LOC['cafe']
    root, coll, z = loc_root(L)
    x, y = L['pos']
    yaw = face_yaw(-x, -y)
    g = G("cafe")
    g.at((x, y, z), yaw)
    g.box((0, 0, -0.45), (8.0, 6.4, 1.5), P['stone'])
    g.box((0, 0.4, 1.95), (6.0, 4.4, 3.3), P['navy'])
    g.box((0, 0.4, 3.62), (6.4, 4.8, 0.16), P['cream'])
    g.prism((0, 0.4, 3.7), 6.8, 5.1, 1.9, P['terracotta'])
    for sx in (-1.75, 1.75):
        g.box((sx, -1.83, 2.0), (1.2, 0.12, 1.3), P['glow'], mat=1)
        g.box((sx, -1.9, 1.3), (1.45, 0.25, 0.12), P['cream'])
        g.box((sx, -1.86, 2.0), (0.08, 0.14, 1.3), P['cream'])
    g.box((0, -1.83, 1.35), (1.0, 0.14, 2.1), P['wood_dark'])
    g.box((0, -1.9, 1.4), (0.12, 0.1, 0.12), P['yellow'])
    for sy in (-0.5, 1.3):
        for sx in (-3.02, 3.02):
            g.box((sx, sy, 2.1), (0.12, 0.9, 1.1), P['glow'], mat=1)
    n = 8
    for i in range(n):
        xx = -3.1 + (i + 0.5) * 6.2 / n
        g.box((xx, -2.45, 3.05), (6.2 / n + 0.01, 1.3, 0.07), P['red'] if i % 2 == 0 else P['cream'], rx=math.radians(22))
    g.box((0, -2.15, 4.3), (2.4, 0.12, 0.55), P['glow'], mat=1)  # sign
    g.box((0, -2.2, 4.3), (2.6, 0.08, 0.7), P['wood_dark'])
    g.box((1.9, 1.4, 4.8), (0.6, 0.6, 1.6), P['brick'])
    # cat on the roof (sits on the ridge)
    g.ico((-1.2, 0.6, 5.75), 0.42, P['cat'], sub=1, sc=(0.8, 1.2, 0.9))
    g.ico((-1.2, 0.05, 6.15), 0.3, P['cat'], sub=1)
    for ex in (-0.15, 0.15):
        g.cyl((-1.2 + ex, 0.05, 6.35), 0.1, 0.0, 0.22, P['cat'], seg=3)
    g.beam((-1.2, 1.05, 5.6), (-0.9, 1.6, 6.3), 0.09, P['cat'])
    # lamp posts
    for lx in (-3.9, 3.9):
        g.cyl((lx, -3.4, 0.25), 0.09, 0.07, 3.3, P['black'], seg=6)
        g.ico((lx, -3.4, 3.75), 0.3, P['glow'], sub=1, mat=1)
        g.cyl((lx, -3.4, 3.98), 0.42, 0.0, 0.38, P['black'], seg=6)
    # string lights from roof edge to lamps (catenary of glow bulbs)
    for (a, b) in [((-3.0, -1.9, 3.6), (-3.9, -3.4, 3.4)), ((3.0, -1.9, 3.6), (3.9, -3.4, 3.4)),
                   ((-3.9, -3.4, 3.4), (3.9, -3.4, 3.4))]:
        A, B = Vector(a), Vector(b)
        for k in range(1, 12):
            t = k / 12
            p = A.lerp(B, t) - Vector((0, 0, 0.6 * math.sin(math.pi * t)))
            g.ico(p, 0.09, random.choice([P['glow'], P['glow']]), sub=1, mat=1)
    # terrace tables and chairs
    for tx in (-2.0, 0.0, 2.0):
        ty = -4.6 if tx != 0 else -5.6
        g.cyl((tx, ty, 0.25), 0.07, 0.07, 0.8, P['black'], seg=5)
        g.cyl((tx, ty, 1.05), 0.62, 0.62, 0.07, P['cream'], seg=10)
        g.cyl((tx, ty, 1.12), 0.06, 0.05, 0.16, P['glow'], seg=5, mat=1)  # candle
        for cx in (-0.95, 0.95):
            g.box((tx + cx, ty, 0.62), (0.48, 0.48, 0.08), P['wood'])
            g.box((tx + cx * 1.22, ty, 0.95), (0.07, 0.48, 0.65), P['wood'])
            for lx2 in (-0.18, 0.18):
                g.box((tx + cx + lx2, ty, 0.42), (0.05, 0.4, 0.4), P['black'])
    # chalkboard A-frame
    g.box((-3.0, -6.0, 0.9), (0.9, 0.08, 1.2), P['chalk'], rx=math.radians(12))
    g.box((-3.0, -6.03, 0.9), (1.0, 0.06, 1.3), P['wood'], rx=math.radians(12))
    g.box((-3.0, -5.6, 0.9), (0.9, 0.08, 1.2), P['chalk'], rx=math.radians(-12))
    g.box((-3.0, -6.06, 1.05), (0.6, 0.02, 0.06), P['white'], rx=math.radians(12))
    g.box((-3.0, -6.08, 0.85), (0.45, 0.02, 0.06), P['white'], rx=math.radians(12))
    # planters
    for px in (-2.6, 2.6):
        g.box((px, -2.2, 0.55), (1.1, 0.5, 0.5), P['terracotta'])
        g.ico((px, -2.2, 0.95), 0.45, P['leaf'], sub=1, sc=(1.4, 0.7, 0.8), jitter=0.1)
        g.ico((px + 0.3, -2.3, 1.2), 0.1, P['pink'], sub=1)
    # garden fence + bushes at the back
    pts = [tuple(g.world(-4.5 + 1.5 * k, 3.8)[:2]) for k in range(7)]
    fence(g, pts)
    for k in range(4):
        wx, wy, _ = (Matrix.Translation(Vector((x, y, z))) @ Matrix.Rotation(yaw, 4, 'Z') @ Vector((-4 + 2.6 * k, 5.0, 0)))
        bush(g, wx, wy, 1.0)
    return loc_finish(L, g)


def build_beachbar():
    L = LOC['beachbar']
    root, coll, z = loc_root(L)
    x, y = L['pos']
    r = math.hypot(x, y)
    ux, uy = x / r, y / r
    yaw = face_yaw(ux, uy)  # local -Y faces the sea
    g = G("beach")
    M = Matrix.Translation(Vector((x, y, z))) @ Matrix.Rotation(yaw, 4, 'Z')

    def W(lx, ly):
        p = M @ Vector((lx, ly, 0))
        return p.x, p.y
    g.at((x, y, z), yaw)
    for sx in (-2.8, 2.8):
        for sy in (-2.2, 2.2):
            g.cyl((sx, sy, -1.0), 0.15, 0.15, 1.6, P['wood_dark'], seg=6)
            g.cyl((sx, sy, 0.65), 0.13, 0.13, 2.7, P['bamboo'], seg=6)
    g.box((0, 0, 0.55), (6.4, 5.2, 0.2), P['wood_light'])
    g.cyl((0, 0, 3.2), 4.5, 3.7, 0.45, P['straw_dark'], seg=10)
    g.cyl((0, 0, 3.6), 3.75, 0.0, 2.1, P['straw'], seg=10)
    g.box((0, -1.3, 1.15), (4.2, 0.7, 1.0), P['bamboo'])
    g.box((0, -1.35, 1.7), (4.5, 0.95, 0.12), P['teal'])
    g.box((0, 1.95, 1.6), (4.2, 0.3, 1.7), P['wood'])
    for k in range(9):
        g.cyl((-1.8 + k * 0.45, 1.75, 1.95), 0.08, 0.06, 0.38, random.choice([P['glow'], P['teal'], P['red'], P['green']]),
              seg=5, mat=1 if k % 3 == 0 else 0)
    for sx in (-1.5, 0, 1.5):
        g.cyl((sx, -2.3, 0.65), 0.08, 0.08, 0.7, P['bamboo'], seg=6)
        g.cyl((sx, -2.3, 1.35), 0.3, 0.3, 0.1, P['red'], seg=8)
    g.box((0, -2.35, 2.8), (2.6, 0.1, 0.55), P['orange'])
    g.box((0, -2.4, 2.8), (2.0, 0.05, 0.25), P['yellow'])
    # tiki torches
    for sx in (-3.6, 3.6):
        g.cyl((sx, -2.8, 0.0), 0.08, 0.06, 2.2, P['bamboo'], seg=5)
        g.cyl((sx, -2.8, 2.2), 0.18, 0.12, 0.35, P['glow'], seg=5, mat=1)
    g.ident()
    for (lx, ly, s) in [(-5.2, 1.5, 1.05), (5.4, 2.6, 1.15), (6.5, -3.8, 0.9), (-6.5, -3.2, 1.0), (-9, 0.5, 1.1)]:
        wx, wy = W(lx, ly)
        palm(g, wx, wy, s)
    # parasols, loungers, towels, surfboards, ball
    for (lx, ly, ca, cb) in [(-4.0, -6.5, P['red'], P['white']), (0.5, -7.4, P['teal'], P['white']), (4.3, -6.8, P['yellow'], P['orange'])]:
        wx, wy = W(lx, ly)
        gzz = gz(wx, wy)
        if gzz < 0.05:
            continue
        g.ident()
        g.cyl((wx, wy, gzz - 0.3), 0.05, 0.05, 2.7, P['white'], seg=5)
        g.cyl((wx, wy, gzz + 2.0), 1.7, 0.0, 0.62, ca, seg=8, stripes=(ca, cb, 8))
        # sun lounger
        g.at((wx, wy, gzz), yaw)
        g.box((0.9, 0.0, 0.32), (0.7, 1.7, 0.08), P['white'])
        g.box((0.9, 1.0, 0.6), (0.7, 0.6, 0.08), P['white'], rx=math.radians(50))
        for lx2 in (0.65, 1.15):
            g.box((lx2, -0.6, 0.15), (0.05, 0.05, 0.3), P['wood'])
            g.box((lx2, 0.6, 0.15), (0.05, 0.05, 0.3), P['wood'])
        g.box((-0.9, 0.2, 0.03), (0.8, 1.6, 0.03), cb if cb != P['white'] else P['pink'])
        g.ident()
    for k, (lx, ly) in enumerate([(-7.5, -2.0), (-8.1, -1.4), (-7.0, -1.1)]):
        wx, wy = W(lx, ly)
        gzz = gz(wx, wy)
        g.at((wx, wy, gzz), yaw + 0.3 * k)
        g.ico((0, 0, 1.0), 1.0, [P['blue'], P['pink'], P['yellow']][k], sub=1, sc=(0.32, 0.08, 1.15))
        g.ico((0, -0.06, 1.0), 1.0, P['white'], sub=1, sc=(0.06, 0.04, 1.1))
        g.ident()
    wx, wy = W(2.6, -9.0)
    g.ico((wx, wy, gz(wx, wy) + 0.32), 0.38, P['red'], sub=2, stripes=(P['red'], P['white'], 6))
    # pier into the sea
    sx, sy = W(0, -2.6)
    length = 6.0
    while length < 22 and gz(sx + ux * length, sy + uy * length) > -1.4:
        length += 1.0
    length += 4
    pier(g, sx, sy, ux, uy, length)
    L['pier_end'] = (sx + ux * length, sy + uy * length)
    # rowboat (separate object for bobbing)
    rb = G("Rowboat")
    hull_mesh(rb, [(-1.3, 0.55, 0.45, 0.05), (-0.6, 0.75, 0.4, -0.15), (0.4, 0.72, 0.42, -0.15), (1.2, 0.4, 0.5, 0.0),
                   (1.6, 0.03, 0.6, 0.25)], P['wood_light'], P['blue'], P['white'])
    rb.box((0, 0.1, 0.35), (1.3, 0.25, 0.06), P['wood'])
    rb.box((0, -0.8, 0.33), (1.0, 0.25, 0.06), P['wood'])
    rb.beam((-0.4, -0.2, 0.4), (-1.3, 0.6, 0.0), 0.06, P['wood_dark'])
    px = sx + ux * (length - 2.5) + (-uy) * 2.4
    py = sy + uy * (length - 2.5) + ux * 2.4
    boat = rb.obj("Rowboat", loc=(px, py, -0.05), rz=face_yaw(-ux, -uy) + 0.15, coll=coll)
    return loc_finish(L, g, extra=[boat])


def build_chalet():
    L = LOC['chalet']
    root, coll, z = loc_root(L)
    x, y = L['pos']
    # the chalet's front (door, windows, balcony) looks at the mountain peak, not toward the sea
    yaw = face_yaw(PEAK[0] - x, PEAK[1] - y)
    g = G("chalet")
    g.at((x, y, z), yaw)
    g.box((0, 0, -0.5), (6.4, 5.4, 2.0), P['rock'])
    g.box((0, 0, 1.8), (5.6, 4.6, 2.6), P['log'])
    for zz in (0.9, 1.5, 2.1, 2.7):
        g.box((0, -2.33, zz), (5.7, 0.08, 0.12), P['wood_dark'])
        g.box((0, 2.33, zz), (5.7, 0.08, 0.12), P['wood_dark'])
    g.prism((0, 0, 3.1), 6.8, 5.8, 2.6, P['roof_dark'])
    g.prism((0, 0, 4.15), 4.1, 6.0, 1.6, P['snow'])
    for sx in (-1.6, 1.6):
        g.box((sx, -2.33, 2.0), (1.0, 0.12, 1.0), P['glow'], mat=1)
        g.box((sx, -2.38, 1.45), (1.2, 0.2, 0.12), P['snow'])
    g.box((0, -2.33, 1.4), (1.0, 0.14, 1.9), P['wood_dark'])
    g.box((0, -2.36, 4.1), (0.8, 0.1, 0.8), P['glow'], mat=1)
    g.box((0, -3.0, 2.95), (4.6, 1.2, 0.15), P['wood'])
    for k in range(9):
        g.box((-2.2 + k * 0.55, -3.55, 3.3), (0.08, 0.08, 0.6), P['wood_light'])
    g.box((0, -3.55, 3.6), (4.6, 0.1, 0.08), P['wood_light'])
    g.box((1.7, 1.0, 5.2), (0.7, 0.7, 1.8), P['rock'])
    g.box((1.7, 1.0, 6.15), (0.85, 0.85, 0.15), P['snow'])
    # firewood stack
    for row in range(3):
        for k in range(5 - row):
            g.cyl((3.2, -1.6 + k * 0.42 + row * 0.21, 0.25 + row * 0.38), 0.19, 0.19, 1.1, P['log'], seg=6,
                  rot=Matrix.Rotation(math.pi / 2, 4, 'Y') @ Matrix.Translation((0, 0, -0.55)))
    # sled
    g.box((-3.4, -3.2, 0.35), (0.8, 1.7, 0.08), P['red'])
    for sx in (-3.75, -3.05):
        g.box((sx, -3.2, 0.15), (0.06, 1.9, 0.06), P['black'])
        g.box((sx, -4.1, 0.3), (0.06, 0.06, 0.35), P['black'])
    # snowman
    g.ico((3.5, -4.0, 0.5), 0.6, P['snow'], sub=1)
    g.ico((3.5, -4.0, 1.3), 0.42, P['snow'], sub=1)
    g.cyl((3.5, -4.42, 1.33), 0.07, 0.0, 0.35, P['orange'], seg=4, rot=Matrix.Rotation(math.pi / 2, 4, 'X'))
    smoke = empty(f"SMOKE_{L['id']}", g.T @ Vector((1.7, 1.0, 6.4)), coll, size=0.6, kind='SPHERE')
    g.ident()
    M = Matrix.Translation(Vector((x, y, z))) @ Matrix.Rotation(yaw, 4, 'Z')
    for k in range(11):
        a = random.uniform(0, 2 * math.pi)
        rr = random.uniform(6.5, 11)
        p = M @ Vector((math.cos(a) * rr, math.sin(a) * rr + 2, 0))
        if np.hypot(PATH[:, 0] - p.x, PATH[:, 1] - p.y).min() < 2.2:
            continue
        pine(g, p.x, p.y, random.uniform(0.8, 1.25), snow=True)
    return loc_finish(L, g, extra=[smoke])


def build_funfair():
    L = LOC['funfair']
    root, coll, z = loc_root(L)
    x, y = L['pos']
    yaw = face_yaw(-x, -y)
    g = G("fair")
    g.at((x, y, z), yaw)
    M = g.T.copy()
    # ferris wheel support
    g.box((0, 3, 0.1), (7.5, 3.6, 0.5), P['cream'])
    for sy in (2.0, 4.0):
        for sx in (-3.0, 3.0):
            g.beam((sx, sy, 0.2), (0, sy, 8.0), 0.3, P['white'])
    g.beam((0, 1.7, 8.0), (0, 4.3, 8.0), 0.4, P['gray'])
    # ticket booth
    g.box((4.8, -1.0, 1.0), (1.6, 1.4, 2.0), P['pink'])
    g.box((4.8, -1.72, 1.3), (1.0, 0.06, 0.7), P['glow'], mat=1)
    g.prism((4.8, -1.0, 2.0), 1.9, 1.7, 0.8, P['white'])
    # tent
    tc = (-6.0, -3.5, 0)
    g.cyl(tc, 3.0, 3.0, 2.4, P['red'], seg=12, stripes=(P['red'], P['cream'], 12))
    g.cyl((tc[0], tc[1], 2.4), 3.35, 0.0, 2.8, P['red'], seg=12, stripes=(P['red'], P['cream'], 12))
    g.cyl((tc[0], tc[1], 5.1), 0.05, 0.05, 1.3, P['black'], seg=4)
    g.box((tc[0] + 0.35, tc[1], 6.15), (0.7, 0.04, 0.4), P['yellow'])
    g.box((tc[0], tc[1] - 2.95, 0.9), (1.2, 0.2, 1.8), P['wood_dark'])
    # balloons
    for k in range(6):
        bx, by = 6.2 + random.uniform(-0.6, 0.6), -2.2 + random.uniform(-0.6, 0.6)
        bz = 2.6 + random.uniform(0, 1.0)
        g.beam((5.6, -1.8, 1.2), (bx, by, bz), 0.02, P['white'])
        g.ico((bx, by, bz + 0.3), 0.32, random.choice([P['red'], P['yellow'], P['blue'], P['pink'], P['green']]),
              sub=1, sc=(1, 1, 1.2))
    # bunting around
    poles = [(-9.5, -7.5), (-3, -9.5), (3.5, -9.0), (9.0, -5.5), (10, 1.5)]
    cols = [P['red'], P['yellow'], P['blue'], P['green'], P['pink'], P['orange']]
    for (px, py) in poles:
        g.cyl((px, py, -0.3), 0.08, 0.07, 4.8, P['white'], seg=5)
        g.ico((px, py, 4.55), 0.15, P['yellow'], sub=1)
    for i in range(len(poles) - 1):
        A = Vector((poles[i][0], poles[i][1], 4.3))
        B = Vector((poles[i + 1][0], poles[i + 1][1], 4.3))
        n = 9
        for k in range(n):
            t0, t1 = k / n, (k + 0.6) / n
            p0 = A.lerp(B, t0) - Vector((0, 0, 0.8 * math.sin(math.pi * t0)))
            p1 = A.lerp(B, t1) - Vector((0, 0, 0.8 * math.sin(math.pi * t1)))
            pm = (p0 + p1) / 2 - Vector((0, 0, 0.55))
            g.poly([p0, p1, pm], [(0, 1, 2)], cols[k % len(cols)])
    # benches + lanterns
    for (bx, by) in [(-2, -7), (2.5, -7)]:
        g.box((bx, by, 0.5), (1.8, 0.5, 0.1), P['wood'])
        g.box((bx, by + 0.25, 0.85), (1.8, 0.08, 0.5), P['wood'])
    g.ident()
    # carousel (separate rotating object)
    cpos = M @ Vector((6.5, 5.0, 0))
    cg = G("Carousel")
    cg.cyl((0, 0, 0), 3.0, 3.0, 0.4, P['cream'], seg=12, stripes=(P['cream'], P['pink'], 12))
    cg.cyl((0, 0, 0.4), 0.3, 0.3, 3.0, P['yellow'], seg=8)
    cg.cyl((0, 0, 3.3), 3.3, 3.3, 0.35, P['red'], seg=12, stripes=(P['red'], P['white'], 12))
    cg.cyl((0, 0, 3.65), 3.3, 0.0, 1.5, P['red'], seg=12, stripes=(P['red'], P['white'], 12))
    cg.ico((0, 0, 5.25), 0.25, P['yellow'], sub=1)
    for k in range(8):
        a = 2 * math.pi * k / 8
        px, py = math.cos(a) * 2.3, math.sin(a) * 2.3
        hz = 1.3 + 0.3 * (k % 2)
        cg.cyl((px, py, 0.4), 0.05, 0.05, 2.9, P['yellow'], seg=4)
        hc = [P['white'], P['blue'], P['pink'], P['yellow']][k % 4]
        cg.at((px, py, hz), a)
        cg.box((0, 0, 0), (0.35, 0.9, 0.45), hc)
        cg.box((0, 0.45, 0.35), (0.28, 0.3, 0.5), hc)
        cg.box((0, 0.2, 0.5), (0.4, 0.15, 0.06), P['red'])
        cg.ident()
        cg.ico((math.cos(a) * 3.1, math.sin(a) * 3.1, 3.45), 0.09, P['glow'], sub=1, mat=1)
    car = cg.obj("Carousel", loc=(cpos.x, cpos.y, gz(cpos.x, cpos.y) - 0.05), coll=coll)
    # ferris wheel rotor (axis = local Y)
    hub = M @ Vector((0, 3, 8.0))
    fw = G("FerrisWheel")
    Rw = 6.0
    gcols = [P['red'], P['yellow'], P['blue'], P['teal'], P['pink'], P['orange'], P['purple'], P['green']]
    for yy in (-0.55, 0.55):
        for k in range(16):
            a = 2 * math.pi * (k + 0.5) / 16
            fw.box((Rw * math.cos(a), yy, Rw * math.sin(a)), (0.22, 0.2, 2 * math.pi * Rw / 16 + 0.05), P['white'], ry=-a)
            fw.ico((Rw * math.cos(a) * 1.02, yy * 1.2, Rw * math.sin(a) * 1.02), 0.08, P['glow'], sub=1, mat=1)
        for k in range(8):
            a = 2 * math.pi * k / 8
            fw.box((Rw / 2 * math.cos(a), yy, Rw / 2 * math.sin(a)), (Rw, 0.12, 0.12), P['white'], ry=-a)
    fw.cyl((0, -0.8, 0), 0.6, 0.6, 1.6, P['red'], seg=8, rot=Matrix.Rotation(-math.pi / 2, 4, 'X'))
    for k in range(8):
        a = 2 * math.pi * k / 8
        cx, cz = Rw * math.cos(a), Rw * math.sin(a)
        fw.box((cx, 0, cz), (0.08, 1.2, 0.08), P['gray'])
        fw.box((cx, 0, cz - 0.75), (1.0, 0.9, 0.8), gcols[k])
        fw.box((cx, 0, cz - 0.28), (1.15, 1.0, 0.1), P['white'])
    wheel = fw.obj("FerrisWheel", loc=tuple(hub), rz=yaw, coll=coll)
    return loc_finish(L, g, extra=[car, wheel])


def build_ship():
    L = LOC['ship']
    root, coll, z = loc_root(L)
    x, y = L['pos']
    r = math.hypot(x, y)
    ux, uy = x / r, y / r
    g = G("dock")
    # find deep water
    s = 10.0
    while s < 34 and gz(x + ux * s - uy * 4.6, y + uy * s + ux * 4.6) > -2.2:
        s += 1.0
    plen = s + 5
    pier(g, x, y, ux, uy, plen, width=2.6, z=1.05)
    # crates + barrels on the dock
    yawp = face_yaw(-ux, -uy)
    M = Matrix.Translation(Vector((x, y, 1.11))) @ Matrix.Rotation(yawp, 4, 'Z')
    for (lx, ly, kind) in [(0.6, 3.0, 'c'), (0.7, 3.9, 'c'), (-0.7, 4.6, 'b'), (-0.6, 5.5, 'b'), (0.6, 8.5, 'b'),
                           (0.65, 9.4, 'c'), (-0.65, plen - 2.5, 'c'), (0.6, plen - 3.5, 'b')]:
        p = M @ Vector((lx, ly, 0))
        if kind == 'c':
            crate(g, p.x, p.y, p.z, 0.8, yawp + random.uniform(-0.3, 0.3))
        else:
            barrel(g, p.x, p.y, p.z)
    p = M @ Vector((0.65, 3.45, 0.8))
    crate(g, p.x, p.y, p.z, 0.6, yawp + 0.5)
    # bollards + rope coil
    for ly in (6.5, plen - 1.0):
        p = M @ Vector((-1.1, ly, 0))
        g.ident()
        g.cyl((p.x, p.y, p.z), 0.15, 0.15, 0.4, P['black'], seg=6)
    # ship (separate object, bobs in three.js)
    sh = G("PirateShip")
    secs = [(-5.2, 1.6, 2.3, -0.4), (-3.6, 2.0, 2.0, -0.9), (-1.0, 2.15, 1.75, -1.1), (1.6, 2.05, 1.75, -1.05),
            (3.6, 1.6, 1.9, -0.8), (5.2, 0.8, 2.2, -0.4), (6.2, 0.05, 2.5, 0.2)]
    hull_mesh(sh, secs, P['deck'], P['hull'], P['hull_low'])
    # gold stripe
    for i in range(len(secs) - 1):
        for sgn in (-1, 1):
            a = Vector((sgn * secs[i][1] * 1.005, secs[i][0], secs[i][2] - 0.45))
            b = Vector((sgn * secs[i + 1][1] * 1.005, secs[i + 1][0], secs[i + 1][2] - 0.45))
            sh.beam(a, b, 0.12, P['yellow'], t2=0.05)
            a2 = Vector((sgn * secs[i][1] * 0.97, secs[i][0], secs[i][2] + 0.25))
            b2 = Vector((sgn * secs[i + 1][1] * 0.97, secs[i + 1][0], secs[i + 1][2] + 0.25))
            sh.beam(a2, b2, 0.1, P['wood_dark'])
    sh.box((0, -3.9, 2.75), (3.4, 2.4, 1.5), P['wood'])
    sh.box((0, -3.9, 3.55), (3.7, 2.7, 0.15), P['wood_dark'])
    for sx in (-0.9, 0.0, 0.9):
        sh.box((sx, -5.12, 2.75), (0.5, 0.08, 0.5), P['glow'], mat=1)
    sh.box((0, -5.25, 3.9), (0.12, 0.12, 0.8), P['black'])
    sh.box((0, -5.25, 4.4), (0.35, 0.35, 0.4), P['glow'], mat=1)
    sh.cyl((0, 1.4, 1.5), 0.2, 0.15, 10.0, P['wood_dark'], seg=6)
    sh.cyl((0, -1.6, 1.6), 0.18, 0.14, 8.4, P['wood_dark'], seg=6)
    for (my, zz, w, hh) in [(1.4, 4.2, 4.2, 2.8), (1.4, 7.6, 3.2, 2.2), (-1.6, 4.3, 3.6, 2.4), (-1.6, 7.2, 2.6, 1.7)]:
        sh.beam((-w / 2 - 0.2, my, zz + hh / 2 + 0.05), (w / 2 + 0.2, my, zz + hh / 2 + 0.05), 0.12, P['wood_dark'])
        V = [(-w / 2, my, zz + hh / 2), (w / 2, my, zz + hh / 2), (w / 2 * 1.08, my + 0.45, zz - hh / 2),
             (-w / 2 * 1.08, my + 0.45, zz - hh / 2), (0, my + 0.6, zz)]
        sh.poly(V, [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)], P['sail'])
    sh.box((0.55, 1.4, 11.0), (1.1, 0.04, 0.7), P['black'])
    sh.ico((0.55, 1.36, 11.05), 0.16, P['white'], sub=1, sc=(1, 0.3, 1))
    sh.beam((0, 6.0, 2.3), (0, 9.0, 3.3), 0.2, P['wood_dark'])
    sh.poly([(0, 8.8, 3.3), (0, 1.6, 10.8), (0, 2.0, 3.0)], [(0, 1, 2)], P['sail'])
    for sgn in (-1, 1):
        for cy in (-2.0, 0.0, 2.0):
            w = 2.1 if abs(cy) < 1.5 else 2.0
            sh.cyl((sgn * (w - 0.2), cy, 1.2), 0.17, 0.13, 0.75, P['black'], seg=6,
                   rot=Matrix.Rotation(sgn * math.pi / 2, 4, 'Y'))
            sh.box((sgn * (w - 0.05), cy, 1.2), (0.06, 0.55, 0.45), P['wood_dark'])
    sh.ico((0, 6.0, 1.9), 0.3, P['yellow'], sub=1)  # figurehead
    sp = Vector((x + ux * s - uy * 4.6, y + uy * s + ux * 4.6, 0.0))
    ship = sh.obj("PirateShip", loc=tuple(sp), rz=face_yaw(-ux, -uy), coll=coll)
    out = loc_finish(L, g, extra=[ship])
    for nm, dz in ((f"PIN_{L['id']}", 14.0), (f"CAMT_{L['id']}", 4.0)):
        e = bpy.data.objects[nm]
        e.location = (sp.x - x, sp.y - y, dz)  # child of the root, root sits at (x, y, z)
        e.matrix_parent_inverse = Matrix.Identity(4)
        e.location = (sp.x - x, sp.y - y, dz - z + z)  # local offset from root
    cp = bpy.data.objects[f"CAMP_{L['id']}"]
    cp.matrix_parent_inverse = Matrix.Identity(4)
    cp.location = (sp.x - x + ux * 22 - uy * 10, sp.y - y + uy * 22 + ux * 10, 13.0)
    return out


def build_castle():
    L = LOC['castle']
    root, coll, z = loc_root(L)
    x, y = L['pos']
    yaw = face_yaw(-x, -y)
    g = G("castle")
    g.at((x, y, z), yaw)
    g.box((0, 1.0, -0.8), (11, 9.5, 2.2), P['castle_dark'])
    g.box((0, 1.0, 2.8), (8, 6.6, 5.2), P['castle'])
    for k in range(13):
        xx = -3.75 + k * 0.625
        if k % 2 == 0:
            g.box((xx, 1.0 - 3.3, 5.65), (0.5, 0.5, 0.6), P['castle'])
            g.box((xx, 1.0 + 3.3, 5.65), (0.5, 0.5, 0.6), P['castle'])
    for (tx, ty) in [(-4.3, -2.6), (4.3, -2.6), (-4.3, 4.6), (4.3, 4.6)]:
        g.cyl((tx, ty, 0), 1.4, 1.3, 8.2, P['castle'], seg=8)
        g.cyl((tx, ty, 8.2), 1.6, 1.6, 0.45, P['castle_dark'], seg=8)
        g.cyl((tx, ty, 8.65), 1.75, 0.0, 3.2, P['purple'], seg=8)
        g.cyl((tx, ty, 11.8), 0.04, 0.04, 1.0, P['black'], seg=3)
        g.poly([(tx, ty, 12.75), (tx + 0.8, ty, 12.55), (tx, ty, 12.35)], [(0, 1, 2)], P['purple_dark'])
        ox, oy = tx, ty - 1.0
        d = Vector((tx, ty - 1.0, 0)).normalized()
        for zz in (3.0, 6.0):
            g.box((tx + d.x * 1.37, ty + d.y * 1.37, zz), (0.45, 0.12, 0.8), P['glowp'], rz=math.atan2(d.x, -d.y), mat=2)
    g.cyl((0, 1.6, 0), 1.9, 1.8, 12.0, P['castle'], seg=8)
    g.cyl((0, 1.6, 12.0), 2.1, 2.1, 0.5, P['castle_dark'], seg=8)
    g.cyl((0, 1.6, 12.5), 2.4, 0.0, 4.6, P['purple'], seg=8)
    for zz in (7.0, 9.5):
        g.box((0, 1.6 - 1.86, zz), (0.5, 0.12, 0.9), P['glowp'], mat=2)
    g.box((0, -2.33, 1.5), (2.0, 0.2, 2.8), P['black'])
    g.cyl((0, -2.35, 2.9), 1.0, 1.0, 0.2, P['black'], seg=8, rot=Matrix.Rotation(math.pi / 2, 4, 'X'))
    for sx in (-2.3, 2.3):
        g.box((sx, -2.32, 3.6), (0.6, 0.12, 1.0), P['glowp'], mat=2)
        g.cyl((sx * 0.6, -2.6, 2.2), 0.12, 0.12, 0.3, P['glowp'], seg=5, mat=2)
    # broken curtain wall in front with a gap and rubble
    for (a, b) in [((-9, -6.5), (-4, -6.5)), ((-1.0, -6.5), (2.0, -6.5)), ((6, -6.5), (9, -6.5))]:
        g.box(((a[0] + b[0]) / 2, a[1], 1.0), (b[0] - a[0], 0.9, 2.6 + random.uniform(-0.6, 0.6)), P['castle'])
    for k in range(10):
        g.box((random.uniform(-4, -1) if k % 2 else random.uniform(2, 6), -6.5 + random.uniform(-1.5, 1.5), 0.2),
              [random.uniform(0.4, 0.9)] * 3, P['castle_dark'], rz=random.uniform(0, 3), rx=random.uniform(-.4, .4))
    # graveyard
    for k in range(9):
        gx, gy = -8 + (k % 3) * 1.6 + random.uniform(-.2, .2), -9 - (k // 3) * 1.6
        g.box((gx, gy, 0.45), (0.7, 0.2, 1.0), P['grave'], rz=random.uniform(-.2, .2), rx=random.uniform(-.15, .15))
        if k % 3 == 1:
            g.box((gx, gy, 0.75), (0.7, 0.21, 0.15), P['grave'])
    # wisps
    for k in range(6):
        g.ico((random.uniform(-9, 9), random.uniform(-10, 6), random.uniform(1.5, 4)), 0.14, P['glowp'], sub=1, mat=2)
    g.ident()
    M = Matrix.Translation(Vector((x, y, z))) @ Matrix.Rotation(yaw, 4, 'Z')
    for k in range(7):
        a = random.uniform(0, 2 * math.pi)
        rr = random.uniform(8, 12)
        p = M @ Vector((math.cos(a) * rr, math.sin(a) * rr, 0))
        zz = gz(p.x, p.y) - 0.2
        if zz < 0.5:
            continue
        base = Vector((p.x, p.y, zz))
        top = base + Vector((random.uniform(-.4, .4), random.uniform(-.4, .4), 3.2))
        g.beam(base, top, 0.28, P['deadwood'])
        for b in range(3):
            bb = base.lerp(top, 0.5 + 0.2 * b)
            ang = random.uniform(0, 6.28)
            g.beam(bb, bb + Vector((math.cos(ang) * 1.3, math.sin(ang) * 1.3, 0.9)), 0.12, P['deadwood'])
    bats = empty(f"BATS_{L['id']}", M @ Vector((0, 1.6, 14)), coll, size=1.0, kind='SPHERE')
    return loc_finish(L, g, extra=[bats])


# ------------------------------------------------------------------ nature + path props
def build_nature():
    coll = bpy.data.collections["Island_Base"]
    g = G("Nature")
    placed = []
    locs = [(L['pos'][0], L['pos'][1], L['pad'] + 3.5) for L in LOCDEF]

    def ok(x, y, mind=2.4, pathd=2.6):
        if np.min(np.hypot(PATH[:, 0] - x, PATH[:, 1] - y)) < pathd:
            return False
        if np.min(np.hypot(RIVER[:, 0] - x, RIVER[:, 1] - y)) < 3.0:
            return False
        for (lx, ly, lr) in locs:
            if math.hypot(x - lx, y - ly) < lr:
                return False
        for (px, py) in placed:
            if math.hypot(x - px, y - py) < mind:
                return False
        return True
    tries = 0
    ntree = 0
    while ntree < 150 and tries < 6000:
        tries += 1
        th = random.uniform(-math.pi, math.pi)
        f = math.sqrt(random.uniform(0.0, 0.93))
        r = coastR(th) * f
        x, y = r * math.cos(th), r * math.sin(th)
        zz, nz = ground(x, y)
        if zz < 0.8 or nz < 0.82 or zz > 13:
            continue
        # clustered forests via noise
        if noise.noise(Vector((x * 0.05, y * 0.05, 11.0))) < -0.15 and f < 0.75:
            continue
        if not ok(x, y):
            continue
        placed.append((x, y))
        ntree += 1
        if f > 0.78 and zz < 1.8:
            palm(g, x, y, random.uniform(0.8, 1.1))
        elif zz > 6.5:
            pine(g, x, y, random.uniform(0.8, 1.3), snow=zz > 10)
        elif random.random() < 0.35:
            pine(g, x, y, random.uniform(0.8, 1.2))
        else:
            round_tree(g, x, y, random.uniform(0.8, 1.25))
    nb = nf = nr = 0
    tries = 0
    while (nb < 70 or nf < 45 or nr < 45) and tries < 8000:
        tries += 1
        th = random.uniform(-math.pi, math.pi)
        f = math.sqrt(random.uniform(0.0, 0.97))
        r = coastR(th) * f
        x, y = r * math.cos(th), r * math.sin(th)
        zz, nz = ground(x, y)
        if zz < 0.3:
            continue
        if nr < 45 and (nz < 0.8 or random.random() < 0.3) and ok(x, y, 1.5, 1.8):
            placed.append((x, y)); nr += 1
            rock(g, x, y, random.choice([0.4, 0.6, 0.9, 1.3, 1.9]))
        elif nb < 70 and nz > 0.8 and zz < 11 and ok(x, y, 1.4, 1.9):
            placed.append((x, y)); nb += 1
            bush(g, x, y, random.uniform(0.7, 1.3))
        elif nf < 45 and nz > 0.85 and 1.0 < zz < 9 and ok(x, y, 2.0, 1.6):
            placed.append((x, y)); nf += 1
            flower_patch(g, x, y, random.randint(6, 11))
    # deco from the river step (rocks + foam)
    ob = g.obj("Nature", coll=coll)
    deco = MAIN['deco'].obj("RiverDeco", coll=coll)
    log(f"nature: {ntree} trees, {nb} bushes, {nf} flower patches, {nr} rocks")
    return [ob, deco]


def build_path_props():
    coll = bpy.data.collections["Island_Base"]
    g = G("PathProps")
    n = len(PATH)
    # lanterns every ~13 units, alternating sides
    side = 1
    for i in range(6, n - 6, 16):
        dx, dy = PATH[i + 1] - PATH[i]
        L = math.hypot(dx, dy)
        px, py = -dy / L * side * 1.8, dx / L * side * 1.8
        x, y = PATH[i][0] + px, PATH[i][1] + py
        if np.min(np.hypot(RIVER[:, 0] - x, RIVER[:, 1] - y)) > 3 and gz(x, y) > 0.5:
            lantern(g, x, y)
        side = -side
    # signposts at the junction between each pair of locations (forks to the neighbours)
    cols = [P['red'], P['teal'], P['blue'], P['yellow'], P['orange'], P['purple']]
    seglen = n // 5
    for i in range(5):
        k = i * seglen + seglen // 2
        dx, dy = PATH[k + 1] - PATH[k]
        L = math.hypot(dx, dy)
        x, y = PATH[k][0] - dy / L * 2.0, PATH[k][1] + dx / L * 2.0
        A, B = LOCDEF[i], LOCDEF[i + 1]
        signpost(g, x, y, [(A['pos'][0], A['pos'][1], cols[i]), (B['pos'][0], B['pos'][1], cols[i + 1])])
    # wooden bridge where the path crosses the river
    d, ix = seg_dist(PATH, RIVER)
    j = int(np.argmin(d))
    if d[j] < 2.5:
        px, py = PATH[j]
        dx, dy = PATH[min(j + 2, n - 1)] - PATH[max(j - 2, 0)]
        a = math.atan2(dy, dx)
        zb = max(gz(PATH[max(j - 6, 0)][0], PATH[max(j - 6, 0)][1]), gz(PATH[min(j + 6, n - 1)][0], PATH[min(j + 6, n - 1)][1]))
        ri = int(min(ix[j], len(RIVER_Z) - 1))
        zr = RIVER_Z[ri]
        deck = max(zb, zr + 1.2)
        g.at((px, py, 0), a - math.pi / 2)  # local +Y along path direction
        span = 9.0
        k = 0
        for s in np.arange(-span / 2, span / 2, 0.45):
            arch = 0.7 * math.cos(math.pi * s / span)
            g.box((0, s, deck + arch - 0.3), (2.2, 0.4, 0.14), P['wood_light'] if k % 2 else P['wood'])
            k += 1
        for sx in (-1.15, 1.15):
            prev = None
            for s in np.arange(-span / 2, span / 2 + 0.01, span / 6):
                arch = 0.7 * math.cos(math.pi * s / span)
                g.box((sx, s, deck + arch + 0.2), (0.12, 0.12, 1.0), P['wood_dark'])
                p = Vector((sx, s, deck + arch + 0.65))
                if prev is not None:
                    g.beam(prev, p, 0.09, P['wood'])
                prev = p
            for s in (-span / 2 + 0.5, span / 2 - 0.5):
                g.cyl((sx, s, zr - 1.0), 0.15, 0.15, deck - zr + 0.8, P['wood_dark'], seg=6)
        g.ident()
        log(f"bridge at path idx {j} deck {deck:.2f}")
    # stepping stones across the lower river (near the beach)
    ri = int(len(RIVER) * 0.86)
    rx, ry = RIVER[ri]
    dx, dy = RIVER[ri + 1] - RIVER[ri]
    L = math.hypot(dx, dy)
    for k in range(-2, 3):
        sx, sy = rx - dy / L * k * 0.95, ry + dx / L * k * 0.95
        g.ident()
        g.cyl((sx + random.uniform(-.15, .15), sy, RIVER_Z[ri] - 0.6), 0.42, 0.36, 0.75, P['stone'], seg=7)
    # fences along the castle headland path section
    i0 = 4 * seglen + int(seglen * 0.55)
    pts = []
    for i in range(i0, n - 8, 3):
        dx, dy = PATH[i + 1] - PATH[i]
        L = math.hypot(dx, dy)
        pts.append((PATH[i][0] + dy / L * 1.6, PATH[i][1] - dx / L * 1.6))
    fence(g, pts)
    pts = []
    for i in range(int(seglen * 0.15), int(seglen * 0.45), 3):
        dx, dy = PATH[i + 1] - PATH[i]
        L = math.hypot(dx, dy)
        pts.append((PATH[i][0] - dy / L * 1.6, PATH[i][1] + dx / L * 1.6))
    fence(g, pts)
    ob = g.obj("PathProps", coll=coll)
    # player path empties (spline samples) for the moving marker
    pr = empty("PATH", (0, 0, 0), coll, size=2, kind='PLAIN_AXES')
    pathdata = []
    for k in range(0, n, 3):
        x, y = PATH[k]
        z = max(gz(x, y), 0.0) + 0.05
        e = empty(f"PATH_{k // 3:03d}", (x, y, z), coll, size=0.3, kind='PLAIN_AXES', parent=pr)
        pathdata.append([x, y, z])
    MAIN['pathdata'] = pathdata
    # which path sample is closest to each location
    for L in LOCDEF:
        dd = [math.hypot(p[0] - L['pos'][0], p[1] - L['pos'][1]) for p in pathdata]
        L['path_index'] = int(np.argmin(dd))
    return [ob]


# ------------------------------------------------------------------ far islands
ISLETS = [
    dict(name="Isle_Lighthouse", c=(168, 72), R=13, peak=7, seed=1.3, sandy=False),
    dict(name="Isle_PalmCay", c=(-142, 128), R=9, peak=1.6, seed=2.1, sandy=True),
    dict(name="Isle_RockStacks", c=(38, -178), R=11, peak=13, seed=0.7, sandy=False),
    dict(name="Isle_Twin", c=(-188, -66), R=10, peak=4.5, seed=3.3, sandy=True),
]


def islet_h(I):
    cx, cy = I['c']

    def hf(x, y):
        dx, dy = x - cx, y - cy
        r = math.hypot(dx, dy)
        th = math.atan2(dy, dx)
        R = I['R'] * (1 + 0.18 * math.sin(2 * th + I['seed']) + 0.1 * math.sin(3 * th + 2 * I['seed']) + 0.05 * math.sin(5 * th + 3 * I['seed']))
        d = r / R
        n = fbm(x * 0.12, y * 0.12, I['seed'])
        if d < 0.8:
            return 0.8 + I['peak'] * smooth(0.8, 0.05, d) ** 1.3 * (0.85 + 0.3 * n) + 0.35 * n
        if d < 1.0:
            return 0.8 * (1 - d) / 0.2
        return -min((d - 1) * 16, 7.0)
    return hf


def build_islet(I):
    coll = new_coll("Far_Islands")
    g = G(I['name'])
    ext = I['R'] * 1.75
    hf = islet_h(I)
    terrain_grid(g, I['c'][0], I['c'][1], ext, 34, hf, seed=int(I['seed'] * 10))
    for f in g.bm.faces:
        c = f.calc_center_median()
        nz = f.normal.z
        if c.z < -0.05:
            col = mix(mix(P['sand_wet'], P['seabed'], -c.z / 2), P['seabed_deep'], (-c.z - 2) / 5)
        elif c.z < 1.0 and nz > 0.6 and (I['sandy'] or random.random() < 0.4):
            col = P['sand']
        elif nz < 0.65:
            col = P['rock'] if random.random() < .6 else P['rock_dark']
        else:
            col = grass_col(c)
        g.pf(f, col, 0, 0.04)
    bvh = BVHTree.FromBMesh(g.bm)
    cx, cy = I['c']
    BVHS.append((bvh, cx - ext, cx + ext, cy - ext, cy + ext))
    I['bvh'] = bvh
    # props
    out = []
    if I['name'] == "Isle_Lighthouse":
        hx, hy = cx, cy
        zt = gz(hx, hy) - 0.3
        g.ident()
        cols = [P['white'], P['lh_red']]
        for k in range(5):
            g.cyl((hx, hy, zt + k * 2.0), 1.35 - k * 0.1, 1.25 - k * 0.1, 2.0, cols[k % 2], seg=10)
        g.cyl((hx, hy, zt + 10), 1.5, 1.5, 0.3, P['black'], seg=10)
        g.cyl((hx, hy, zt + 10.3), 0.75, 0.75, 1.3, P['glow'], seg=8, mat=1)
        g.cyl((hx, hy, zt + 11.6), 1.0, 0.0, 1.3, P['lh_red'], seg=10)
        hx2, hy2 = cx + 3.5, cy - 2.5
        z2 = gz(hx2, hy2)
        g.box((hx2, hy2, z2 + 0.8), (3, 2.4, 2.0), P['white'])
        g.prism((hx2, hy2, z2 + 1.8), 3.3, 2.7, 1.2, P['lh_red'])
        g.box((hx2, hy2 - 1.22, z2 + 1.0), (0.6, 0.1, 0.6), P['glow'], mat=1)
        out.append(empty("LIGHTHOUSE_LAMP", (hx, hy, zt + 11.0), coll, size=1.0, kind='SPHERE'))
        for k in range(5):
            a = random.uniform(0, 6.28)
            rock(g, cx + math.cos(a) * I['R'] * 0.9, cy + math.sin(a) * I['R'] * 0.9, random.uniform(0.8, 1.6))
    elif I['name'] == "Isle_PalmCay":
        for k in range(5):
            a = random.uniform(0, 6.28)
            rr = random.uniform(0, I['R'] * 0.5)
            palm(g, cx + math.cos(a) * rr, cy + math.sin(a) * rr, random.uniform(0.9, 1.2))
        g.ident()
        z0 = gz(cx + 2, cy + 2)
        g.box((cx + 2, cy + 2, z0 + 0.3), (0.9, 0.7, 0.6), P['wood'])  # treasure chest
        g.box((cx + 2, cy + 2, z0 + 0.7), (0.95, 0.75, 0.2), P['yellow'])
    elif I['name'] == "Isle_RockStacks":
        for k in range(6):
            a = random.uniform(0, 6.28)
            rr = random.uniform(I['R'] * 0.9, I['R'] * 1.5)
            rx, ry = cx + math.cos(a) * rr, cy + math.sin(a) * rr
            g.ident()
            g.ico((rx, ry, -1.0), 1.0, P['rock'], sub=1, sc=(1.6, 1.4, random.uniform(4, 8)), jitter=0.2)
        for k in range(5):
            a = random.uniform(0, 6.28)
            rr = random.uniform(0, I['R'] * 0.5)
            x, y = cx + math.cos(a) * rr, cy + math.sin(a) * rr
            if ground(x, y)[1] > 0.75:
                pine(g, x, y, 0.9)
    else:
        for k in range(3):
            a = random.uniform(0, 6.28)
            palm(g, cx + math.cos(a) * 3, cy + math.sin(a) * 3, 1.0)
        for k in range(6):
            a = random.uniform(0, 6.28)
            rock(g, cx + math.cos(a) * I['R'] * 0.8, cy + math.sin(a) * I['R'] * 0.8, random.uniform(0.6, 1.4))
    ob = g.obj(I['name'], coll=coll)
    return [ob] + out


def build_sea():
    coll = new_coll("Far_Islands")
    g = G("SeaRocks")
    n = 0
    tries = 0
    while n < 34 and tries < 2000:
        tries += 1
        a = random.uniform(-math.pi, math.pi)
        if n < 12:
            rr = coastR(a) * random.uniform(1.06, 1.25)
            # keep clear of the piers / river mouth
            if min(abs(angdiff(a, math.radians(d))) for d in (-40, 152, 74)) < 0.3:
                continue
        else:
            rr = random.uniform(80, 230)
        x, y = rr * math.cos(a), rr * math.sin(a)
        if any(math.hypot(x - I['c'][0], y - I['c'][1]) < I['R'] * 2 for I in ISLETS):
            continue
        s = random.uniform(0.8, 2.6)
        g.ident()
        g.ico((x, y, random.uniform(-1.2, -0.2)), s, P['rock'] if random.random() < .5 else P['rock2'], sub=1,
              sc=(random.uniform(1, 1.5), random.uniform(0.8, 1.2), random.uniform(0.7, 1.4)), jitter=0.25,
              rz=random.uniform(0, 6))
        if random.random() < 0.3:
            g.ico((x + s * 0.8, y, -0.2), s * 0.45, P['rock2'], sub=1, jitter=0.2)
        n += 1
    ob = g.obj("SeaRocks", coll=coll)
    # buoys (separate, bob in three.js)
    out = [ob]
    for k in range(6):
        a = math.radians(-160 + k * 61 + random.uniform(-10, 10))
        rr = coastR(a) * random.uniform(1.25, 1.45)
        bg = G(f"Buoy_{k + 1}")
        bg.cyl((0, 0, -0.5), 0.45, 0.5, 0.9, P['red'] if k % 2 else P['white'], seg=8,
               stripes=(P['red'], P['white'], 4))
        bg.cyl((0, 0, 0.4), 0.12, 0.05, 1.0, P['black'], seg=4)
        bg.ico((0, 0, 1.45), 0.14, P['glow'], sub=1, mat=1)
        out.append(bg.obj(f"Buoy_{k + 1}", loc=(rr * math.cos(a), rr * math.sin(a), 0), coll=coll))
    # dolphin + whale tail (animated in three.js)
    dg = G("Dolphin")
    dg.ico((0, 0, 0), 1.0, P['dolphin'], sub=2, sc=(0.45, 1.4, 0.45))
    dg.ico((0, 1.35, -0.05), 0.25, P['dolphin'], sub=1, sc=(0.6, 1.4, 0.5))
    dg.poly([(0, -0.2, 0.35), (0, 0.4, 0.4), (0, -0.4, 0.9)], [(0, 1, 2)], P['dolphin'])
    dg.poly([(0, -1.25, 0), (-0.6, -1.75, 0.05), (0.6, -1.75, 0.05)], [(0, 1, 2)], P['dolphin'])
    dg.ico((0, 0.2, -0.2), 1.0, P['white'], sub=1, sc=(0.35, 1.0, 0.25))
    out.append(dg.obj("Dolphin", loc=(110, -40, -3), coll=coll))
    wg = G("WhaleTail")
    wg.ico((0, 0, 0.6), 1.0, P['whale'], sub=1, sc=(0.6, 0.6, 1.4))
    for sgn in (-1, 1):
        wg.poly([(0, 0, 1.8), (sgn * 2.4, 0.3, 2.6), (sgn * 2.0, 0.0, 1.7), (sgn * 0.6, 0, 1.4)], [(0, 1, 2), (0, 2, 3)], P['whale'])
    out.append(wg.obj("WhaleTail", loc=(-95, -120, -4), coll=coll))
    return out


def build_meta():
    """write the JSON side-car (three.js coordinates: x, z, -y)"""
    def t3(v):
        return [round(v[0], 3), round(v[2], 3), round(-v[1], 3)]
    bpy.context.view_layer.update()
    locs = []
    for L in LOCDEF:
        pin = bpy.data.objects[f"PIN_{L['id']}"].matrix_world.translation
        ct = bpy.data.objects[f"CAMT_{L['id']}"].matrix_world.translation
        cp = bpy.data.objects[f"CAMP_{L['id']}"].matrix_world.translation
        locs.append(dict(id=L['id'], key=L['key'], name=L['name'], node=f"LOC_{L['id']}_{L['key']}",
                         pin=t3(pin), camTarget=t3(ct), camPos=t3(cp), pathIndex=L['path_index']))
    meta = dict(extent=HM['E'], heightMin=-8.0, heightRange=12.0, heightmap="heightmap.png",
                locations=locs, path=[t3(p) for p in MAIN['pathdata']],
                river=dict(points=[t3((x, y, float(z))) for (x, y), z in zip(RIVER.tolist(), RIVER_Z.tolist())]))
    with open(os.path.join(OUT, "map_meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False)


HM = dict(E=240.0, W=768)


def step_heightmap():
    E, W = HM['E'], HM['W']
    arr = np.zeros((W, W), np.float32)
    px = (np.arange(W) + 0.5) / W * 2 * E - E
    for (b, x0, x1, y0, y1) in BVHS:
        i0, i1 = np.searchsorted(px, x0), np.searchsorted(px, x1)
        j0, j1 = np.searchsorted(px, y0), np.searchsorted(px, y1)
        for j in range(j0, j1):
            y = px[j]
            for i in range(i0, i1):
                hit = b.ray_cast(Vector((px[i], y, 300)), Vector((0, 0, -1)))
                if hit[0] is not None:
                    v = (hit[0].z + 8.0) / 12.0
                    if v > arr[j, i]:
                        arr[j, i] = v
    arr = np.clip(arr, 0, 1)
    img = bpy.data.images.new("heightmap", W, W, alpha=False, float_buffer=False)
    try:
        img.colorspace_settings.name = 'Non-Color'
    except Exception:
        pass
    rgba = np.ones((W, W, 4), np.float32)
    rgba[..., 0] = arr; rgba[..., 1] = arr; rgba[..., 2] = arr
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = os.path.join(OUT, "heightmap.png")
    img.file_format = 'PNG'
    img.save()
    build_meta()
    return None


def all_mesh_objects():
    return [o for o in SCN.objects if o.type == 'MESH']


def step_materials():
    v = view3d()
    if v:
        sp = v[1].spaces.active
        sp.shading.type = 'MATERIAL'
    # join the base island pieces into one mesh (terrain + nature + path props + river deco)
    win = bpy.context.window_manager.windows[0]
    parts = [bpy.data.objects[n] for n in ("Terrain", "Nature", "PathProps", "RiverDeco") if n in bpy.data.objects]
    join(parts, "Island_Base_mesh")
    far = [bpy.data.objects[I['name']] for I in ISLETS] + [bpy.data.objects["SeaRocks"]]
    join(far, "Far_Islands_mesh")
    return [bpy.data.objects["Island_Base_mesh"]]


def join(objs, name):
    win = bpy.context.window_manager.windows[0]
    for o in SCN.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    with bpy.context.temp_override(window=win, active_object=objs[0], object=objs[0], selected_objects=objs,
                                   selected_editable_objects=objs):
        bpy.ops.object.join()
    objs[0].name = name
    objs[0].data.name = name
    return objs[0]


def step_bake():
    win = bpy.context.window_manager.windows[0]
    SCN.render.engine = 'CYCLES'
    SCN.cycles.device = 'CPU'
    SCN.cycles.samples = 24
    try:
        SCN.cycles.use_denoising = False
    except Exception:
        pass
    if SCN.world is None:
        SCN.world = bpy.data.worlds.new("World")
    SCN.world.light_settings.distance = 3.5
    objs = [o for o in all_mesh_objects() if o.name != "River"]
    for o in objs:
        me = o.data
        if "AO" not in me.color_attributes:
            me.color_attributes.new("AO", 'FLOAT_COLOR', 'CORNER')
        me.color_attributes.active_color = me.color_attributes["AO"]
    for o in SCN.objects:
        o.select_set(o in objs)
    bpy.context.view_layer.objects.active = objs[0]
    t = time.time()
    with bpy.context.temp_override(window=win, active_object=objs[0], object=objs[0], selected_objects=objs,
                                   selected_editable_objects=objs):
        bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    log(f"AO bake {time.time()-t:.1f}s on {len(objs)} objects")
    for o in objs:
        me = o.data
        n = len(me.loops)
        col = np.empty(n * 4, np.float32)
        ao = np.empty(n * 4, np.float32)
        me.color_attributes["Col"].data.foreach_get("color", col)
        me.color_attributes["AO"].data.foreach_get("color", ao)
        col = col.reshape(-1, 4)
        ao = np.clip(ao.reshape(-1, 4)[:, 0], 0, 1)
        mi = np.empty(len(me.polygons), np.int32)
        me.polygons.foreach_get("material_index", mi)
        lt = np.empty(len(me.polygons), np.int32)
        me.polygons.foreach_get("loop_total", lt)
        lm = np.repeat(mi, lt)
        f = 0.42 + 0.58 * ao ** 1.15
        f[lm != 0] = 1.0
        col[:, :3] *= f[:, None]
        me.color_attributes["Col"].data.foreach_set("color", col.ravel())
        me.color_attributes.remove(me.color_attributes["AO"])
        me.color_attributes.active_color = me.color_attributes["Col"]
        me.update()
    try:
        SCN.render.engine = 'BLENDER_EEVEE'
    except Exception:
        pass
    return None


def step_export():
    win = bpy.context.window_manager.windows[0]
    path = os.path.join(OUT, "island.glb")
    kw = dict(filepath=path, export_format='GLB', use_selection=False, export_apply=True, export_yup=True,
              export_extras=True, export_cameras=False, export_lights=False, export_normals=False,
              export_texcoords=True)
    with bpy.context.temp_override(window=win):
        try:
            bpy.ops.export_scene.gltf(**kw)
        except TypeError as e:
            log(f"export kw fallback: {e}")
            bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True, export_yup=True)
    with bpy.context.temp_override(window=win):
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "island.blend"))
    return None


def step_done():
    ORBIT['on'] = False
    for o in SCN.objects:
        o.select_set(False)
    tris = 0
    per = {}
    for o in all_mesh_objects():
        me = o.data
        me.calc_loop_triangles()
        per[o.name] = len(me.loop_triangles)
        tris += per[o.name]
    info = dict(times=TIMES, fails=FAILS, triangles=tris, per_object=per,
                blender=bpy.app.version_string, glb=os.path.getsize(os.path.join(OUT, "island.glb")),
                total_s=time.time() - T0)
    with open(os.path.join(OUT, "build_done.json"), "w") as f:
        json.dump(info, f, indent=1)
    log(f"DONE  {tris} triangles")
    CAM['loc'] = Vector((0, 0, 0)); CAM['dist'] = 175
    return None


STEPS = [
    ("Setting up scene + viewport", step_setup),
    ("Terrain: sculpting the main island", step_terrain),
    ("River + waterfall carved from the peak", step_river),
    ("Sandy beach ring", step_beach),
    ("Winding dirt path through the 6 spots", step_path),
    ("Location 1/6 - Midnight Cafe", build_cafe),
    ("Location 2/6 - Beach Bar", build_beachbar),
    ("Location 3/6 - Mountain Chalet", build_chalet),
    ("Location 4/6 - Funfair", build_funfair),
    ("Location 5/6 - Pirate Ship", build_ship),
    ("Location 6/6 - Haunted Castle", build_castle),
    ("Bridge, lanterns, signposts, fences, stepping stones, path empties", build_path_props),
    ("Forests, palms, bushes, flowers, rocks", build_nature),
] + [(f"Far island - {I['name']}", (lambda I=I: build_islet(I))) for I in ISLETS] + [
    ("Sea rocks, buoys, dolphin, whale", build_sea),
    ("Materials (palette + glow) & merging static meshes", step_materials),
    ("Baking ambient occlusion into vertex colours (Cycles)", step_bake),
    ("Water heightmap + map_meta.json for Three.js", step_heightmap),
    ("Export island.glb + save island.blend", step_export),
    ("Done!", step_done),
]
MATS = []

# ------------------------------------------------------------------ viewport driving
CAM = dict(loc=Vector((0, 0, 0)), dist=160.0)
ORBIT = dict(on=True)
STATE = dict(i=0, phase=0, t=0.0, text="")


def view3d():
    wm = bpy.context.window_manager
    best = None
    for win in wm.windows:
        for area in win.screen.areas:
            if area.type == 'VIEW_3D':
                if best is None or area.width * area.height > best[1].width * best[1].height:
                    reg = next((r for r in area.regions if r.type == 'WINDOW'), None)
                    best = (win, area, reg)
    return best


def frame(objs):
    pts = []
    for o in objs:
        if o is None:
            continue
        if o.type == 'MESH':
            pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
        else:
            pts.append(o.matrix_world.translation)
    if not pts:
        return
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    CAM['loc'] = (mn + mx) / 2
    CAM['dist'] = max((mx - mn).length * 1.25, 25)


def status(text):
    STATE['text'] = text
    v = view3d()
    if v:
        v[1].header_text_set(text)
        v[1].tag_redraw()


def orbit_tick():
    if not ORBIT['on']:
        return None
    v = view3d()
    if v:
        r3 = v[1].spaces.active.region_3d
        r3.view_rotation = Quaternion((0, 0, 1), math.radians(0.22)) @ r3.view_rotation
        r3.view_location = r3.view_location.lerp(CAM['loc'], 0.05)
        r3.view_distance = r3.view_distance + (CAM['dist'] - r3.view_distance) * 0.05
    return 1 / 30


def runner():
    i = STATE['i']
    if i >= len(STEPS):
        status(f"Last Drop map - DONE in {time.time()-T0:.0f}s  -  island.glb + island.blend saved")
        return None
    name, fn = STEPS[i]
    if STATE['phase'] == 0:
        status(f"Last Drop map  [{i + 1}/{len(STEPS)}]  {name} ...")
        log(f"STEP {i + 1}: {name}")
        STATE['phase'] = 1
        return 0.25
    t = time.time()
    objs = None
    try:
        objs = fn()
    except Exception:
        tb = traceback.format_exc()
        log(f"FAILED {name}\n{tb}")
        FAILS.append(name)
        with open(os.path.join(OUT, "build_error.txt"), "a") as f:
            f.write(f"{name}\n{tb}\n")
    TIMES[name] = round(time.time() - t, 2)
    try:
        bpy.context.view_layer.update()
    except Exception:
        pass
    if objs:
        frame(objs)
    STATE['i'] += 1
    STATE['phase'] = 0
    status(f"Last Drop map  [{i + 1}/{len(STEPS)}]  {name}  - done ({TIMES[name]:.1f}s)")
    return 1.6 if objs else 0.6


if bpy.app.background:
    # headless dry-run: execute every step synchronously
    while STATE['i'] < len(STEPS):
        runner()
else:
    bpy.app.timers.register(runner, first_interval=2.0)
    bpy.app.timers.register(orbit_tick, first_interval=2.5)
    REC = os.environ.get("LD_RECORD_DIR")
    if REC:
        # optional: save the 3D viewport as numbered frames (independent of other windows on screen)
        os.makedirs(REC, exist_ok=True)
        RECST = dict(n=0, t0=None, stop=None)

        def rec_tick():
            v = view3d()
            if v:
                win, area, region = v
                try:
                    with bpy.context.temp_override(window=win, area=area, region=region):
                        bpy.ops.screen.screenshot_area(filepath=os.path.join(REC, f"f_{RECST['n']:05d}.png"))
                    if RECST['t0'] is None:
                        RECST['t0'] = time.time()
                    with open(os.path.join(REC, "times.txt"), "a") as f:
                        f.write(f"{RECST['n']} {time.time() - RECST['t0']:.3f}\n")
                    RECST['n'] += 1
                except Exception as e:
                    log(f"rec failed: {e}")
            if STATE['i'] >= len(STEPS):
                if RECST['stop'] is None:
                    RECST['stop'] = time.time()
                elif time.time() - RECST['stop'] > 4.0:
                    return None
            return 1 / 12
        bpy.app.timers.register(rec_tick, first_interval=2.2)
log("build_map.py loaded, timers registered")
