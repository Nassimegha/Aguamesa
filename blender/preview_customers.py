# Aguamesa - contact sheet of the customers (QA), Blender 5.2 headless.
# Run: blender.exe --background --python preview_customers.py -- <location|ids,comma> <out.png>
# Imports blender/_chars/char_<id>_raw.glb (built by build_customers.py), lines them up by
# rows of 6 and renders them with Workbench (vertex colours, studio light), front 3/4 view.
import bpy
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index("--") + 1:]
what, out = argv[0], argv[1]
manifest = json.load(open(os.path.join(HERE, "..", "src", "client", "world", "customers.manifest.json"), encoding="utf-8"))
ids = [m["id"] for m in manifest if m["location"] == what] or what.split(",")
size = {m["id"]: m["size"] for m in manifest}

bpy.ops.wm.read_factory_settings(use_empty=True)
COLS = 6
for i, cid in enumerate(ids):
    bpy.ops.import_scene.gltf(filepath=os.path.join(HERE, "_chars", f"char_{cid}_raw.glb"))
    root = next(o for o in bpy.context.selected_objects if o.parent is None)
    # the clips key the root's transform: place a holder above it instead
    holder = bpy.data.objects.new(f"H_{cid}", None)
    bpy.context.collection.objects.link(holder)
    root.parent = holder
    k = {"tall": 1.0, "small": 3.6, "floater": 1.6}[size.get(cid, "tall")]  # show small ones bigger
    holder.scale = (k, k, k)
    holder.location = ((i % COLS) * 1.0, 0, -(i // COLS) * 1.15)
    holder.rotation_euler = (0, 0, -0.35)

rows = math.ceil(len(ids) / COLS)
cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
bpy.context.collection.objects.link(cam)
cam.data.type = 'ORTHO'
cam.data.ortho_scale = max(COLS * 1.0, rows * 1.15) + 0.4
cam.location = ((COLS - 1) / 2, 10, -(rows - 1) * 1.15 / 2 + 0.45)
cam.rotation_euler = (math.pi / 2, 0, math.pi)  # characters face +Y
sc = bpy.context.scene
sc.camera = cam
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'
sc.display.shading.color_type = 'VERTEX'
sc.display.shading.show_shadows = True
sc.display.shading.show_cavity = True
sc.render.resolution_x = 1500
sc.render.resolution_y = int(1500 * (rows * 1.15 + 0.4) / (COLS * 1.0 + 0.4))
sc.render.film_transparent = False
sc.world = bpy.data.worlds.new("w")
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print(f"[preview] {len(ids)} customers -> {out}", flush=True)
