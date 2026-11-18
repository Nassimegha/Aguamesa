# Aguamesa - 3 Cafe customers (Blender 5.2, headless)
# Run:  blender.exe --background --python build_customers_cafe.py
#
# Each char_<customer>.glb (contrat 00 §6.3) has 4 named animations, all keyframed
# on the character's root object so the glTF exporter's per-action export produces
# exactly 4 clean clips: idle, happy, meh, splashed.
# customers.ts (Tache 3) plays idle while waiting, then happy/meh/splashed on
# onPourEnd() depending on the score.
import bpy
import bmesh
import math
import os

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
FPS = 24
bpy.context.preferences.edit.keyframe_new_interpolation_type = 'SINE'


def log(msg):
    print(f"[customers] {msg}", flush=True)


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
    """Push the object's current action onto its own NLA track, named after the
    clip. Blender's glTF exporter (export_animation_mode='NLA_TRACKS') reads one
    glTF animation per NLA track, which is the reliable way to export several
    named clips on the same object (the active-action-only path drops all but
    the last one)."""
    action = obj.animation_data.action
    track = obj.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, int(action.frame_range[0]), action)
    obj.animation_data.action = None


def animate_root(root, size):
    """4 short clips keyframed on the root only, so the exporter's per-action
    mode produces exactly 4 named glTF animations: idle, happy, meh, splashed."""
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
    bpy.ops.export_scene.gltf(
        filepath=raw, export_format='GLB',
        export_animation_mode='NLA_TRACKS',
    )
    log(f"{name} exported -> {os.path.getsize(raw)} bytes raw")


def build_giant(root):
    size = 0.5
    body = add_profile_mesh("Body", [(0.16, 0.0), (0.2, 0.22), (0.17, 0.42)], (0.42, 0.62, 0.38), parent=root)
    head = add_sphere("Head", 0.14, (0, 0, 0.52), (0.55, 0.68, 0.42), parent=root)
    add_sphere("EyeL", 0.02, (-0.05, 0.12, 0.54), (0.1, 0.08, 0.06), parent=root)
    add_sphere("EyeR", 0.02, (0.05, 0.12, 0.54), (0.1, 0.08, 0.06), parent=root)
    return size


def build_fairy(root):
    size = 0.16
    body = add_profile_mesh("Body", [(0.045, 0.0), (0.05, 0.08), (0.04, 0.14)], (0.92, 0.55, 0.78), parent=root)
    head = add_sphere("Head", 0.045, (0, 0, 0.18), (0.95, 0.8, 0.85), parent=root)
    add_sphere("EyeL", 0.008, (-0.016, 0.038, 0.185), (0.2, 0.1, 0.2), parent=root)
    add_sphere("EyeR", 0.008, (0.016, 0.038, 0.185), (0.2, 0.1, 0.2), parent=root)
    wing_l = add_sphere("WingL", 0.05, (-0.06, -0.02, 0.1), (0.85, 0.92, 1.0), scale=(0.25, 1, 1.4), alpha=0.55, parent=root)
    wing_r = add_sphere("WingR", 0.05, (0.06, -0.02, 0.1), (0.85, 0.92, 1.0), scale=(0.25, 1, 1.4), alpha=0.55, parent=root)
    return size


def build_ghost(root):
    size = 0.4
    body = add_profile_mesh(
        "Body",
        [(0.0, 0.0), (0.06, 0.05), (0.12, 0.14), (0.15, 0.24), (0.15, 0.32),
         (0.1, 0.38), (0.0, 0.41)],
        (0.86, 0.9, 0.98), alpha=0.55, segments=28, cap_bottom=False, cap_top=False, parent=root,
    )
    add_sphere("EyeL", 0.025, (-0.055, 0.1, 0.3), (0.1, 0.1, 0.16), parent=root)
    add_sphere("EyeR", 0.025, (0.055, 0.1, 0.3), (0.1, 0.1, 0.16), parent=root)
    root.location = (0, 0, 0.06)  # floats a little above the ground
    return size


build_customer("giant", build_giant, 0.5)
build_customer("fairy", build_fairy, 0.16)
build_customer("ghost", build_ghost, 0.4)
