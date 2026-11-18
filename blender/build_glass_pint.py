# Aguamesa - glass_pint builder (Blender 5.2, headless)
# Run:  blender.exe --background --python build_glass_pint.py
#
# Builds the first glass of the game: a simple pint glass with the 3 markers
# the gameplay code (P1) needs, per the contract (00-projet-et-contrat.md §6.3):
#   - LIQUID_BOTTOM / LIQUID_TOP : empties, the liquid rises between them
#   - LIQUID_SHAPE               : mesh, the inner volume the liquid fills
#
# Scale: 1 unit = 1 meter. The glass stands on the origin, Y-up after export.
import bpy
import bmesh
import math
import os

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_GLB = os.path.join(OUT_DIR, "glass_pint_raw.glb")

# Real pint glass proportions, in meters.
HEIGHT = 0.155
R_BOTTOM_OUT, R_TOP_OUT = 0.030, 0.041   # outer wall, slight taper
WALL = 0.003                              # wall thickness used for the inner volume
LIQUID_Z0 = 0.006                         # liquid floor, just above the true base
LIQUID_Z1 = HEIGHT - 0.007                # liquid ceiling, just below the rim


def log(msg):
    print(f"[glass_pint] {msg}", flush=True)


def make_frustum(name, r_bottom, r_top, z0, z1, segments=32, cap_bottom=True, cap_top=False):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)

    bm = bmesh.new()
    bottom = [bm.verts.new((r_bottom * math.cos(2 * math.pi * i / segments),
                             r_bottom * math.sin(2 * math.pi * i / segments), z0))
              for i in range(segments)]
    top = [bm.verts.new((r_top * math.cos(2 * math.pi * i / segments),
                          r_top * math.sin(2 * math.pi * i / segments), z1))
           for i in range(segments)]
    bm.verts.ensure_lookup_table()

    for i in range(segments):
        j = (i + 1) % segments
        bm.faces.new((bottom[i], bottom[j], top[j], top[i]))
    if cap_bottom:
        bm.faces.new(reversed(bottom))
    if cap_top:
        bm.faces.new(top)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    return obj


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
        for transmission_key in ("Transmission Weight", "Transmission"):
            if transmission_key in bsdf.inputs:
                bsdf.inputs[transmission_key].default_value = 0.0  # fake glass via alpha, not transmission (too costly on mobile)
    mat.blend_method = 'BLEND' if alpha < 1.0 else 'OPAQUE'
    mat.use_backface_culling = False
    return mat


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)

    body = make_frustum("GlassBody", R_BOTTOM_OUT, R_TOP_OUT, 0.0, HEIGHT,
                         cap_bottom=True, cap_top=False)
    body.data.materials.append(make_material("GlassMat", (0.85, 0.93, 0.96, 1.0), alpha=0.22, roughness=0.05))

    liquid_shape = make_frustum("LIQUID_SHAPE",
                                 R_BOTTOM_OUT - WALL, R_TOP_OUT - WALL,
                                 LIQUID_Z0, LIQUID_Z1,
                                 cap_bottom=True, cap_top=True)
    liquid_shape.data.materials.append(make_material("LiquidPlaceholderMat", (0.93, 0.72, 0.18, 1.0), alpha=0.85, roughness=0.15))

    bottom_empty = bpy.data.objects.new("LIQUID_BOTTOM", None)
    bottom_empty.empty_display_type = 'PLAIN_AXES'
    bottom_empty.empty_display_size = 0.01
    bottom_empty.location = (0.0, 0.0, LIQUID_Z0)
    bpy.context.collection.objects.link(bottom_empty)

    top_empty = bpy.data.objects.new("LIQUID_TOP", None)
    top_empty.empty_display_type = 'PLAIN_AXES'
    top_empty.empty_display_size = 0.01
    top_empty.location = (0.0, 0.0, LIQUID_Z1)
    bpy.context.collection.objects.link(top_empty)

    root = bpy.data.objects.new("glass_pint", None)
    bpy.context.collection.objects.link(root)
    for obj in (body, liquid_shape, bottom_empty, top_empty):
        obj.parent = root

    names = sorted(o.name for o in bpy.context.collection.objects)
    log(f"objects in scene: {names}")
    for required in ("LIQUID_BOTTOM", "LIQUID_TOP", "LIQUID_SHAPE"):
        assert required in names, f"missing required object {required}"

    bpy.ops.export_scene.gltf(filepath=RAW_GLB, export_format='GLB')
    log(f"exported {RAW_GLB} ({os.path.getsize(RAW_GLB)} bytes, uncompressed)")


build()
