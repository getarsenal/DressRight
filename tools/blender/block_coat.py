"""
Block coat: a clean, tailored-block AGSU/ASU coat built from a front-view drawing.

No cloth simulation. The coat is a set of analytic surfaces:
- the torso is a stack of rounded-box cross-sections. The width at each height
  comes from the reference drawing; depth comes from the mannequin plus ease.
  Every section keeps a little clearance over the body.
- the sleeves are straight, slightly tapered tubes around the mannequin's arms,
  with a rounded sleeve head at the shoulder point.
- the collar band, shirt collar, lapels, tie, pockets, flaps, belt, keeper,
  buckle, buttons and shoulder loops are cut from outlines measured on the
  drawing, then laid onto those surfaces and given thickness.

Reference: a front view at 44.6 px/in. The center line is at x = 603 px and
the collar top at y = 610 px. Drawing coordinates are (x_in, y_in): inches
right of center and inches down from the collar top.

Blender frame: inches, Z up, front = -Y, +X = wearer's left (viewer's right
in a front view). `SH` is the mannequin's shoulder line.

Run:  python tools/blender/block_coat.py --out tools/blender/out [--uniform ASU] [--export public/models/coat-agsu-male.glb]
"""
import argparse
import math
import os
import sys

import bpy
import bmesh
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import delaunay_2d_cdt

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import body as body_mod  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--uniform", default="AGSU", choices=["AGSU", "ASU"])
ap.add_argument("--out", default=os.path.join(HERE, "out"))
ap.add_argument("--stage", default="block")
ap.add_argument("--samples", type=int, default=24)
ap.add_argument("--res", type=int, default=700)
ap.add_argument("--export", default="")
ap.add_argument("--body", default=os.path.join(HERE, "assets", "human_base_meshes_bundle.blend"))
ap.add_argument("--ref", default="", help="reference drawing, for a side-by-side comparison render")
args, _ = ap.parse_known_args(sys.argv[1:])  # tolerate other scripts' flags when imported
AGSU = args.uniform == "AGSU"

SH = 14.5  # mannequin shoulder line (inches)
ZTOP = SH + 3.36  # collar top at the back
PXIN, CX, CY, IMG_W, IMG_H = 44.6, 603, 610, 1206, 2622  # reference drawing frame


def dz_of(y_in):
    return ZTOP - y_in - SH


def Z(dz):
    return SH + dz


# ------------------------------------------------------------------ drawing measurements

# torso half-width (front view) by height (dz from the shoulder line)
# straight shoulder line from the neck to the shoulder point, then a rounded edge rolling into the sleeve
HW_KEYS = [(1.90, 3.60), (1.20, 5.10), (0.40, 6.80), (-0.35, 8.40), (-0.80, 9.20), (-1.30, 9.60), (-2.00, 9.78),
           (-3.00, 9.82), (-4.20, 9.75), (-5.00, 9.10), (-5.80, 8.25), (-6.60, 7.9), (-7.64, 7.45), (-12.1, 7.08), (-14.1, 6.90),
           (-16.6, 7.17), (-18.8, 7.42), (-25.6, 7.49), (-29.8, 7.50)]
# sleeve outer edge (front view)
SLEEVE_OUT = [(-0.9, 8.68), (-5.38, 9.66), (-12.14, 11.19), (-16.64, 11.5), (-25.14, 12.13)]
HEM_DZ = dz_of(32.85)
CUFF_DZ = -24.0  # over the wrist (the drawing's arms run longer than the mannequin's)
NECK_DZ = 1.9

# outlines, (x_in, y_in), wearer's left (+x); mirrored for the right
LAPEL = [(2.74, 0.55), (4.42, 4.26), (3.07, 4.44), (5.20, 4.60), (4.44, 5.83), (3.86, 6.50), (3.23, 7.17), (2.56, 7.85),
         (1.88, 8.52), (1.17, 9.19), (0.43, 9.87), (-0.07, 10.2), (0.0, 9.64), (0.25, 8.74), (0.70, 7.40), (1.10, 6.05),
         (1.52, 4.70), (1.93, 3.36), (2.35, 2.00)]
# the lapel below the gorge (the collar piece covers the rest, up and around the neck)
LAPEL_LOW = [(1.80, 3.70), (3.40, 4.02), (3.07, 4.44), (5.20, 4.60), (4.44, 5.83), (3.86, 6.50), (3.23, 7.17), (2.56, 7.85),
             (1.88, 8.52), (1.17, 9.19), (0.43, 9.87), (-0.07, 10.2), (0.0, 9.64), (0.25, 8.74), (0.70, 7.40), (1.10, 6.05),
             (1.52, 4.70)]
V_EDGE = [(2.74, 0.6), (2.35, 2.0), (1.93, 3.36), (1.52, 4.7), (1.1, 6.05), (0.7, 7.4), (0.25, 8.74), (0.0, 9.64)]
SHIRT_LEAF = [(2.55, 0.80), (0.16, 2.80), (0.62, 4.75), (1.28, 5.95), (1.60, 4.50), (2.05, 3.0), (2.45, 1.8)]
TIE = [(-0.55, 2.55), (0.55, 2.55), (0.38, 4.75), (0.95, 6.7), (0.0, 9.7), (-0.95, 6.7), (-0.38, 4.75)]
POCKET = dict(cx=4.4, w=5.0, top=9.1, bottom=16.0, flap=2.05, point=0.43, pleat=1.6, button_y=10.05)
LOWER_FLAP = [(6.88, 19.2), (3.66, 19.9), (4.08, 23.5), (7.33, 22.8)]
LOWER_BUTTON = (6.66, 21.95)
BUTTONS_Y = [11.37, 14.33, 17.33] + ([] if AGSU else [20.3])
BUTTON_X = 0.47
BELT = dict(top_c=18.4, top_s=17.7, bot_c=20.0, bot_s=19.2, side_x=6.76)
BUCKLE = dict(w=1.12, h=1.75, bar=0.2, y=19.25)
KEEPER = [(2.2, 18.3), (2.8, 18.3), (2.8, 20.0), (2.2, 20.0)]
FRONT_EDGE = [(-0.32, 10.2), (-0.08, 10.2), (-0.08, 32.6), (-0.32, 32.6)]
LOOP = dict(x0=5.2, x1=8.9, w=0.8, button_x=5.75)  # starts just outside the collar edge

COLORS = {
    "AGSU": dict(coat=(75, 70, 53), shirt=(181, 161, 140), tie=(76, 71, 53)),
    "ASU": dict(coat=(29, 39, 71), shirt=(243, 243, 241), tie=(18, 18, 18)),
}[args.uniform]


def lerp_keys(keys, x):
    """Piecewise-linear lookup; keys sorted by the first element (either order)."""
    ks = sorted(keys)
    if x <= ks[0][0]:
        return ks[0][1]
    for (x0, y0), (x1, y1) in zip(ks, ks[1:]):
        if x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return ks[-1][1]


def smoothstep(a, b, t):
    k = min(1.0, max(0.0, (t - a) / (b - a)))
    return k * k * (3 - 2 * k)


# ------------------------------------------------------------------ scene, materials


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = args.samples
    sc.cycles.use_denoising = True
    sc.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("World")
    sc.world = w
    w.color = (0.12, 0.13, 0.12)


def lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def material(name, rgb, rough=0.85, metal=0.0, sheen=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (lin(rgb[0]), lin(rgb[1]), lin(rgb[2]), 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Sheen Weight"].default_value = sheen
    return m


MATS = {}


def mats():
    MATS["coat"] = material("Fabric", COLORS["coat"], 0.88, sheen=0.2)
    MATS["shirt"] = material("Shirt", COLORS["shirt"], 0.8)
    MATS["tie"] = material("Tie", COLORS["tie"], 0.7)
    MATS["brass"] = material("Brass", (168, 132, 63), 0.38, metal=1.0)
    MATS["man"] = material("Mannequin", (150, 152, 156), 0.6)
    MATS["seam"] = material("Seam", tuple(int(c * 0.68) for c in COLORS["coat"]), 0.9)


def mesh_object(name, verts, faces, material_key, smooth=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    me.materials.append(MATS[material_key])
    for p in me.polygons:
        p.use_smooth = smooth
    return ob


def apply_modifiers(ob):
    bpy.context.view_layer.objects.active = ob
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def solidify(ob, thickness, offset=-1.0, rim=True, even=True):
    s = ob.modifiers.new("Solidify", "SOLIDIFY")
    s.thickness = thickness
    s.offset = offset
    s.use_even_offset = even
    s.use_rim = rim
    apply_modifiers(ob)


def bevel(ob, width=0.03, segments=2):
    b = ob.modifiers.new("Bevel", "BEVEL")
    b.width = width
    b.segments = segments
    b.limit_method = "ANGLE"
    b.angle_limit = math.radians(40)
    apply_modifiers(ob)


def smooth_by_angle(ob, deg=35):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(deg))


# ------------------------------------------------------------------ mannequin measurements


def measure_body(man):
    """Per height (dz): torso x-extent and depth, and the arm's bounding box."""
    vs = [v.co.copy() for v in man.data.vertices if v.co.x > 0]
    torso, arm, delt = {}, {}, {}
    for k in range(-62, 9):
        dz = k * 0.5
        slab = [v for v in vs if abs(v.z - Z(dz)) < 0.3]
        if len(slab) < 8:
            continue
        if -9.0 <= dz <= -0.5:
            d = [v for v in slab if v.x > 7.9]
            if d:
                delt[dz] = (min(v.y for v in d), max(v.y for v in d))
        xs = sorted(v.x for v in slab)
        ax0 = None
        if -23.0 < dz < -5.0:
            for i in range(len(xs) - 1, 0, -1):
                if xs[i] - xs[i - 1] > 0.35 and xs[i] > 6.3:
                    ax0 = xs[i]
                    break
        if ax0 is not None:
            a = [v for v in slab if v.x >= ax0]
            arm[dz] = (min(v.x for v in a), max(v.x for v in a), min(v.y for v in a), max(v.y for v in a))
            t = [v for v in slab if v.x < ax0]
        elif dz < -4.0:
            continue  # arm merged with the torso: no clean torso reading at this height
        else:
            t = slab
        torso[dz] = (max(v.x for v in t), min(v.y for v in t), max(v.y for v in t))
    return torso, arm, delt


def series(d, idx):
    return sorted((k, v[idx]) for k, v in d.items())


def smooth_series(pts, radius=1.0):
    out = []
    for z, _ in pts:
        near = [v for zz, v in pts if abs(zz - z) <= radius]
        out.append((z, sum(near) / len(near)))
    return out


# ------------------------------------------------------------------ torso surface


class Torso:
    """Rounded-box sections: half-width hw (front view), center cy and half-depth ry, roundness n."""

    def __init__(self, body_torso, body_verts=()):
        x1 = smooth_series(series(body_torso, 0), 0.75)
        yf = smooth_series(series(body_torso, 1), 1.5)
        yb = smooth_series(series(body_torso, 2), 1.5)
        self.dzs = [HEM_DZ - 0.1 + i * 0.125 for i in range(int((NECK_DZ - HEM_DZ + 0.2) / 0.125) + 1)]
        belt_dz = dz_of(BELT["top_c"])
        seat_dz = -23.0
        rows = []
        front_belt = lerp_keys(yf, belt_dz) - 0.75
        back_seat = max(lerp_keys(yb, z) for z in (seat_dz - 1, seat_dz, seat_dz + 1)) + 0.6
        for dz in self.dzs:
            hw = lerp_keys(HW_KEYS, dz)
            if dz < -4.5:  # clearance over the body
                hw = max(hw, lerp_keys(x1, dz) + 0.45)
            elif -5.2 <= dz <= -0.8:  # the shoulder carries out over the deltoid
                hw = max(hw, lerp_keys(x1, dz) + 0.4)
            ease_f = 0.85 if dz < 0 else 0.75 + 0.1 * smoothstep(0.0, 1.5, dz)
            ease_b = 0.65 if dz < 0 else 0.7
            f = lerp_keys(yf, dz) - ease_f
            b = lerp_keys(yb, dz) + ease_b
            if dz < belt_dz:
                f = min(f, front_belt)  # the skirt hangs straight from the waist in front
            if dz < seat_dz:
                b = max(b, back_seat)  # ... and from the seat at the back
            # roundness: round neck and shoulders, a softly rounded chest, a flatter skirt
            n = lerp_keys([(1.6, 2.0), (0.0, 2.3), (-4.5, 2.4), (-7.0, 2.75), (-14.0, 2.8), (-18.0, 3.0)], dz)
            rows.append([dz, hw, (f + b) / 2, (b - f) / 2, n, (b - f) / 2])
        # smooth every profile (gaussian, ~1 in) so the surface has no ripples
        sigma = 8.0
        kern = [math.exp(-0.5 * (k / sigma) ** 2) for k in range(-24, 25)]
        kern_w = [math.exp(-0.5 * (k / 3.5) ** 2) for k in range(-24, 25)]  # width: keep the shoulder edge defined
        for col in (1, 2, 3, 4, 5):
            vals = [r[col] for r in rows]
            for i in range(len(rows)):
                acc = wsum = 0.0
                for k, w in zip(range(-24, 25), kern_w if col == 1 else kern):
                    j = min(len(rows) - 1, max(0, i + k))
                    acc += vals[j] * w
                    wsum += w
                rows[i][col] = acc / wsum
        # every section must contain the body (front and back depth sized separately): the
        # rounder shoulders and chest otherwise let the back of the armpit show
        if body_verts:
            need_f = [0.0] * len(rows)
            need_b = [0.0] * len(rows)
            z0 = rows[0][0]
            for v in body_verts:
                i = int(round((v.z - SH - z0) / 0.125))
                if not 0 <= i < len(rows):
                    continue
                _, hw, cy, ryf, n, ryb = rows[i]
                ax = abs(v.x) / hw
                shoulder = -5.4 < v.z - SH < -0.5
                if ax > ((0.97 if v.y < cy else 0.85) if shoulder else 0.9):
                    continue  # the sleeve's job
                k = (1 - min(ax, 0.999) ** n) ** (1 / n)
                d = (abs(v.y - cy) + 0.4) / max(k, 0.35)
                if v.y < cy:
                    need_f[i] = max(need_f[i], d)
                else:
                    need_b[i] = max(need_b[i], d)
            for need, col in ((need_f, 3), (need_b, 5)):
                dil = [max(need[max(0, i - 16):i + 17]) for i in range(len(need))]
                sm = []
                for i in range(len(dil)):
                    acc = wsum = 0.0
                    for k, w in zip(range(-24, 25), kern):
                        j = min(len(dil) - 1, max(0, i + k))
                        acc += dil[j] * w
                        wsum += w
                    sm.append(acc / wsum)
                for i in range(len(rows)):
                    rows[i][col] = max(rows[i][col], sm[i])
            # a final pass: taking the max leaves small kinks that show as bands under lighting
            for col in (3, 5):
                vals = [r[col] for r in rows]
                for _ in range(2):
                    out = []
                    for i in range(len(rows)):
                        acc = wsum = 0.0
                        for k, w in zip(range(-24, 25), kern):
                            j = min(len(rows) - 1, max(0, i + k))
                            acc += vals[j] * w
                            wsum += w
                        out.append(acc / wsum)
                    vals = out
                for i in range(len(rows)):
                    rows[i][col] = vals[i] + (0.08 if col in (3, 5) else 0.0)
        self.rows = rows

    def section(self, dz):
        rows = self.rows
        if dz <= rows[0][0]:
            return rows[0][1:]
        if dz >= rows[-1][0]:
            return rows[-1][1:]
        i = int((dz - rows[0][0]) / 0.125)
        i = max(0, min(len(rows) - 2, i))
        a, b = rows[i], rows[i + 1]
        t = (dz - a[0]) / (b[0] - a[0])
        return [a[k] + (b[k] - a[k]) * t for k in range(1, 6)]

    @staticmethod
    def sp(u, n):
        return math.copysign(abs(u) ** (2.0 / n), u)

    def point(self, t, dz):
        hw, cy, ryf, n, ryb = self.section(dz)
        sn = math.sin(t)
        return Vector((hw * self.sp(math.cos(t), n), cy + (ryb if sn > 0 else ryf) * self.sp(sn, n), Z(dz)))

    def hw(self, dz):
        return self.section(dz)[0]

    def build(self, cols=160):
        verts, faces = [], []
        top = len(self.dzs)
        for r, dz in enumerate(self.dzs):
            for c in range(cols):
                t = 2 * math.pi * c / cols
                p = self.point(t, dz)
                # rounded front corners at the hem
                w = 1 - smoothstep(HEM_DZ, HEM_DZ + 4.0, dz)
                p.z += 1.2 * smoothstep(5.4, 7.6, abs(p.x)) ** 1.5 * w * (1.0 if p.y < self.section(dz)[1] else 0.0)
                verts.append(p)
        for r in range(top - 1):
            for c in range(cols):
                a = r * cols + c
                b = r * cols + (c + 1) % cols
                faces.append((a, b, b + cols, a + cols))
        ob = mesh_object("Coat", verts, faces, "coat")
        return ob


# ------------------------------------------------------------------ sleeves


def linfit(pts):
    n = len(pts)
    mx = sum(p[0] for p in pts) / n
    my = sum(p[1] for p in pts) / n
    sxx = sum((p[0] - mx) ** 2 for p in pts) or 1e-9
    k = sum((p[0] - mx) * (p[1] - my) for p in pts) / sxx
    return k, my - k * mx


# sleeve inner edge where the drawing shows it (below the torso), as a straight line
SLEEVE_IN = [(dz_of(15.5), 7.13), (dz_of(28.5), 8.36)]


SEAM_TOP, SEAM_BOT = -0.7, -6.6  # armhole seam: top at the shoulder point, bottom at the armpit


def armhole_seams(sleeve, objs):
    """The armhole seam drawn on the coat: up the front of the arm from the armpit, over the
    shoulder point and down the back, where sleeve and body meet. Its top is the shoulder seam
    that sleeve insignia are measured from (exported as dr_seam_L / dr_seam_R)."""
    bvh = bvh_of(objs)
    sm = sleeve.seam
    _, cy, _, ry = sleeve.ring(sm["dzc"])
    ry -= 0.4
    pts = []
    for k in range(73):
        if k <= 12:  # front leg, up from the armpit
            dz = SEAM_BOT + (sm["dzc"] - SEAM_BOT) * k / 12
            _, c_, _, r_ = sleeve.ring(dz)
            y = c_ - r_ + 0.4
        elif k >= 60:  # back leg, down to the armpit
            dz = sm["dzc"] + (SEAM_BOT - sm["dzc"]) * (k - 60) / 12
            _, c_, _, r_ = sleeve.ring(dz)
            y = c_ + r_ - 0.4
        else:  # over the shoulder
            th = math.pi * (k - 12) / 48
            y, dz = cy - ry * math.cos(th), sm["dzc"] + sm["az"] * math.sin(th)
        pts.append((y, dz))
    sleeve.seam_top = {}
    for side in (1, -1):
        vs, fs = [], []
        prev = None
        hits = []
        for y, dz in pts:
            hit = cast(bvh, Vector((side * 30.0, y, Z(dz))), Vector((-side, 0, 0)))
            if hit:
                p, n = hit
                hits.append((p, n if n.x * side > 0 else -n))
        for _ in range(3):  # even out small steps where the line crosses mesh rows
            hits = [hits[0]] + [((a[0] + b[0] * 2 + c[0]) / 4, (a[1] + b[1] * 2 + c[1]).normalized())
                                for a, b, c in zip(hits, hits[1:], hits[2:])] + [hits[-1]]
        for p, n in hits:
            p = p + n * 0.02
            if prev is not None:
                tan = (p - prev).normalized()
                w = n.cross(tan).normalized() * 0.04
                vs += [p - w, p + w]
            prev = p
        for i in range(len(vs) // 2 - 1):
            q = 2 * i
            fs.append((q, q + 1, q + 3, q + 2))
        seam_ob = mesh_object(f"ArmholeSeam{side}", vs, fs, "seam")
        fix_normals(seam_ob, outward=True)
        top = cast(bvh, Vector((side * 30.0, sm["yc"], Z(SEAM_TOP))), Vector((-side, 0, 0)))
        down = cast(bvh, Vector((side * (sleeve.sx - 0.1), sm["yc"], 80.0)), Vector((0, 0, -1)))
        sleeve.seam_top[side] = down[0] if down else (top[0] if top else Vector((side * sleeve.sx, sm["yc"], Z(SEAM_TOP))))


def fit_line(top_dz, bot_dz, reqs, ge=True, top_min=None, top_max=None):
    """The tightest straight edge from top_dz to bot_dz that stays clear of every requirement
    (dz, value): >= them when ge, else <=. Returns (top value, bottom value)."""
    sg = 1 if ge else -1
    rs = [(min(1.0, max(0.0, (dz - top_dz) / (bot_dz - top_dz))), sg * r) for dz, r in reqs]
    lo = min(r for _, r in rs) - 2.0
    hi = max(r for _, r in rs) + 4.0
    best = None
    steps = 120
    for i in range(steps + 1):
        top = lo + (hi - lo) * i / steps
        if top_min is not None and sg * top < sg * top_min - 1e-9 and ge:
            continue
        # smallest bottom that works with this top
        bot = -1e9
        for f, r in rs:
            if f > 1e-6:
                bot = max(bot, top + (r - top) / f)
            elif top < r:
                bot = None
                break
        if bot is None:
            continue
        score = top + bot
        if best is None or score < best[0]:
            best = (score, top, bot)
    top, bot = best[1], best[2]
    if top_min is not None:
        top = max(top, top_min) if ge else min(top, top_min)
    return (sg * top, sg * bot)


class Sleeve:
    """A clean, straight military sleeve: four straight edges (outer, inner, front, back) from the
    shoulder to a square cuff, sized to clear the mannequin's arm with a little ease. Near the top
    the cap rounds over the shoulder point. The armhole seam is an arch in the side view, from
    the shoulder point down the front and back of the arm to the armpit."""

    def __init__(self, arm, body_full, delt, torso=None, body_verts=()):
        self.torso = torso
        top, bot = -1.0, CUFF_DZ
        self.top, self.bot = top, bot
        self.sx = torso.hw(SEAM_TOP) if torso is not None else 8.8
        lower = [(dz, a) for dz, a in arm.items() if bot <= dz <= -7.0]
        # outer edge: clear the deltoid and the arm
        reqs = [(dz, lerp_keys(body_full, dz) + 0.3) for dz in [x * 0.25 for x in range(-18, -5)]]
        reqs += [(dz, a[1] + 0.35) for dz, a in lower]
        self.out = fit_line(top, bot, reqs, True)
        # inner edge parallel to the outer one: a constant width, like a pressed sleeve
        width = max(4.6, max(self.edge(self.out, dz) - (a[0] - 0.35) for dz, a in lower))
        self.inn = (self.out[0] - width, self.out[1] - width)
        # front/back: straight centre line through the arm, constant depth
        # the arm's own front/back, read from the mannequin beyond the torso's side
        prof = []
        for k in range(int((CUFF_DZ + 1.0 + 3.0) / -0.5)):
            dz = -3.0 - 0.5 * k
            ys = [v.y for v in body_verts if v.x > 7.7 and abs(v.z - Z(dz)) < 0.25]
            if len(ys) > 6:
                prof.append((dz, min(ys), max(ys)))
        cyk, cyb = linfit([(dz, (a + b) / 2) for dz, a, b in prof])
        need = [max(cyk * dz + cyb - a, b - (cyk * dz + cyb)) + 0.35 for dz, a, b in prof]
        depth = min(3.1, max(need))
        print("arm profile", [(round(d, 1), round(a, 2), round(b, 2)) for d, a, b in prof[::4]], "depth", round(depth, 2))
        cyt, cyb2 = cyk * top + cyb, cyk * bot + cyb
        self.front = (cyt - depth, cyb2 - depth)
        self.back = (cyt + depth, cyb2 + depth)
        mid = (SEAM_TOP + SEAM_BOT) / 2
        f, b = self.edge(self.front, mid), self.edge(self.back, mid)
        self.seam = dict(yc=(f + b) / 2, ay=(b - f) / 2 + 0.25, dzc=mid, az=(SEAM_TOP - SEAM_BOT) / 2)
        print("sleeve edges", [round(v, 2) for v in self.out + self.inn + self.front + self.back], self.seam)

    def edge(self, line, dz):
        f = (dz - self.top) / (self.bot - self.top)
        return line[0] + (line[1] - line[0]) * f

    def ring(self, dz):
        out, inn = self.edge(self.out, dz), self.edge(self.inn, dz)
        fy, by = self.edge(self.front, dz), self.edge(self.back, dz)
        cap0, capt = -2.6, -0.45
        if dz > cap0:  # the cap rounds over the shoulder point
            s = min(1.0, (dz - cap0) / (capt - cap0))
            g = math.sqrt(max(0.0, 1 - s * s))
            out = self.sx + (out - self.sx) * g
            c, h = (fy + by) / 2, (by - fy) / 2 * (0.55 + 0.45 * g)
            fy, by = c - h, c + h
            inn = min(inn, out - 1.2)
        cx, cy = (inn + out) / 2, (fy + by) / 2
        return cx, cy, (out - inn) / 2, (by - fy) / 2

    def axis(self, dz):
        cx, cy, _, _ = self.ring(dz)
        return Vector((cx, cy, Z(dz)))

    def seam_r(self, y, dz, pad=0.0):
        """<1 inside the armhole: an arch over the shoulder whose legs run down the sleeve's own
        front and back edges to the armpit. `pad` widens (+) or narrows (-) it."""
        s = self.seam
        _, cy, _, ry = self.ring(min(dz, s["dzc"]))
        u = (y - cy) / max(ry + pad, 0.3)
        v = max(0.0, (dz - s["dzc"]) / (s["az"] + pad))
        return math.hypot(u, v)

    def build(self, side, cols=72):
        n = 3.2  # squarer sections: a pressed sleeve
        dzs = [CUFF_DZ + i * 0.2 for i in range(int((-0.45 - CUFF_DZ) / 0.2) + 1)]
        verts, faces = [], []
        for dz in dzs:
            cx, cy, rx, ry = self.ring(dz)
            for c in range(cols):
                t = 2 * math.pi * c / cols
                x = cx + rx * Torso.sp(math.cos(t), n)
                y = cy + ry * Torso.sp(math.sin(t), n)
                verts.append(Vector((x * side, y, Z(dz))))
        rows = len(dzs)
        for r in range(rows - 1):
            for c in range(cols):
                a = r * cols + c
                b = r * cols + (c + 1) % cols
                faces.append((a, b, b + cols, a + cols) if side > 0 else (a, a + cols, b + cols, b))
        cx, cy, _, _ = self.ring(dzs[-1])
        verts.append(Vector((cx * side, cy, Z(dzs[-1] + 0.1))))
        top = len(verts) - 1
        base = (rows - 1) * cols
        for c in range(cols):
            a, b = base + c, base + (c + 1) % cols
            faces.append((a, b, top) if side > 0 else (a, top, b))
        return mesh_object(f"Sleeve{'L' if side > 0 else 'R'}", verts, faces, "coat")

    def tuck(self, ob):
        """Outside the armhole arch (and above the armpit) the sleeve dives just under the body."""
        t = self.torso
        for v in ob.data.vertices:
            c = v.co
            dz = c.z - SH
            if dz < SEAM_BOT - 0.05:
                continue
            k = smoothstep(1.0, 1.08, self.seam_r(c.y, dz, 0.25))
            if k <= 0:
                continue
            hw, c0, ryf, nn, ryb = t.section(dz)
            yt = min(max(c.y, c0 - ryf + 0.2), c0 + ryb - 0.2)
            u2 = min(0.999, abs(yt - c0) / max(ryb if yt > c0 else ryf, 1e-3))
            xt2 = hw * (1 - u2 ** nn) ** (1 / nn)
            ax = abs(c.x)
            c.y = c.y * (1 - k) + yt * k
            c.x = math.copysign(ax * (1 - k) + min(ax, xt2 - 0.14) * k, c.x)
        ob.data.update()

    def tuck_torso(self, ob):
        """Inside the armhole arch the body's side goes under the sleeve."""
        t = self.torso
        for v in ob.data.vertices:
            c = v.co
            dz = c.z - SH
            if not (SEAM_BOT - 0.3 < dz < SEAM_TOP + 0.3):
                continue
            ax = abs(c.x)
            if ax < 0.7 * t.hw(dz):
                continue
            w = smoothstep(1.0, 0.92, self.seam_r(c.y, dz, -0.12))
            if w <= 0:
                continue
            cx = self.ring(dz)[0]
            c.x = math.copysign(ax + (min(ax, cx) - ax) * w, c.x)
        ob.data.update()


# ------------------------------------------------------------------ bands (collar, shirt collar, belt)


def band(name, rx0, ry0, rx1, ry1, cy, dz0, top_fn, t0, t1, material_key, cols=96, rows=6, thickness=0.1):
    verts, faces = [], []
    for r in range(rows + 1):
        h = r / rows
        for c in range(cols + 1):
            t = t0 + (t1 - t0) * c / cols
            dz = dz0 + h * (top_fn(t) - dz0)
            rx = rx0 + (rx1 - rx0) * h
            ry = ry0 + (ry1 - ry0) * h
            verts.append(Vector((rx * math.cos(t), cy + ry * math.sin(t), Z(dz))))
    w = cols + 1
    for r in range(rows):
        for c in range(cols):
            a = r * w + c
            faces.append((a, a + 1, a + 1 + w, a + w))
    ob = mesh_object(name, verts, faces, material_key)
    fix_normals(ob, outward=True)
    if thickness:
        solidify(ob, thickness)
    return ob


def fix_normals(ob, outward=True):
    """Point faces away from the body axis (or toward the viewer for flat panels)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    score = 0.0
    for f in bm.faces:
        c = f.calc_center_median()
        d = Vector((c.x, c.y - 0.5, 0)) if outward else Vector((0, -1, 0))
        if d.length > 1e-6:
            score += f.normal.dot(d.normalized()) * f.calc_area()
    if score < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()


def collar_fall(torso_bvh, stand_top, t0=-0.62, t1=math.pi + 0.62, cols=96, rows=10):
    """The collar's fall: from the fold line at the top of the stand it rolls outward and down,
    lying over the shoulders. Wider at the back than at the front ends."""
    verts, faces = [], []
    for r in range(rows + 1):
        h = r / rows
        for c in range(cols + 1):
            t = t0 + (t1 - t0) * c / cols
            back = (math.sin(t) + 1) / 2  # 0 at the front ends, 1 at the center back
            r0x, r0y = 3.72, 3.42  # fold line, just outside the stand
            width = 0.95 + 0.3 * back
            r1x, r1y = r0x + width, r0y + width * 0.9
            z0 = Z(stand_top(t) + 0.12)
            ex, ey = r1x * math.cos(t), 0.4 + r1y * math.sin(t)
            hit = cast(torso_bvh, Vector((ex, ey, 80.0)), Vector((0, 0, -1)))
            z1 = (hit[0].z if hit else Z(1.0)) + 0.18
            rr = 1 - (1 - h) ** 2  # moves out quickly, then drops: a rolled fold
            zz = h ** 1.6
            rx = r0x + (r1x - r0x) * rr
            ry = r0y + (r1y - r0y) * rr
            verts.append(Vector((rx * math.cos(t), 0.4 + ry * math.sin(t), z0 + (z1 - z0) * zz)))
    w = cols + 1
    for r in range(rows):
        for c in range(cols):
            a = r * w + c
            faces.append((a, a + 1, a + 1 + w, a + w))
    ob = mesh_object("CollarFall", verts, faces, "coat")
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if sum(f.normal.z * f.calc_area() for f in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()
    solidify(ob, 0.11)
    bevel(ob, 0.03)
    return ob


FOLD_DZ = 2.45  # top of the coat collar (the fold): the shirt collar shows ~0.55 in above it


def neck_form(torso):
    """The coat body plus a short extension above its neckline that rises, slightly inward,
    to the collar fold. Returns point(t, dz) and normal(t, dz)."""
    top = NECK_DZ - 0.05

    def point(t, dz):
        if dz <= top:
            return torso.point(t, dz)
        base = torso.point(t, top)
        hw, cy, ryf, n, ryb = torso.section(top)
        k = (dz - top) / (FOLD_DZ - top)
        sh = 1 - 0.07 * k
        return Vector((base.x * sh, cy + (base.y - cy) * sh, Z(dz)))

    def normal(t, dz):
        e = 1e-3
        p = point(t, dz)
        nrm = (point(t + e, dz) - p).cross(point(t, dz + 0.01) - p)
        if nrm.length < 1e-9:
            nrm = Vector((math.cos(t), math.sin(t), 0))
        nrm.normalize()
        cy = torso.section(min(dz, top))[1]
        if nrm.dot(Vector((p.x, p.y - cy, 0))) < 0:
            nrm = -nrm
        return nrm

    return point, normal


def shell(name, verts, nrms, faces, thickness, material_key):
    """A cloth panel with thickness built from exact surface normals: the back face is offset
    along them and the edges are closed. Shading uses the same normals, so the panel reads
    perfectly smooth however irregular its triangles are."""
    n = len(verts)
    tris = []
    for f in faces:
        a, b, c = (verts[i] for i in f)
        fn = (b - a).cross(c - a)
        if fn.length < 1e-10:
            continue
        avg = nrms[f[0]] + nrms[f[1]] + nrms[f[2]]
        tris.append(tuple(f) if fn.dot(avg) > 0 else (f[0], f[2], f[1]))
    allv = list(verts) + [v - nm * thickness for v, nm in zip(verts, nrms)]
    allf = list(tris) + [(c + n, b + n, a + n) for a, b, c in tris]
    count = {}
    for a, b, c in tris:
        for e in ((a, b), (b, c), (c, a)):
            k = (min(e), max(e))
            count[k] = count.get(k, 0) + 1
    for a, b, c in tris:
        for e in ((a, b), (b, c), (c, a)):
            if count[(min(e), max(e))] == 1:
                allf.append((e[1], e[0], e[0] + n, e[1] + n))
    ob = mesh_object(name, allv, allf, material_key)
    custom = [tuple(nm) for nm in nrms] + [tuple(-nm) for nm in nrms]
    ob.data.normals_split_custom_set_from_vertices(custom)
    return ob


def lapel_collar(torso):
    """Lapels and collar as ONE piece of cloth, as on the real coat: from the top button each
    lapel runs up the chest beside the opening, turns at the notch into the collar, and the
    collar wraps low and short around the back of the neck. Laid out in the coat's own
    surface parameters (t around, dz up) and mapped onto it, so it lies smoothly with no gaps."""
    point, normal = neck_form(torso)

    def t_of(x, dz):
        hw, cy, ryf, n, ryb = torso.section(min(dz, NECK_DZ - 0.05))
        hw *= (1 - 0.07 * max(0.0, min(1.0, (dz - NECK_DZ) / (FOLD_DZ - NECK_DZ))))
        c = min(0.999, abs(x) / hw) ** (n / 2)
        return -math.acos(math.copysign(c, x))  # wearer's left front, t in (-pi, 0)

    def drawing(pts):
        return [(t_of(x, dz_of(y)), dz_of(y)) for x, y in pts]

    # roll line (the opening edge), neck down to the top button
    roll = [(t_of(2.95, 2.30), 2.30)] + drawing([(2.35, 2.0), (1.93, 3.36), (1.52, 4.7), (1.1, 6.05), (0.7, 7.4),
                                                  (0.25, 8.74), (0.0, 9.64)])
    # outer edge from the lapel bottom up: lapel edge, point, notch, collar point, collar edge
    outer_front = drawing([(-0.07, 10.2), (0.43, 9.87), (1.17, 9.19), (1.88, 8.52), (2.56, 7.85), (3.23, 7.17),
                           (3.86, 6.5), (4.44, 5.83), (4.90, 5.05), (5.25, 4.62), (3.62, 4.50),
                           (4.50, 4.05), (4.74, 3.45), (4.92, 2.75)])

    # collar edge over the shoulder and round the back: a set width measured down the cloth
    def down(t, width):
        dz, run, prev = FOLD_DZ, 0.0, point(t, FOLD_DZ)
        while run < width and dz > -4.0:
            dz -= 0.03
            q = point(t, dz)
            run += (q - prev).length
            prev = q
        return dz

    t_join = outer_front[-1][0]
    back = []
    for k in range(1, 13):
        t = t_join + (math.pi / 2 - t_join) * k / 12
        f = (t - t_join) / (math.pi / 2 - t_join)
        width = 1.55 + 0.25 * f
        w = smoothstep(0.0, 0.5, f)
        back.append((t, outer_front[-1][1] * (1 - w) + down(t, width) * w))
    # the collar edge from the collar point round the back: one smooth curve (no waves)
    ncp = 11  # index of the collar point in outer_front
    tail = outer_front[ncp:] + back
    for _ in range(12):
        tail = [tail[0]] + [((a[0] + 2 * b[0] + c[0]) / 4, (a[1] + 2 * b[1] + c[1]) / 4)
                            for a, b, c in zip(tail, tail[1:], tail[2:])] + [tail[-1]]
    tail = [(v.x, v.y) for v in catmull([Vector((a, b, 0)) for a, b in tail], 4)]
    outer_left = outer_front[:ncp] + tail
    fold_left = [(math.pi / 2 - (math.pi / 2 + 0.35) * k / 10, FOLD_DZ) for k in range(10)] + [(-0.35, FOLD_DZ)]
    inner_left = fold_left + roll  # back centre -> front -> top button

    # whole outline (unwrapped, t continuous from the left front through the back to the right front)
    mirror = lambda pts: [(math.pi - t, dz) for t, dz in pts]
    outer_right = mirror(outer_left)
    inner_right = mirror(inner_left)
    loop = list(reversed(outer_left))  # back centre outer -> lapel bottom (left)
    loop += list(reversed(inner_left))  # top button -> up the roll line -> fold -> back centre
    loop += inner_right[1:]  # back centre -> right front fold -> roll line -> top button
    loop += list(outer_right)  # right lapel bottom -> ... -> back centre outer
    loop = loop[:-1]

    R = 5.0  # unwrap scale: t radians -> inches, roughly
    smooth_loop = []
    for a, b in zip(loop, loop[1:] + loop[:1]):
        n = max(1, int(math.hypot((b[0] - a[0]) * R, b[1] - a[1]) / 0.1))
        for i in range(n):
            smooth_loop.append((a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n))
    poly = [(t * R, dz) for t, dz in smooth_loop]
    xs = [p_[0] for p_ in poly]
    zs = [p_[1] for p_ in poly]
    pts = [Vector(p_) for p_ in poly]
    step = 0.13
    x = min(xs) + step / 2
    while x < max(xs):
        z = min(zs) + step / 2
        while z < max(zs):
            if inside(x, z, poly) and min_dist(x, z, poly) > step * 0.45:
                pts.append(Vector((x, z)))
            z += step
        x += step
    nring = len(poly)
    vcos, _, faces, _, _, _ = delaunay_2d_cdt(pts, [(i, (i + 1) % nring) for i in range(nring)], [], 0, 1e-6)
    faces = [f for f in faces if inside(*(sum((vcos[i] for i in f), Vector((0, 0))) / 3), poly)]
    verts, nrms = [], []
    for v in vcos:
        t, dz = v.x / R, v.y
        p = point(t, dz)
        nrm = normal(t, dz)
        left = 1 - smoothstep(math.pi / 2 - 0.4, math.pi / 2 + 0.4, t)  # wearer's left lapel lies on top
        # the lapel sits on the chest; along the opening it settles close over the shirt
        edge = min_dist(v.x, v.y, poly)
        off = 0.17 + 0.04 * left
        verts.append(p + nrm * off)
        nrms.append(nrm)
    ob = shell("Collar", verts, nrms, [tuple(f) for f in faces], 0.1, "coat")
    # the stand: from the fold down inside, closing the gap to the shirt collar
    sv, sf, cols = [], [], 80
    t0, t1 = -0.5, math.pi + 0.5
    for c in range(cols + 1):
        t = t0 + (t1 - t0) * c / cols
        top = point(t, FOLD_DZ) + normal(t, FOLD_DZ) * 0.17
        bot = Vector((3.30 * math.cos(t), 0.4 + 3.0 * math.sin(t), Z(1.5)))
        for r in range(4):
            sv.append(top.lerp(bot, r / 3))
    for c in range(cols):
        for r in range(3):
            q = c * 4 + r
            sf.append((q, q + 4, q + 5, q + 1))
    stand = mesh_object("CollarStand", sv, sf, "coat")
    fix_normals(stand, outward=True)
    solidify(stand, 0.06)

    # gorge seam: from the notch up toward the roll line
    gorge = []
    a, b = (3.62, 4.50), (2.10, 3.10)
    for k in range(13):
        h = k / 12
        x_, y_ = a[0] + (b[0] - a[0]) * h, a[1] + (b[1] - a[1]) * h
        dz = dz_of(y_)
        gorge.append((t_of(x_, dz), dz))
    for side in (1, -1):
        gv, gf = [], []
        for t, dz in gorge:
            tt = t if side > 0 else math.pi - t
            p = point(tt, dz)
            nrm = normal(tt, dz)
            left = 1 - smoothstep(math.pi / 2 - 0.4, math.pi / 2 + 0.4, tt)
            off = 0.17 + 0.04 * left + 0.008
            tan = (point(tt + 0.01, dz) - p).normalized()
            gv += [p + nrm * off - tan * 0.018, p + nrm * off + tan * 0.018]
        for k in range(len(gorge) - 1):
            q = 2 * k
            gf.append((q, q + 1, q + 3, q + 2))
        g = mesh_object(f"GorgeSeam{side}", gv, gf, "seam")
        fix_normals(g, outward=True)
    return ob, stand


def catmull(pts, n):
    """Catmull-Rom through pts, n samples per segment."""
    out = []
    P = [pts[0]] + pts + [pts[-1]]
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(pts[-1])
    return out


def continuous_collar(torso, stand_top, rows=10, roll_rows=4):
    """One piece of cloth: from the notch on each lapel it runs up the chest along the roll line,
    over the shoulders and around the back of the neck, where it rolls over the stand.

    Built on the coat's own surface: every point is torso.point(t, dz) lifted along the surface
    normal, with the collar outline interpolated in (t, dz), so it can't twist or float."""
    def t_front(x, dz, side=1):
        hw, cy, ryf, n, ryb = torso.section(dz)
        c = min(0.999, abs(x) / hw) ** (n / 2)
        t = -math.acos(c)  # front, wearer's left
        return t if side > 0 else -math.pi - t

    top = NECK_DZ - 0.08
    # (inner = roll line, outer = collar edge) on the drawing, notch end first
    front = [((1.77, 3.95), (4.42, 4.26)), ((2.00, 3.20), (3.94, 3.20)), ((2.20, 2.50), (3.62, 2.50)), ((2.38, 1.90), (3.35, 1.90))]
    secs = []  # (t_in, dz_in, t_out, dz_out, neckness)
    for (xi, yi), (xo, yo) in front:
        di, do = dz_of(yi), dz_of(yo)
        secs.append((t_front(xi, di), di, t_front(xo, do), do, 0.0))
    t0, t1 = -0.72, math.pi + 0.72
    steps = 22
    for k in range(steps + 1):
        t = t0 + (t1 - t0) * k / steps
        back = (math.sin(t) + 1) / 2
        width = 1.05 + 0.3 * back  # short: measured along the cloth
        dz, run, prev = top, 0.0, torso.point(t, top)
        while run < width and dz > -6.0:
            dz -= 0.05
            q = torso.point(t, dz)
            run += (q - prev).length
            prev = q
        w = smoothstep(-0.72, -0.2, t) * smoothstep(math.pi + 0.72, math.pi + 0.2, t)
        secs.append((t, top, t, dz, w))
    for (xi, yi), (xo, yo) in reversed(front):
        di, do = dz_of(yi), dz_of(yo)
        secs.append((t_front(xi, di, -1), di, t_front(xo, do, -1), do, 0.0))

    cols = [catmull([Vector((s_[k], 0, 0)) for s_ in secs], 6) for k in range(5)]
    tin, din, tout, dout, neck = [[v.x for v in c] for c in cols]
    verts, faces = [], []
    w_ = rows + roll_rows + 1
    for i in range(len(tin)):
        off = 0.38 - 0.2 * neck[i]  # over the lapel in front, close to the coat around the neck
        for r in range(rows + 1):  # outer edge -> roll line, on the surface
            h = r / rows
            t = tout[i] + (tin[i] - tout[i]) * h
            dz = dout[i] + (din[i] - dout[i]) * h
            p = torso.point(t, dz)
            nrm = surface_normal(torso, t, dz)
            verts.append(p + nrm * (off + 0.04 * math.sin(math.pi * h)))
        # the roll: from the roll line up and over to the fold at the top of the stand
        base = verts[-1]
        tt = tin[i]
        fold = Vector((3.64 * math.cos(tt), 0.4 + 3.34 * math.sin(tt), Z(stand_top(tt) + 0.08)))
        for r in range(1, roll_rows + 1):
            h = r / roll_rows
            q = base.lerp(fold, h)
            q.z += 0.1 * math.sin(math.pi * h)  # rounded fold
            verts.append(base.lerp(q, neck[i]))
    for i in range(len(tin) - 1):
        for r in range(rows + roll_rows):
            q = i * w_ + r
            faces.append((q, q + 1, q + 1 + w_, q + w_))
    ob = mesh_object("Collar", verts, faces, "coat")
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    score = 0.0
    for f in bm.faces:
        c = f.calc_center_median()
        score += f.normal.dot(Vector((c.x, c.y - 0.4, 0)).normalized() + Vector((0, 0, 0.6))) * f.calc_area()
    if score < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()
    solidify(ob, 0.11, even=False)
    for p_ in ob.data.polygons:
        p_.use_smooth = True
    return ob


def seam(name, outline_xz, panel_ob, inset=0.14, width=0.035, lift=0.008):
    """A topstitch line just inside a panel's outline, laid on the panel's front."""
    pts = [Vector(p) for p in outline_xz]
    area = sum(a.x * b.y - b.x * a.y for a, b in zip(pts, pts[1:] + pts[:1])) / 2
    sgn = 1 if area > 0 else -1  # inward normal side

    def offset(d):
        out = []
        n = len(pts)
        for i in range(n):
            a, b, c = pts[i - 1], pts[i], pts[(i + 1) % n]
            e1 = (b - a).normalized()
            e2 = (c - b).normalized()
            n1 = Vector((-e1.y, e1.x)) * sgn
            n2 = Vector((-e2.y, e2.x)) * sgn
            m = (n1 + n2)
            m = m.normalized() if m.length > 1e-6 else n1
            k = max(0.5, m.dot(n1))
            out.append(b + m * (d / k))
        return out

    inner, outer = offset(inset + width), offset(inset)
    # densify both loops together
    ring_in, ring_out = [], []
    for i in range(len(pts)):
        a0, a1 = outer[i], outer[(i + 1) % len(pts)]
        b0, b1 = inner[i], inner[(i + 1) % len(pts)]
        n = max(1, int((a1 - a0).length / 0.1))
        for k in range(n):
            ring_out.append(a0.lerp(a1, k / n))
            ring_in.append(b0.lerp(b1, k / n))
    bvh = bvh_of([panel_ob])
    verts = []
    for p in ring_out + ring_in:
        hit = cast(bvh, Vector((p.x, -60.0, p.y)), Vector((0, 1, 0)))
        if hit:
            q, nrm = hit
            nrm = nrm if nrm.y < 0 else -nrm
            verts.append(q + nrm * lift)
        else:
            verts.append(Vector((p.x, -5.0, p.y)))
    m = len(ring_out)
    faces = [(i, (i + 1) % m, m + (i + 1) % m, m + i) for i in range(m)]
    ob = mesh_object(name, verts, faces, "seam")
    return ob


def belt(torso):
    cols, rows = 160, 6
    verts, faces = [], []
    cy_of = lambda dz: torso.section(dz)[1]
    for r in range(rows + 1):
        h = r / rows
        for c in range(cols):
            t = 2 * math.pi * c / cols
            # V in front: the belt dips toward the buckle
            probe = torso.point(t, dz_of(BELT["top_c"]))
            front = probe.y < cy_of(dz_of(BELT["top_c"]))
            s = smoothstep(0.0, BELT["side_x"], abs(probe.x)) if front else 1.0
            top = BELT["top_c"] + (BELT["top_s"] - BELT["top_c"]) * s
            bot = BELT["bot_c"] + (BELT["bot_s"] - BELT["bot_c"]) * s
            dz = dz_of(bot + (top - bot) * h)
            p = torso.point(t, dz)
            nrm = surface_normal(torso, t, dz)
            verts.append(p + nrm * 0.28)
    for r in range(rows):
        for c in range(cols):
            a = r * cols + c
            b = r * cols + (c + 1) % cols
            faces.append((a, b, b + cols, a + cols))
    ob = mesh_object("Belt", verts, faces, "coat")
    fix_normals(ob)
    solidify(ob, 0.16)
    bevel(ob, 0.03)
    smooth_by_angle(ob)
    return ob


def surface_normal(torso, t, dz, e=1e-3):
    p = torso.point(t, dz)
    du = torso.point(t + e, dz) - p
    dv = torso.point(t, dz + e * 10) - p
    n = du.cross(dv)
    if n.length < 1e-9:
        return Vector((math.cos(t), math.sin(t), 0))
    n.normalize()
    radial = Vector((p.x, p.y - torso.section(dz)[1], 0))
    if radial.length > 1e-6 and n.dot(radial) < 0:
        n = -n
    return n


# ------------------------------------------------------------------ flat panels laid onto the coat


def outline_to_xz(outline, mirror=False):
    return [((-x if mirror else x), Z(dz_of(y))) for x, y in outline]


def panel(name, outline_xz, targets, offset, thickness, material_key, step=0.12, from_above=False, torso=None, bev=0.025):
    """Triangulate a 2D outline (x, z) -- or (x, y) when laid from above -- project it and give it thickness."""
    xs = [p[0] for p in outline_xz]
    zs = [p[1] for p in outline_xz]
    pts = [Vector((x, z)) for x, z in outline_xz]
    extra = []
    x = min(xs) + step / 2
    while x < max(xs):
        z = min(zs) + step / 2
        while z < max(zs):
            if inside(x, z, outline_xz) and min_dist(x, z, outline_xz) > step * 0.4:
                extra.append(Vector((x, z)))
            z += step
        x += step
    # densify the outline so edges follow the surface
    ring = []
    for a, b in zip(pts, pts[1:] + pts[:1]):
        n = max(1, int((b - a).length / step))
        for i in range(n):
            ring.append(a.lerp(b, i / n))
    allp = ring + extra
    vcos, _, faces, _, _, _ = delaunay_2d_cdt(allp, [(i, (i + 1) % len(ring)) for i in range(len(ring))], [], 0, 1e-5)
    # keep triangles inside the outline
    faces = [f for f in faces if inside(*(sum((vcos[i] for i in f), Vector((0, 0))) / 3), outline_xz)]
    verts = []
    bvh = targets
    for v in vcos:
        if from_above:
            x, y = v.x, v.y
            hit = cast(bvh, Vector((x, y, 80.0)), Vector((0, 0, -1)))
            p, nrm = hit if hit else (Vector((x, y, Z(0))), Vector((0, 0, 1)))
            if nrm.z < 0:
                nrm = -nrm
        else:
            x, z = v.x, v.y
            if torso is not None and z < Z(1.6):
                lim = torso.hw(z - SH) - 0.3
                x = max(-lim, min(lim, x))
            hit = cast(bvh, Vector((x, -60.0, z)), Vector((0, 1, 0)))
            if not hit:  # off the top of the surface: snap to the nearest point instead of floating
                loc, n2, _, _ = bvh.find_nearest(Vector((x, 0.0, z)))
                hit = (loc, n2.normalized()) if loc is not None else (Vector((x, -3.0, z)), Vector((0, -1, 0)))
            p, nrm = hit
            if nrm.y > 0:
                nrm = -nrm
        verts.append(p + nrm * offset)
    ob = mesh_object(name, verts, [tuple(f) for f in faces], material_key)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-3)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-3)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    want = Vector((0, 0, 1)) if from_above else Vector((0, -1, 0))
    if sum(f.normal.dot(want) * f.calc_area() for f in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()
    if thickness:
        solidify(ob, thickness, offset=-1.0, even=False)
    if bev:
        bevel(ob, bev)
    smooth_by_angle(ob)
    return ob


def inside(x, z, poly):
    c = False
    n = len(poly)
    for i in range(n):
        x1, z1 = poly[i]
        x2, z2 = poly[(i + 1) % n]
        if (z1 > z) != (z2 > z) and x < (x2 - x1) * (z - z1) / (z2 - z1) + x1:
            c = not c
    return c


def min_dist(x, z, poly):
    best = 1e9
    p = Vector((x, z))
    for a, b in zip(poly, poly[1:] + poly[:1]):
        a, b = Vector(a), Vector(b)
        ab = b - a
        t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-12)))
        best = min(best, (p - (a + ab * t)).length)
    return best


def bvh_of(objs):
    bpy.context.view_layer.update()
    verts, polys = [], []
    for ob in objs:
        mw = ob.matrix_world
        base = len(verts)
        verts += [mw @ v.co for v in ob.data.vertices]
        polys += [[base + i for i in p.vertices] for p in ob.data.polygons]
    return BVHTree.FromPolygons(verts, polys)


def cast(bvh, origin, direction):
    loc, nrm, _, _ = bvh.ray_cast(origin, direction)
    if loc is None:
        return None
    return loc, nrm.normalized()


def button(name, pos, nrm, d, h=0.16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=d / 2, location=(0, 0, 0))
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = (1, 1, (h * 2) / d)
    bpy.ops.object.transform_apply(scale=True)
    q = Vector((0, 0, 1)).rotation_difference(nrm)
    ob.matrix_world = Matrix.Translation(pos) @ q.to_matrix().to_4x4()
    ob.data.materials.append(MATS["brass"])
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def front_hit(bvh, x, y_in):
    hit = cast(bvh, Vector((x, -60, Z(dz_of(y_in)))), Vector((0, 1, 0)))
    if not hit:
        return Vector((x, -5, Z(dz_of(y_in)))), Vector((0, -1, 0))
    p, n = hit
    return p, (n if n.y < 0 else -n)


# ------------------------------------------------------------------ build


def build():
    man = body_mod.load_body(args.body, SH, arm_hang_deg=8.0, neck_cut=1.8)
    man.data.materials.clear()
    man.data.materials.append(MATS["man"])
    body_torso, arm, delt = measure_body(man)
    body_full = smooth_series([(dz, v[0]) for dz, v in sorted(body_torso.items()) if dz > -4.5], 0.5)

    torso = Torso(body_torso, [v.co.copy() for v in man.data.vertices])
    coat = torso.build()
    sleeve = Sleeve(arm, body_full, delt, torso, [v.co.copy() for v in man.data.vertices])
    sleeves = [sleeve.build(1), sleeve.build(-1)]

    # shirt collar: round the neck, dipping in front behind the tie knot (the leaves fold over it)
    shirt_band = band("ShirtCollar", 3.10, 2.80, 3.12, 2.82, 0.35, 0.5,
                      lambda t: 3.0 - 2.0 * max(0.0, -math.sin(t)) ** 5, -math.pi / 2, 1.5 * math.pi, "shirt", thickness=0.06)
    collar, stand = lapel_collar(torso)
    # dress-form neck: fills the shirt collar (the mannequin's own neck is cut low, below the jaw)
    nv, nf, ncols = [], [], 64
    for r, (rx, ry, z) in enumerate(((2.55, 2.35, 1.4), (2.55, 2.35, 3.15), (2.35, 2.15, 3.3), (0.0, 0.0, 3.32))):
        for c in range(ncols):
            t = 2 * math.pi * c / ncols
            nv.append(Vector((rx * math.cos(t), 0.45 + ry * math.sin(t), Z(z))))
    for r in range(3):
        for c in range(ncols):
            q, q2 = r * ncols + c, r * ncols + (c + 1) % ncols
            nf.append((q, q2, q2 + ncols, q + ncols))
    neck = mesh_object("NeckStub", nv, nf, "man")
    fix_normals(neck, outward=True)
    smooth_by_angle(neck, 40)

    base = bvh_of([coat, collar, shirt_band])
    torso_only = bvh_of([coat])
    # a smooth form for the shirt and tie: the coat front blending up into the shirt collar
    fv, ff, cols = [], [], 96
    for r in range(9):
        h = r / 8
        for c in range(cols):
            t = 2 * math.pi * c / cols
            a_ = torso.point(t, 1.7)
            b_ = Vector((3.14 * math.cos(t), 0.35 + 2.84 * math.sin(t), Z(3.0)))
            fv.append(a_.lerp(b_, h * h * (3 - 2 * h)))
    for r in range(8):
        for c in range(cols):
            q, q2 = r * cols + c, r * cols + (c + 1) % cols
            ff.append((q, q2, q2 + cols, q + cols))
    form = mesh_object("ShirtForm", fv, ff, "shirt")
    shirt_bvh = bvh_of([coat, form])
    bpy.data.objects.remove(form)

    # shirt in the V, tie, shirt collar leaves
    shirt_poly = [(min(x + 0.45, 2.85), y) for x, y in V_EDGE]
    shirt_poly = [(x, 0.6) for x, _ in shirt_poly[:1]] + shirt_poly + [(-x, y) for x, y in reversed(shirt_poly)] + [(-shirt_poly[0][0], 0.6)]
    panel("ShirtFront", outline_to_xz(shirt_poly), shirt_bvh, 0.03, 0.0, "shirt", bev=0)
    panel("Tie", outline_to_xz(TIE), shirt_bvh, 0.08, 0.04, "tie", bev=0.012)
    for m in (False, True):
        panel(f"ShirtLeaf{'R' if m else 'L'}", outline_to_xz(SHIRT_LEAF, m), shirt_bvh, 0.13, 0.04, "shirt", bev=0.012)


    # breast pockets, flaps, pleats, buttons
    P = POCKET
    for side in (1, -1):
        cx = P["cx"] * side
        x0, x1 = cx - P["w"] / 2, cx + P["w"] / 2
        body = [(x0, P["top"]), (x1, P["top"]), (x1, P["bottom"]), (x0, P["bottom"])]
        pb = panel(f"BreastBody{side}", outline_to_xz(body), torso_only, 0.14, 0.12, "coat", torso=torso)
        seam(f"BreastBodySeam{side}", outline_to_xz(body), pb)
        if AGSU:
            pl = [(cx - P["pleat"] / 2, P["top"] + P["flap"]), (cx + P["pleat"] / 2, P["top"] + P["flap"]),
                  (cx + P["pleat"] / 2, P["bottom"] - 0.05), (cx - P["pleat"] / 2, P["bottom"] - 0.05)]
            pp = panel(f"BreastPleat{side}", outline_to_xz(pl), torso_only, 0.2, 0.06, "coat", torso=torso, bev=0.015)
            seam(f"BreastPleatSeam{side}", outline_to_xz(pl), pp, inset=0.06, width=0.03)
        fl = [(x0 - 0.06, P["top"] - 0.05), (x1 + 0.06, P["top"] - 0.05), (x1 + 0.06, P["top"] + P["flap"]),
              (cx, P["top"] + P["flap"] + P["point"]), (x0 - 0.06, P["top"] + P["flap"])]
        pf = panel(f"BreastFlap{side}", outline_to_xz(fl), torso_only, 0.27, 0.12, "coat", torso=torso)
        seam(f"BreastFlapSeam{side}", outline_to_xz(fl), pf, inset=0.12)
        p, n = front_hit(torso_only, cx, P["button_y"])
        button(f"BreastButton{side}", p + n * 0.3, n, 0.62, h=0.13)
        # lower pocket flaps
        lf = [(x * side, y) for x, y in LOWER_FLAP]
        pl = panel(f"LowerFlap{side}", outline_to_xz(lf), torso_only, 0.13, 0.12, "coat", torso=torso)
        seam(f"LowerFlapSeam{side}", outline_to_xz(lf), pl, inset=0.12)
        if AGSU:
            p, n = front_hit(torso_only, LOWER_BUTTON[0] * side, LOWER_BUTTON[1])
            button(f"LowerButton{side}", p + n * 0.2, n, 0.62, h=0.13)

    # front edge of the overlapping front
    panel("FrontEdge", outline_to_xz(FRONT_EDGE), torso_only, 0.05, 0.04, "coat", bev=0.015)
    for i, y in enumerate(BUTTONS_Y):
        p, n = front_hit(torso_only, BUTTON_X, y)
        button(f"FrontButton{i}", p + n * 0.14, n, 0.9, h=0.17)

    if AGSU:
        blt = belt(torso)
        belt_bvh = bvh_of([blt])
        panel("BeltKeeper", outline_to_xz(KEEPER), belt_bvh, 0.07, 0.07, "coat", bev=0.015)
        build_buckle(belt_bvh)

    # shoulder loops, laid on from above
    LOOP["x1"] = sleeve.sx - 0.15  # the loop ends at the shoulder seam
    tops = bvh_of([coat] + sleeves)
    for side in (1, -1):
        ridge = lambda x: 0.65 + (abs(x) - LOOP["x0"]) / (LOOP["x1"] - LOOP["x0"]) * (1.8 - 0.65)
        L = LOOP
        w = L["w"] / 2
        pts = [(L["x0"], 0.0), (L["x0"] + 0.35, -w), (L["x1"], -w), (L["x1"], w), (L["x0"] + 0.35, w)]
        outline = [(x * side, ridge(x) + y) for x, y in pts]
        panel(f"Loop{side}", outline, tops, 0.06, 0.1, "coat", from_above=True, step=0.1)
        hit = cast(tops, Vector((L["button_x"] * side, ridge(L["button_x"]), 80)), Vector((0, 0, -1)))
        if hit:
            p, n = hit
            n = n if n.z > 0 else -n
            button(f"LoopButton{side}", p + n * 0.24, n, 0.55, h=0.12)

    # cloth edges with a little thickness
    solidify(coat, 0.1)
    for s in sleeves:
        solidify(s, 0.1)
        sleeve.tuck(s)
    sleeve.tuck_torso(coat)
    armhole_seams(sleeve, [coat] + sleeves)
    return coat, man, sleeve


def build_buckle(belt_bvh):
    B = BUCKLE
    p, n = front_hit(belt_bvh, 0.0, B["y"])
    w, h, b = B["w"], B["h"], B["bar"]
    bm = bmesh.new()
    for cx, cz, sx, sz in ((0, h / 2 - b / 2, w, b), (0, -h / 2 + b / 2, w, b), (w / 2 - b / 2, 0, b, h), (-w / 2 + b / 2, 0, b, h)):
        m = Matrix.Translation((cx, 0, cz)) @ Matrix.Diagonal((sx, 0.09, sz, 1))
        bmesh.ops.create_cube(bm, size=1.0, matrix=m)
    me = bpy.data.meshes.new("Buckle")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("Buckle", me)
    bpy.context.collection.objects.link(ob)
    me.materials.append(MATS["brass"])
    q = Vector((0, -1, 0)).rotation_difference(-n if n.y > 0 else n)
    ob.matrix_world = Matrix.Translation(p + (n if n.y < 0 else -n) * 0.1) @ q.to_matrix().to_4x4()
    bevel(ob, 0.02)
    smooth_by_angle(ob)


# ------------------------------------------------------------------ renders


def lights():
    def area(name, loc, energy, size):
        d = bpy.data.lights.new(name, "AREA")
        d.energy = energy
        d.size = size
        o = bpy.data.objects.new(name, d)
        o.location = loc
        o.rotation_euler = (Vector((0, 0, Z(-10))) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        bpy.context.collection.objects.link(o)

    area("Key", (30, -70, 40), 60000, 40)
    area("Fill", (-50, -40, 10), 20000, 50)
    area("Rim", (0, 60, 40), 25000, 40)


def camera():
    cam = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
    bpy.context.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    return cam


def shoot(cam, name, az=0, ortho=False, res=None):
    sc = bpy.context.scene
    if ortho:
        cam.data.type = "ORTHO"
        cam.data.ortho_scale = IMG_H / PXIN
        sc.render.resolution_x, sc.render.resolution_y = IMG_W // 2, IMG_H // 2
        cam.location = ((IMG_W / 2 - CX) / PXIN, -120, ZTOP - (IMG_H / 2 - CY) / PXIN)
        cam.rotation_euler = (math.radians(90), 0, 0)
    else:
        cam.data.type = "PERSP"
        cam.data.lens = 60
        r = res or args.res
        sc.render.resolution_x, sc.render.resolution_y = r, int(r * 1.25)
        a = math.radians(az)
        tgt = Vector((0, 0, Z(-12)))
        cam.location = tgt + Vector((math.sin(a) * 105, -math.cos(a) * 105, 8))
        cam.rotation_euler = (tgt - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = os.path.abspath(os.path.join(args.out, f"{args.stage}_{name}.png"))
    bpy.ops.render.render(write_still=True)
    return sc.render.filepath


# ------------------------------------------------------------------ export


def export_glb(coat, man, sleeve, path):
    top_button = Z(dz_of(BUTTONS_Y[0]))
    root = bpy.data.objects.new("DressRightCoat", None)
    bpy.context.collection.objects.link(root)
    for side in (1, -1):
        for i in range(13):
            dz = -2.6 + (CUFF_DZ + 0.3 - -2.6) * i / 12
            p = sleeve.axis(dz)
            e = bpy.data.objects.new(f"dr_arm_{'L' if side > 0 else 'R'}_{i:02d}", None)
            e.location = (p.x * side, p.y, p.z)
            bpy.context.collection.objects.link(e)
    for side in (1, -1):
        e = bpy.data.objects.new(f"dr_seam_{'L' if side > 0 else 'R'}", None)
        e.location = sleeve.seam_top[side]
        bpy.context.collection.objects.link(e)
    for ob in list(bpy.data.objects):
        if ob.type in ("CAMERA", "LIGHT"):
            bpy.data.objects.remove(ob)
    dec = man.modifiers.new("Web", "DECIMATE")
    dec.ratio = 0.35
    apply_modifiers(man)
    for ob in bpy.data.objects:
        if ob is not root:
            ob.location.z -= top_button
            if ob.parent is None:
                ob.parent = root
    root["dr_version"] = 2
    root["dr_uniform"] = args.uniform
    root["dr_units"] = "inch"
    root["dr_sleeve_length"] = round(Z(-0.9) - Z(CUFF_DZ), 2)
    root["dr_shoulder_line_y"] = SH - top_button
    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(path), export_format="GLB", export_yup=True, export_apply=True,
                              export_extras=True, export_cameras=False, export_lights=False, export_animations=False,
                              export_skins=False)


def main():
    os.makedirs(args.out, exist_ok=True)
    reset()
    mats()
    coat, man, sleeve = build()
    lights()
    cam = camera()
    front = shoot(cam, "ortho", ortho=True)
    for n, az in (("front", 0), ("q34", 35), ("side", 90), ("back", 180)):
        shoot(cam, n, az)
    if args.ref:
        try:
            from PIL import Image
            a = Image.open(args.ref).convert("RGB").resize((IMG_W // 2, IMG_H // 2))
            b = Image.open(front).convert("RGB")
            c = Image.new("RGB", (a.width * 2, a.height))
            c.paste(a, (0, 0))
            c.paste(b, (a.width, 0))
            c.save(os.path.join(args.out, f"{args.stage}_compare.png"))
        except ImportError:
            pass
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(os.path.join(args.out, f"coat_{args.stage}.blend")))
    if args.export:
        export_glb(coat, man, sleeve, args.export)


if __name__ == "__main__":
    main()
