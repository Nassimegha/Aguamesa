# Aguamesa - 3 Chalet customers (Blender 5.2, headless)
# Run:  blender.exe --background --python build_customers_chalet.py
# Same pipeline as build_customers_cafe.py / build_customers_beach.py.
import bpy
import bmesh
import math
import os

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
FPS = 24
bpy.context.preferences.edit.keyframe_new_interpolation_type = 'SINE'


def log(msg):
    print(f"[customers_chalet] {msg}", flush=True)


def make_material(name, color, alpha=1.0, roughness=0.8):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    try:
        mat.use_nodes = True
    except Exception:
        pass
    bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf:
        bsdf.inputs["Base Color"].default_value = tuple(color) + (1.0,) if len(color) == 3 else tuple(color)
        bsdf.inputs["Roughness"].default_value = roughness
        if "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = alpha
    mat.blend_method = 'BLEND' if alpha < 1.0 else 'OPAQUE'
    return mat


def add_profile_mesh(name, profile, color, alpha=1.0, segments=20, cap_bottom=True, cap_top=True, parent=None):
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
    if cap_top and len(rings[-1]) > 2:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    obj.data.materials.append(make_material(f"{name}Mat", color, alpha))
    if parent:
        obj.parent = parent
    return obj


def add_sphere(name, radius, loc, color, parent=None, scale=(1, 1, 1), alpha=1.0):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=loc, segments=14, ring_count=10)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(make_material(f"{name}Mat", color, alpha))
    if parent:
        obj.parent = parent
    return obj


def add_cone(name, r1, r2, depth, loc, color, rot=(0, 0, 0), parent=None):
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(make_material(f"{name}Mat", color))
    if parent:
        obj.parent = parent
    return obj


def key(obj, frame, loc=None, scale=None, rot=None):
    bpy.context.scene.frame_set(frame)
    if loc is not None:
        obj.location = loc
        obj.keyframe_insert(data_path="location", frame=frame)
    if scale is not None:
        obj.scale = scale
        obj.keyframe_insert(data_path="scale", frame=frame)
    if rot is not None:
        obj.rotation_euler = rot
        obj.keyframe_insert(data_path="rotation_euler", frame=frame)


def new_action(obj, name):
    if obj.animation_data is None:
        obj.animation_data_create()
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    obj.animation_data.action = action
    return action


def stash_action_to_nla(obj, name):
    action = obj.animation_data.action
    track = obj.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, int(action.frame_range[0]), action)
    obj.animation_data.action = None


def animate_root(root, size):
    base_loc = tuple(root.location)
    base_scale = (1.0, 1.0, 1.0)

    new_action(root, "idle")
    key(root, 0, loc=base_loc, scale=base_scale, rot=(0, 0, 0))
    key(root, FPS, loc=(base_loc[0], base_loc[1], base_loc[2] + size * 0.03), scale=(1, 1, 1.02), rot=(0, 0, 0))
    key(root, 2 * FPS, loc=base_loc, scale=base_scale, rot=(0, 0, 0))
    stash_action_to_nla(root, "idle")

    new_action(root, "happy")
    key(root, 0, loc=base_loc, scale=base_scale, rot=(0, 0, 0))
    key(root, int(0.25 * FPS), loc=base_loc, scale=(1.12, 1.12, 0.82), rot=(0, 0, 0))
    key(root, int(0.5 * FPS), loc=(base_loc[0], base_loc[1], base_loc[2] + size * 0.22), scale=(0.9, 0.9, 1.25), rot=(0, 0, 0.08))
    key(root, int(0.75 * FPS), loc=base_loc, scale=(1.1, 1.1, 0.85), rot=(0, 0, -0.04))
    key(root, FPS, loc=base_loc, scale=base_scale, rot=(0, 0, 0))
    stash_action_to_nla(root, "happy")

    new_action(root, "meh")
    key(root, 0, loc=base_loc, scale=base_scale, rot=(0, 0, 0))
    key(root, FPS, loc=(base_loc[0], base_loc[1], base_loc[2] - size * 0.05), scale=(1.03, 1.03, 0.93), rot=(-0.12, 0, 0))
    key(root, 2 * FPS, loc=base_loc, scale=base_scale, rot=(0, 0, 0))
    stash_action_to_nla(root, "meh")

    new_action(root, "splashed")
    key(root, 0, loc=base_loc, scale=base_scale, rot=(0, 0, 0))
    key(root, int(0.15 * FPS), loc=(base_loc[0], base_loc[1] - size * 0.12, base_loc[2]), scale=(1.1, 0.9, 0.95), rot=(0, 0, 0.2))
    key(root, int(0.35 * FPS), loc=(base_loc[0], base_loc[1] + size * 0.05, base_loc[2]), scale=(0.95, 1.05, 1.0), rot=(0, 0, -0.12))
    key(root, int(0.6 * FPS), loc=base_loc, scale=base_scale, rot=(0, 0, 0))
    stash_action_to_nla(root, "splashed")


def build_customer(name, build_body, size):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = bpy.data.objects.new(f"char_{name}", None)
    bpy.context.collection.objects.link(root)
    root.location = (0, 0, 0)

    build_body(root)
    animate_root(root, size)

    bpy.context.scene.frame_set(0)
    names = sorted(o.name for o in bpy.context.collection.objects)
    log(f"{name}: objects {names}")

    raw = os.path.join(OUT_DIR, f"char_{name}_raw.glb")
    bpy.ops.export_scene.gltf(filepath=raw, export_format='GLB', export_animation_mode='NLA_TRACKS')
    log(f"{name} exported -> {os.path.getsize(raw)} bytes raw")


def build_yeti(root):
    size = 0.55
    add_profile_mesh("Body", [(0.19, 0.0), (0.22, 0.24), (0.18, 0.46)], (0.92, 0.95, 0.96), parent=root)
    add_sphere("Head", 0.15, (0, 0, 0.57), (0.88, 0.9, 0.92), parent=root)
    add_sphere("EyeL", 0.02, (-0.055, 0.13, 0.59), (0.55, 0.3, 0.2), parent=root)
    add_sphere("EyeR", 0.02, (0.055, 0.13, 0.59), (0.55, 0.3, 0.2), parent=root)
    add_cone("HornL", 0.015, 0.0, 0.05, (-0.08, 0.02, 0.69), (0.75, 0.7, 0.65), parent=root)
    add_cone("HornR", 0.015, 0.0, 0.05, (0.08, 0.02, 0.69), (0.75, 0.7, 0.65), parent=root)
    return size


def build_skier(root):
    size = 0.17
    add_profile_mesh("Body", [(0.045, 0.0), (0.05, 0.08), (0.04, 0.14)], (0.3, 0.55, 0.85), parent=root)
    add_sphere("Head", 0.045, (0, 0, 0.18), (0.95, 0.85, 0.75), parent=root)
    add_sphere("EyeL", 0.008, (-0.016, 0.038, 0.185), (0.2, 0.1, 0.2), parent=root)
    add_sphere("EyeR", 0.008, (0.016, 0.038, 0.185), (0.2, 0.1, 0.2), parent=root)
    add_sphere("Beanie", 0.047, (0, 0, 0.21), (0.85, 0.3, 0.35), scale=(1, 1, 0.75), parent=root)
    add_sphere("BeaniePom", 0.016, (0, 0, 0.25), (0.95, 0.9, 0.9), parent=root)
    return size


def build_grandma_bear(root):
    size = 0.42
    add_profile_mesh("Body", [(0.15, 0.0), (0.17, 0.2), (0.14, 0.34)], (0.55, 0.38, 0.25), parent=root)
    add_sphere("Head", 0.1, (0, 0, 0.42), (0.58, 0.4, 0.27), parent=root)
    add_sphere("SnoutBase", 0.05, (0, 0.08, 0.39), (0.72, 0.55, 0.4), parent=root)
    add_sphere("EyeL", 0.014, (-0.04, 0.09, 0.45), (0.1, 0.08, 0.06), parent=root)
    add_sphere("EyeR", 0.014, (0.04, 0.09, 0.45), (0.1, 0.08, 0.06), parent=root)
    add_sphere("EarL", 0.03, (-0.08, -0.02, 0.5), (0.5, 0.34, 0.22), parent=root)
    add_sphere("EarR", 0.03, (0.08, -0.02, 0.5), (0.5, 0.34, 0.22), parent=root)
    # a little shawl for charm
    add_profile_mesh("Shawl", [(0.16, 0.26), (0.17, 0.28), (0.1, 0.3)], (0.75, 0.3, 0.35), segments=16, parent=root)
    return size


build_customer("yeti", build_yeti, 0.55)
build_customer("skier", build_skier, 0.17)
build_customer("grandma_bear", build_grandma_bear, 0.42)
