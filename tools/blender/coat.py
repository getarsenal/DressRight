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
from mathutils.geometry import delaunay_2d_cdt

# ---------------------------------------------------------------- args

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
ap = argparse.ArgumentParser()
ap.add_argument("--uniform", default="AGSU", choices=["AGSU", "ASU"])
ap.add_argument("--sex", default="male", choices=["male", "female"])
ap.add_argument("--out", default="tools/blender/out")
ap.add_argument("--samples", type=int, default=32)
ap.add_argument("--res", type=int, default=900)
ap.add_argument("--stage", default="stage2")
ap.add_argument("--drape", type=int, default=1)
args = ap.parse_args(argv)
os.makedirs(args.out, exist_ok=True)

HEM_Z = -19.5  # coat length: covers the seat
TOP_BUTTON_Z = 0.0
NOTCH = (3.2, 9.0)  # lapel notch (x, z), matches layout.ts

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
    j("pelvis", 0, 0.4, -15, 6.7, 4.7, ease + (0.55 if coat else 0))
    j("waist", 0, 0.2, -8, 6.0, 4.2, ease + (0.25 if coat else 0))
    j("ribs", 0, -0.2, 0, 6.9, 4.6)
    j("chest", 0, -0.5, 6, 7.3, 4.9)
    j("uchest", 0, -0.2, 11, 6.9, 4.4)
    j("neckb", 0, 0.4, 15.5, 2.5, 2.6, 0.5 if coat else 0)
    j("neckt", 0, 0.5, 19, 2.15, 2.25, 0.0)
    for side, sx in (("L", 1), ("R", -1)):
        j("shoulder" + side, 5.8 * sx, 0.2, 14.0, 2.3, 2.4, arm_ease)
        j("deltoid" + side, 8.3 * sx, 0.3, 12.6, 2.45, 2.6, arm_ease)
        # arms hang slightly away from the body (display-form pose) so sleeves clear the skirt
        j("bicep" + side, 9.3 * sx, 0.2, 6.5, 2.15, 2.3, arm_ease)
        j("elbow" + side, 10.0 * sx, -0.4, 0.5, 1.75, 1.9, arm_ease)
        j("forearm" + side, 10.6 * sx, -1.4, -4.5, 1.6, 1.75, arm_ease)
        j("wrist" + side, 11.1 * sx, -2.4, -9.0, 1.15, 1.35, arm_ease * 0.9)
        E += [("uchest", "shoulder" + side), ("shoulder" + side, "deltoid" + side), ("deltoid" + side, "bicep" + side),
              ("bicep" + side, "elbow" + side), ("elbow" + side, "forearm" + side), ("forearm" + side, "wrist" + side)]
        if not coat:
            j("hand" + side, 11.4 * sx, -2.8, -12.5, 0.9, 1.6, 0)
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
        j("hem", 0, 0.5, -26, 7.0, 5.0, ease + 0.9)
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


def bisect(bm, co, no, where=None):
    """Cut with a plane and drop what's on the +normal side. `where(v)` limits the cut to part of the mesh."""
    if where is None:
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    else:
        vs = {v for v in bm.verts if where(v.co)}
        geom = list(vs) + [e for e in bm.edges if all(v in vs for v in e.verts)] + [f for f in bm.faces if all(v in vs for v in f.verts)]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=Vector(co), plane_no=Vector(no), clear_outer=True)


def open_coat(ob, joints):
    """Cut the hem, cuffs and neck open with clean planes so the shell reads as a garment."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bisect(bm, (0, 0, HEM_Z), (0, 0, -1))  # hem
    bisect(bm, (0, 0, 16.4), (0, 0, 1))  # neck opening
    for side in ("L", "R"):
        w = Vector(joints["wrist" + side])
        f = Vector(joints["forearm" + side])
        axis = (w - f).normalized()
        sx = 1 if side == "L" else -1
        bisect(bm, w - axis * 0.6, axis, where=lambda c, sx=sx: c.x * sx > 9.3 or (c.x * sx > 6.0 and c.z > -6))  # cuff: this sleeve only
    bm.to_mesh(ob.data)
    bm.free()


def build_coat_shell(uniform):
    v, e, r, names = body_skeleton(ease=0.7, arm_ease=0.45, coat=True)
    ob = skin_object("Coat", v, e, r, subdiv=3)
    apply_all(ob)
    open_coat(ob, dict(zip(names, v)))
    ob.data.materials.append(fabric_material(uniform))
    bpy.ops.object.shade_smooth()
    return ob



# ---------------------------------------------------------------- projected pattern pieces


def simple_material(name, rgb, rough=0.6, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return m


def polygon_mesh(name, outline, step=0.22, plane="XZ", depth=-40.0):
    """Triangulated mesh filling a 2D outline, with interior points so it can bend when projected."""
    pts = [Vector((u, v)) for u, v in outline]
    n = len(pts)
    # densify the boundary
    bound = []
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]
        k = max(1, int((b - a).length / step))
        bound += [a.lerp(b, t / k) for t in range(k)]
    us = [p.x for p in bound]
    vs = [p.y for p in bound]

    def inside(p):
        c = False
        for i in range(n):
            a, b = pts[i], pts[(i + 1) % n]
            if (a.y > p.y) != (b.y > p.y) and p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y + 1e-12) + a.x:
                c = not c
        return c

    grid = []
    u = min(us) + step / 2
    while u < max(us):
        v = min(vs) + step / 2
        while v < max(vs):
            q = Vector((u, v))
            if inside(q) and all((q - b).length > step * 0.45 for b in bound[:: max(1, len(bound) // 60)]):
                grid.append(q)
            v += step
        u += step
    verts2 = bound + grid
    edges = [(i, (i + 1) % len(bound)) for i in range(len(bound))]
    out = delaunay_2d_cdt(verts2, edges, [], 2, 1e-6)  # 2 = keep only faces inside the constraints
    vco, _, faces = out[0], out[1], out[2]
    if plane == "XZ":
        verts3 = [(p.x, depth, p.y) for p in vco]
    else:  # XY seen from above
        verts3 = [(p.x, p.y, depth) for p in vco]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts3, [], [list(f) for f in faces])
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def project_onto(ob, target, offset, axis="Y", positive=True):
    sw = ob.modifiers.new("Project", "SHRINKWRAP")
    sw.target = target
    sw.wrap_method = "PROJECT"
    sw.use_project_x = axis == "X"
    sw.use_project_y = axis == "Y"
    sw.use_project_z = axis == "Z"
    sw.use_positive_direction = positive
    sw.use_negative_direction = not positive
    sw.offset = offset
    apply_all(ob)
    # any vertex the projection missed snaps to the nearest surface point instead
    deps = bpy.context.evaluated_depsgraph_get()
    tgt = target.evaluated_get(deps)
    for v in ob.data.vertices:
        if abs(v.co.y) > 30 or abs(v.co.z) > 60:
            ok, loc, nor, _ = tgt.closest_point_on_mesh(v.co)
            if ok:
                v.co = loc + nor * offset


def finish_piece(ob, thickness, material, bevel=0.03):
    sol = ob.modifiers.new("Thickness", "SOLIDIFY")
    sol.thickness = thickness
    sol.offset = 1
    if bevel:
        bv = ob.modifiers.new("Bevel", "BEVEL")
        bv.width = bevel
        bv.segments = 2
        bv.limit_method = "ANGLE"
    ob.data.materials.append(material)
    for poly in ob.data.polygons:
        poly.use_smooth = True
    return ob


def lapel_outline(side):
    nx, nz = NOTCH
    neck_r = 2.6
    pts = [
        (neck_r * 0.72, 16.25),
        (0.0, TOP_BUTTON_Z),
        (nx + 1.4, nz + 0.2),
        (nx + 0.8, nz),
        (nx + 1.6, nz + 1.0),
        (neck_r + 1.5, 15.9),
        (neck_r + 0.2, 16.3),
    ]
    pts = [(x * side, z) for x, z in pts]
    return pts if side > 0 else list(reversed(pts))


def build_front(coat, mannequin, uniform):
    fabric = coat.data.materials[0]
    lapel_mat = fabric
    # lapels + front collar, projected while the coat front is still whole
    lapels = []
    for side in (1, -1):
        lp = polygon_mesh(f"Lapel{'L' if side > 0 else 'R'}", lapel_outline(side), step=0.2)
        project_onto(lp, coat, 0.1)
        finish_piece(lp, 0.12, lapel_mat, bevel=0.04)
        lapels.append(lp)
    # open the V between the lapels (just inside their inner edges)
    bm = bmesh.new()
    bm.from_mesh(coat.data)
    kill = []
    for f in bm.faces:
        c = f.calc_center_median()
        if c.y < 0 and TOP_BUTTON_Z - 0.2 < c.z < 17.5:
            w = max(0.0, (c.z - TOP_BUTTON_Z) / (16.25 - TOP_BUTTON_Z) * 2.6 * 0.72 - 0.15)
            if abs(c.x) < w:
                kill.append(f)
    bmesh.ops.delete(bm, geom=kill, context="FACES")
    bm.to_mesh(coat.data)
    bm.free()

    # back collar: a band around the neck joining the two front collar pieces
    collar = bpy.data.meshes.new("CollarBack")
    bm = bmesh.new()
    rings = []
    for k, (r, z) in enumerate(((3.05, 16.2), (3.35, 17.6))):
        pts_row = []
        for i in range(29):
            th = math.radians(-35 + i * (250 / 28))
            pts_row.append(bm.verts.new((r * math.cos(th), 0.5 + r * math.sin(th) * 1.05, z)))
        rings.append(pts_row)
    for i in range(28):
        bm.faces.new((rings[0][i], rings[0][i + 1], rings[1][i + 1], rings[1][i]))
    bm.to_mesh(collar)
    bm.free()
    co = bpy.data.objects.new("CollarBack", collar)
    bpy.context.collection.objects.link(co)
    finish_piece(co, 0.14, fabric, bevel=0.04)

    # shirt + tie inside the V
    shirt_rgb = (0.52, 0.45, 0.33) if uniform == "AGSU" else (0.82, 0.82, 0.8)
    tie_rgb = (0.03, 0.028, 0.02) if uniform == "AGSU" else (0.01, 0.01, 0.01)
    shirt = mannequin.copy()
    shirt.data = mannequin.data.copy()
    shirt.name = "Shirt"
    bpy.context.collection.objects.link(shirt)
    bm = bmesh.new()
    bm.from_mesh(shirt.data)
    def keep_v(c):
        vw = max(0.0, (c.z - TOP_BUTTON_Z) / (16.25 - TOP_BUTTON_Z) * 2.6 * 0.72) + 0.25
        return c.y < 0.5 and -1.0 < c.z < 15.9 and abs(c.x) < vw
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not keep_v(f.calc_center_median())], context="FACES")
    for v in bm.verts:
        v.co += v.normal * 0.22
    bm.to_mesh(shirt.data)
    bm.free()
    shirt.data.materials.clear()
    shirt.data.materials.append(simple_material("Shirt", shirt_rgb, 0.7))
    ring("ShirtCollar", 2.62, 15.8, 2.72, 17.3, -62, 242, shirt.data.materials[0], 0.06)
    tie_outline = [(-0.45, 16.6), (0.45, 16.6), (0.32, 15.6), (0.8, 3.0), (0.0, 1.6), (-0.8, 3.0), (-0.32, 15.6)]
    tie = polygon_mesh("Tie", tie_outline, step=0.15)
    project_onto(tie, mannequin, 0.3)  # body has no holes; 0.3 = shirt depth + tie gap
    finish_piece(tie, 0.08, simple_material("Tie", tie_rgb, 0.45), bevel=0.02)
    return lapels


# ---------------------------------------------------------------- surface helpers + details


def bvh_of(ob):
    from mathutils.bvhtree import BVHTree

    deps = bpy.context.evaluated_depsgraph_get()
    return BVHTree.FromObject(ob, deps)


def front_point(bvh, x, z):
    """Hit point and normal on the coat front at (x, z), looking from the front."""
    hit, nor, _, _ = bvh.ray_cast(Vector((x, -40, z)), Vector((0, 1, 0)))
    return hit, nor


def ring(name, r0, z0, r1, z1, a0, a1, mat, thick, cy=0.5, segs=40):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rows = []
    for r, z in ((r0, z0), (r1, z1)):
        rows.append([bm.verts.new((r * math.cos(math.radians(a0 + (a1 - a0) * i / segs)), cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / segs)), z)) for i in range(segs + 1)])
    for i in range(segs):
        bm.faces.new((rows[0][i], rows[0][i + 1], rows[1][i + 1], rows[1][i]))
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return finish_piece(ob, thick, mat, bevel=0.02)


def brass_material():
    return simple_material("Brass", (0.78, 0.56, 0.22), rough=0.28, metal=1.0)


def button(name, pos, nor, radius, mat, height=0.16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=radius, location=pos)
    b = bpy.context.object
    b.name = name
    b.scale = (1, 1, height / radius)
    b.rotation_euler = nor.to_track_quat("Z", "Y").to_euler()
    b.location = pos + nor * (height * 0.45)
    b.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return b


def flap_outline(cx, top, w, h, point):
    return [(cx - w / 2, top), (cx + w / 2, top), (cx + w / 2, top - h + point), (cx, top - h), (cx - w / 2, top - h + point)]


def rect(cx, top, w, h):
    return [(cx - w / 2, top), (cx + w / 2, top), (cx + w / 2, top - h), (cx - w / 2, top - h)]


# AGSU male pocket/belt geometry (inches); matches layout.ts coatGeometry where it overlaps
BREAST = dict(cx=5.0, top=4.6, w=4.5, h=5.4, flap=2.2, point=0.38)
LOWER = dict(cx=4.9, top=-8.4, w=5.8, h=6.4, flap=2.4, point=0.32)
BELT = dict(z0=-7.4, z1=-5.8)
BUTTONS_Z = [0.0, -4.3, -9.6, -13.6]


def build_details(coat, uniform):
    fabric = coat.data.materials[0]
    brass = brass_material()
    bvh = bvh_of(coat)
    agsu = uniform == "AGSU"

    def pocket(name, P, pleat):
        for side in (1, -1):
            cx = P["cx"] * side
            body = polygon_mesh(f"{name}Body{side}", rect(cx, P["top"] - 0.15, P["w"], P["h"]), step=0.3)
            project_onto(body, coat, 0.04)
            finish_piece(body, 0.2, fabric, bevel=0.05)
            if pleat:
                pl = polygon_mesh(f"{name}Pleat{side}", rect(cx, P["top"] - P["flap"], 1.5, P["h"] - P["flap"]), step=0.25)
                project_onto(pl, coat, 0.25)
                finish_piece(pl, 0.05, fabric, bevel=0.03)
            fl = polygon_mesh(f"{name}Flap{side}", flap_outline(cx, P["top"], P["w"] + 0.2, P["flap"], P["point"]), step=0.25)
            project_onto(fl, coat, 0.28)
            finish_piece(fl, 0.12, fabric, bevel=0.05)
            hit, nor = front_point(bvh, cx, P["top"] - P["flap"] + 0.45)
            if hit:
                button(f"{name}Button{side}", hit + nor * 0.4, nor, 0.3, brass)

    pocket("Breast", BREAST, pleat=agsu)
    pocket("Lower", LOWER, pleat=False)

    # front buttons on the overlap, and the overlapping front edge below the top button
    for i, z in enumerate(BUTTONS_Z):
        hit, nor = front_point(bvh, -0.15, z)
        if hit:
            button(f"FrontButton{i}", hit + nor * 0.12, nor, 0.42, brass)
    edge = polygon_mesh("FrontEdge", [(-1.15, TOP_BUTTON_Z - 0.4), (-0.75, TOP_BUTTON_Z - 0.4), (-0.75, HEM_Z + 0.3), (-1.15, HEM_Z + 0.3)], step=0.2)
    project_onto(edge, coat, 0.03)
    finish_piece(edge, 0.06, fabric, bevel=0.03)

    if agsu:
        # belt: follow the coat surface around the waist
        me = bpy.data.meshes.new("Belt")
        bm = bmesh.new()
        rows = []
        for z in (BELT["z0"], BELT["z1"]):
            row = []
            for i in range(96):
                th = 2 * math.pi * i / 96
                d = Vector((math.cos(th), math.sin(th), 0))
                # cast from inside the body outward: the first hit is the coat body, never a sleeve
                origin = Vector((0, 0.3, z))
                hit, nor, _, _ = bvh.ray_cast(origin, d)
                row.append(bm.verts.new(hit + d * 0.2 if hit else origin + d * 8))
            rows.append(row)
        for i in range(96):
            j = (i + 1) % 96
            bm.faces.new((rows[0][i], rows[0][j], rows[1][j], rows[1][i]))
        bm.to_mesh(me)
        bm.free()
        belt = bpy.data.objects.new("Belt", me)
        bpy.context.collection.objects.link(belt)
        finish_piece(belt, 0.16, fabric, bevel=0.04)
        # buckle: brass frame at center front
        hit, nor = front_point(bvh, 0.0, (BELT["z0"] + BELT["z1"]) / 2)
        if hit:
            bpy.ops.mesh.primitive_cube_add(size=1, location=hit + nor * 0.3)
            bk = bpy.context.object
            bk.name = "Buckle"
            bk.scale = (1.5, 0.12, 1.9)
            bk.rotation_euler = nor.to_track_quat("-Y", "Z").to_euler()
            bv = bk.modifiers.new("Bevel", "BEVEL")
            bv.width = 0.12
            bv.segments = 3
            bk.data.materials.append(brass)

    # shoulder loops, projected from above onto the shoulders
    for side in (1, -1):
        x0, x1 = 3.7 * side, 8.2 * side
        outline = [(x0, -0.85), (x1, -1.0), (x1, 1.0), (x0, 0.85), (x0 - 0.5 * side, 0.0)]
        if side < 0:
            outline = list(reversed(outline))
        lp = polygon_mesh(f"Loop{side}", outline, step=0.22, plane="XY", depth=40.0)
        project_onto(lp, coat, 0.06, axis="Z", positive=False)
        finish_piece(lp, 0.12, fabric, bevel=0.04)
        hit, nor, _, _ = bvh.ray_cast(Vector((4.2 * side, 0.0, 40)), Vector((0, 0, -1)))
        if hit:
            button(f"LoopButton{side}", hit + nor * 0.22, nor, 0.28, brass)


def drape(coat, mannequin, frames=24):
    """Cloth-simulate the coat shell on the mannequin so it settles with weight and folds."""
    man_col = mannequin.modifiers.new("Collision", "COLLISION")
    mannequin.collision.thickness_outer = 0.12
    mannequin.collision.cloth_friction = 8
    # pin the shoulders, collar area and upper chest/back; the rest hangs
    vg = coat.vertex_groups.new(name="pin")
    for v in coat.data.vertices:
        w = min(1.0, max(0.0, (v.co.z - 9.0) / 4.0))
        if w > 0:
            vg.add([v.index], w, "REPLACE")
    cl = coat.modifiers.new("Cloth", "CLOTH")
    st = cl.settings
    st.quality = 6
    st.mass = 0.6
    st.tension_stiffness = 40
    st.compression_stiffness = 40
    st.shear_stiffness = 15
    st.bending_stiffness = 2.5
    st.air_damping = 1.0
    st.vertex_group_mass = "pin"
    st.pin_stiffness = 1.0
    st.gravity = (0, 0, -386.0)  # 9.81 m/s² in inches/s²
    cl.collision_settings.distance_min = 0.1
    cl.collision_settings.use_self_collision = False
    sc = bpy.context.scene
    sc.frame_start = 1
    sc.frame_end = frames
    cl.point_cache.frame_start = 1
    cl.point_cache.frame_end = frames
    for f in range(1, frames + 1):
        sc.frame_set(f)
    bpy.context.view_layer.objects.active = coat
    bpy.ops.object.modifier_apply(modifier="Cloth")
    mannequin.modifiers.remove(man_col)


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
    man = build_mannequin()
    coat = build_coat_shell(args.uniform)
    if args.drape:
        drape(coat, man)
    sol = coat.modifiers.new("Thickness", "SOLIDIFY")
    sol.thickness = 0.08
    sol.offset = 1
    apply_all(coat)
    build_front(coat, man, args.uniform)
    build_details(coat, args.uniform)
    cam = lights_and_camera()
    for n, az in (("front", 0), ("q34", 35), ("side", 90), ("back", 180)):
        shoot(cam, f"{args.stage}_{n}", az)
    shoot(cam, f"{args.stage}_closeup", 15, elev_deg=8, dist=75, target=(0, 0, 9))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(os.path.join(args.out, f"coat_{args.stage}.blend")))


main()
