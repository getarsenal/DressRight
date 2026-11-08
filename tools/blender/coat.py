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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import body as body_mod  # noqa: E402
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import delaunay_2d_cdt

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
ap = argparse.ArgumentParser()
ap.add_argument("--uniform", default="AGSU", choices=["AGSU", "ASU"])
ap.add_argument("--out", default="tools/blender/out")
ap.add_argument("--samples", type=int, default=32)
ap.add_argument("--res", type=int, default=900)
ap.add_argument("--stage", default="v3")
ap.add_argument("--export", default="", help="write a .glb for the web app")
ap.add_argument("--body", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "human_base_meshes_bundle.blend"))
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
    "loop": dict(x0=3.2, x1=7.2, w=1.6, button_x=3.86),  # ends at the shoulder seam
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


def coat_joints(m, roomy=0.0):
    """Coat skeleton fitted to the measured body: torso centers/depths follow the body
    (chest, shoulder blades, seat) plus tailoring ease; widths are at least the photo
    silhouette; sleeves follow the body's arm path."""

    def torso_at(dz):
        z = Z(dz)
        best = min(m["torso"], key=lambda t: abs(t[0] - z))
        return best  # (z, half-width, front y, back y)

    def ring(dz, min_hw, ease_x, ease_y, extra_back=0.0, at=None):
        _, hw, yf, yb = torso_at(dz if at is None else at)  # `at`: measure at another height (skirt hangs from the hips)
        rx = max(min_hw, hw + ease_x) + roomy
        cy = (yf + yb + extra_back) / 2
        ry = (yb + extra_back - yf) / 2 + ease_y + roomy
        return ((0, cy, Z(dz)), (rx, ry))

    J = {
        "hemx": ring(-31, 7.55, 1.5, 1.05, at=-21),  # skirt hangs straight from the seat
        "hip": ring(-21, 7.35, 1.0, 0.85),
        "belt": ring(-14.8, 6.75, 0.6, 0.65),
        "ribs": ring(-10, 7.45, 0.9, 0.7),
        "chest": ring(-6, 7.75, 1.0, 0.75),
        # armpit level: keep the torso full where the sleeves branch off (the skin modifier pinches here)
        "axilla": ring(-3.9, 8.1, 1.4, 0.75),
        "uchest": ring(-2.3, 7.2, 0.9, 0.7),
        "neckb": ((0, 0.5, Z(0.9)), (2.9, 3.0)),
        # collar: a short stand, then the fall rolls outward and lies over the shoulder slope
        "collar": ((0, 0.75, Z(SPEC["collar_top_z"] + 0.6)), (3.95, 4.05)),
    }
    E = [("hemx", "hip"), ("hip", "belt"), ("belt", "ribs"), ("ribs", "chest"), ("chest", "axilla"), ("axilla", "uchest"), ("uchest", "neckb"), ("neckb", "collar")]
    arm = sorted(m["arm"], key=lambda a: -a[0])

    def arm_at(dz):
        z = Z(dz)
        a = min(arm, key=lambda t: abs(t[0] - z))
        return a  # (z, cx, cy, rx, ry)

    for s, sx in (("L", 1), ("R", -1)):
        pts = []
        # tailored sleeve (inches): bicep, elbow, forearm, cuff radii side-to-side / front-to-back
        for name, dz, r in (("bic", -7.5, (2.15, 2.55)), ("elb", -12.5, (1.95, 2.3)), ("fore", -17.3, (1.85, 2.1)), ("wri", -23.6, (1.7, 1.85))):
            _, cx, cy, *_ = arm_at(dz)
            pts.append((name, (cx * sx, cy, Z(dz)), (r[0] + roomy * 0.5, r[1] + roomy * 0.5)))
        _, c0x, c0y, *_ = arm_at(-4.0)
        J["sh" + s] = ((5.5 * sx, 0.7, Z(-1.3)), (2.35, 2.75))
        J["del" + s] = (((c0x + 0.15) * sx, c0y, Z(-2.6)), (2.6, 3.0))
        for name, c, r in pts:
            J[name + s] = (c, r)
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


def on_sleeve(p, nor):
    """A hit on the inner face of a hanging sleeve (it faces the body), not the chest beside it."""
    return abs(p.x) > 5.5 and p.z < Z(-3.0) and nor.x * (1 if p.x > 0 else -1) < -0.2


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
        else:  # from above, onto the shoulders (a hit far down means we fell off the shoulder)
            origin, d = Vector((v.co.x, v.co.y, 80)), Vector((0, 0, -1))
            ok_side = lambda h: h.z > Z(-2.5)
        hit, nor, _, _ = bvh.ray_cast(origin, d)
        if axis == "Y":  # look past a hanging sleeve to the chest behind it
            for _ in range(8):
                if hit is None or not on_sleeve(hit, nor):
                    break
                hit, nor, _, _ = bvh.ray_cast(hit + d * 0.02, d)
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
    ob = body_mod.load_body(args.body, SH, arm_hang_deg=12.0)
    ob.data.materials.clear()
    ob.data.materials.append(principled("Mannequin", (0.30, 0.31, 0.32), rough=0.5)[0])
    return ob


def drape_on(ob, body, frames=36):
    """Cloth-simulate the coat onto the body: it settles under gravity with a slight
    contraction, rests on the shoulders, bridges across the chest and can't pass
    through the body (collision). The collar is pinned so the coat hangs from the neck."""
    col = body.modifiers.new("Collision", "COLLISION")
    body.collision.thickness_outer = 0.18
    body.collision.thickness_inner = 0.4
    body.collision.cloth_friction = 6
    pin = ob.vertex_groups.new(name="pin")
    for v in ob.data.vertices:
        w = smooth_step(Z(0.2), Z(1.4), v.co.z) if abs(v.co.x) < 4.2 else 0.0
        # hold the shoulder caps too, so the sleeves can't slide down and bunch into a fold
        if 3.5 < abs(v.co.x) < 10.5:
            w = max(w, 0.7 * smooth_step(Z(-3.2), Z(-0.6), v.co.z))
        if w > 0:
            pin.add([v.index], w, "REPLACE")
    cl = ob.modifiers.new("Cloth", "CLOTH")
    st = cl.settings
    st.quality = 10
    st.mass = 0.35
    st.air_damping = 2.0
    st.tension_stiffness = 30
    st.compression_stiffness = 30
    st.shear_stiffness = 12
    st.bending_stiffness = 4.0  # wool-blend suiting resists folding
    st.shrink_min = 0.035  # contract slightly so the cloth settles onto the body
    st.gravity = (0, 0, -386.0)  # 9.81 m/s² in in/s²
    st.vertex_group_mass = "pin"
    st.pin_stiffness = 1.0
    cs = cl.collision_settings
    cs.distance_min = 0.12
    cs.collision_quality = 4
    sc = bpy.context.scene
    sc.frame_start, sc.frame_end = 1, frames
    cl.point_cache.frame_start, cl.point_cache.frame_end = 1, frames
    for f in range(1, frames + 1):
        sc.frame_set(f)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier="Cloth")
    body.modifiers.remove(col)
    sc.frame_set(1)


def smooth_step(a, b, t):
    k = min(1.0, max(0.0, (t - a) / (b - a)))
    return k * k * (3 - 2 * k)


COAT_J = {}


def build_coat(uniform, man):
    J, E = coat_joints(body_mod.measure(man, SH), roomy=0.45)
    COAT_J.update(J)
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
    # smooth like pressed cloth, then make sure nothing of the body pokes through
    sm = ob.modifiers.new("Press", "SMOOTH")
    sm.factor = 0.6
    sm.iterations = 6
    apply_all(ob)
    drape_on(ob, man)
    # iron the sleeve heads: the cap rests on the deltoid while the sleeve below hangs
    # free, which leaves a shelf; a local smooth blends one into the other
    cap = ob.vertex_groups.new(name="cap")
    for v in ob.data.vertices:
        w = smooth_step(7.6, 8.8, abs(v.co.x)) * smooth_step(Z(-9.0), Z(-5.5), v.co.z) * (1 - smooth_step(Z(-1.8), Z(-0.4), v.co.z))
        if w > 0:
            cap.add([v.index], w, "REPLACE")
    ir = ob.modifiers.new("Iron", "SMOOTH")
    ir.vertex_group = "cap"
    ir.factor = 0.7
    ir.iterations = 20
    apply_all(ob)
    ss = ob.modifiers.new("Subsurf", "SUBSURF")  # smooth the simulated surface
    ss.levels = 1
    apply_all(ob)
    ob.data.materials.append(fabric_material(uniform))
    return ob


def build_front(coat, man, uniform):
    fabric = coat.data.materials[0]
    lapel_r = SPEC["lapel"]
    outline_r = [(-x, Z(z)) for x, z in lapel_r]  # wearer's right is -x
    outline_l = mirror_x(outline_r)
    for name, ol in (("LapelR", outline_r), ("LapelL", outline_l)):
        piece(name, ol, coat, 0.12, 0.17, fabric, step=0.1, bevel=0.06)  # thick enough to cast an edge shadow
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
        if hit and agsu:  # the blue coat's lower flaps have no buttons
            button(f"LowerButton{sx}", hit + nor * 0.16, nor, 0.62, brass, h=0.13)
    # the AGSU's fourth button is under the belt; the blue coat shows all four
    for i, z in enumerate(SPEC["buttons_z"] + ([] if agsu else [SPEC["buttons_z"][-1] - 2.9])):
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
            bpy.ops.mesh.primitive_cube_add(size=1, location=hit + nor * 0.5)  # sits on the belt's face
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


# ---------------------------------------------------------------- export for the web app


def sleeve_centerline(coat, man, side, samples=13):
    """Points along each sleeve's centerline, shoulder → cuff: the middle of the
    mannequin's arm in horizontal slabs (the sleeve hangs around the arm)."""
    s = "L" if side > 0 else "R"
    top = COAT_J["del" + s][0]
    z0, z1 = top[2], Z(SPEC["cuff_z"])
    mv = [v.co for v in man.data.vertices if v.co.x * side > 5.0 and z1 - 1.0 < v.co.z < z0 + 1.0]
    out = []
    for i in range(samples):
        z = z0 + (z1 - z0) * i / (samples - 1)
        slab = sorted((v for v in mv if abs(v.z - z) < 0.45), key=lambda v: v.x * side)
        if len(slab) < 6:
            out.append(out[-1].copy() if out else Vector(top))
            out[-1].z = z
            continue
        xs = [v.x * side for v in slab]
        # the arm is the outermost island; if it touches the torso, take one arm's width from the outside
        cut = max(xs) - 3.8
        for k in range(len(xs) - 1, 0, -1):
            if xs[k] - xs[k - 1] > 0.35:
                cut = max(cut, xs[k - 1] + 0.01)
                break
        arm = [v for v in slab if v.x * side >= cut]
        ax = [v.x for v in arm]
        ay = [v.y for v in arm]
        out.append(Vector(((max(ax) + min(ax)) / 2, (max(ay) + min(ay)) / 2, z)))
    return out


def export_glb(coat, man, path, uniform):
    """Write the coat + mannequin as a .glb for the app (frame: top button at the origin, inches)."""
    top_button = Z(SPEC["buttons_z"][0])
    # anchors: sleeve centerlines (the app ray-casts outward from these to find the sleeve surface)
    root = bpy.data.objects.new("DressRightCoat", None)
    bpy.context.collection.objects.link(root)
    for side in (1, -1):
        for i, p in enumerate(sleeve_centerline(coat, man, side)):
            e = bpy.data.objects.new(f"dr_arm_{'L' if side > 0 else 'R'}_{i:02d}", None)
            e.location = p
            bpy.context.collection.objects.link(e)
    # simple glTF-friendly materials (the procedural twill doesn't export; the app adds its own weave)
    flat = principled("Fabric", FABRIC_RGB[uniform], rough=0.82, sheen=0.25)[0]
    for ob in bpy.data.objects:
        if ob.type == "MESH" and ob.data.materials and ob.data.materials[0].name.startswith("Fabric"):
            ob.data.materials[0] = flat
    # phone budget: thin out dense pieces (cloth sim + subsurf leave far more than needed)
    for ob in bpy.data.objects:
        if ob.type != "MESH" or ob.name == "Mannequin":
            continue
        bpy.ops.object.select_all(action="DESELECT")
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.convert(target="MESH")  # bake bevels etc. first so the budget is real
        tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
        if ob.name not in ("Coat", "Tie", "ShirtFront", "ShirtCollar"):
            continue  # thin cut pieces (lapels, flaps, loops) keep their exact edges and shading
        target = 45000 if ob.name == "Coat" else 3000
        if tris > target * 1.2:
            dec = ob.modifiers.new("Budget", "DECIMATE")
            dec.ratio = target / tris
            bpy.ops.object.modifier_apply(modifier=dec.name)
        bpy.ops.object.shade_smooth(keep_sharp_edges=False)  # decimation leaves facets otherwise
    # remove render-only objects, move the origin to the top button
    for ob in list(bpy.data.objects):
        if ob.type in ("CAMERA", "LIGHT"):
            bpy.data.objects.remove(ob)
    for ob in bpy.data.objects:
        if ob is not root:
            ob.location.z -= top_button
            if ob.parent is None:
                ob.parent = root
    root["dr_version"] = 1
    root["dr_uniform"] = uniform
    root["dr_units"] = "inch"
    root["dr_sleeve_length"] = -SPEC["cuff_z"]
    root["dr_shoulder_line_y"] = SH - top_button
    root["dr_spec"] = str({k: v for k, v in SPEC.items() if k != "lapel"})
    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(path),
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_extras=True,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_skins=False,
    )


def main():
    reset()
    man = build_mannequin()
    coat = build_coat(args.uniform, man)
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
    if args.export:
        # lighter mannequin for the web
        dec = man.modifiers.new("Web", "DECIMATE")
        dec.ratio = 0.35
        apply_all(man)
        export_glb(coat, man, args.export, args.uniform)


main()
