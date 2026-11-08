"""
DressRight coat builder (Blender 5.x, runs headless).

    python -m venv .venv && .venv/bin/pip install bpy==5.2.3
    .venv/bin/python tools/blender/coat.py --uniform AGSU --sex male --out tools/blender/out

Units: 1 Blender unit = 1 inch, matching the web app's layout engine.
Axes: Blender -Y is the coat front, +X is the wearer's left, Z is up. The glTF
exporter's "+Y up" conversion turns this into the app's frame (front = +Z).
Origin: coat centerline at the height of the top button (as in layout.ts).

Stages (each writes renders to --out so they can be reviewed):
  1. mannequin   - 40R male body (skin-modifier skeleton, subdivided)
  2. coat shell  - one connected garment over the body with ease
"""
import argparse
import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector

# ---------------------------------------------------------------- args

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
ap = argparse.ArgumentParser()
ap.add_argument("--uniform", default="AGSU", choices=["AGSU", "ASU"])
ap.add_argument("--sex", default="male", choices=["male", "female"])
ap.add_argument("--out", default="tools/blender/out")
ap.add_argument("--samples", type=int, default=32)
ap.add_argument("--res", type=int, default=900)
args = ap.parse_args(argv)
os.makedirs(args.out, exist_ok=True)

FABRIC = {"AGSU": (0.110, 0.104, 0.062), "ASU": (0.022, 0.030, 0.075)}  # linear RGB

# ---------------------------------------------------------------- scene


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = "NONE"
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = args.samples
    sc.cycles.use_denoising = True
    sc.render.resolution_x = int(args.res * 0.75)
    sc.render.resolution_y = args.res
    sc.render.film_transparent = False
    sc.view_settings.view_transform = "AgX"
    world = bpy.data.worlds.new("World")
    sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.035, 0.038, 0.035, 1)
    bg.inputs[1].default_value = 1.0


# ---------------------------------------------------------------- skin-modifier bodies


def skin_object(name, verts, edges, radii, subdiv=2):
    """Build a smooth body from a skeleton: verts (x,y,z), edges, per-vertex (rx, ry) radii."""
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, edges, [])
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    mod = ob.modifiers.new("Skin", "SKIN")
    mod.use_smooth_shade = True
    mod.branch_smoothing = 0.6
    for v, r in zip(me.skin_vertices[0].data, radii):
        v.radius = r
    me.skin_vertices[0].data[0].use_root = True
    sub = ob.modifiers.new("Subsurf", "SUBSURF")
    sub.levels = subdiv
    sub.render_levels = subdiv
    return ob


def apply_all(ob):
    bpy.context.view_layer.objects.active = ob
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


# Skeleton for a 40R male, inches. Origin: centerline at top-button height.
# Each joint: (x, y, z) and skin radius (rx side-to-side, ry front-back).
def body_skeleton(scale=1.0, ease=0.0, arm_ease=0.0, coat=False):
    s = scale
    J = {}
    E = []

    def j(name, x, y, z, rx, ry, e=None):
        e = ease if e is None else e
        J[name] = ((x * s, y * s, z * s), (rx * s + e, ry * s + e))

    # torso (y negative = front)
    j("pelvis", 0, 0.4, -15, 6.7, 4.7, ease + (1.3 if coat else 0))
    j("waist", 0, 0.2, -8, 6.0, 4.2)
    j("ribs", 0, -0.2, 0, 6.9, 4.6)
    j("chest", 0, -0.5, 6, 7.3, 4.9)
    j("uchest", 0, -0.2, 11, 6.9, 4.4)
    j("neckb", 0, 0.4, 15.5, 2.5, 2.6, 0.5 if coat else 0)
    j("neckt", 0, 0.5, 19, 2.15, 2.25, 0.0)
    for side, sx in (("L", 1), ("R", -1)):
        j("shoulder" + side, 5.8 * sx, 0.2, 14.0, 2.3, 2.4, arm_ease)
        j("deltoid" + side, 8.3 * sx, 0.3, 12.6, 2.45, 2.6, arm_ease)
        j("bicep" + side, 9.0 * sx, 0.2, 6.5, 2.15, 2.3, arm_ease)
        j("elbow" + side, 9.2 * sx, -0.4, 0.5, 1.75, 1.9, arm_ease)
        j("forearm" + side, 9.1 * sx, -1.4, -4.5, 1.6, 1.75, arm_ease)
        j("wrist" + side, 9.0 * sx, -2.4, -9.0, 1.15, 1.35, arm_ease * 0.9)
        E += [("uchest", "shoulder" + side), ("shoulder" + side, "deltoid" + side), ("deltoid" + side, "bicep" + side),
              ("bicep" + side, "elbow" + side), ("elbow" + side, "forearm" + side), ("forearm" + side, "wrist" + side)]
        if not coat:
            j("hand" + side, 8.9 * sx, -2.8, -12.5, 0.9, 1.6, 0)
            E.append(("wrist" + side, "hand" + side))
            j("thigh" + side, 4.0 * sx, 0.4, -24, 4.0, 4.2, 0)
            j("knee" + side, 4.2 * sx, 0.2, -36, 2.6, 2.8, 0)
            E += [("pelvis", "thigh" + side), ("thigh" + side, "knee" + side)]
    E += [("pelvis", "waist"), ("waist", "ribs"), ("ribs", "chest"), ("chest", "uchest"), ("uchest", "neckb"), ("neckb", "neckt")]
    if not coat:
        j("head", 0, 0.6, 23.5, 3.1, 3.6, 0)
        E.append(("neckt", "head"))
    if coat:
        # skirt: the coat hangs below the pelvis joint to the hem
        j("hem", 0, 0.5, -22, 7.0, 5.0, ease + 1.4)
        E.append(("pelvis", "hem"))
    names = list(J)
    verts = [J[n][0] for n in names]
    radii = [J[n][1] for n in names]
    edges = [(names.index(a), names.index(b)) for a, b in E]
    return verts, edges, radii, names


# ---------------------------------------------------------------- materials


def mannequin_material():
    m = bpy.data.materials.new("Mannequin")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.32, 0.33, 0.34, 1)
    b.inputs["Roughness"].default_value = 0.55
    return m


def fabric_material(uniform):
    """Wool gabardine: a fine diagonal twill as bump, slight sheen."""
    m = bpy.data.materials.new("Fabric")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*FABRIC[uniform], 1)
    b.inputs["Roughness"].default_value = 0.78
    b.inputs["Sheen Weight"].default_value = 0.35
    b.inputs["Sheen Roughness"].default_value = 0.4
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (22, 22, 22)  # ~22 twill wales per inch
    mapping.inputs["Rotation"].default_value = (0, 0, math.radians(45))
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.inputs["Distortion"].default_value = 0.6
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 180
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "FLOAT"
    mix.inputs["Factor"].default_value = 0.25
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.18
    bump.inputs["Distance"].default_value = 0.01
    nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], wave.inputs["Vector"])
    nt.links.new(coord.outputs["Object"], noise.inputs["Vector"])
    nt.links.new(wave.outputs["Fac"], mix.inputs["A"])
    nt.links.new(noise.outputs["Fac"], mix.inputs["B"])
    nt.links.new(mix.outputs["Result"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


# ---------------------------------------------------------------- build


def build_mannequin():
    v, e, r, _ = body_skeleton()
    ob = skin_object("Mannequin", v, e, r, subdiv=2)
    apply_all(ob)
    ob.data.materials.append(mannequin_material())
    return ob


def bisect(bm, co, no):
    """Cut the mesh with a plane and drop everything on the +normal side."""
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=Vector(co), plane_no=Vector(no), clear_outer=True)


def open_coat(ob, joints):
    """Cut the hem, cuffs and neck open with clean planes so the shell reads as a garment."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bisect(bm, (0, 0, -15.2), (0, 0, -1))  # hem
    bisect(bm, (0, 0, 16.4), (0, 0, 1))  # neck opening
    for side in ("L", "R"):
        w = Vector(joints["wrist" + side])
        f = Vector(joints["forearm" + side])
        axis = (w - f).normalized()
        bisect(bm, w - axis * 0.6, axis)  # cuff, perpendicular to the forearm
    bm.to_mesh(ob.data)
    bm.free()


def build_coat_shell(uniform):
    v, e, r, names = body_skeleton(ease=0.7, arm_ease=0.45, coat=True)
    ob = skin_object("Coat", v, e, r, subdiv=3)
    apply_all(ob)
    open_coat(ob, dict(zip(names, v)))
    sol = ob.modifiers.new("Thickness", "SOLIDIFY")
    sol.thickness = 0.08
    sol.offset = 1
    ob.data.materials.append(fabric_material(uniform))
    bpy.ops.object.shade_smooth()
    return ob


def lights_and_camera():
    def area(name, loc, energy, size, color=(1, 1, 1)):
        bpy.ops.object.light_add(type="AREA", location=loc)
        L = bpy.context.object
        L.name = name
        L.data.energy = energy
        L.data.size = size
        L.data.color = color
        d = Vector((0, 0, 2)) - L.location
        L.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        return L

    area("Key", (35, -55, 40), 26000, 30)
    area("Fill", (-45, -40, 15), 9000, 40, (0.9, 0.95, 1))
    area("Rim", (0, 60, 45), 14000, 30)
    bpy.ops.object.camera_add()
    cam = bpy.context.object
    cam.data.lens = 70
    bpy.context.scene.camera = cam
    return cam


def shoot(cam, name, azimuth_deg, elev_deg=6, dist=150, target=(0, 0, 1)):
    t = Vector(target)
    a = math.radians(azimuth_deg)
    e = math.radians(elev_deg)
    cam.location = t + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    cam.rotation_euler = (t - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.render.filepath = os.path.join(args.out, f"{name}.png")
    bpy.ops.render.render(write_still=True)


def main():
    reset()
    build_mannequin()
    build_coat_shell(args.uniform)
    cam = lights_and_camera()
    for n, az in (("front", 0), ("q34", 35), ("side", 90), ("back", 180)):
        shoot(cam, f"stage1_{n}", az)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(os.path.join(args.out, "coat_stage1.blend")))


main()
