# Aguamesa - 3 Beach customers (Blender 5.2, headless)
# Run:  blender.exe --background --python build_customers_beach.py
# Same animation pipeline as build_customers_cafe.py (see blender/README.md for
# the NLA-track gotcha). 4 clips per character: idle, happy, meh, splashed.
import bpy
import bmesh
import math
import os

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
FPS = 24
bpy.context.preferences.edit.keyframe_new_interpolation_type = 'SINE'


def log(msg):
    print(f"[customers_beach] {msg}", flush=True)


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


def build_surfer(root):
    size = 0.4
    add_profile_mesh("Body", [(0.07, 0.0), (0.075, 0.2), (0.06, 0.32)], (0.95, 0.75, 0.45), parent=root)
    add_sphere("Head", 0.06, (0, 0, 0.4), (0.9, 0.65, 0.42), parent=root)
    add_sphere("EyeL", 0.01, (-0.022, 0.05, 0.41), (0.1, 0.08, 0.06), parent=root)
    add_sphere("EyeR", 0.01, (0.022, 0.05, 0.41), (0.1, 0.08, 0.06), parent=root)
    # tied-back hair bun, tucked right against the head
    add_sphere("Hair", 0.035, (0, -0.03, 0.42), (0.3, 0.16, 0.1), parent=root)
    # small surfboard, flat on the ground behind, not towering over the character
    board = add_profile_mesh("Surfboard", [(0.0, 0.0), (0.045, 0.06), (0.04, 0.3), (0.0, 0.34)], (0.98, 0.85, 0.35),
                              segments=10, parent=root)
    board.rotation_euler = (math.pi / 2 + 0.2, 0, 0)
    board.location = (0.14, -0.08, 0.02)
    return size


def build_crab_mister(root):
    size = 0.22
    add_sphere("Body", 0.11, (0, 0, 0.1), (0.88, 0.42, 0.28), scale=(1.3, 1.0, 0.65), parent=root)
    add_sphere("EyeL", 0.025, (-0.05, 0.07, 0.2), (0.95, 0.9, 0.85), parent=root)
    add_sphere("EyeR", 0.025, (0.05, 0.07, 0.2), (0.95, 0.9, 0.85), parent=root)
    add_sphere("PupilL", 0.012, (-0.05, 0.085, 0.205), (0.1, 0.08, 0.06), parent=root)
    add_sphere("PupilR", 0.012, (0.05, 0.085, 0.205), (0.1, 0.08, 0.06), parent=root)
    for side in (-1, 1):
        claw = add_sphere(f"Claw{'L' if side < 0 else 'R'}", 0.05, (side * 0.16, 0.02, 0.08),
                           (0.92, 0.5, 0.33), scale=(1.3, 0.8, 0.8), parent=root)
    for i, side in enumerate((-1, 1)):
        for j in range(2):
            add_cone(f"Leg{side}_{j}", 0.012, 0.012, 0.09, (side * (0.1 + j * 0.05), -0.08 + j * 0.02, 0.02),
                     (0.7, 0.32, 0.2), rot=(1.3, 0, side * 0.3), parent=root)
    return size


def build_mermaid(root):
    size = 0.38
    # one continuous taper from the tail tip up through the torso, so it reads
    # as a single flowing body instead of stacked segments.
    add_profile_mesh(
        "Body",
        [(0.0, 0.0), (0.035, 0.05), (0.05, 0.14), (0.06, 0.22), (0.065, 0.3), (0.06, 0.36)],
        (0.3, 0.72, 0.62), parent=root,
    )
    add_sphere("Head", 0.06, (0, 0, 0.42), (0.95, 0.82, 0.72), parent=root)
    add_sphere("EyeL", 0.01, (-0.022, 0.05, 0.43), (0.1, 0.08, 0.06), parent=root)
    add_sphere("EyeR", 0.01, (0.022, 0.05, 0.43), (0.1, 0.08, 0.06), parent=root)
    add_sphere("Hair", 0.045, (0, -0.02, 0.44), (0.55, 0.3, 0.35), scale=(1, 1, 1.2), parent=root)
    # tail fin flaring out flat at the very bottom tip
    fin = add_profile_mesh("Fin", [(0.0, 0.0), (0.1, 0.0), (0.0, 0.07)], (0.22, 0.68, 0.58), segments=3,
                            cap_bottom=True, cap_top=False, parent=root)
    fin.rotation_euler = (0, math.pi / 2, 0)
    return size


build_customer("surfer", build_surfer, 0.4)
build_customer("crab_mister", build_crab_mister, 0.22)
build_customer("mermaid", build_mermaid, 0.38)
