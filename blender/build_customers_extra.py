# Aguamesa - pirate, wizard (customers of the daily content) + barista (Blender 5.2, headless)
# Run:  blender.exe --background --python build_customers_extra.py
# Reuses the helpers of build_customers_cafe.py (same 4 clips idle/happy/meh/splashed, root-keyed).
import os

_here = os.path.dirname(os.path.abspath(__file__))
_src = open(os.path.join(_here, "build_customers_cafe.py"), encoding="utf-8").read()
exec(_src.split('build_customer("giant"')[0])  # helpers only, no builds


def add_cone(name, r_bottom, height, z0, color, parent, tip=0.0, segments=18):
    return add_profile_mesh(name, [(r_bottom, z0), (tip, z0 + height)], color, segments=segments, parent=parent)


def build_pirate(root):
    # stocky sailor: striped barrel body, big beard, tricorn hat, eye patch
    add_profile_mesh("Body", [(0.13, 0.0), (0.17, 0.12), (0.16, 0.3), (0.12, 0.38)], (0.75, 0.18, 0.16), parent=root)
    add_profile_mesh("Belt", [(0.172, 0.13), (0.172, 0.17)], (0.18, 0.12, 0.08), cap_bottom=False, cap_top=False, parent=root)
    add_sphere("Buckle", 0.025, (0, 0.165, 0.15), (0.95, 0.78, 0.25), parent=root, scale=(1, 0.4, 1))
    add_sphere("Head", 0.11, (0, 0, 0.47), (0.93, 0.74, 0.6), parent=root)
    add_sphere("Beard", 0.1, (0, 0.05, 0.41), (0.36, 0.2, 0.1), parent=root, scale=(1.05, 0.8, 0.85))
    add_sphere("Nose", 0.028, (0, 0.11, 0.47), (0.95, 0.6, 0.5), parent=root)
    add_sphere("EyeL", 0.016, (-0.04, 0.095, 0.5), (0.08, 0.06, 0.05), parent=root)
    add_sphere("Patch", 0.026, (0.042, 0.095, 0.5), (0.05, 0.05, 0.05), parent=root, scale=(1, 0.4, 1))
    add_profile_mesh("HatBrim", [(0.0, 0.55), (0.17, 0.555), (0.17, 0.575), (0.0, 0.58)], (0.12, 0.1, 0.1), segments=3, parent=root)
    add_profile_mesh("HatTop", [(0.1, 0.57), (0.085, 0.66), (0.0, 0.68)], (0.12, 0.1, 0.1), parent=root)
    add_sphere("Skull", 0.018, (0, 0.09, 0.62), (0.96, 0.95, 0.9), parent=root)
    add_sphere("ArmL", 0.05, (-0.19, 0, 0.26), (0.75, 0.18, 0.16), parent=root, scale=(0.8, 0.8, 1.6))
    add_sphere("ArmR", 0.05, (0.19, 0, 0.26), (0.75, 0.18, 0.16), parent=root, scale=(0.8, 0.8, 1.6))
    return 0.5


def build_wizard(root):
    # tall thin robe, huge pointy hat with stars, long white beard, glowing staff orb
    add_profile_mesh("Robe", [(0.15, 0.0), (0.11, 0.18), (0.08, 0.36)], (0.24, 0.2, 0.55), parent=root)
    add_sphere("Head", 0.085, (0, 0, 0.43), (0.93, 0.78, 0.66), parent=root)
    add_profile_mesh("Beard", [(0.07, 0.42), (0.065, 0.36), (0.035, 0.26), (0.0, 0.2)], (0.95, 0.95, 0.97), parent=root)
    add_sphere("EyeL", 0.013, (-0.03, 0.075, 0.45), (0.08, 0.08, 0.12), parent=root)
    add_sphere("EyeR", 0.013, (0.03, 0.075, 0.45), (0.08, 0.08, 0.12), parent=root)
    add_profile_mesh("HatBrim", [(0.0, 0.48), (0.16, 0.485), (0.16, 0.5), (0.0, 0.505)], (0.2, 0.16, 0.48), parent=root)
    add_cone("HatCone", 0.095, 0.3, 0.5, (0.24, 0.2, 0.55), parent=root)
    add_sphere("Star1", 0.016, (0.05, 0.07, 0.58), (1.0, 0.85, 0.3), parent=root)
    add_sphere("Star2", 0.012, (-0.03, 0.06, 0.66), (1.0, 0.85, 0.3), parent=root)
    staff = add_profile_mesh("Staff", [(0.012, 0.0), (0.012, 0.6)], (0.45, 0.3, 0.18), parent=root)
    staff.location = (0.18, 0.03, 0)
    orb = add_sphere("Orb", 0.04, (0.18, 0.03, 0.63), (0.55, 0.85, 1.0), parent=root)
    m = orb.data.materials[0]
    bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf and "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = (0.55, 0.85, 1.0, 1.0)
        bsdf.inputs["Emission Strength"].default_value = 3.0
    return 0.5


def build_barista(root):
    # friendly barista behind the station: apron, rolled sleeves, little cap
    add_profile_mesh("Body", [(0.11, 0.0), (0.13, 0.15), (0.12, 0.32), (0.08, 0.38)], (0.95, 0.93, 0.88), parent=root)
    add_profile_mesh("Apron", [(0.135, 0.02), (0.14, 0.16), (0.128, 0.28)], (0.42, 0.24, 0.14), cap_bottom=False, cap_top=False, parent=root)
    add_sphere("Head", 0.09, (0, 0, 0.46), (0.86, 0.66, 0.52), parent=root)
    add_sphere("Hair", 0.093, (0, -0.015, 0.49), (0.18, 0.11, 0.08), parent=root, scale=(1, 1, 0.7))
    add_sphere("EyeL", 0.013, (-0.032, 0.08, 0.47), (0.08, 0.06, 0.05), parent=root)
    add_sphere("EyeR", 0.013, (0.032, 0.08, 0.47), (0.08, 0.06, 0.05), parent=root)
    add_sphere("Smile", 0.022, (0, 0.082, 0.43), (0.7, 0.3, 0.28), parent=root, scale=(1.2, 0.3, 0.45))
    add_sphere("ArmL", 0.042, (-0.15, 0.04, 0.24), (0.86, 0.66, 0.52), parent=root, scale=(0.8, 0.8, 1.7))
    add_sphere("ArmR", 0.042, (0.15, 0.04, 0.24), (0.86, 0.66, 0.52), parent=root, scale=(0.8, 0.8, 1.7))
    return 0.46


build_customer("pirate", build_pirate, 0.5)
build_customer("wizard", build_wizard, 0.5)
build_customer("barista", build_barista, 0.46)
