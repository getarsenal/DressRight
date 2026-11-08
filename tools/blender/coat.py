"""
DressRight coat builder (Blender 5.x, headless).

    python -m venv .venv && .venv/bin/pip install bpy==5.2.3
    .venv/bin/python tools/blender/coat.py --out tools/blender/out

Units: 1 Blender unit = 1 inch (the web app's layout units).
Axes: Blender -Y = coat front, +X = wearer's left, Z up. glTF "+Y up" export
maps this to the app frame (front = +Z). Build frame: shoulder line at
z = SH; on export the origin moves to the top button (as in layout.ts).

All coat dimensions come from SPEC below, measured from a straight-on product
photo of an issued AGSU coat (40R), calibrated to a 31-inch coat length
(31.6 px/in), which also gives a 0.9-inch (36-ligne) front button, a 1.8-inch
belt and 4.7 x 6.9-inch breast pockets. x = inches from center front,
z = inches from the shoulder line (negative = below).
"""
import argparse
import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import delaunay_2d_cdt

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
ap = argparse.ArgumentParser()
ap.add_argument("--uniform", default="AGSU", choices=["AGSU", "ASU"])
ap.add_argument("--out", default="tools/blender/out")
ap.add_argument("--samples", type=int, default=32)
ap.add_argument("--res", type=int, default=900)
ap.add_argument("--stage", default="v2")
args = ap.parse_args(argv)
os.makedirs(args.out, exist_ok=True)

SH = 14.5  # shoulder-line height in the build frame

# ---------------------------------------------------------------- measured spec (AGSU, male 40R)
SPEC = {
    "collar_top_z": 3.0,  # back collar top above the shoulder line
    "lapel": [  # wearer's right side outline (x, z)
        (1.33, 2.4),  # inner (roll) edge at the neck
        (0.22, -4.65),  # lapels meet (2.45 in above the top button)
        (2.9, -2.9),  # lapel belly
        (4.65, -0.85),  # lapel point
        (3.54, -0.32),  # notch vertex
        (4.43, -0.22),  # collar point
        (2.28, 3.0),  # collar outer edge at the neck
    ],
    "buttons_z": [-7.1, -10.2, -13.0],
    "button_d": 0.9,
    "breast": dict(cx=4.6, top=-4.5, w=4.7, h=6.9, flap=2.75, point=0.4, pleat=1.33, button_z=-6.9),
    "belt": dict(top=-13.9, h=1.8, buckle_w=1.25, buckle_h=2.2),
    "lower_flap": dict(cx=5.0, top=-15.8, w=4.1, h=3.5, button_dx=1.6, button_z=-17.9),
    "hem_z": -27.7,
    "cuff_z": -22.9,
    "loop": dict(x0=3.2, x1=8.1, w=1.6, button_x=3.86),
    "color_srgb": (60, 48, 32),  # photographed coat, lightly corrected for studio exposure
}


def Z(dz):
    """spec z (from the shoulder line) → build frame"""
    return SH + dz


def srgb_to_linear(c):
    c = c / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


FABRIC_RGB = {
    "AGSU": tuple(srgb_to_linear(c) for c in SPEC["color_srgb"]),
    "ASU": (0.018, 0.024, 0.06),
}

# ---------------------------------------------------------------- scene


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = args.samples
    sc.cycles.use_denoising = True
    sc.render.resolution_x = int(args.res * 0.75)
    sc.render.resolution_y = args.res
    sc.view_settings.view_transform = "AgX"
    world = bpy.data.worlds.new("World")
    sc.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.05, 0.053, 0.05, 1)


def apply_all(ob):
    bpy.context.view_layer.objects.active = ob
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def link(ob):
    bpy.context.collection.objects.link(ob)
    return ob


def skin_object(name, joints, edges, subdiv):
    names = list(joints)
    me = bpy.data.meshes.new(name)
    me.from_pydata([joints[n][0] for n in names], [(names.index(a), names.index(b)) for a, b in edges], [])
    ob = link(bpy.data.objects.new(name, me))
    bpy.context.view_layer.objects.active = ob
    sk = ob.modifiers.new("Skin", "SKIN")
    sk.use_smooth_shade = True
    sk.branch_smoothing = 0.8
    for v, n in zip(me.skin_vertices[0].data, names):
        v.radius = joints[n][1]
    me.skin_vertices[0].data[0].use_root = True
    ss = ob.modifiers.new("Subsurf", "SUBSURF")
    ss.levels = ss.render_levels = subdiv
    apply_all(ob)
    return ob


# ---------------------------------------------------------------- bodies


def mannequin_joints():
    J = {
        "pelvis": ((0, 0.4, -10), (6.5, 4.6)),
        "waist": ((0, 0.2, -2), (5.9, 4.2)),
        "ribs": ((0, -0.2, 4), (6.8, 4.6)),
        "chest": ((0, -0.5, 8.5), (7.1, 4.8)),
        "uchest": ((0, -0.2, 12), (6.6, 4.3)),
        "neckb": ((0, 0.4, 15.4), (2.45, 2.55)),
        "neckt": ((0, 0.5, 19), (2.1, 2.2)),
        "head": ((0, 0.6, 23.5), (3.1, 3.6)),
    }
    E = [("pelvis", "waist"), ("waist", "ribs"), ("ribs", "chest"), ("chest", "uchest"), ("uchest", "neckb"), ("neckb", "neckt"), ("neckt", "head")]
    for s, sx in (("L", 1), ("R", -1)):
        J["sh" + s] = ((5.6 * sx, 0.2, 13.0), (2.1, 2.2))
        J["del" + s] = ((7.9 * sx, 0.3, 11.9), (2.25, 2.4))
        J["bic" + s] = ((8.5 * sx, 0.2, 7.0), (2.0, 2.15))
        J["elb" + s] = ((9.0 * sx, -0.4, 2.0), (1.65, 1.8))
        J["fore" + s] = ((9.3 * sx, -1.3, -2.8), (1.5, 1.65))
        J["wri" + s] = ((9.5 * sx, -2.2, -7.6), (1.05, 1.25))
        J["hand" + s] = ((9.6 * sx, -2.6, -11.0), (0.9, 1.6))
        J["thigh" + s] = ((4.0 * sx, 0.4, -17), (4.0, 4.2))
        J["knee" + s] = ((4.2 * sx, 0.2, -29), (2.6, 2.8))
        E += [("uchest", "sh" + s), ("sh" + s, "del" + s), ("del" + s, "bic" + s), ("bic" + s, "elb" + s), ("elb" + s, "fore" + s),
              ("fore" + s, "wri" + s), ("wri" + s, "hand" + s), ("pelvis", "thigh" + s), ("thigh" + s, "knee" + s)]
    return J, E


def coat_joints():
    """Coat skeleton: silhouette half-widths from the photo (chest 7.7, belt 6.5, hem 7.3)."""
    J = {
        "hemx": ((0, 0.4, Z(-34)), (7.55, 5.3)),
        "hip": ((0, 0.3, Z(-21)), (7.35, 5.15)),
        "belt": ((0, 0.1, Z(-14.8)), (6.75, 4.75)),
        "ribs": ((0, -0.2, Z(-10)), (7.45, 5.1)),
        "chest": ((0, -0.5, Z(-6)), (7.75, 5.25)),
        "uchest": ((0, -0.2, Z(-2.2)), (7.2, 4.8)),
        "neckb": ((0, 0.4, Z(1.0)), (2.85, 2.95)),
        "collar": ((0, 0.45, Z(SPEC["collar_top_z"] + 0.9)), (2.95, 3.05)),  # collar stand
    }
    E = [("hemx", "hip"), ("hip", "belt"), ("belt", "ribs"), ("ribs", "chest"), ("chest", "uchest"), ("uchest", "neckb"), ("neckb", "collar")]
    for s, sx in (("L", 1), ("R", -1)):
        J["sh" + s] = ((5.6 * sx, 0.2, Z(-1.2)), (2.35, 2.5))
        J["del" + s] = ((7.9 * sx, 0.3, Z(-2.3)), (2.55, 2.75))
        J["bic" + s] = ((8.55 * sx, 0.2, Z(-7.5)), (2.35, 2.5))
        J["elb" + s] = ((9.05 * sx, -0.4, Z(-12.5)), (2.05, 2.2))
        J["fore" + s] = ((9.35 * sx, -1.3, Z(-17.3)), (1.9, 2.05))
        J["wri" + s] = ((9.55 * sx, -2.3, Z(-23.6)), (1.7, 1.85))
        E += [("uchest", "sh" + s), ("sh" + s, "del" + s), ("del" + s, "bic" + s), ("bic" + s, "elb" + s), ("elb" + s, "fore" + s), ("fore" + s, "wri" + s)]
    return J, E


# ---------------------------------------------------------------- materials


def principled(name, rgb, rough=0.6, metal=0.0, sheen=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Sheen Weight"].default_value = sheen
    return m, b


def fabric_material(uniform):
    """Fine wool-blend twill: subtle diagonal weave, slight heathering and sheen."""
    m, b = principled("Fabric", FABRIC_RGB[uniform], rough=0.82, sheen=0.25)
    b.inputs["Sheen Roughness"].default_value = 0.35
    nt = m.node_tree
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (48, 48, 48)
    mp.inputs["Rotation"].default_value = (0, 0, math.radians(45))
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.inputs["Distortion"].default_value = 0.4
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 6
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.07
    bump.inputs["Distance"].default_value = 0.004
    tint = nt.nodes.new("ShaderNodeMix")
    tint.data_type = "RGBA"
    tint.inputs["A"].default_value = (*FABRIC_RGB[uniform], 1)
    tint.inputs["B"].default_value = tuple(c * 1.25 for c in FABRIC_RGB[uniform]) + (1,)
    fac = nt.nodes.new("ShaderNodeMath")
    fac.operation = "MULTIPLY"
    fac.inputs[1].default_value = 0.12
    nt.links.new(coord.outputs["Object"], mp.inputs["Vector"])
    nt.links.new(mp.outputs["Vector"], wave.inputs["Vector"])
    nt.links.new(wave.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    nt.links.new(coord.outputs["Object"], noise.inputs["Vector"])
    nt.links.new(noise.outputs["Fac"], fac.inputs[0])
    nt.links.new(fac.outputs["Value"], tint.inputs["Factor"])
    nt.links.new(tint.outputs["Result"], b.inputs["Base Color"])
    return m


# ---------------------------------------------------------------- geometry helpers


def bisect(bm, co, no, where=None):
    if where is None:
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    else:
        vs = {v for v in bm.verts if where(v.co)}
        geom = list(vs) + [e for e in bm.edges if all(v in vs for v in e.verts)] + [f for f in bm.faces if all(v in vs for v in f.verts)]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=Vector(co), plane_no=Vector(no), clear_outer=True)


def polygon_mesh(name, outline, step=0.12, plane="XZ", depth=-40.0):
    """Triangulated fill of a 2D outline with interior points (so it can bend when projected)."""
    pts = [Vector(p) for p in outline]
    n = len(pts)
    bound = []
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]
        k = max(1, int((b - a).length / step))
        bound += [a.lerp(b, t / k) for t in range(k)]

    def inside(p):
        c = False
        for i in range(n):
            a, b = pts[i], pts[(i + 1) % n]
            if (a.y > p.y) != (b.y > p.y) and p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y + 1e-12) + a.x:
                c = not c
        return c

    us, vs = [p.x for p in bound], [p.y for p in bound]
    grid = []
    u = min(us) + step / 2
    while u < max(us):
        v = min(vs) + step / 2
        while v < max(vs):
            q = Vector((u, v))
            if inside(q) and min((q - b).length for b in bound) > step * 0.5:
                grid.append(q)
            v += step
        u += step
    edges = [(i, (i + 1) % len(bound)) for i in range(len(bound))]
    vco, _, faces, *_ = delaunay_2d_cdt(bound + grid, edges, [], 2, 1e-6)
    v3 = [(p.x, depth, p.y) for p in vco] if plane == "XZ" else [(p.x, p.y, depth) for p in vco]
    me = bpy.data.meshes.new(name)
    me.from_pydata(v3, [], [list(f) for f in faces])
    return link(bpy.data.objects.new(name, me))


def project_onto(ob, target, offset, axis="Y", positive=True):
    """Drop each vertex onto the target along the axis, keeping only front-facing hits.

    Rays start outside the body; a hit counts only if it lands on the near side
    (front of the coat for Y, top of the shoulders for Z). Misses fall back to
    the nearest surface point, so no vertex is ever left floating.
    """
    bpy.context.view_layer.update()  # make sure the target's evaluated mesh is current
    deps = bpy.context.evaluated_depsgraph_get()
    tgt = target.evaluated_get(deps)
    bvh = BVHTree.FromObject(target, deps)
    for v in ob.data.vertices:
        if axis == "Y":
            origin, d = Vector((v.co.x, -60, v.co.z)), Vector((0, 1, 0))
            ok_side = lambda h: h.y < 1.0
        else:  # from above, onto the shoulders
            origin, d = Vector((v.co.x, v.co.y, 80)), Vector((0, 0, -1))
            ok_side = lambda h: True
        hit, nor, _, _ = bvh.ray_cast(origin, d)
        if hit is not None and ok_side(hit):
            if nor.dot(d) > 0:
                nor = -nor
            v.co = hit + nor * offset
        else:
            ok, loc, nor, _ = tgt.closest_point_on_mesh(Vector((v.co.x, -3 if axis == "Y" else v.co.y, v.co.z if axis == "Y" else 16)))
            if ok:
                v.co = loc + nor * offset
    clean_mesh(ob)


def clean_mesh(ob):
    """Merge near-duplicates, dissolve zero-area faces and unify face direction (outward = toward the viewer/up)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.012)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=0.004)
    bm.faces.ensure_lookup_table()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # make the shell face outward from the body (away from the coat's centerline)
    if bm.faces:
        out = sum((f.normal.dot(Vector((f.calc_center_median().x * 0.15, f.calc_center_median().y, 0)).normalized() or Vector((0, -1, 0))) for f in bm.faces), 0.0)
        if out < 0:
            bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()


def thicken(ob, thickness):
    """Give a projected shell thickness by extruding it along each vertex's own unit normal.

    (The Solidify modifier misbehaves on thin, steep, triangulated patches; this can't overshoot.)
    """
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.normal_update()
    normals = {v: v.normal.copy() for v in bm.verts}
    ext = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
    new_verts = [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]
    # extruded verts map 1:1 onto the originals through the rim edges
    for v in new_verts:
        src = next((e.other_vert(v) for e in v.link_edges if e.other_vert(v) in normals), None)
        n = normals.get(src, Vector((0, -1, 0)))
        if n.length < 1e-6:
            n = Vector((0, -1, 0))
        v.co += n.normalized() * thickness
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()


def finish_piece(ob, thickness, material, bevel=0.035):
    thicken(ob, thickness)
    if bevel:
        bv = ob.modifiers.new("Bevel", "BEVEL")
        bv.width = bevel
        bv.segments = 3
        bv.limit_method = "ANGLE"
    ob.data.materials.append(material)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def piece(name, outline, target, offset, thickness, material, step=0.12, bevel=0.035):
    ob = polygon_mesh(name, outline, step=step)
    project_onto(ob, target, offset)
    return finish_piece(ob, thickness, material, bevel=bevel)


def mirror_x(outline):
    return list(reversed([(-x, z) for x, z in outline]))


def front_hit(bvh, x, z):
    hit, nor, _, _ = bvh.ray_cast(Vector((x, -40, z)), Vector((0, 1, 0)))
    return hit, nor


def button(name, hit, nor, d, mat, h=0.16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=20, radius=d / 2, location=hit)
    b = bpy.context.object
    b.name = name
    b.scale = (1, 1, h / (d / 2))
    b.rotation_euler = nor.to_track_quat("Z", "Y").to_euler()
    b.location = hit + nor * (h * 0.5)
    b.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    # eagle relief stand-in: a raised ring
    bpy.ops.mesh.primitive_torus_add(major_radius=d * 0.4, minor_radius=d * 0.035, location=b.location + nor * h * 0.42)
    r = bpy.context.object
    r.rotation_euler = b.rotation_euler
    r.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return b


# ---------------------------------------------------------------- build


def build_mannequin():
    J, E = mannequin_joints()
    ob = skin_object("Mannequin", J, E, 2)
    ob.data.materials.append(principled("Mannequin", (0.30, 0.31, 0.32), rough=0.5)[0])
    return ob


def build_coat(uniform):
    J, E = coat_joints()
    ob = skin_object("Coat", J, E, 3)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bisect(bm, (0, 0, Z(SPEC["hem_z"])), (0, 0, -1))
    # neck opening at the measured collar height: the coat's neck rises like a collar stand,
    # so the collar part of the lapels has cloth underneath it
    bisect(bm, (0, 0, Z(SPEC["collar_top_z"]) + 0.05), (0, 0, 1), where=lambda c: abs(c.x) < 4.5)
    for s, sx in (("L", 1), ("R", -1)):
        w, f = Vector(J["wri" + s][0]), Vector(J["fore" + s][0])
        axis = (w - f).normalized()
        cut = Vector((w.x, w.y, Z(SPEC["cuff_z"])))
        bisect(bm, cut, axis, where=lambda c, sx=sx: c.x * sx > 7.6 and c.z < Z(-14))
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.materials.append(fabric_material(uniform))
    return ob


def build_front(coat, man, uniform):
    fabric = coat.data.materials[0]
    lapel_r = SPEC["lapel"]
    outline_r = [(-x, Z(z)) for x, z in lapel_r]  # wearer's right is -x
    outline_l = mirror_x(outline_r)
    for name, ol in (("LapelR", outline_r), ("LapelL", outline_l)):
        piece(name, ol, coat, 0.1, 0.12, fabric, step=0.1, bevel=0.045)
    # open the V between the lapels (inner edge runs from the neck to where the lapels meet)
    (xi, zi), (xb, zb) = lapel_r[0], lapel_r[1]
    bm = bmesh.new()
    bm.from_mesh(coat.data)
    kill = []
    for f in bm.faces:
        c = f.calc_center_median()
        if c.y < 0 and Z(zb) - 0.1 < c.z < Z(SPEC["collar_top_z"]) + 0.2:
            t = (c.z - Z(zb)) / (Z(zi) - Z(zb))
            if abs(c.x) < xb + (xi - xb) * max(0, min(1, t)) - 0.12:
                kill.append(f)
    bmesh.ops.delete(bm, geom=kill, context="FACES")
    bm.to_mesh(coat.data)
    bm.free()
    # back collar: stands around the neck between the collar ends, top at the measured height
    me = bpy.data.meshes.new("CollarBack")
    bm = bmesh.new()
    rows = []
    for r, z in ((3.12, Z(1.0)), (3.3, Z(SPEC["collar_top_z"]))):
        row = []
        for i in range(41):
            th = math.radians(-38 + i * (256 / 40))
            row.append(bm.verts.new((r * math.cos(th), 0.45 + r * math.sin(th) * 1.05, z)))
        rows.append(row)
    for i in range(40):
        bm.faces.new((rows[0][i], rows[0][i + 1], rows[1][i + 1], rows[1][i]))
    bm.to_mesh(me)
    bm.free()
    finish_piece(link(bpy.data.objects.new("CollarBack", me)), 0.14, fabric, bevel=0.04)
    # shirt and tie in the V
    shirt_rgb = (0.52, 0.45, 0.34) if uniform == "AGSU" else (0.82, 0.82, 0.8)
    tie_rgb = (0.035, 0.03, 0.02) if uniform == "AGSU" else (0.01, 0.01, 0.01)
    shirt_mat = principled("Shirt", shirt_rgb, rough=0.7)[0]
    sh_outline = [(-xi - 0.25, Z(zi)), (xi + 0.25, Z(zi)), (xb + 0.3, Z(zb) - 0.3), (-xb - 0.3, Z(zb) - 0.3)]
    piece("ShirtFront", sh_outline, man, 0.25, 0.04, shirt_mat, step=0.15, bevel=0)
    tie = [(-0.42, Z(2.2)), (0.42, Z(2.2)), (0.3, Z(1.3)), (0.75, Z(zb) - 0.5), (0.0, Z(zb) - 1.6), (-0.75, Z(zb) - 0.5), (-0.3, Z(1.3))]
    piece("Tie", tie, man, 0.33, 0.07, principled("Tie", tie_rgb, rough=0.45)[0], step=0.1, bevel=0.02)
    # shirt collar band
    me = bpy.data.meshes.new("ShirtCollar")
    bm = bmesh.new()
    rows = []
    for r, z in ((2.62, Z(1.2)), (2.7, Z(2.45))):
        rows.append([bm.verts.new((r * math.cos(math.radians(a)), 0.5 + r * math.sin(math.radians(a)), z)) for a in range(-75, 256, 8)])
    for i in range(len(rows[0]) - 1):
        bm.faces.new((rows[0][i], rows[0][i + 1], rows[1][i + 1], rows[1][i]))
    bm.to_mesh(me)
    bm.free()
    finish_piece(link(bpy.data.objects.new("ShirtCollar", me)), 0.05, shirt_mat, bevel=0)


def flap_outline(cx, top, w, h, point):
    """Pocket flap with a softly curved, pointed lower edge (as on the issued coat)."""
    pts = [(cx - w / 2, top), (cx + w / 2, top), (cx + w / 2, top - h + point)]
    for i in range(1, 8):
        t = i / 8
        pts.append((cx + w / 2 * (1 - t), top - h + point - point * (t ** 0.8)))
    pts.append((cx, top - h))
    for i in range(7, 0, -1):
        t = i / 8
        pts.append((cx - w / 2 * (1 - t), top - h + point - point * (t ** 0.8)))
    pts.append((cx - w / 2, top - h + point))
    return pts


def rect(cx, top, w, h):
    return [(cx - w / 2, top), (cx + w / 2, top), (cx + w / 2, top - h), (cx - w / 2, top - h)]


def build_details(coat, uniform):
    fabric = coat.data.materials[0]
    brass = principled("Brass", (0.62, 0.43, 0.2), rough=0.35, metal=1.0)[0]
    bpy.context.view_layer.update()
    bvh = BVHTree.FromObject(coat, bpy.context.evaluated_depsgraph_get())
    agsu = uniform == "AGSU"
    B = SPEC["breast"]
    for sx in (1, -1):
        cx = B["cx"] * sx
        piece(f"BreastBody{sx}", rect(cx, Z(B["top"]) - 0.1, B["w"], B["h"]), coat, 0.03, 0.16, fabric, bevel=0.05)
        if agsu:  # box pleat: a raised center panel below the flap
            piece(f"BreastPleat{sx}", rect(cx, Z(B["top"] - B["flap"]) + 0.2, B["pleat"], B["h"] - B["flap"] - 0.15), coat, 0.21, 0.04, fabric, bevel=0.025)
        piece(f"BreastFlap{sx}", flap_outline(cx, Z(B["top"]), B["w"] + 0.12, B["flap"], B["point"]), coat, 0.24, 0.1, fabric, bevel=0.045)
        hit, nor = front_hit(bvh, cx, Z(B["button_z"]))
        if hit:
            button(f"BreastButton{sx}", hit + nor * 0.34, nor, 0.62, brass, h=0.13)
        L = SPEC["lower_flap"]
        lcx = L["cx"] * sx
        piece(f"LowerFlap{sx}", rect(lcx, Z(L["top"]), L["w"], L["h"]), coat, 0.06, 0.1, fabric, bevel=0.045)
        hit, nor = front_hit(bvh, lcx + L["button_dx"] * sx, Z(L["button_z"]))
        if hit:
            button(f"LowerButton{sx}", hit + nor * 0.16, nor, 0.62, brass, h=0.13)
    for i, z in enumerate(SPEC["buttons_z"]):
        hit, nor = front_hit(bvh, 0.35, Z(z))
        if hit:
            button(f"FrontButton{i}", hit + nor * 0.12, nor, SPEC["button_d"], brass)
    zb = SPEC["lapel"][1][1]
    piece("FrontEdge", [(0.15, Z(zb)), (0.55, Z(zb)), (0.55, Z(SPEC["hem_z"]) + 0.2), (0.15, Z(SPEC["hem_z"]) + 0.2)], coat, 0.03, 0.05, fabric, bevel=0.025)

    if agsu:
        bt = SPEC["belt"]
        me = bpy.data.meshes.new("Belt")
        bm = bmesh.new()
        rows = []
        for z in (Z(bt["top"]) - bt["h"], Z(bt["top"])):
            row = []
            for i in range(128):
                th = 2 * math.pi * i / 128
                d = Vector((math.cos(th), math.sin(th), 0))
                hit, *_ = bvh.ray_cast(Vector((0, 0.2, z)), d)
                row.append(bm.verts.new(hit + d * 0.18 if hit else Vector((0, 0.2, z)) + d * 7))
            rows.append(row)
        for i in range(128):
            j = (i + 1) % 128
            bm.faces.new((rows[0][i], rows[0][j], rows[1][j], rows[1][i]))
        bm.to_mesh(me)
        bm.free()
        finish_piece(link(bpy.data.objects.new("Belt", me)), 0.15, fabric, bevel=0.04)
        zc = Z(bt["top"]) - bt["h"] / 2
        hit, nor = front_hit(bvh, 0.2, zc)
        if hit:  # buckle: an open rectangular frame
            bpy.ops.mesh.primitive_cube_add(size=1, location=hit + nor * 0.36)
            bk = bpy.context.object
            bk.name = "Buckle"
            bk.scale = (bt["buckle_w"], 0.1, bt["buckle_h"])
            bk.rotation_euler = nor.to_track_quat("-Y", "Z").to_euler()
            fr = bk.modifiers.new("Frame", "WIREFRAME")
            fr.thickness = 0.16
            fr.use_even_offset = True
            bk.data.materials.append(brass)
            piece("BeltKeeper", rect(-2.4, zc + bt["h"] / 2 + 0.1, 0.45, bt["h"] + 0.2), coat, 0.38, 0.06, fabric, bevel=0.02)

    lp = SPEC["loop"]
    for sx in (1, -1):
        ol = [(lp["x0"] * sx, -lp["w"] / 2), (lp["x1"] * sx, -lp["w"] / 2 - 0.1), (lp["x1"] * sx, lp["w"] / 2 + 0.1), (lp["x0"] * sx, lp["w"] / 2), ((lp["x0"] - 0.45) * sx, 0)]
        if sx < 0:
            ol = list(reversed(ol))
        ob = polygon_mesh(f"Loop{sx}", ol, step=0.1, plane="XY", depth=60.0)
        project_onto(ob, coat, 0.05, axis="Z", positive=False)
        finish_piece(ob, 0.11, fabric, bevel=0.035)
        hit, nor, *_ = bvh.ray_cast(Vector((lp["button_x"] * sx, 0, 60)), Vector((0, 0, -1)))
        if hit:
            button(f"LoopButton{sx}", hit + nor * 0.2, nor, 0.55, brass, h=0.12)


def lights_and_camera():
    def area(name, loc, energy, size, color=(1, 1, 1)):
        bpy.ops.object.light_add(type="AREA", location=loc)
        L = bpy.context.object
        L.name, L.data.energy, L.data.size, L.data.color = name, energy, size, color
        L.rotation_euler = (Vector((0, 0, 4)) - L.location).to_track_quat("-Z", "Y").to_euler()

    area("Key", (30, -60, 45), 30000, 40)
    area("Fill", (-50, -45, 15), 12000, 50, (0.92, 0.95, 1))
    area("Rim", (0, 60, 45), 16000, 30)
    bpy.ops.object.camera_add()
    cam = bpy.context.object
    cam.data.lens = 85
    bpy.context.scene.camera = cam
    return cam


def shoot(cam, name, az, elev=4, dist=175, target=(0, 0, 2)):
    t = Vector(target)
    a, e = math.radians(az), math.radians(elev)
    cam.location = t + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    cam.rotation_euler = (t - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.render.filepath = os.path.join(args.out, f"{name}.png")
    bpy.ops.render.render(write_still=True)


def main():
    reset()
    man = build_mannequin()
    coat = build_coat(args.uniform)
    sol = coat.modifiers.new("Thickness", "SOLIDIFY")
    sol.thickness = 0.08
    sol.offset = 1
    apply_all(coat)
    build_front(coat, man, args.uniform)
    build_details(coat, args.uniform)
    cam = lights_and_camera()
    for n, az in (("front", 0), ("q34", 30), ("side", 90), ("back", 180)):
        shoot(cam, f"{args.stage}_{n}", az)
    shoot(cam, f"{args.stage}_closeup", 12, elev=6, dist=85, target=(0, 0, Z(-5)))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(os.path.join(args.out, f"coat_{args.stage}.blend")))


main()
