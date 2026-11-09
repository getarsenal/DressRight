"""
Realistic mannequin for the coat builder.

Uses the Blender Foundation "Human Base Meshes" realistic male body (CC0, by
Dan Ulrich; fetch with tools/blender/fetch_assets.sh). The body is converted
to inches, scaled to 5'10", aligned so its shoulder line sits at `sh`, its
arms lowered from the A-pose to a natural hang, and trimmed to a dress form
(neck stub to knees).
"""
import math
import os

import bpy
import bmesh
from mathutils import Matrix, Vector

M_TO_IN = 39.3701
HEIGHT_IN = 70.0


def smooth(a, b, t):
    k = min(1.0, max(0.0, (t - a) / (b - a)))
    return k * k * (3 - 2 * k)


def load_body(blend_path, sh, arm_hang_deg=8.0, multires_level=1, neck_cut=3.7):
    if not os.path.exists(blend_path):
        raise SystemExit(f"Body mesh not found: {blend_path}. Run tools/blender/fetch_assets.sh first.")
    with bpy.data.libraries.load(blend_path, link=False) as (src, dst):
        dst.objects = ["GEO-body_male_realistic"]
    ob = dst.objects[0]
    bpy.context.collection.objects.link(ob)
    ob.name = "Mannequin"
    for m in list(ob.modifiers):  # keep a little of the sculpted detail
        if m.type == "MULTIRES":
            m.levels = m.render_levels = min(multires_level, m.total_levels)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=m.name)
    ob.location = (0, 0, 0)
    ob.rotation_euler = (0, 0, 0)
    ob.parent = None

    me = ob.data
    zs = [v.co.z for v in me.vertices]
    h_m = max(zs) - min(zs)
    s = HEIGHT_IN / h_m
    for v in me.vertices:
        v.co = Vector((v.co.x * s, v.co.y * s, (v.co.z - min(zs)) * s))
    # the body faces -Y already (Blender front); center it front-to-back
    ys = [v.co.y for v in me.vertices]
    cy = (max(ys) + min(ys)) / 2
    for v in me.vertices:
        v.co.y -= cy

    # shoulder line: top of the shoulder between neck and arm
    H = HEIGHT_IN
    shoulder_z = max(v.co.z for v in me.vertices if 5.6 < abs(v.co.x) < 6.8 and 0.74 * H < v.co.z < 0.86 * H)
    dz = sh - shoulder_z
    for v in me.vertices:
        v.co.z += dz

    lower_arms(me, sh, arm_hang_deg)
    trim_to_dress_form(ob, sh, neck_cut)
    me.update()
    bpy.context.view_layer.update()
    return ob


def lower_arms(me, sh, target_deg):
    """Rotate each arm about its shoulder joint from the A-pose toward a natural hang.

    Below the armpit the arm is its own island in every horizontal slab, so it
    rotates fully; around the shoulder the rotation fades out to keep the
    deltoid/armpit transition smooth.
    """
    verts = me.vertices
    for side in (1, -1):
        # hand/forearm only: above the thighs' reach and outside the legs (feet sit wide too)
        arm = [v for v in verts if v.co.x * side > 9.0 and sh - 34 < v.co.z < sh - 6]
        if not arm:
            continue
        lowest = min(arm, key=lambda v: v.co.z)
        pivot = Vector((side * 6.6, 0.0, sh - 1.9))
        hand = Vector((lowest.co.x, 0, lowest.co.z))
        d = hand - Vector((pivot.x, 0, pivot.z))
        current = math.degrees(math.atan2(abs(d.x), -d.z))  # angle from straight down
        delta = math.radians(current - target_deg) * side  # rotate toward the body
        rot = Matrix.Rotation(delta, 4, "Y")
        # armpit threshold: the gap between torso and arm, per slab below the armpit
        armpit_z = sh - 5.0
        for v in verts:
            ax = v.co.x * side
            if ax < 4.5 or v.co.z > sh + 1.5:
                continue
            if v.co.z < sh - 14:  # below the waist: only what's well outside the hips (A-pose hands/forearms)
                w = smooth(8.2, 9.2, ax)
            elif v.co.z < armpit_z:  # chest level: arm is just outside the ribcage
                w = smooth(5.9, 7.2, ax)
            else:  # around the shoulder: fade the rotation
                w = smooth(5.9, 8.4, ax) * (1 - smooth(armpit_z, sh + 0.8, v.co.z) * 0.55)
            if w <= 0:
                continue
            p = v.co - pivot
            q = rot @ p
            v.co = pivot + p.lerp(q, w)


def trim_to_dress_form(ob, sh, neck_cut=3.7):
    """Keep a neck stub through the knees; close the cut ends."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    for co, no in (((0, 0, sh + neck_cut), (0, 0, 1)), ((0, 0, sh - 40.0), (0, 0, -1))):
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=Vector(co), plane_no=Vector(no), clear_outer=True)
    bmesh.ops.holes_fill(bm, edges=bm.edges[:], sides=0)
    bm.to_mesh(ob.data)
    bm.free()
    for p in ob.data.polygons:
        p.use_smooth = True


def measure(ob, sh):
    """Torso cross-sections and arm path, for fitting the coat to the body."""
    vs = [v.co.copy() for v in ob.data.vertices]
    out = {"torso": [], "arm": []}
    for k in range(-30, 3):
        z = sh + k
        slab = [p for p in vs if abs(p.z - z) < 0.5]
        lim = 6.9 if z > sh - 14 else 8.0  # arms hang just outside the ribcage; hips are wider
        torso = [p for p in slab if abs(p.x) < lim]
        if torso:
            out["torso"].append((z, max(abs(p.x) for p in torso), min(p.y for p in torso), max(p.y for p in torso)))
        arm = [p for p in slab if p.x > 6.8]
        if arm and z < sh - 2:
            cx = sum(p.x for p in arm) / len(arm)
            cy = sum(p.y for p in arm) / len(arm)
            rx = (max(p.x for p in arm) - min(p.x for p in arm)) / 2
            ry = (max(p.y for p in arm) - min(p.y for p in arm)) / 2
            out["arm"].append((z, cx, cy, rx, ry))
    return out
