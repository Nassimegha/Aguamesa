# Aguamesa - the 7 remaining glasses (Blender 5.2, headless)
# Run:  blender.exe --background --python build_glasses.py
#
# glass_pint was built by build_glass_pint.py (Tache 1). This script builds the
# other 7 shapes of GlassModel (contrat 00 §6.1), all with the same 3 markers
# (contrat §6.3): LIQUID_BOTTOM / LIQUID_TOP (empties) and LIQUID_SHAPE (mesh).
# One glass = one .glb, so the scene is cleared and re-exported for each shape.
import bpy
import bmesh
import math
import os

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
WALL = 0.003  # outer-to-inner wall thickness, used for every shape


def log(msg):
    print(f"[glasses] {msg}", flush=True)


def make_material(name, color, alpha=1.0, roughness=0.5):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    try:
        mat.use_nodes = True
    except Exception:
        pass
    bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = roughness
        if "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = alpha
        for key in ("Transmission Weight", "Transmission"):
            if key in bsdf.inputs:
                bsdf.inputs[key].default_value = 0.0
    mat.blend_method = 'BLEND' if alpha < 1.0 else 'OPAQUE'
    mat.use_backface_culling = False
    return mat


def add_profile_mesh(name, profile, segments=28, cap_bottom=True, cap_top=False):
    """profile: list of (radius, z) rings from bottom to top, lofted into one mesh."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)

    bm = bmesh.new()
    rings = []
    for radius, z in profile:
        ring = [bm.verts.new((radius * math.cos(2 * math.pi * i / segments),
                               radius * math.sin(2 * math.pi * i / segments), z))
                for i in range(segments)]
        rings.append(ring)
    bm.verts.ensure_lookup_table()

    for r in range(len(rings) - 1):
        a, b = rings[r], rings[r + 1]
        for i in range(segments):
            j = (i + 1) % segments
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if cap_bottom:
        bm.faces.new(reversed(rings[0]))
    if cap_top:
        bm.faces.new(rings[-1])

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    return obj


def add_handle(name, attach_radius, z0, z1, side_radius, color):
    """A simple ring handle on the +X side of the glass, half-embedded in the wall."""
    bpy.ops.mesh.primitive_torus_add(
        major_radius=side_radius, minor_radius=side_radius * 0.22,
        location=(attach_radius + side_radius * 0.6, 0, (z0 + z1) / 2),
        major_segments=16, minor_segments=8,
        rotation=(0, math.pi / 2, 0),
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (1, (z1 - z0) / (2 * side_radius), 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(make_material(f"{name}Mat", color, alpha=0.22, roughness=0.05))
    return obj


def add_empty(name, z):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'PLAIN_AXES'
    e.empty_display_size = 0.01
    e.location = (0, 0, z)
    bpy.context.collection.objects.link(e)
    return e


GLASS_COLOR = (0.85, 0.93, 0.96, 1.0)
LIQUID_COLOR = (0.93, 0.72, 0.18, 1.0)


def build_one(model, body_profile, liquid_profile, liquid_z, handle=None, extra=None):
    """body_profile/liquid_profile: list of (radius, z). liquid_z: (bottom, top)."""
    bpy.ops.wm.read_factory_settings(use_empty=True)

    body = add_profile_mesh("GlassBody", body_profile, cap_bottom=True, cap_top=False)
    body.data.materials.append(make_material("GlassMat", GLASS_COLOR, alpha=0.22, roughness=0.05))

    liquid = add_profile_mesh("LIQUID_SHAPE", liquid_profile, cap_bottom=True, cap_top=True)
    liquid.data.materials.append(make_material("LiquidPlaceholderMat", LIQUID_COLOR, alpha=0.85, roughness=0.15))

    if handle:
        add_handle("Handle", *handle, GLASS_COLOR)

    if extra:
        extra()

    add_empty("LIQUID_BOTTOM", liquid_z[0])
    add_empty("LIQUID_TOP", liquid_z[1])

    root = bpy.data.objects.new(f"glass_{model}", None)
    bpy.context.collection.objects.link(root)
    for obj in list(bpy.context.collection.objects):
        if obj is not root:
            obj.parent = root

    names = sorted(o.name for o in bpy.context.collection.objects)
    for required in ("LIQUID_BOTTOM", "LIQUID_TOP", "LIQUID_SHAPE"):
        assert required in names, f"{model}: missing {required}"

    raw = os.path.join(OUT_DIR, f"glass_{model}_raw.glb")
    bpy.ops.export_scene.gltf(filepath=raw, export_format='GLB')
    log(f"{model}: {names} -> {os.path.getsize(raw)} bytes raw")


def build():
    # mug_giant : large straight mug with a handle, for the Giant customer.
    build_one(
        "mug_giant",
        body_profile=[(0.062, 0.0), (0.065, 0.22)],
        liquid_profile=[(0.059, 0.006), (0.062, 0.21)],
        liquid_z=(0.006, 0.21),
        handle=(0.065, 0.04, 0.18, 0.05),
    )

    # thimble : tiny straight cup, for the Fairy customer.
    build_one(
        "thimble",
        body_profile=[(0.017, 0.0), (0.019, 0.045)],
        liquid_profile=[(0.014, 0.003), (0.016, 0.041)],
        liquid_z=(0.003, 0.041),
    )

    # flute : tall narrow bowl on a thin stem and foot.
    def flute_extra():
        foot = add_profile_mesh("Foot", [(0.022, 0.0), (0.022, 0.004), (0.006, 0.006)], cap_bottom=True, cap_top=True)
        foot.data.materials.append(make_material("FootMat", GLASS_COLOR, alpha=0.22, roughness=0.05))
        stem = add_profile_mesh("Stem", [(0.006, 0.006), (0.006, 0.07)], cap_bottom=False, cap_top=False)
        stem.data.materials.append(make_material("StemMat", GLASS_COLOR, alpha=0.22, roughness=0.05))

    build_one(
        "flute",
        body_profile=[(0.016, 0.07), (0.028, 0.2)],
        liquid_profile=[(0.013, 0.078), (0.025, 0.192)],
        liquid_z=(0.078, 0.192),
        extra=flute_extra,
    )

    # coconut : round body, two lofted frustums approximating a sphere silhouette.
    build_one(
        "coconut",
        body_profile=[(0.028, 0.0), (0.066, 0.065), (0.055, 0.13)],
        liquid_profile=[(0.024, 0.006), (0.063, 0.065), (0.052, 0.122)],
        liquid_z=(0.006, 0.122),
    )

    # teacup : short, wide, small handle.
    build_one(
        "teacup",
        body_profile=[(0.042, 0.0), (0.05, 0.07)],
        liquid_profile=[(0.039, 0.005), (0.047, 0.064)],
        liquid_z=(0.005, 0.064),
        handle=(0.05, 0.02, 0.055, 0.022),
    )

    # goblet : flared bowl on a thin stem and wide foot.
    def goblet_extra():
        foot = add_profile_mesh("Foot", [(0.034, 0.0), (0.034, 0.005), (0.008, 0.008)], cap_bottom=True, cap_top=True)
        foot.data.materials.append(make_material("FootMat", GLASS_COLOR, alpha=0.22, roughness=0.05))
        stem = add_profile_mesh("Stem", [(0.008, 0.008), (0.008, 0.075)], cap_bottom=False, cap_top=False)
        stem.data.materials.append(make_material("StemMat", GLASS_COLOR, alpha=0.22, roughness=0.05))

    build_one(
        "goblet",
        body_profile=[(0.028, 0.075), (0.05, 0.1), (0.046, 0.165)],
        liquid_profile=[(0.024, 0.082), (0.047, 0.1), (0.043, 0.157)],
        liquid_z=(0.082, 0.157),
        extra=goblet_extra,
    )

    # tankard : robust straight mug with a sturdy handle, minimal taper.
    build_one(
        "tankard",
        body_profile=[(0.047, 0.0), (0.048, 0.15)],
        liquid_profile=[(0.044, 0.006), (0.045, 0.142)],
        liquid_z=(0.006, 0.142),
        handle=(0.048, 0.03, 0.12, 0.035),
    )


build()
